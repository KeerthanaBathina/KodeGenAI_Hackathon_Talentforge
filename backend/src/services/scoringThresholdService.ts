/**
 * Scoring Threshold Service - Version-aware threshold management per job family
 * Implements effective-date-based policy versioning for AI scoring thresholds
 */

import { Decimal } from '@prisma/client/runtime/library';
import { prisma } from '../db/prisma';
import logger from '../utils/logger';
import { auditService } from './auditService';
import { PolicyValidationError, PolicyNotFoundError } from './errors/PolicyErrors';

export interface ScoringThresholdData {
  id: string;
  jobFamilyId: string;
  aiShortlistThreshold: Decimal;
  confidenceThreshold: Decimal;
  experienceThresholdYears: number;
  effectiveFrom: Date;
  createdById: string;
  createdAt: Date;
  createdBy?: {
    id: string;
    fullName: string;
    email: string;
  };
}

export interface AuditRequestContext {
  actorRole?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/**
 * Validate scoring threshold values
 */
function validateScoringThresholds(data: {
  aiShortlistThreshold: number;
  confidenceThreshold: number;
  experienceThresholdYears: number;
}): void {
  const errors: string[] = [];

  // AI shortlist threshold: 0.0-1.0
  if (data.aiShortlistThreshold < 0 || data.aiShortlistThreshold > 1) {
    errors.push(
      'AI shortlist threshold must be between 0 and 1 (e.g., 0.75 for 75%)',
    );
  }

  // Confidence threshold: 0.0-1.0
  if (data.confidenceThreshold < 0 || data.confidenceThreshold > 1) {
    errors.push(
      'Confidence threshold must be between 0 and 1 (e.g., 0.8 for 80%)',
    );
  }

  // Experience threshold: 0-50 years
  if (data.experienceThresholdYears < 0 || data.experienceThresholdYears > 50) {
    errors.push('Experience threshold must be between 0 and 50 years');
  }

  if (errors.length > 0) {
    throw new PolicyValidationError(
      'Invalid scoring threshold values',
      errors,
    );
  }
}

/**
 * Create new scoring threshold version for job family
 * Each version captures different thresholds at different effective dates
 */
export async function createScoringThresholdVersion(
  data: {
    jobFamilyId: string;
    aiShortlistThreshold: number;
    confidenceThreshold: number;
    experienceThresholdYears: number;
    effectiveFrom: Date;
  },
  createdBy: string,
  auditContext: AuditRequestContext = {},
): Promise<ScoringThresholdData> {
  // Validate ranges
  validateScoringThresholds({
    aiShortlistThreshold: data.aiShortlistThreshold,
    confidenceThreshold: data.confidenceThreshold,
    experienceThresholdYears: data.experienceThresholdYears,
  });

  // Verify job family exists
  const jobFamily = await prisma.jobFamily.findUnique({
    where: { id: data.jobFamilyId },
  });

  if (!jobFamily) {
    throw new PolicyNotFoundError(`Job family ${data.jobFamilyId} not found`);
  }

  // Verify actor exists and is active
  const actor = await prisma.user.findUnique({
    where: { id: createdBy },
  });

  if (!actor || !actor.active) {
    throw new PolicyValidationError('Invalid actor', [
      'User creating threshold not found or inactive',
    ]);
  }

  // Get existing threshold for comparison
  const existingThreshold = await getEffectiveScoringThreshold(
    data.jobFamilyId,
    new Date(),
  );

  // Create new version
  const threshold = await prisma.scoringThreshold.create({
    data: {
      jobFamilyId: data.jobFamilyId,
      aiShortlistThreshold: new Decimal(data.aiShortlistThreshold),
      confidenceThreshold: new Decimal(data.confidenceThreshold),
      experienceThresholdYears: data.experienceThresholdYears,
      effectiveFrom: data.effectiveFrom,
      createdById: createdBy,
    },
    include: {
      createdBy: {
        select: {
          id: true,
          fullName: true,
          email: true,
        },
      },
      jobFamily: true,
    },
  });

  // Log audit event with before/after comparison
  await auditService.logEvent({
    action: 'scoring_threshold.version_created',
    actorId: createdBy,
    actorRole: auditContext.actorRole,
    resourceType: 'ScoringThreshold',
    resourceId: threshold.id,
    metadata: {
      jobFamilyId: data.jobFamilyId,
      jobFamilyName: jobFamily.name,
      effectiveFrom: threshold.effectiveFrom,
      oldValues: existingThreshold
        ? {
            aiShortlistThreshold: existingThreshold.aiShortlistThreshold.toNumber(),
            confidenceThreshold: existingThreshold.confidenceThreshold.toNumber(),
            experienceThresholdYears: existingThreshold.experienceThresholdYears,
          }
        : null,
      newValues: {
        aiShortlistThreshold: data.aiShortlistThreshold,
        confidenceThreshold: data.confidenceThreshold,
        experienceThresholdYears: data.experienceThresholdYears,
      },
    },
    ipAddress: auditContext.ipAddress,
    userAgent: auditContext.userAgent,
  });

  logger.info('Created new scoring threshold version', {
    jobFamilyId: data.jobFamilyId,
    jobFamilyName: jobFamily.name,
    effectiveFrom: threshold.effectiveFrom,
    createdBy: actor.email,
  });

  return threshold as ScoringThresholdData;
}

/**
 * Get effective scoring threshold for job family at specific date
 * Critical for in-flight application isolation
 */
export async function getEffectiveScoringThreshold(
  jobFamilyId: string,
  asOfDate: Date = new Date(),
): Promise<ScoringThresholdData | null> {
  const threshold = await prisma.scoringThreshold.findFirst({
    where: {
      jobFamilyId,
      effectiveFrom: { lte: asOfDate },
    },
    orderBy: {
      effectiveFrom: 'desc',
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

  return threshold as ScoringThresholdData | null;
}

/**
 * Get scoring threshold history for job family with pagination
 */
export async function getScoringThresholdHistory(
  jobFamilyId: string,
  options: {
    limit?: number;
  } = {},
): Promise<ScoringThresholdData[]> {
  const thresholds = await prisma.scoringThreshold.findMany({
    where: { jobFamilyId },
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

  return thresholds as ScoringThresholdData[];
}

/**
 * Get all current effective thresholds for all job families
 */
export async function getAllEffectiveScoringThresholds(
  asOfDate: Date = new Date(),
): Promise<ScoringThresholdData[]> {
  // Get all job families
  const jobFamilies = await prisma.jobFamily.findMany({
    select: { id: true },
  });

  const thresholds: ScoringThresholdData[] = [];

  for (const jobFamily of jobFamilies) {
    const threshold = await getEffectiveScoringThreshold(
      jobFamily.id,
      asOfDate,
    );
    if (threshold) {
      thresholds.push(threshold);
    }
  }

  return thresholds;
}

/**
 * Validate that a threshold change won't affect in-flight applications
 * Returns error if trying to set effective date in the past (retroactive change)
 */
export async function validateEffectiveDateSafety(
  effectiveFrom: Date,
): Promise<void> {
  // Effective date must be in the future or today
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (effectiveFrom < today) {
    throw new PolicyValidationError(
      'Cannot create policy with retroactive effective date',
      [
        'Effective date must be today or in the future to prevent affecting in-flight applications',
      ],
    );
  }
}
