import { prisma } from '../db/prisma';
import logger from '../utils/logger';
import { auditService } from './auditService';
import {
  PolicyNotFoundError,
  InvalidThresholdRangeError,
} from './errors/PolicyErrors';

export interface ScreeningThresholds {
  id: string;
  shortlistThreshold: number;
  borderlineMin: number;
  borderlineMax: number;
  rejectThreshold: number;
  version: number;
  effectiveFrom: Date;
  createdAt: Date;
}

export type RecommendationType = 'shortlist' | 'manual_review' | 'reject';

export interface AuditRequestContext {
  actorRole?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

const SCREENING_THRESHOLD_SELECT = {
  id: true,
  shortlistThreshold: true,
  borderlineMin: true,
  borderlineMax: true,
  rejectThreshold: true,
  version: true,
  effectiveFrom: true,
  createdAt: true,
} as const;

// In-memory cache for active thresholds
let cachedThresholds: ScreeningThresholds | null = null;
let cacheTimestamp: number = 0;
const CACHE_TTL = 60000; // 1 minute

/**
 * Validate threshold ranges and logical ordering
 */
function validateThresholdRanges(data: {
  shortlistThreshold: number;
  borderlineMin: number;
  borderlineMax: number;
  rejectThreshold: number;
}): void {
  const errors: string[] = [];

  // All values must be 0-100
  if (data.shortlistThreshold < 0 || data.shortlistThreshold > 100) {
    errors.push('Shortlist threshold must be between 0 and 100');
  }
  if (data.borderlineMin < 0 || data.borderlineMin > 100) {
    errors.push('Borderline min must be between 0 and 100');
  }
  if (data.borderlineMax < 0 || data.borderlineMax > 100) {
    errors.push('Borderline max must be between 0 and 100');
  }
  if (data.rejectThreshold < 0 || data.rejectThreshold > 100) {
    errors.push('Reject threshold must be between 0 and 100');
  }

  // Logical order: reject < borderlineMin < borderlineMax < shortlist
  if (data.rejectThreshold >= data.borderlineMin) {
    errors.push('Reject threshold must be less than borderline min');
  }
  if (data.borderlineMin >= data.borderlineMax) {
    errors.push('Borderline min must be less than borderline max');
  }
  if (data.borderlineMax >= data.shortlistThreshold) {
    errors.push('Borderline max must be less than shortlist threshold');
  }

  if (errors.length > 0) {
    throw new InvalidThresholdRangeError(errors);
  }
}

/**
 * Get active thresholds with caching (for current date)
 */
export async function getActiveThresholds(): Promise<ScreeningThresholds> {
  return getEffectiveThreshold(new Date());
}

/**
 * Get effective threshold at specific date
 * Critical for in-flight application isolation
 */
export async function getEffectiveThreshold(
  asOfDate: Date = new Date(),
): Promise<ScreeningThresholds> {
  const now = Date.now();

  // Check cache only for current date
  if (
    cachedThresholds &&
    asOfDate.getTime() === Math.floor(Date.now() / (24 * 60 * 60 * 1000)) * (24 * 60 * 60 * 1000) &&
    now - cacheTimestamp < CACHE_TTL
  ) {
    return cachedThresholds;
  }

  // Fetch from database
  const thresholds = await prisma.screeningThreshold.findFirst({
    where: {
      effectiveFrom: {
        lte: asOfDate,
      },
    },
    orderBy: {
      effectiveFrom: 'desc',
    },
    select: SCREENING_THRESHOLD_SELECT,
  });

  if (!thresholds) {
    throw new PolicyNotFoundError('No effective screening threshold found');
  }

  const result = thresholds as ScreeningThresholds;

  // Cache only if this is for the current date
  if (
    asOfDate.getTime() === Math.floor(Date.now() / (24 * 60 * 60 * 1000)) * (24 * 60 * 60 * 1000)
  ) {
    cachedThresholds = result;
    cacheTimestamp = now;
  }

  logger.info('Loaded effective thresholds', {
    version: result.version,
    shortlist: result.shortlistThreshold,
    borderline: `${result.borderlineMin}-${result.borderlineMax}`,
    asOfDate: asOfDate.toISOString(),
  });

  return result;
}

/**
 * Get screening recommendation based on score and thresholds
 */
export function getRecommendation(
  score: number,
  thresholds: ScreeningThresholds,
): RecommendationType {
  if (score >= thresholds.shortlistThreshold) {
    return 'shortlist';
  }

  if (score <= thresholds.rejectThreshold) {
    return 'reject';
  }

  // Between reject and shortlist = manual review
  return 'manual_review';
}

/**
 * Create new threshold version with validation and audit logging
 */
export async function createScreeningThresholdVersion(
  data: {
    shortlistThreshold: number;
    borderlineMin: number;
    borderlineMax: number;
    rejectThreshold: number;
    effectiveFrom: Date;
  },
  createdBy: string,
  auditContext: AuditRequestContext = {},
): Promise<ScreeningThresholds> {
  // Validate thresholds
  validateThresholdRanges(data);

  // Get latest version for comparison
  const latestVersion = await prisma.screeningThreshold.findFirst({
    orderBy: { version: 'desc' },
    select: SCREENING_THRESHOLD_SELECT,
  });

  const newVersion = (latestVersion?.version || 0) + 1;

  // Create new version
  const threshold = await prisma.screeningThreshold.create({
    data: {
      ...data,
      version: newVersion,
    },
    select: SCREENING_THRESHOLD_SELECT,
  });

  // Log audit event with before/after values
  await auditService.logEvent({
    action: 'threshold.version_created',
    actorId: createdBy,
    actorRole: auditContext.actorRole,
    resourceType: 'ScreeningThreshold',
    resourceId: threshold.id,
    metadata: {
      version: newVersion,
      effectiveFrom: threshold.effectiveFrom,
      oldValues: latestVersion
        ? {
            shortlistThreshold: latestVersion.shortlistThreshold,
            borderlineMin: latestVersion.borderlineMin,
            borderlineMax: latestVersion.borderlineMax,
            rejectThreshold: latestVersion.rejectThreshold,
          }
        : null,
      newValues: {
        shortlistThreshold: data.shortlistThreshold,
        borderlineMin: data.borderlineMin,
        borderlineMax: data.borderlineMax,
        rejectThreshold: data.rejectThreshold,
      },
    },
    ipAddress: auditContext.ipAddress,
    userAgent: auditContext.userAgent,
  });

  // Clear cache
  clearThresholdCache();

  logger.info('Created new screening threshold version', {
    version: newVersion,
    effectiveFrom: threshold.effectiveFrom,
    createdBy,
  });

  return threshold as ScreeningThresholds;
}

export async function createThresholdVersion(
  data: {
    shortlistThreshold: number;
    borderlineMin: number;
    borderlineMax: number;
    rejectThreshold: number;
    effectiveFrom?: Date;
  },
  createdBy: string = 'system-thresholds',
  auditContext: AuditRequestContext = {},
): Promise<ScreeningThresholds> {
  return createScreeningThresholdVersion(
    {
      shortlistThreshold: data.shortlistThreshold,
      borderlineMin: data.borderlineMin,
      borderlineMax: data.borderlineMax,
      rejectThreshold: data.rejectThreshold,
      effectiveFrom: data.effectiveFrom ?? new Date(),
    },
    createdBy,
    auditContext,
  );
}

/**
 * Get threshold history with pagination
 */
export async function getThresholdHistory(
  limit: number = 50,
): Promise<Array<ScreeningThresholds & { changedBy?: string }>> {
  return (await prisma.screeningThreshold.findMany({
    orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }],
    take: limit,
    select: SCREENING_THRESHOLD_SELECT,
  })) as Array<ScreeningThresholds & { changedBy?: string }>;
}

/**
 * Clear threshold cache
 */
export function clearThresholdCache(): void {
  cachedThresholds = null;
  cacheTimestamp = 0;
}
