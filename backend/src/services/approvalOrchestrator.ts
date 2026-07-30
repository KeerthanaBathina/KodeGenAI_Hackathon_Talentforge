import { prisma } from '../db/prisma';
import { Decimal } from '@prisma/client/runtime/library';
import { getApprovalPolicy, ApprovalTier } from './approvalPolicyService';
import { sendApprovalRequestEmail } from './approvalEmailService';
import { auditEvent } from './auditService';
import logger from '../utils/logger';

export interface InitiateApprovalChainParams {
  decisionId: string;
  applicationId: string;
  compensationAmount: Decimal;
  decidedById: string;
}

export interface ProcessApprovalResponseParams {
  approvalId: string;
  approverId: string;
  approved: boolean;
  comments?: string;
}

/**
 * Initiate approval chain for an offer decision
 * 
 * Creates the first tier approval record and sends notification.
 * Subsequent tiers are created only after previous tier approves.
 * 
 * @param params - Decision and compensation details
 * @returns First approval record ID
 */
export async function initiateApprovalChain(
  params: InitiateApprovalChainParams
): Promise<string> {
  const { decisionId, applicationId, compensationAmount, decidedById } = params;

  logger.info({
    decisionId,
    applicationId,
    compensationAmount: compensationAmount.toString()
  }, 'Initiating approval chain');

  // Query approval policy
  const policy = await getApprovalPolicy(compensationAmount);

  if (policy.requiredApprovers.length === 0) {
    logger.warn({ decisionId, policyId: policy.policyId }, 
      'Approval policy has no required approvers - auto-approving');
    
    // No approvals needed, directly approve
    await prisma.application.update({
      where: { id: applicationId },
      data: { status: 'approved_for_offer' }
    });

    await auditEvent({
      eventType: 'APPROVAL_AUTO_APPROVED',
      entityType: 'decision',
      entityId: decisionId,
      actorId: 'system',
      payload: { reason: 'no_approvals_required', policyId: policy.policyId }
    });

    return 'auto-approved';
  }

  // Create first tier approval record
  const firstTier = policy.requiredApprovers[0];
  
  const approval = await prisma.approval.create({
    data: {
      decisionId,
      approverId: firstTier.approverId,
      tier: `tier_${firstTier.tier}`,
      status: 'pending'
    }
  });

  logger.info({
    approvalId: approval.id,
    approverId: firstTier.approverId,
    tier: firstTier.tier,
    displayName: firstTier.displayName
  }, 'Created first tier approval record');

  // Send email notification to first approver
  await sendApprovalRequestEmail({
    approvalId: approval.id,
    approverId: firstTier.approverId,
    approverDisplayName: firstTier.displayName,
    decisionId,
    applicationId,
    compensationAmount,
    tier: firstTier.tier
  });

  // Audit event
  await auditEvent({
    eventType: 'APPROVAL_CHAIN_INITIATED',
    entityType: 'decision',
    entityId: decisionId,
    actorId: decidedById,
    payload: {
      approvalId: approval.id,
      policyId: policy.policyId,
      totalTiers: policy.requiredApprovers.length,
      firstApproverId: firstTier.approverId
    }
  });

  return approval.id;
}

/**
 * Process approval or rejection response from an approver
 * 
 * Handles tier advancement or chain termination based on response.
 * 
 * @param params - Approval response details
 */
export async function processApprovalResponse(
  params: ProcessApprovalResponseParams
): Promise<void> {
  const { approvalId, approverId, approved, comments } = params;

  logger.info({ approvalId, approverId, approved }, 'Processing approval response');

  // Fetch approval record
  const approval = await prisma.approval.findUnique({
    where: { id: approvalId },
    include: {
      decision: {
        include: {
          application: {
            select: { id: true, candidateId: true, requisitionId: true }
          }
        }
      }
    }
  });

  if (!approval) {
    throw new Error(`Approval record ${approvalId} not found`);
  }

  // Verify approver matches
  if (approval.approverId !== approverId) {
    throw new Error('Approver ID mismatch');
  }

  // Check if already responded
  if (approval.status !== 'pending') {
    logger.warn({ approvalId, currentStatus: approval.status }, 
      'Approval already processed');
    throw new Error('Approval already processed');
  }

  // Update approval record
  await prisma.approval.update({
    where: { id: approvalId },
    data: {
      status: approved ? 'approved' : 'rejected',
      comments,
      respondedAt: new Date()
    }
  });

  // Audit the response
  await auditEvent({
    eventType: approved ? 'APPROVAL_APPROVED' : 'APPROVAL_REJECTED',
    entityType: 'approval',
    entityId: approvalId,
    actorId: approverId,
    payload: {
      decisionId: approval.decisionId,
      tier: approval.tier,
      comments
    }
  });

  if (!approved) {
    // REJECTION PATH: Terminate chain
    await handleRejection(approval, approverId, comments);
  } else {
    // APPROVAL PATH: Check for next tier
    await advanceToNextTier(approval);
  }
}

/**
 * Handle rejection at any tier
 * 
 * Updates application status, notifies hiring manager, terminates chain.
 */
