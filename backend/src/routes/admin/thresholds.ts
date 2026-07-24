import { Router } from 'express';
import { z } from 'zod';
import {
    getActiveThresholds,
    createThresholdVersion,
    getThresholdHistory,
} from '../../services/thresholdService';
import { authenticate } from '../../middleware/authenticate';
import logger from '../../utils/logger';

const router = Router();

const CreateThresholdSchema = z
    .object({
        shortlistThreshold: z.number().int().min(0).max(100),
        borderlineMin: z.number().int().min(0).max(100),
        borderlineMax: z.number().int().min(0).max(100),
        rejectThreshold: z.number().int().min(0).max(100),
        effectiveFrom: z.string().datetime().optional(),
    })
    .refine((data) => data.rejectThreshold < data.borderlineMin, {
        message: 'Reject threshold must be less than borderline min',
    })
    .refine((data) => data.borderlineMax < data.shortlistThreshold, {
        message: 'Borderline max must be less than shortlist threshold',
    });

// GET /api/admin/thresholds/active
router.get('/active', authenticate, async (req, res) => {
    try {
        const thresholds = await getActiveThresholds();
        res.json(thresholds);
    } catch (error) {
        logger.error('Failed to fetch active thresholds', { error });
        res.status(500).json({
            error: {
                code: 'INTERNAL_ERROR',
                message: 'Failed to fetch thresholds',
            },
        });
    }
});

// GET /api/admin/thresholds/history
router.get('/history', authenticate, async (req, res) => {
    try {
        const history = await getThresholdHistory();
        res.json({ history, count: history.length });
    } catch (error) {
        logger.error('Failed to fetch threshold history', { error });
        res.status(500).json({
            error: {
                code: 'INTERNAL_ERROR',
                message: 'Failed to fetch history',
            },
        });
    }
});

// POST /api/admin/thresholds
router.post('/', authenticate, async (req, res) => {
    try {
        const validation = CreateThresholdSchema.safeParse(req.body);
        if (!validation.success) {
            return res.status(400).json({
                error: {
                    code: 'VALIDATION_ERROR',
                    message: 'Invalid threshold data',
                    details: validation.error.errors,
                },
            });
        }

        const threshold = await createThresholdVersion({
            ...validation.data,
            effectiveFrom: validation.data.effectiveFrom
                ? new Date(validation.data.effectiveFrom)
                : undefined,
        });

        logger.info('Threshold version created', { version: threshold.version });

        res.status(201).json(threshold);
    } catch (error) {
        logger.error('Failed to create threshold', { error });
        res.status(500).json({
            error: {
                code: 'INTERNAL_ERROR',
                message: 'Failed to create threshold',
            },
        });
    }
});

export default router;
