/**
 * Admin Scoring Thresholds Management Routes
 *
 * REST API endpoints for managing job-family-specific AI scoring thresholds with versioning.
 * All routes require admin authentication.
 *
 * @module routes/admin/scoringThresholds
 */

import express, { Request, Response, NextFunction } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { prisma } from '../../db/prisma';
import {
  createScoringThresholdVersion,
  getEffectiveScoringThreshold,
  getScoringThresholdHistory,
  getAllEffectiveScoringThresholds,
  validateEffectiveDateSafety,
} from '../../services/scoringThresholdService';
import { buildAuditContextFromRequest } from '../../services/auditContextService';
import {
  PolicyValidationError,
  PolicyNotFoundError,
} from '../../services/errors/PolicyErrors';
import logger from '../../utils/logger';

const router = express.Router();

// All routes require authentication and admin role
router.use(authenticate);
router.use(authorize(['admin']));

// ============================================================================
// GET /api/admin/scoring-thresholds
// ============================================================================

router.get('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const jobFamilyId = req.query.jobFamilyId as string | undefined;
    const activeOnly = req.query.activeOnly === 'true';

    if (activeOnly) {
      const thresholds = await getAllEffectiveScoringThresholds(new Date());

      const filtered = jobFamilyId
        ? thresholds.filter((t) => t.jobFamilyId === jobFamilyId)
        : thresholds;

      res.set('Cache-Control', 'no-cache, no-store, must-revalidate');

      res.json({
        thresholds: filtered.map((t) => ({
          id: t.id,
          jobFamilyId: t.jobFamilyId,
          aiShortlistThreshold: t.aiShortlistThreshold.toNumber(),
          confidenceThreshold: t.confidenceThreshold.toNumber(),
          experienceThresholdYears: t.experienceThresholdYears,
          effectiveFrom: t.effectiveFrom.toISOString(),
          createdAt: t.createdAt.toISOString(),
          createdBy: t.createdBy,
        })),
        total: filtered.length,
      });
    } else {
      // Get all thresholds (latest version per job family)
      const jobFamilies = await prisma.jobFamily.findMany({
        select: { id: true, name: true },
      });

      const results = await Promise.all(
        jobFamilies.map(async (jf) => {
          const threshold = await getEffectiveScoringThreshold(jf.id);
          return threshold ? { ...threshold, jobFamilyName: jf.name } : null;
        }),
      );

      const filtered = results
        .filter((r) => r !== null && (!jobFamilyId || r.jobFamilyId === jobFamilyId))
        .map((t) => ({
          id: t!.id,
          jobFamilyId: t!.jobFamilyId,
          jobFamilyName: (t as any).jobFamilyName,
          aiShortlistThreshold: t!.aiShortlistThreshold.toNumber(),
          confidenceThreshold: t!.confidenceThreshold.toNumber(),
          experienceThresholdYears: t!.experienceThresholdYears,
          effectiveFrom: t!.effectiveFrom.toISOString(),
          createdAt: t!.createdAt.toISOString(),
          createdBy: t!.createdBy,
        }));

      res.set('Cache-Control', 'no-cache, no-store, must-revalidate');

      res.json({
        thresholds: filtered,
        total: filtered.length,
      });
    }
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// GET /api/admin/scoring-thresholds/:jobFamilyId/history
// ============================================================================

router.get(
  '/:jobFamilyId/history',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { jobFamilyId } = req.params;
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);

      // Verify job family exists
      const jobFamily = await prisma.jobFamily.findUnique({
        where: { id: jobFamilyId },
      });

      if (!jobFamily) {
        res.status(404).json({
          error: {
            code: 'NOT_FOUND',
            message: 'Job family not found',
            resourceType: 'JobFamily',
            resourceId: jobFamilyId,
          },
        });
        return;
      }

      const versions = await getScoringThresholdHistory(jobFamilyId, { limit });

      res.set('Cache-Control', 'no-cache, no-store, must-revalidate');

      res.json({
        jobFamily: {
          id: jobFamily.id,
          name: jobFamily.name,
        },
        versions: versions.map((v) => ({
          id: v.id,
          aiShortlistThreshold: v.aiShortlistThreshold.toNumber(),
          confidenceThreshold: v.confidenceThreshold.toNumber(),
          experienceThresholdYears: v.experienceThresholdYears,
          effectiveFrom: v.effectiveFrom.toISOString(),
          createdAt: v.createdAt.toISOString(),
          createdBy: v.createdBy,
        })),
        total: versions.length,
      });
    } catch (error) {
      next(error);
    }
  },
);

