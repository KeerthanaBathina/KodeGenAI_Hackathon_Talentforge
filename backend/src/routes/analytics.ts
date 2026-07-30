import {
  getNoShowAnalytics,
  noShowAnalyticsQuerySchema
} from '../services/noShowAnalyticsService';
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/authorize';
import {
  getPipelineAnalytics,
  pipelineAnalyticsQuerySchema
} from '../services/pipelineAnalyticsService';
import {
  getFunnelAnalytics,
  funnelAnalyticsQuerySchema
} from '../services/funnelAnalyticsService';
import {
  getConfusionMatrixAnalytics,
  confusionMatrixQuerySchema
} from '../services/confusionMatrixService';
import logger from '../utils/logger';

const router = Router();

router.get(
  '/pipeline',
  authenticate,
  requireRole(['recruiter', 'hr_manager', 'admin']),
  async (req: Request, res: Response): Promise<void> => {
    const startedAt = Date.now();

    try {
      const query = pipelineAnalyticsQuerySchema.parse(req.query);
      const payload = await getPipelineAnalytics(query.requisitionId);

      const durationMs = Date.now() - startedAt;
      logger.info(
        {
          requisitionId: query.requisitionId ?? null,
          durationMs,
          userId: req.user?.id
        },
        '[PipelineAnalytics] KPI payload generated'
      );

      res.status(200).json(payload);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          error: {
            code: 'INVALID_QUERY_PARAMS',
            message: 'Invalid query parameters',
            details: error.errors
          }
        });
        return;
      }
      logger.error({ error, userId: req.user?.id }, '[PipelineAnalytics] failed to generate KPI payload');
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to retrieve pipeline analytics'
        }
      });
    }
  }
);

router.get(
  '/no-show',
  authenticate,
  requireRole(['recruiter', 'hr_manager', 'admin']),
  async (req: Request, res: Response): Promise<void> => {
    const startedAt = Date.now();

    try {
      const query = noShowAnalyticsQuerySchema.parse(req.query);
      const payload = await getNoShowAnalytics(query.requisitionId);

      const durationMs = Date.now() - startedAt;
      logger.info(
        {
          requisitionId: query.requisitionId ?? null,
          durationMs,
          userId: req.user?.id
        },
        '[NoShowAnalytics] no-show payload generated'
      );

      res.status(200).json(payload);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          error: {
            code: 'INVALID_QUERY_PARAMS',
            message: 'Invalid query parameters',
            details: error.errors
          }
        });
        return;
      }

      logger.error({ error, userId: req.user?.id }, '[NoShowAnalytics] failed to generate no-show payload');
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to retrieve no-show analytics'
        }
      });
    }
  }
);

router.get(
  '/funnel',
  authenticate,
  requireRole(['recruiter', 'hr_manager', 'admin']),
  async (req: Request, res: Response): Promise<void> => {
    const startedAt = Date.now();

    try {
      const query = funnelAnalyticsQuerySchema.parse(req.query);
      const payload = await getFunnelAnalytics(query.requisitionId);

      const durationMs = Date.now() - startedAt;
      logger.info(
        {
          requisitionId: query.requisitionId ?? null,
          durationMs,
          userId: req.user?.id
        },
        '[FunnelAnalytics] funnel payload generated'
      );

      res.status(200).json(payload);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          error: {
            code: 'INVALID_QUERY_PARAMS',
            message: 'Invalid query parameters',
            details: error.errors
          }
        });
        return;
      }

      logger.error({ error, userId: req.user?.id }, '[FunnelAnalytics] failed to generate funnel payload');
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to retrieve funnel analytics'
        }
      });
    }
  }
);

router.get(
  '/confusion-matrix',
  authenticate,
  requireRole(['recruiter', 'hr_manager', 'admin']),
  async (req: Request, res: Response): Promise<void> => {
    const startedAt = Date.now();

    try {
      const query = confusionMatrixQuerySchema.parse(req.query);
      const payload = await getConfusionMatrixAnalytics(query.requisitionId);

      const durationMs = Date.now() - startedAt;
      logger.info(
        {
          requisitionId: query.requisitionId ?? null,
          durationMs,
          userId: req.user?.id
        },
        '[ConfusionMatrixAnalytics] confusion matrix payload generated'
      );

      res.status(200).json(payload);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          error: {
            code: 'INVALID_QUERY_PARAMS',
            message: 'Invalid query parameters',
            details: error.errors
          }
        });
        return;
      }

      logger.error(
        { error, userId: req.user?.id },
        '[ConfusionMatrixAnalytics] failed to generate confusion matrix payload'
      );
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to retrieve confusion matrix analytics'
        }
      });
    }
  }
);

export default router;
