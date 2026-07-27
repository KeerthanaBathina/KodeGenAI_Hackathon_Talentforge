import { prisma } from '../db/prisma';
import { auditEvent } from './auditService';
import logger from '../utils/logger';

/**
 * Process offer expiry
 * 
 * Called by BullMQ worker when expiry job fires.
 * Updates offer status, sends notifications, updates requisition.
 * 
 * @param offerId - Offer ID
 */
export async function processOfferExpiry(offerId: string): Promise<void> {
  logger.info({ offerId }, 'Processing offer expiry');

  // Fetch offer with current status
  const offer = await prisma.offer.findUnique({
    where: { id: offerId },
    include: {
      application: {
        include: {
          candidate: {
            select: {
              fullName: true,
              email: true
            }
          },
          requisition: {
            include: {
              hiringManager: {
                select: {
                  fullName: true,
                  email: true
                }
              }
            },
            select: {
              id: true,
              title: true,
              hiringManager: true
            }
          }
        }
      }
    }
  });

  if (!offer) {
    logger.warn({ offerId }, 'Offer not found for expiry processing');
    return;
  }

  // Skip if already responded to (idempotency check)
  if (offer.status !== 'pending') {
    logger.info({
      offerId,
      currentStatus: offer.status
    }, 'Offer already responded to, skipping expiry');
    return;
  }

  // Verify expiry time has actually passed (safety check)
  if (new Date() < offer.expiresAt) {
    logger.warn({
      offerId,
      expiresAt: offer.expiresAt,
      currentTime: new Date()
    }, 'Offer expiry job fired before expiry time, rescheduling');
    // Could reschedule here if needed
    return;
  }

  // Update offer and application status in transaction
  await prisma.$transaction(async (tx) => {
    // Update offer status to expired
    await tx.offer.update({
      where: { id: offerId },
      data: {
        status: 'expired',
        respondedAt: new Date() // Mark when expiry was processed
      }
    });

    // Update application status
    await tx.application.update({
      where: { id: offer.applicationId },
      data: {
        status: 'offer_expired'
      }
    });

    // Increment requisition vacancy (position available again)
    await tx.requisition.update({
      where: { id: offer.application.requisition.id },
      data: {
        vacancies: {
          increment: 1
        }
      }
    });
  });

  // Audit event
  await auditEvent({
    eventType: 'OFFER_EXPIRED',
    entityType: 'offer',
    entityId: offerId,
    actorId: 'system',
    payload: {
      applicationId: offer.applicationId,
      candidateName: offer.application.candidate.fullName,
      expiresAt: offer.expiresAt,
      processedAt: new Date()
    }
  });

  logger.info({
    offerId,
    candidateEmail: offer.application.candidate.email,
    expiresAt: offer.expiresAt
  }, 'Offer expired successfully');

  // Send expiry notifications
  await sendOfferExpiryNotifications({
    offerId,
    candidateName: offer.application.candidate.fullName,
    candidateEmail: offer.application.candidate.email,
    roleTitle: offer.application.requisition.title,
    hiringManagerName: offer.application.requisition.hiringManager.fullName,
    hiringManagerEmail: offer.application.requisition.hiringManager.email
  });
}

/**
 * Send offer expiry email notifications
 * 
 * @param params - Notification parameters
 */
async function sendOfferExpiryNotifications(params: {
  offerId: string;
  candidateName: string;
  candidateEmail: string;
  roleTitle: string;
  hiringManagerName: string;
  hiringManagerEmail: string;
}): Promise<void> {
  const {
    offerId,
    candidateName,
    candidateEmail,
    roleTitle,
    hiringManagerName,
    hiringManagerEmail
  } = params;

  logger.info({
    offerId,
    candidateEmail,
    hiringManagerEmail
  }, 'Sending offer expiry notifications');

  // TODO: Implement email sending
  // 1. Send to candidate: "Your offer for [role] has expired"
  // 2. Send to hiring manager: "[Candidate] offer expired, position reopened"

  logger.info({
    offerId,
    recipientCount: 2
  }, 'TODO: Send expiry notification emails');
}

/**
 * Extend offer deadline
 * 
 * Allows hiring managers to extend expiry date.
 * Cancels old job and schedules new one.
 * 
 * @param offerId - Offer ID
 * @param newExpiresAt - New expiry date
 */
export async function extendOfferDeadline(
  offerId: string,
  newExpiresAt: Date
): Promise<void> {
  logger.info({ offerId, newExpiresAt }, 'Extending offer deadline');

  // Update offer record
  const offer = await prisma.offer.update({
    where: { id: offerId },
    data: { expiresAt: newExpiresAt }
  });

  if (offer.status !== 'pending') {
    throw new Error(`Cannot extend deadline for ${offer.status} offer`);
  }

  // Cancel existing expiry job
  const { cancelOfferExpiry, scheduleOfferExpiry } = await import('../queues/offerQueue');
  await cancelOfferExpiry(offerId);

  // Schedule new expiry job
  const delay = newExpiresAt.getTime() - Date.now();
  await scheduleOfferExpiry(
    {
      offerId: offer.id,
      applicationId: offer.applicationId,
      candidateEmail: 'candidate@example.com', // Fetch from DB if needed
      expiresAt: newExpiresAt
    },
    delay
  );

  // Audit event
  await auditEvent({
    eventType: 'OFFER_DEADLINE_EXTENDED',
    entityType: 'offer',
    entityId: offerId,
    actorId: 'system', // Should be hiring manager ID
    payload: {
      previousExpiresAt: offer.expiresAt,
      newExpiresAt
    }
  });

  logger.info({ offerId, newExpiresAt }, 'Offer deadline extended successfully');
}
