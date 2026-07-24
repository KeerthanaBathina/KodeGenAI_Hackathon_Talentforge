/**
 * Manual Review Queue API Routes
 * 
 * Endpoints:
 * - GET /api/manual-review-queue - Fetch queue with filtering and pagination
 * - GET /api/manual-review-queue/stats - Get queue statistics
 * - POST /api/manual-review-queue/:id/review - Mark application as reviewed
 */

import express from 'express';
import { z } from 'zod';
import { ManualReviewQueueService } from '../services/manualReviewQueueService';
import { authenticate } from '../middleware/authenticate';
import { authorize } from '../middleware/authorize';

const router = express.Router();

// Apply authentication to all routes
router.use(authenticate);

/**
 * Query parameters schema for queue listing
 */
const QueueFiltersSchema = z.object({
    reason: z
        .string()
        .optional()
        .transform((val) => (val ? val.split(',') : undefined)),
    requisitionId: z.string().uuid().optional(),
    dateFrom: z
        .string()
        .optional()
        .transform((val) => (val ? new Date(val) : undefined)),
    dateTo: z
        .string()
        .optional()
        .transform((val) => (val ? new Date(val) : undefined)),
    page: z
        .string()
        .optional()
        .transform((val) => (val ? parseInt(val, 10) : 1)),
    limit: z
        .string()
        .optional()
        .transform((val) => (val ? parseInt(val, 10) : 20)),
});

/**
 * Review decision schema
 */
const ReviewDecisionSchema = z.object({
    decision: z.enum(['shortlisted', 'rejected']),
    notes: z.string().optional(),
});

/**
 * GET /api/manual-review-queue
 * 
 * Fetch manual review queue with optional filters
 */
router.get(
    '/',
    authorize(['hr_reviewer', 'hr_manager']),
    async (req, res) => {
        try {
            const validatedQuery = QueueFiltersSchema.parse(req.query);

            const { page, limit, ...filters } = validatedQuery;

            const result = await ManualReviewQueueService.getManualReviewQueue(
                filters,
                { page, limit }
            );

            res.json(result);
        } catch (error) {
            if (error instanceof z.ZodError) {
                res.status(400).json({
                    error: 'Invalid query parameters',
                    details: error.errors,
                });
            } else {
                console.error('[ManualReviewQueue] Failed to fetch queue:', error);
                res.status(500).json({ error: 'Failed to fetch manual review queue' });
            }
        }
    }
);

/**
 * GET /api/manual-review-queue/stats
 * 
 * Get queue statistics
 */
router.get(
    '/stats',
    authorize(['hr_reviewer', 'hr_manager']),
    async (req, res) => {
        try {
            const stats = await ManualReviewQueueService.getManualReviewQueueStats();
            res.json(stats);
        } catch (error) {
            console.error('[ManualReviewQueue] Failed to fetch stats:', error);
            res.status(500).json({ error: 'Failed to fetch queue statistics' });
        }
    }
);

/**
 * POST /api/manual-review-queue/:id/review
 * 
 * Mark application as reviewed and apply decision
 */
router.post(
    '/:id/review',
    authorize(['hr_reviewer', 'hr_manager']),
    async (req, res) => {
        try {
            const { id } = req.params;

            if (!id) {
                res.status(400).json({ error: 'Application ID is required' });
                return;
            }

            const validatedBody = ReviewDecisionSchema.parse(req.body);
            const reviewerId = req.user!.id;

            await ManualReviewQueueService.markAsReviewed(
                id,
                reviewerId,
                validatedBody.decision,
                validatedBody.notes
            );

            res.json({
                success: true,
                message: `Application ${validatedBody.decision}`,
            });
        } catch (error) {
            if (error instanceof z.ZodError) {
                res.status(400).json({
                    error: 'Invalid request body',
                    details: error.errors,
                });
            } else if (
                error instanceof Error &&
                error.message === 'Application not found'
            ) {
                res.status(404).json({ error: 'Application not found' });
            } else {
                console.error('[ManualReviewQueue] Failed to mark as reviewed:', error);
                res.status(500).json({ error: 'Failed to process review decision' });
            }
        }
    }
);

export default router;
