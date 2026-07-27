import { prisma } from '../db/prisma';
import { auditEvent } from './auditService';
import { cancelOfferExpiry } from '../queues/offerQueue';
import logger from '../utils/logger';

export interface AcceptOfferParams {
  offerId: string;
  candidateId: string;
}

export interface DeclineOfferParams {
  offerId: string;
  candidateId: string;
  reason?: string;
}

/**
 * Process offer acceptance
 * 
 * Updates offer status, application status, sends notifications,
 * and queues onboarding task creation.
 * 
 * @param params - Offer and candidate IDs
 */
export async function acceptOffer(
  params: AcceptOfferParams
): Promise<void> {
  const { offerId, candidateId } = params;

  logger.info({ offerId, candidateId }, 'Processing offer acceptance');

  // Fetch offer with validation
  const offer = await prisma.offer.findUnique({
    where: { id: offerId },
    include: {
      application: {
        include: {
          candidate: true,
          requisition: {
            include: {
              hiringManager: true
            }
          }
        }
      },
      decision: {
        include: {
          decidedBy: true
        }
      }
    }
  });

  if (!offer) {
    throw new OfferNotFoundError(`Offer not found: ${offerId}`);
  }

  // Validate offer is for this candidate
  if (offer.application.candidate.id !== candidateId) {
    throw new OfferAccessDeniedError('Offer does not belong to this candidate');
  }

  // Validate offer is still pending
  if (offer.status !== 'pending') {
    throw new OfferAlreadyRespondedError(
      `Offer already ${offer.status}. Cannot accept.`
    );
  }

  // Validate offer has not expired
  if (new Date() > offer.expiresAt) {
    throw new OfferExpiredError('Offer has expired');
  }

  // Update offer and application in transaction
  await prisma.$transaction(async (tx) => {
    // Update offer status
    await tx.offer.update({
      where: { id: offerId },
      data: {
        status: 'accepted',
        respondedAt: new Date()
      }
    });

    // Update application status
    await tx.application.update({
      where: { id: offer.applicationId },
      data: { status: 'offer_accepted' }
    });
  });

  // Audit event
  await auditEvent({
    eventType: 'OFFER_ACCEPTED',
    entityType: 'offer',
    entityId: offerId,
    actorId: candidateId,
    payload: {
      applicationId: offer.applicationId,
      candidateName: offer.application.candidate.fullName,
      roleTitle: offer.application.requisition.title
    }
  });

  logger.info({ offerId, candidateId }, 'Offer accepted successfully');

  // Cancel scheduled expiry job
  await cancelOfferExpiry(offerId);
  logger.info({ offerId }, 'Offer expiry job cancelled due to acceptance');

  // Send confirmation emails
  // TODO: Implement in TASK-003 or separate email task
  logger.info({
    offerId,
    candidateEmail: offer.application.candidate.email,
    recruiterEmail: offer.application.requisition.hiringManager.email
  }, 'TODO: Send acceptance confirmation emails');

  // Queue onboarding task creation
  // TODO: Implement onboarding workflow integration
  logger.info({ offerId, candidateId }, 'TODO: Queue onboarding task');
}

/**
 * Process offer declination
 * 
 * Updates offer status, application status, requisition vacancy,
 * and sends notifications to recruiters.
 * 
 * @param params - Offer ID, candidate ID, optional reason
 */
export async function declineOffer(
  params: DeclineOfferParams
): Promise<void> {
  const { offerId, candidateId, reason } = params;

  logger.info({ offerId, candidateId, hasReason: !!reason }, 'Processing offer declination');

  // Fetch offer with validation
  const offer = await prisma.offer.findUnique({
    where: { id: offerId },
    include: {
      application: {
        include: {
          candidate: true,
          requisition: {
            include: {
              hiringManager: true
            }
          }
        }
      }
    }
  });

  if (!offer) {
    throw new OfferNotFoundError(`Offer not found: ${offerId}`);
  }

  // Validate offer is for this candidate
  if (offer.application.candidate.id !== candidateId) {
    throw new OfferAccessDeniedError('Offer does not belong to this candidate');
  }

  // Validate offer is still pending
  if (offer.status !== 'pending') {
    throw new OfferAlreadyRespondedError(
      `Offer already ${offer.status}. Cannot decline.`
    );
  }

  // Update offer, application, and requisition in transaction
  await prisma.$transaction(async (tx) => {
    // Update offer status
    await tx.offer.update({
      where: { id: offerId },
      data: {
        status: 'declined',
        respondedAt: new Date(),
        responseReason: reason || null
      }
    });

    // Update application status
    await tx.application.update({
      where: { id: offer.applicationId },
      data: { status: 'offer_declined' }
    });

    // Increment requisition vacancy count (position now available again)
    await tx.requisition.update({
      where: { id: offer.application.requisitionId },
      data: {
        vacancies: {
          increment: 1
        }
      }
    });
  });

  // Audit event
  await auditEvent({
    eventType: 'OFFER_DECLINED',
    entityType: 'offer',
    entityId: offerId,
    actorId: candidateId,
    payload: {
      applicationId: offer.applicationId,
      candidateName: offer.application.candidate.fullName,
      roleTitle: offer.application.requisition.title,
      reason: reason || 'Not provided'
    }
  });

  logger.info({ offerId, candidateId }, 'Offer declined successfully');

  // Cancel scheduled expiry job
  await cancelOfferExpiry(offerId);
  logger.info({ offerId }, 'Offer expiry job cancelled due to declination');

  // Send notification to recruiter
  // TODO: Implement in TASK-003 or separate email task
  logger.info({
    offerId,
    recruiterEmail: offer.application.requisition.hiringManager.email,
    reason
  }, 'TODO: Send declination notification to recruiter');
}

/**
 * Get offer details for candidate view
 * 
 * @param offerId - Offer ID
 * @returns Offer details
 */
export async function getOfferDetails(offerId: string) {
  const offer = await prisma.offer.findUnique({
    where: { id: offerId },
    include: {
      application: {
        include: {
          candidate: {
            select: {
              id: true,
              fullName: true,
              email: true
            }
          },
          requisition: {
            select: {
              title: true,
              department: true
            }
          }
        }
      },
      decision: {
        select: {
          compensationBand: true
        }
      }
    }
  });

  if (!offer) {
    throw new OfferNotFoundError(`Offer not found: ${offerId}`);
  }

  return offer;
}

// Custom error classes
export class OfferNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OfferNotFoundError';
  }
}

export class OfferAccessDeniedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OfferAccessDeniedError';
  }
}

export class OfferAlreadyRespondedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OfferAlreadyRespondedError';
  }
}

export class OfferExpiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OfferExpiredError';
  }
}