// ============================================================================
// GET /api/admin/scoring-thresholds/:jobFamilyId/effective
// ============================================================================

router.get(
  '/:jobFamilyId/effective',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { jobFamilyId } = req.params;
      const asOfDate = req.query.asOfDate
        ? new Date(req.query.asOfDate as string)
        : new Date();

      const threshold = await getEffectiveScoringThreshold(jobFamilyId, asOfDate);

      if (!threshold) {
        res.status(404).json({
          error: {
            code: 'NOT_FOUND',
            message: `No effective scoring threshold found for job family ${jobFamilyId}`,
            resourceType: 'ScoringThreshold',
            resourceId: jobFamilyId,
          },
        });
        return;
      }

      res.set('Cache-Control', 'no-cache, no-store, must-revalidate');

      res.json({
        id: threshold.id,
        jobFamilyId: threshold.jobFamilyId,
        aiShortlistThreshold: threshold.aiShortlistThreshold.toNumber(),
        confidenceThreshold: threshold.confidenceThreshold.toNumber(),
        experienceThresholdYears: threshold.experienceThresholdYears,
        effectiveFrom: threshold.effectiveFrom.toISOString(),
        createdAt: threshold.createdAt.toISOString(),
        createdBy: threshold.createdBy,
      });
    } catch (error) {
      next(error);
    }
  },
);

// ============================================================================
// POST /api/admin/scoring-thresholds
// ============================================================================

router.post('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const auditContext = buildAuditContextFromRequest(req);
    const {
      jobFamilyId,
      aiShortlistThreshold,
      confidenceThreshold,
      experienceThresholdYears,
      effectiveFrom,
    } = req.body;

    const errors: string[] = [];

    // Validate required fields
    if (
      !jobFamilyId ||
      aiShortlistThreshold === undefined ||
      confidenceThreshold === undefined ||
      experienceThresholdYears === undefined ||
      !effectiveFrom
    ) {
      errors.push(
        'Missing required fields: jobFamilyId, aiShortlistThreshold, confidenceThreshold, experienceThresholdYears, effectiveFrom',
      );
    }

    // Validate effectiveFrom is not in the past
    if (effectiveFrom) {
      try {
        await validateEffectiveDateSafety(new Date(effectiveFrom));
      } catch (error) {
        if (error instanceof PolicyValidationError) {
          errors.push(...error.errors);
        }
      }
    }

    if (errors.length > 0) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid policy values',
          details: errors,
        },
      });
      return;
    }

    const threshold = await createScoringThresholdVersion(
      {
        jobFamilyId,
        aiShortlistThreshold,
        confidenceThreshold,
        experienceThresholdYears,
        effectiveFrom: new Date(effectiveFrom),
      },
      req.user!.id,
      {
        actorRole: auditContext.actorRole,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
      },
    );

    logger.info(
      {
        thresholdId: threshold.id,
        jobFamilyId,
        actorId: req.user!.id,
      },
      'Scoring threshold version created via API',
    );

    res.status(201).json({
      id: threshold.id,
      jobFamilyId: threshold.jobFamilyId,
      aiShortlistThreshold: threshold.aiShortlistThreshold.toNumber(),
      confidenceThreshold: threshold.confidenceThreshold.toNumber(),
      experienceThresholdYears: threshold.experienceThresholdYears,
      effectiveFrom: threshold.effectiveFrom.toISOString(),
      createdAt: threshold.createdAt.toISOString(),
      createdBy: threshold.createdBy,
    });
  } catch (error) {
    if (error instanceof PolicyValidationError) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: error.message,
          details: error.errors,
        },
      });
      return;
    }

    if (error instanceof PolicyNotFoundError) {
      res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: error.message,
        },
      });
      return;
    }

    next(error);
  }
});

export default router;
