/**
 * Admin Screening Thresholds Management Routes
 *
 * REST API endpoints for managing AI screening thresholds with versioning support.
 * All routes require admin authentication.
 *
 * @module routes/admin/screeningThresholds
 */

import express, { Request, Response, NextFunction } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { prisma } from '../../db/prisma';
import {
  createScreeningThresholdVersion,
  getEffectiveThreshold,
  getThresholdHistory,
} from '../../services/thresholdService';
import {
  InvalidThresholdRangeError,
  PolicyNotFoundError,
} from '../../services/errors/PolicyErrors';
import { buildAuditContextFromRequest } from '../../services/auditContextService';
import logger from '../../utils/logger';

const router = express.Router();

// All routes require authentication and admin role
router.use(authenticate);
router.use(authorize(['admin']));

// ============================================================================
// GET /api/admin/screening-thresholds/active
// ============================================================================

router.get('/active', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const threshold = await getEffectiveThreshold(new Date());

    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.set('X-Policy-Version', threshold.version.toString());

    res.json({
      id: threshold.id,
      shortlistThreshold: threshold.shortlistThreshold,
      borderlineMin: threshold.borderlineMin,
      borderlineMax: threshold.borderlineMax,
      rejectThreshold: threshold.rejectThreshold,
      version: threshold.version,
      effectiveFrom: threshold.effectiveFrom.toISOString(),
      createdAt: threshold.createdAt.toISOString(),
    });
  } catch (error) {
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

// ============================================================================
// GET /api/admin/screening-thresholds/history
// ============================================================================

router.get('/history', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const asOfDate = req.query.asOfDate
      ? new Date(req.query.asOfDate as string)
      : new Date();

    const thresholds = await getThresholdHistory(limit);

    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');

    res.json({
      thresholds: thresholds.map((t) => ({
        id: t.id,
        shortlistThreshold: t.shortlistThreshold,
        borderlineMin: t.borderlineMin,
        borderlineMax: t.borderlineMax,
        rejectThreshold: t.rejectThreshold,
        version: t.version,
        effectiveFrom: t.effectiveFrom.toISOString(),
        createdAt: t.createdAt.toISOString(),
      })),
      total: thresholds.length,
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// GET /api/admin/screening-thresholds/:id
// ============================================================================

router.get('/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;

    const threshold = await prisma.screeningThreshold.findUnique({
      where: { id },
    });

    if (!threshold) {
      res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'Threshold not found',
          resourceType: 'ScreeningThreshold',
          resourceId: id,
        },
      });
      return;
    }

    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.set('X-Policy-Version', threshold.version.toString());

    res.json({
      id: threshold.id,
      shortlistThreshold: threshold.shortlistThreshold,
      borderlineMin: threshold.borderlineMin,
      borderlineMax: threshold.borderlineMax,
      rejectThreshold: threshold.rejectThreshold,
      version: threshold.version,
      effectiveFrom: threshold.effectiveFrom.toISOString(),
      createdAt: threshold.createdAt.toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// POST /api/admin/screening-thresholds
// ============================================================================

router.post('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const auditContext = buildAuditContextFromRequest(req);
    const {
      shortlistThreshold,
      borderlineMin,
      borderlineMax,
      rejectThreshold,
      effectiveFrom,
    } = req.body;

    // Validate required fields
    const errors: string[] = [];

    if (
      shortlistThreshold === undefined ||
      borderlineMin === undefined ||
      borderlineMax === undefined ||
      rejectThreshold === undefined ||
      !effectiveFrom
    ) {
      errors.push(
        'Missing required fields: shortlistThreshold, borderlineMin, borderlineMax, rejectThreshold, effectiveFrom'
      );
    }

    // Validate effectiveFrom is not in the past
    if (effectiveFrom) {
      const requestedDate = new Date(effectiveFrom);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (requestedDate < today) {
        errors.push('effectiveFrom cannot be in the past (must be today or later)');
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

    const threshold = await createScreeningThresholdVersion(
      {
        shortlistThreshold,
        borderlineMin,
        borderlineMax,
        rejectThreshold,
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
        version: threshold.version,
        actorId: req.user!.id,
      },
      'Screening threshold version created via API',
    );

    res.status(201).json({
      id: threshold.id,
      shortlistThreshold: threshold.shortlistThreshold,
      borderlineMin: threshold.borderlineMin,
      borderlineMax: threshold.borderlineMax,
      rejectThreshold: threshold.rejectThreshold,
      version: threshold.version,
      effectiveFrom: threshold.effectiveFrom.toISOString(),
      createdAt: threshold.createdAt.toISOString(),
    });
  } catch (error) {
    if (error instanceof InvalidThresholdRangeError) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: error.message,
          details: error.errors,
        },
      });
      return;
    }
    next(error);
  }
});

export default router;
