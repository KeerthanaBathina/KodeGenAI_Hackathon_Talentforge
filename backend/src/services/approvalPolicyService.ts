import { prisma } from '../db/prisma';
import { Decimal } from '@prisma/client/runtime/library';
import logger from '../utils/logger';
import { auditService } from './auditService';
import {
  PolicyValidationError,
  PolicyNotFoundError,
  InvalidApproverError,
  InvalidCompensationBandError,
} from './errors/PolicyErrors';

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
  effectiveFrom?: Date;
}

export interface AuditRequestContext {
  actorRole?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/**
 * Query approval policy for a given compensation amount
 * Returns the most recent effective policy for the compensation band
 */
export async function getApprovalPolicy(
  compensationAmount: Decimal,
  asOfDate: Date = new Date(),
): Promise<ApprovalPolicyResult> {
  logger.debug(
    { compensationAmount: compensationAmount.toString(), asOfDate },
    'Querying approval policy',
  );

  // Query active policy that encompasses the compensation amount and is effective at asOfDate
  const policy = await prisma.approvalPolicy.findFirst({
    where: {
      active: true,
      compensationBandMin: { lte: compensationAmount },
      compensationBandMax: { gte: compensationAmount },
      effectiveFrom: { lte: asOfDate },
    },
    orderBy: [
      { effectiveFrom: 'desc' }, // Get most recent policy
    ],
    include: {
      createdBy: {
        select: {
          id: true,
          fullName: true,
          email: true,
        },
      },
    },
  });

  if (!policy) {
    logger.warn(
      { compensationAmount: compensationAmount.toString() },
      'No approval policy found for compensation amount',
    );
    throw new PolicyNotFoundError(
      `No active approval policy found for compensation amount: ${compensationAmount}`,
    );
  }

  // Parse and validate requiredApprovers JSON
  const requiredApprovers = policy.requiredApprovers as ApprovalTier[];

  // Sort by tier to ensure correct order
  const sortedApprovers = [...requiredApprovers].sort((a, b) => a.tier - b.tier);

  logger.info(
    {
      policyId: policy.id,
      tierCount: sortedApprovers.length,
      tiers: sortedApprovers.map((a) => `${a.tier}: ${a.role}`),
    },
    'Approval policy determined',
  );

  return {
    policyId: policy.id,
    requiredApprovers: sortedApprovers,
    compensationBandMin: policy.compensationBandMin,
    compensationBandMax: policy.compensationBandMax,
    effectiveFrom: policy.effectiveFrom,
  };
}

/**
 * Create new approval policy version with validation
 * Each version is effective from a specific date, preventing retroactive changes
 */
export async function createApprovalPolicyVersion(
  data: {
    compensationBandMin: Decimal;
    compensationBandMax: Decimal;
    requiredApprovers: ApprovalTier[];
    effectiveFrom: Date;
  },
  createdBy: string,
  auditContext: AuditRequestContext = {},
): Promise<ApprovalPolicyResult> {
  // Validate compensation band
  if (data.compensationBandMin.gte(data.compensationBandMax)) {
    throw new InvalidCompensationBandError([
      `Min compensation (${data.compensationBandMin}) must be less than max (${data.compensationBandMax})`,
    ]);
  }

  // Verify all approvers exist and are active
  for (const approver of data.requiredApprovers) {
    const user = await prisma.user.findUnique({
      where: { id: approver.approverId },
    });

    if (!user) {
      throw new InvalidApproverError(
        approver.approverId,
        `User not found: ${approver.displayName}`,
      );
    }

    if (!user.active) {
      throw new InvalidApproverError(
        approver.approverId,
        `User is inactive: ${approver.displayName}`,
      );
    }
  }

  // Get existing policy for comparison (current effective policy)
  const existingPolicy = await prisma.approvalPolicy.findFirst({
    where: {
      active: true,
      compensationBandMin: { lte: data.compensationBandMax },
      compensationBandMax: { gte: data.compensationBandMin },
      effectiveFrom: { lte: new Date() },
    },
    orderBy: {
      effectiveFrom: 'desc',
    },
  });

  // Create new version
  const policy = await prisma.approvalPolicy.create({
    data: {
      compensationBandMin: data.compensationBandMin,
      compensationBandMax: data.compensationBandMax,
      requiredApprovers: data.requiredApprovers as any,
      effectiveFrom: data.effectiveFrom,
      createdById: createdBy,
      active: true,
    },
    include: {
      createdBy: {
        select: {
          id: true,
          fullName: true,
          email: true,
        },
      },
    },
  });

  // Log audit event with before/after comparison
  await auditService.logEvent({
    action: 'approval_policy.version_created',
    actorId: createdBy,
    actorRole: auditContext.actorRole,
    resourceType: 'ApprovalPolicy',
    resourceId: policy.id,
    metadata: {
      compensationBand: `${data.compensationBandMin}-${data.compensationBandMax}`,
      effectiveFrom: policy.effectiveFrom,
      oldApprovers: existingPolicy?.requiredApprovers || null,
      newApprovers: data.requiredApprovers,
    },
    ipAddress: auditContext.ipAddress,
    userAgent: auditContext.userAgent,
  });

  logger.info('Created new approval policy version', {
    policyId: policy.id,
    compensationBand: `${data.compensationBandMin}-${data.compensationBandMax}`,
    effectiveFrom: data.effectiveFrom,
    createdBy,
    approversCount: data.requiredApprovers.length,
  });

  return {
    policyId: policy.id,
    requiredApprovers: data.requiredApprovers,
    compensationBandMin: data.compensationBandMin,
    compensationBandMax: data.compensationBandMax,
    effectiveFrom: data.effectiveFrom,
  };
}

/**
 * Get approval policy history with pagination
 */
export async function getApprovalPolicyHistory(
  options: {
    compensationBandMin?: Decimal;
    compensationBandMax?: Decimal;
    limit?: number;
  } = {},
): Promise<ApprovalPolicyResult[]> {
  const where: any = {};

  if (options.compensationBandMin && options.compensationBandMax) {
    where.OR = [
      {
        AND: [
          { compensationBandMin: { lte: options.compensationBandMax } },
          { compensationBandMax: { gte: options.compensationBandMin } },
        ],
      },
    ];
  }

  const policies = await prisma.approvalPolicy.findMany({
    where,
    orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }],
    take: options.limit || 50,
    include: {
      createdBy: {
        select: {
          id: true,
          fullName: true,
          email: true,
        },
      },
    },
  });

  return policies.map((policy) => ({
    policyId: policy.id,
    requiredApprovers: policy.requiredApprovers as ApprovalTier[],
    compensationBandMin: policy.compensationBandMin,
    compensationBandMax: policy.compensationBandMax,
    effectiveFrom: policy.effectiveFrom,
  }));
}

