import prisma from '../db/prisma';
import logger from '../utils/logger';
import { generateDecisionPdf } from './decisionPdfService';
import { sendRejectionEmail } from './emailService';
import { createReminderTask } from './taskService';
import { auditEvent } from './auditService';
import { AUDIT_EVENT_TYPES } from '../constants/auditEventTypes';
import type { DecisionOutcome } from '@prisma/client';

export interface ProcessDecisionOutcomeParams {
  decisionId: string;
  applicationId: string;
  outcome: DecisionOutcome;
  reasonCodeId: string;
  justification: string;
  decidedBy: string;
  actorRole?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

function resolveDecisionOutcomeAuditType(outcome: DecisionOutcome): string {
  switch (outcome) {
    case 'offer':
      return AUDIT_EVENT_TYPES.DECISION_SHORTLIST;
    case 'reject':
      return AUDIT_EVENT_TYPES.DECISION_REJECT;
    case 'hold':
      return AUDIT_EVENT_TYPES.DECISION_HOLD;
    case 'withdraw':
      return AUDIT_EVENT_TYPES.DECISION_WITHDRAW;
  }
}

/**
 * Process a decision outcome with appropriate status transitions and actions
 * 
 * Routes to outcome-specific handlers based on the decision type:
 * - offer: Transitions to pending_approval (US-003 workflow trigger)
 * - reject: Transitions to rejected, sends email, generates PDF
 * - hold: Transitions to on_hold, creates 14-day reminder
 * - withdraw: Transitions to withdrawn (no notifications)
 * 
 * @param params - Decision processing parameters
 */
export async function processDecisionOutcome(
  params: ProcessDecisionOutcomeParams
): Promise<void> {
  const { decisionId, applicationId, outcome } = params;

  try {
    logger.info('Processing decision outcome', {
      decisionId,
      applicationId,
      outcome
    });

    // Execute outcome-specific logic
    switch (outcome) {
      case 'offer':
        await processOfferDecision(params);
        break;
      case 'reject':
        await processRejectDecision(params);
        break;
      case 'hold':
        await processHoldDecision(params);
        break;
      case 'withdraw':
        await processWithdrawDecision(params);
        break;
      default:
        throw new Error(`Unknown decision outcome: ${outcome}`);
    }

    // Log audit event
    await auditEvent({
      actorId: params.decidedBy,
      actorRole: params.actorRole,
      eventType: resolveDecisionOutcomeAuditType(outcome),
      entityType: 'application',
      entityId: applicationId,
      payload: {
        decisionId,
        outcome,
        reasonCodeId: params.reasonCodeId,
        reason_code_id: params.reasonCodeId,
        justificationLength: params.justification.length,
        processedAt: new Date().toISOString()
      },
      ipAddress: params.ipAddress,
      userAgent: params.userAgent
    });

    logger.info('Decision outcome processed successfully', {
      decisionId,
      outcome
    });
  } catch (error) {
    logger.error('Error processing decision outcome', {
      decisionId,
      outcome,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    throw error;
  }
}

/**
 * Process offer decision
 * Transitions application to pending_approval status
 */
async function processOfferDecision(
  params: ProcessDecisionOutcomeParams
): Promise<void> {
  const { applicationId, decisionId } = params;

  logger.debug('Processing offer decision', { decisionId, applicationId });

  // Update application status to pending_approval
  await prisma.application.update({
    where: { id: applicationId },
    data: {
      status: 'pending_approval',
      updatedAt: new Date()
    }
  });

  // TODO: Trigger approval chain workflow (US-003)
  // This will be implemented in US-003
  logger.info(`Offer decision ${decisionId} awaiting approval chain`);
}

/**
 * Process reject decision
 * Transitions to rejected, generates PDF, sends rejection email
 */
async function processRejectDecision(
  params: ProcessDecisionOutcomeParams
): Promise<void> {
  const { applicationId, decisionId, justification, decidedBy } = params;

  logger.debug('Processing reject decision', { decisionId, applicationId });

  // Update application status to rejected
  const application = await prisma.application.update({
    where: { id: applicationId },
    data: {
      status: 'rejected',
      updatedAt: new Date()
    },
    include: {
      candidate: {
        select: {
          email: true,
          profile: {
            select: {
              fullName: true
            }
          }
        }
      },
      requisition: {
        select: {
          title: true
        }
      }
    }
  });

  // Get reason code details
  const reasonCode = await prisma.reasonCode.findUniqueOrThrow({
    where: { id: params.reasonCodeId },
    select: {
      code: true,
      displayText: true
    }
  });

  // Get decision maker details
  const decidedByUser = await prisma.user.findUniqueOrThrow({
    where: { id: decidedBy },
    select: {
      fullName: true
    }
  });

  const candidateName = application.candidate.profile?.fullName || 'Candidate';

  // Generate PDF summary (async, don't block)
  generateDecisionPdf({
    decisionId,
    candidateName,
    requisitionTitle: application.requisition.title,
    outcome: 'reject',
    reasonCode: reasonCode.code,
    reasonLabel: reasonCode.displayText,
    justification,
    decidedBy,
    decidedByName: decidedByUser.fullName,
    decidedAt: new Date()
  })
    .then(async (pdfUrl) => {
      // Update decision record with PDF URL
      await prisma.decision.update({
        where: { id: decisionId },
        data: { pdfUrl }
      });

      logger.info('PDF generated and stored for decision', { decisionId, pdfUrl });
    })
    .catch((error) => {
      logger.error('Failed to generate PDF for decision', {
        decisionId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      // Don't fail the whole process if PDF generation fails
    });

  // Send rejection email within 60 seconds
  setTimeout(async () => {
    try {
      await sendRejectionEmail({
        candidateEmail: application.candidate.email,
        candidateName,
        requisitionTitle: application.requisition.title,
        companyName: 'TalentForge'
      });

      logger.info('Rejection email sent', {
        decisionId,
        candidateEmail: application.candidate.email
      });
    } catch (error) {
      logger.error('Failed to send rejection email', {
        decisionId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      // Log but don't fail - email delivery is best-effort
    }
  }, 2000); // 2-second delay to ensure transaction commits
}

/**
 * Process hold decision
 * Transitions to on_hold, creates 14-day reminder task
 */
async function processHoldDecision(
  params: ProcessDecisionOutcomeParams
): Promise<void> {
  const { applicationId, decisionId, decidedBy } = params;

  logger.debug('Processing hold decision', { decisionId, applicationId });

  // Update application status to on_hold
  await prisma.application.update({
    where: { id: applicationId },
    data: {
      status: 'on_hold',
      updatedAt: new Date()
    }
  });

  // Create 14-day reminder task for the decision maker
  const reminderDate = new Date();
  reminderDate.setDate(reminderDate.getDate() + 14);

  await createReminderTask({
    assignedTo: decidedBy,
    title: `Review held application: ${applicationId.slice(0, 8)}`,
    description: `Application was placed on hold. Please review and take action.`,
    dueDate: reminderDate,
    entityType: 'application',
    entityId: applicationId,
    metadata: {
      decisionId,
      holdReason: params.reasonCodeId
    }
  });

  logger.info('Hold decision processed: 14-day reminder created', {
    decisionId,
    assignedTo: decidedBy,
    dueDate: reminderDate
  });
}

/**
 * Process withdraw decision
 * Transitions to withdrawn (no candidate notification)
 */
async function processWithdrawDecision(
  params: ProcessDecisionOutcomeParams
): Promise<void> {
  const { applicationId, decisionId } = params;

  logger.debug('Processing withdraw decision', { decisionId, applicationId });

  // Update application status to withdrawn
  await prisma.application.update({
    where: { id: applicationId },
    data: {
      status: 'withdrawn',
      updatedAt: new Date()
    }
  });

  logger.info('Withdrawal decision processed', {
    decisionId,
    applicationId
  });

  // No candidate notification for withdrawal
}

/**
 * Get outcome status message for client response
 */
export function getOutcomeMessage(outcome: DecisionOutcome): string {
  switch (outcome) {
    case 'offer':
      return 'Decision submitted — awaiting approval';
    case 'reject':
      return 'Rejection decision recorded. Candidate will be notified.';
    case 'hold':
      return 'Application placed on hold. Reminder set for 14 days.';
    case 'withdraw':
      return 'Application withdrawn from consideration.';
    default:
      return 'Decision recorded successfully.';
  }
}
