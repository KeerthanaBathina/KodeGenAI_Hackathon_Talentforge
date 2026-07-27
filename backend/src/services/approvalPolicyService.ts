import { prisma } from '../db/prisma';
import { Decimal } from '@prisma/client/runtime/library';
import logger from '../utils/logger';

export interface ApprovalTier {
  tier: number;
  role: string;
  approverId: string;
  displayName: string;
}

export interface ApprovalPolicyResult {
  policyId: string;
  requiredApprovers: ApprovalTier[];
  compensationBandMin: Decimal;
  compensationBandMax: Decimal;
}

export class ApprovalPolicyNotFoundError extends Error {
  constructor(compensationAmount: Decimal) {
    super(`No active approval policy found for compensation amount: ${compensationAmount}`);
    this.name = 'ApprovalPolicyNotFoundError';
  }
}

/**
 * Query approval policy for a given compensation amount
 * 
 * @param compensationAmount - The compensation amount to find policy for
 * @returns Approval policy with ordered list of required approvers
 * @throws ApprovalPolicyNotFoundError if no active policy matches
 */
export async function getApprovalPolicy(
  compensationAmount: Decimal
): Promise<ApprovalPolicyResult> {
  logger.debug({ compensationAmount: compensationAmount.toString() }, 
    'Querying approval policy');

  // Query active policy that encompasses the compensation amount
  const policy = await prisma.approvalPolicy.findFirst({
    where: {
      active: true,
      compensationBandMin: { lte: compensationAmount },
      compensationBandMax: { gte: compensationAmount }
    },
    orderBy: {
      effectiveFrom: 'desc' // Get most recent policy if multiple match
    }
  });

  if (!policy) {
    logger.warn({ compensationAmount: compensationAmount.toString() }, 
      'No approval policy found for compensation amount');
    throw new ApprovalPolicyNotFoundError(compensationAmount);
  }

  // Parse and validate requiredApprovers JSON
  const requiredApprovers = policy.requiredApprovers as ApprovalTier[];
  
  // Sort by tier to ensure correct order
  const sortedApprovers = [...requiredApprovers].sort((a, b) => a.tier - b.tier);

  logger.info({
    policyId: policy.id,
    tierCount: sortedApprovers.length,
    tiers: sortedApprovers.map(a => `${a.tier}: ${a.role}`)
  }, 'Approval policy determined');

  return {
    policyId: policy.id,
    requiredApprovers: sortedApprovers,
    compensationBandMin: policy.compensationBandMin,
    compensationBandMax: policy.compensationBandMax
  };
}

/**
 * Validate that all approvers in a policy exist and have required permissions
 * 
 * @param policyId - Policy ID to validate
 * @returns Validation result with any missing or invalid approvers
 */
export async function validateApprovalPolicy(
  policyId: string
): Promise<{ valid: boolean; errors: string[] }> {
  const policy = await prisma.approvalPolicy.findUnique({
    where: { id: policyId }
  });

  if (!policy) {
    return { valid: false, errors: ['Policy not found'] };
  }

  const requiredApprovers = policy.requiredApprovers as ApprovalTier[];
  const errors: string[] = [];

  // Verify each approver exists
  for (const approver of requiredApprovers) {
    const user = await prisma.user.findUnique({
      where: { id: approver.approverId },
      select: { id: true, role: true }
    });

    if (!user) {
      errors.push(`Approver ${approver.displayName} (${approver.approverId}) not found`);
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Get all active approval policies for administrative viewing
 * 
 * @returns List of all active policies with basic info
 */
export async function listActivePolicies(): Promise<ApprovalPolicyResult[]> {
  const policies = await prisma.approvalPolicy.findMany({
    where: { active: true },
    orderBy: { compensationBandMin: 'asc' }
  });

  return policies.map(policy => ({
    policyId: policy.id,
    requiredApprovers: policy.requiredApprovers as ApprovalTier[],
    compensationBandMin: policy.compensationBandMin,
    compensationBandMax: policy.compensationBandMax
  }));
}