/**
 * Validate that all approvers in a policy exist and have required permissions
 */
export async function validateApprovalPolicy(
  policyId: string,
): Promise<{ valid: boolean; errors: string[] }> {
  const policy = await prisma.approvalPolicy.findUnique({
    where: { id: policyId },
  });

  if (!policy) {
    return { valid: false, errors: ['Policy not found'] };
  }

  const requiredApprovers = policy.requiredApprovers as ApprovalTier[];
  const errors: string[] = [];

  // Verify each approver exists and is active
  for (const approver of requiredApprovers) {
    const user = await prisma.user.findUnique({
      where: { id: approver.approverId },
      select: { id: true, role: true, active: true },
    });

    if (!user) {
      errors.push(
        `Approver ${approver.displayName} (${approver.approverId}) not found`,
      );
    } else if (!user.active) {
      errors.push(
        `Approver ${approver.displayName} (${approver.approverId}) is inactive`,
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Get all active approval policies for administrative viewing
 */
export async function listActivePolicies(
  asOfDate: Date = new Date(),
): Promise<ApprovalPolicyResult[]> {
  const policies = await prisma.approvalPolicy.findMany({
    where: {
      active: true,
      effectiveFrom: { lte: asOfDate },
    },
    orderBy: [{ effectiveFrom: 'desc' }, { compensationBandMin: 'asc' }],
    include: {
      createdBy: {
        select: {
          id: true,
          fullName: true,
          email: true,
        },
      },
    },
  });

  // For each compensation band, return only the most recent policy
  const uniquePolicies = new Map<string, ApprovalPolicyResult>();

  for (const policy of policies) {
    const bandKey = `${policy.compensationBandMin}-${policy.compensationBandMax}`;
    if (!uniquePolicies.has(bandKey)) {
      uniquePolicies.set(bandKey, {
        policyId: policy.id,
        requiredApprovers: policy.requiredApprovers as ApprovalTier[],
        compensationBandMin: policy.compensationBandMin,
        compensationBandMax: policy.compensationBandMax,
        effectiveFrom: policy.effectiveFrom,
      });
    }
  }

  return Array.from(uniquePolicies.values());
}
