import { Router, Request, Response } from 'express';
import * as requisitionService from '../services/requisitionService';
import { hasDraft } from '../services/applicationDraftService';
import { checkApplicationEligibility } from '../services/applicationStatusService';
import { authenticate } from '../middleware/authenticate';
import { z } from 'zod';
import logger from '../utils/logger';

const router = Router();

// Validation schema for query parameters
const ListRequisitionsSchema = z.object({
    page: z.coerce.number().int().min(1).optional().default(1),
    pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
    department: z.string().optional(),
    location: z.string().optional(),
    jobType: z.enum(['full_time', 'part_time', 'contract', 'internship']).optional(),
    experienceLevel: z.coerce.number().int().min(0).optional(),
    keyword: z.string().optional(),
    status: z.string().optional().default('open'),
});

/**
 * GET /api/requisitions
 * List requisitions with filters and pagination
 */
router.get('/', async (req: Request, res: Response) => {
    try {
        const params = ListRequisitionsSchema.parse(req.query);

        const result = await requisitionService.listRequisitions({
            page: params.page,
            pageSize: params.pageSize,
            filters: {
                department: params.department,
                location: params.location,
                jobType: params.jobType,
                experienceLevel: params.experienceLevel,
                keyword: params.keyword,
                status: params.status,
            },
        });

        res.status(200).json(result);
    } catch (error) {
        if (error instanceof z.ZodError) {
            logger.warn({ error: error.errors }, 'Invalid requisition list query parameters');
            res.status(400).json({
                error: {
                    code: 'INVALID_QUERY_PARAMS',
                    message: 'Invalid query parameters',
                    details: error.errors,
                },
            });
            return;
        }

        logger.error({ error }, 'Error listing requisitions');
        res.status(500).json({
            error: {
                code: 'INTERNAL_ERROR',
                message: 'Unable to retrieve requisitions',
            },
        });
    }
});

/**
 * GET /api/requisitions/filters
 * Get available filter options for UI dropdowns
 */
router.get('/filters', async (req: Request, res: Response) => {
    try {
        const options = await requisitionService.getFilterOptions();
        res.status(200).json(options);
    } catch (error) {
        logger.error({ error }, 'Error fetching filter options');
        res.status(500).json({
            error: {
                code: 'INTERNAL_ERROR',
                message: 'Unable to retrieve filter options',
            },
        });
    }
});

/**
 * GET /api/requisitions/:id
 * Get single requisition by ID
 */
router.get('/:id', async (req: Request, res: Response) => {
    try {
        const requisition = await requisitionService.getRequisitionById(req.params.id);

        if (!requisition) {
            res.status(404).json({
                error: {
                    code: 'REQUISITION_NOT_FOUND',
                    message: 'Requisition not found',
                },
            });
            return;
        }

        res.status(200).json(requisition);
    } catch (error) {
        logger.error({ error, requisitionId: req.params.id }, 'Error fetching requisition');
        res.status(500).json({
            error: {
                code: 'INTERNAL_ERROR',
                message: 'Unable to retrieve requisition',
            },
        });
    }
});

/**
 * GET /api/requisitions/:id/has-draft
 * Check if authenticated candidate has a draft for this requisition
 */
router.get('/:id/has-draft', authenticate, async (req: Request, res: Response) => {
    try {
        const requisitionId = req.params.id;
        const candidateId = req.user!.id;

        const draftExists = await hasDraft({ candidateId, requisitionId });

        res.status(200).json({
            hasDraft: draftExists,
        });
    } catch (error) {
        logger.error({ error, requisitionId: req.params.id }, 'Error checking draft status');
        res.status(500).json({
            error: {
                code: 'INTERNAL_ERROR',
                message: 'Unable to check draft status',
            },
        });
    }
});

/**
 * GET /api/requisitions/:id/eligibility
 * Check if authenticated candidate can apply to this requisition
 * Enforces duplicate prevention and 90-day cooling period
 */
router.get('/:id/eligibility', authenticate, async (req: Request, res: Response) => {
    try {
        const requisitionId = req.params.id;
        const candidateId = req.user!.id;

        const eligibility = await checkApplicationEligibility({ candidateId, requisitionId });

        // Build user-friendly message
        let message: string | undefined;
        if (!eligibility.canApply) {
            if (eligibility.reason === 'active_application') {
                message = 'You already have an active application for this position.';
            } else if (eligibility.reason === 'cooling_period') {
                const days = eligibility.daysRemaining ?? 0;
                message = `Re-application available in ${days} day${days !== 1 ? 's' : ''}.`;
            }
        } else if (eligibility.reason === 'eligible') {
            message = 'You are eligible to apply for this position.';
        }

        res.status(200).json({
            canApply: eligibility.canApply,
            reason: eligibility.reason,
            existingApplicationId: eligibility.existingApplicationId,
            daysRemaining: eligibility.daysRemaining,
            rejectedAt: eligibility.rejectedAt?.toISOString(),
            message,
        });
    } catch (error) {
        logger.error({ error, requisitionId: req.params.id }, 'Error checking application eligibility');
        res.status(500).json({
            error: {
                code: 'INTERNAL_ERROR',
                message: 'Unable to check application eligibility',
            },
        });
    }
});

export default router;