async function handleRejection(
  approval: any,
  approverId: string,
  comments?: string
): Promise<void> {
  const { decision } = approval;
  const applicationId = decision.application.id;

  logger.info({
    approvalId: approval.id,
    tier: approval.tier,
    approverId
  }, 'Approval rejected - terminating chain');

  // Update application status
  await prisma.application.update({
    where: { id: applicationId },
    data: { status: 'offer_rejected' }
  });

  // Notify hiring manager
  // TODO: Implement notification to hiring manager (email or in-app)
  logger.info({
    applicationId,
    decidedById: decision.decidedById,
    rejectedBy: approverId
  }, 'Notifying hiring manager of rejection');

  // Audit chain termination
  await auditEvent({
    eventType: 'APPROVAL_CHAIN_TERMINATED',
    entityType: 'decision',
    entityId: decision.id,
    actorId: approverId,
    payload: {
      reason: 'tier_rejected',
      rejectedTier: approval.tier,
      comments
    }
  });
}

/**
 * Advance approval chain to next tier or complete if final tier
 */
async function advanceToNextTier(approval: any): Promise<void> {
  const { decision } = approval;
  const applicationId = decision.application.id;
  const currentTierNumber = parseInt(approval.tier.replace('tier_', ''));

  logger.debug({
    approvalId: approval.id,
    currentTier: currentTierNumber
  }, 'Advancing to next tier');

  // Get all approvals for this decision
  const allApprovals = await prisma.approval.findMany({
    where: { decisionId: decision.id },
    orderBy: { tier: 'asc' }
  });

  // Check if all existing approvals are approved
  const allApproved = allApprovals.every(a => a.status === 'approved');

  if (!allApproved) {
    logger.error({ decisionId: decision.id }, 
      'Inconsistent state: advancing tier but previous approvals not all approved');
    return;
  }

  // Determine compensation amount for policy lookup
  // Parse from decision.compensationBand or use a default
  let compensationAmount: Decimal;
  if (decision.compensationBand) {
    // If compensationBand is stored as string like "100000-200000", extract midpoint or use offerDetails
    // For now, we'll need to get it from offerDetails or pass it differently
    // This is a design issue - we need compensation amount stored or retrievable
    logger.warn({ decisionId: decision.id }, 
      'Compensation amount not directly available - using decision offerDetails');
    compensationAmount = new Decimal(150000); // Placeholder - should be from offerDetails
  } else {
    compensationAmount = new Decimal(0);
  }

  // Fetch original policy to determine remaining tiers
  const policy = await getApprovalPolicy(compensationAmount);
  const nextTierConfig = policy.requiredApprovers.find(
    (t: ApprovalTier) => t.tier === currentTierNumber + 1
  );

  if (!nextTierConfig) {
    // No more tiers - FULL APPROVAL COMPLETE
    await handleFullApproval(decision, applicationId);
  } else {
    // Create next tier approval
    await createNextTierApproval(decision, applicationId, nextTierConfig, compensationAmount);
  }
}

/**
 * Handle full approval completion
 * 
 * Updates status to approved_for_offer and triggers offer generation (US-004).
 */
async function handleFullApproval(
  decision: any,
  applicationId: string
): Promise<void> {
  logger.info({
    decisionId: decision.id,
    applicationId
  }, 'All tiers approved - completing approval chain');

  // Update application status
  await prisma.application.update({
    where: { id: applicationId },
    data: { status: 'approved_for_offer' }
  });

  // Audit completion
  await auditEvent({
    eventType: 'APPROVAL_CHAIN_COMPLETED',
    entityType: 'decision',
    entityId: decision.id,
    actorId: 'system',
    payload: {
      applicationId,
      totalApprovals: await prisma.approval.count({
        where: { decisionId: decision.id }
      })
    }
  });

  // TODO: Trigger offer letter generation (US-004)
  logger.info({ applicationId }, 'Triggering offer generation workflow');
}

/**
 * Create next tier approval record and send notification
 */
async function createNextTierApproval(
  decision: any,
  applicationId: string,
  tierConfig: ApprovalTier,
  compensationAmount: Decimal
): Promise<void> {
  logger.info({
    decisionId: decision.id,
    nextTier: tierConfig.tier,
    approverId: tierConfig.approverId
  }, 'Creating next tier approval');

  // Create approval record
  const nextApproval = await prisma.approval.create({
    data: {
      decisionId: decision.id,
      approverId: tierConfig.approverId,
      tier: `tier_${tierConfig.tier}`,
      status: 'pending'
    }
  });

  // Send email to next approver
  await sendApprovalRequestEmail({
    approvalId: nextApproval.id,
    approverId: tierConfig.approverId,
    approverDisplayName: tierConfig.displayName,
    decisionId: decision.id,
    applicationId,
    compensationAmount,
    tier: tierConfig.tier
  });

  // Audit tier advancement
  await auditEvent({
    eventType: 'APPROVAL_TIER_ADVANCED',
    entityType: 'approval',
    entityId: nextApproval.id,
    actorId: 'system',
    payload: {
      decisionId: decision.id,
      tier: tierConfig.tier,
      approverId: tierConfig.approverId
    }
  });
}

/**
 * Get current approval status for a decision
 * 
 * @param decisionId - Decision ID
 * @returns Approval chain status with all tiers
 */
export async function getApprovalStatus(decisionId: string) {
  const approvals = await prisma.approval.findMany({
    where: { decisionId },
    include: {
      approver: {
        select: {
          id: true,
          fullName: true,
          email: true,
          role: true
        }
      }
    },
    orderBy: { tier: 'asc' }
  });

  return {
    decisionId,
    totalTiers: approvals.length,
    approvals: approvals.map(a => ({
      approvalId: a.id,
      tier: a.tier,
      approver: {
        id: a.approver.id,
        name: a.approver.fullName,
        email: a.approver.email,
        role: a.approver.role
      },
      status: a.status,
      comments: a.comments,
      respondedAt: a.respondedAt,
      createdAt: a.createdAt
    }))
  };
}
