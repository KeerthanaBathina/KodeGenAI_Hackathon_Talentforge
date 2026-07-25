/**
 * Manual Review Queue API Routes
 * 
 * Endpoints:
 * - GET /api/manual-review-queue - Fetch queue with filtering and pagination
 * - GET /api/manual-review-queue/stats - Get queue statistics
 * - POST /api/manual-review-queue/:id/review - Mark application as reviewed
 * - POST /api/manual-review-queue/:id/path-override - Override interview path
 */

import express from 'express';
import { z } from 'zod';
import { ManualReviewQueueService } from '../services/manualReviewQueueService';
import { InvalidReasonCodeError } from '../services/manualReviewQueueService';
import { ApplicationDecisionLockedError } from '../services/manualReviewQueueService';
import { InvalidPathOverrideError } from '../services/manualReviewQueueService';
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
    department: z.string().min(1).max(100).optional(),
    scoreBand: z.enum(['high', 'medium', 'low']).optional(),
    status: z.enum(['pending_review', 'shortlisted', 'rejected']).optional(),
    sortBy: z.enum(['candidate', 'role', 'score', 'sla', 'status']).optional(),
    sortDir: z.enum(['asc', 'desc']).optional(),
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
    reasonCode: z
        .string()
        .trim()
        .min(1, 'Reason code is required')
        .max(100, 'Reason code must be 100 characters or fewer'),
    comment: z
        .string()
        .trim()
        .max(500, 'Comment must be 500 characters or fewer')
        .optional(),
});

const ReasonCodeQuerySchema = z.object({
    decision: z.enum(['shortlisted', 'rejected']).optional(),
});

const PathOverrideSchema = z.object({
    newPath: z.enum(['fresher', 'experienced']),
    justification: z
        .string()
        .trim()
        .min(20, 'Justification must be at least 20 characters')
        .max(1000, 'Justification must be 1000 characters or fewer'),
});

const BulkRejectSchema = z.object({
    applicationIds: z
        .array(z.string().uuid('Application ID must be a valid UUID'))
        .min(2, 'Select at least 2 applications for bulk action.')
        .max(200, 'A maximum of 200 applications can be processed in one bulk action'),
    reasonCode: z
        .string()
        .trim()
        .min(1, 'Reason code is required')
        .max(100, 'Reason code must be 100 characters or fewer'),
    comment: z
        .string()
        .trim()
        .max(500, 'Comment must be 500 characters or fewer')
        .optional(),
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

            const { page, limit, sortBy, sortDir, ...filters } = validatedQuery;

            const result = await ManualReviewQueueService.getManualReviewQueue(
                filters,
                { page, limit },
                { sortBy, sortDir }
            );

            res.json(result);
        } catch (error) {
            if (error instanceof z.ZodError) {
                res.status(400).json({
                    error: 'Invalid query parameters',
                    details: error.issues,
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
 * GET /api/manual-review-queue/reason-codes
 *
 * Fetch reason codes that can be used for shortlist/reject decisions
 */
router.get(
    '/reason-codes',
    authorize(['hr_reviewer', 'hr_manager']),
    async (req, res) => {
        try {
            const validatedQuery = ReasonCodeQuerySchema.parse(req.query);
            const reasonCodes = await ManualReviewQueueService.getDecisionReasonCodes(
                validatedQuery.decision
            );

            res.json({ items: reasonCodes });
        } catch (error) {
            if (error instanceof z.ZodError) {
                res.status(400).json({
                    error: 'Invalid query parameters',
                    details: error.issues,
                });
            } else {
                console.error('[ManualReviewQueue] Failed to fetch reason codes:', error);
                res.status(500).json({ error: 'Failed to fetch reason codes' });
            }
        }
    }
);

/**
 * POST /api/manual-review-queue/bulk-reject
 *
 * Bulk reject multiple applications with shared reason code
 */
router.post(
    '/bulk-reject',
    authorize(['hr_reviewer', 'hr_manager']),
    async (req, res) => {
        try {
            const validatedBody = BulkRejectSchema.parse(req.body);
            const actorId = req.user!.id;

            const result = await ManualReviewQueueService.bulkRejectApplications({
                applicationIds: validatedBody.applicationIds,
                actorId,
                reasonCode: validatedBody.reasonCode,
                comment: validatedBody.comment,
            });

            res.json({
                success: true,
                message: 'Bulk reject action completed',
                result,
            });
        } catch (error) {
            if (error instanceof z.ZodError) {
                res.status(400).json({
                    error: 'Invalid request body',
                    details: error.issues,
                });
            } else if (error instanceof InvalidReasonCodeError) {
                res.status(400).json({
                    error: 'Invalid request body',
                    details: [
                        {
                            code: 'custom',
                            path: ['reasonCode'],
                            message: error.message,
                        },
                    ],
                });
            } else {
                console.error('[ManualReviewQueue] Failed to bulk reject applications:', error);
                res.status(500).json({ error: 'Failed to process bulk reject action' });
            }
        }
    }
);

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

            const decisionResult = await ManualReviewQueueService.markAsReviewed(
                id,
                reviewerId,
                validatedBody.decision,
                validatedBody.reasonCode,
                validatedBody.comment
            );

            res.json({
                success: true,
                message: `Application ${validatedBody.decision}`,
                decision: {
                    applicationId: decisionResult.applicationId,
                    status: decisionResult.status,
                    decision: decisionResult.decision,
                    path: decisionResult.path,
                    reasonCode: decisionResult.reasonCode,
                    communicationId: decisionResult.communicationId,
                    correlationId: decisionResult.correlationId,
                    reviewedAt: decisionResult.reviewedAt,
                },
            });
        } catch (error) {
            if (error instanceof z.ZodError) {
                res.status(400).json({
                    error: 'Invalid request body',
                    details: error.issues,
                });
            } else if (error instanceof InvalidReasonCodeError) {
                res.status(400).json({
                    error: 'Invalid request body',
                    details: [
                        {
                            code: 'custom',
                            path: ['reasonCode'],
                            message: error.message,
                        },
                    ],
                });
            } else if (error instanceof ApplicationDecisionLockedError) {
                res.status(409).json({
                    error: 'Application is no longer pending review',
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

/**
 * POST /api/manual-review-queue/:id/path-override
 *
 * Override application path classification with recruiter justification
 */
router.post(
    '/:id/path-override',
    authorize(['recruiter', 'hr_reviewer', 'hr_manager']),
    async (req, res) => {
        try {
            const { id } = req.params;

            if (!id) {
                res.status(400).json({ error: 'Application ID is required' });
                return;
            }

            const validatedBody = PathOverrideSchema.parse(req.body);
            const actorId = req.user!.id;

            const result = await ManualReviewQueueService.overrideApplicationPath({
                applicationId: id,
                actorId,
                newPath: validatedBody.newPath,
                justification: validatedBody.justification,
            });

            res.json({
                success: true,
                message: 'Application path overridden',
                override: result,
            });
        } catch (error) {
            if (error instanceof z.ZodError) {
                res.status(400).json({
                    error: 'Invalid request body',
                    details: error.issues,
                });
            } else if (error instanceof InvalidPathOverrideError) {
                res.status(409).json({
                    error: error.message,
                    code: error.code,
                });
            } else if (
                error instanceof Error &&
                error.message === 'Application not found'
            ) {
                res.status(404).json({ error: 'Application not found' });
            } else {
                console.error('[ManualReviewQueue] Failed to override path:', error);
                res.status(500).json({ error: 'Failed to override application path' });
            }
        }
    }
);

export default router;
