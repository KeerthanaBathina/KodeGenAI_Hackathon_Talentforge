import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/authenticate';
import { requireRole } from '../../middleware/authorize';
import {
    createProvider,
    getProviderById,
    listProviders,
    updateProvider,
    deleteProvider,
} from '../../services/assessmentProviderService';
import {
    CreateAssessmentProviderSchema,
    UpdateAssessmentProviderSchema,
    ProviderIdParamSchema,
    ListProvidersQuerySchema,
} from '../../schemas/assessmentProviderSchemas';
import logger from '../../utils/logger';

const router = Router();

/**
 * All routes require authentication and admin role
 */
router.use(authenticate);
router.use(requireRole(['admin', 'security_admin']));

/**
 * POST /api/admin/assessment-providers
 * Create a new assessment provider
 */
router.post('/', async (req: Request, res: Response): Promise<void> => {
    try {
        const validatedData = CreateAssessmentProviderSchema.parse(req.body);

        if (!req.user?.id) {
            res.status(401).json({
                success: false,
                error: {
                    code: 'UNAUTHORIZED',
                    message: 'Authentication required',
                },
            });
            return;
        }

        const provider = await createProvider(validatedData, req.user.id);

        res.status(201).json({
            success: true,
            data: provider,
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            res.status(400).json({
                success: false,
                error: {
                    code: 'VALIDATION_ERROR',
                    message: 'Invalid provider data',
                    details: error.errors,
                },
            });
            return;
        }

        logger.error('Failed to create provider', { error });
        res.status(500).json({
            success: false,
            error: {
                code: 'INTERNAL_ERROR',
                message: 'Failed to create provider',
            },
        });
    }
});

/**
 * GET /api/admin/assessment-providers
 * List assessment providers with filtering and pagination
 */
router.get('/', async (req: Request, res: Response): Promise<void> => {
    try {
        const filters = ListProvidersQuerySchema.parse(req.query);
        const result = await listProviders(filters, req.user?.role);

        res.json({
            success: true,
            data: result,
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            res.status(400).json({
                success: false,
                error: {
                    code: 'VALIDATION_ERROR',
                    message: 'Invalid query parameters',
                    details: error.errors,
                },
            });
            return;
        }

        logger.error('Failed to list providers', { error });
        res.status(500).json({
            success: false,
            error: {
                code: 'INTERNAL_ERROR',
                message: 'Failed to list providers',
            },
        });
    }
});

/**
 * GET /api/admin/assessment-providers/:id
 * Get a single assessment provider by ID
 */
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = ProviderIdParamSchema.parse(req.params);
        const provider = await getProviderById(id, req.user?.role);

        if (!provider) {
            res.status(404).json({
                success: false,
                error: {
                    code: 'PROVIDER_NOT_FOUND',
                    message: 'Assessment provider not found',
                },
            });
            return;
        }

        res.json({
            success: true,
            data: provider,
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            res.status(400).json({
                success: false,
                error: {
                    code: 'VALIDATION_ERROR',
                    message: 'Invalid provider ID',
                    details: error.errors,
                },
            });
            return;
        }

        logger.error('Failed to get provider', { error });
        res.status(500).json({
            success: false,
            error: {
                code: 'INTERNAL_ERROR',
                message: 'Failed to get provider',
            },
        });
    }
});

/**
 * PATCH /api/admin/assessment-providers/:id
 * Update an assessment provider
 */
router.patch('/:id', async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = ProviderIdParamSchema.parse(req.params);
        const validatedData = UpdateAssessmentProviderSchema.parse(req.body);

        if (!req.user?.id) {
            res.status(401).json({
                success: false,
                error: {
                    code: 'UNAUTHORIZED',
                    message: 'Authentication required',
                },
            });
            return;
        }

        // Check if there are any fields to update
        if (Object.keys(validatedData).length === 0) {
            res.status(400).json({
                success: false,
                error: {
                    code: 'VALIDATION_ERROR',
                    message: 'No fields to update',
                },
            });
            return;
        }

        const updatedProvider = await updateProvider(id, validatedData, req.user.id);

        res.json({
            success: true,
            data: updatedProvider,
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            res.status(400).json({
                success: false,
                error: {
                    code: 'VALIDATION_ERROR',
                    message: 'Invalid provider data',
                    details: error.errors,
                },
            });
            return;
        }

        if (error instanceof Error && error.message === 'Provider not found') {
            res.status(404).json({
                success: false,
                error: {
                    code: 'PROVIDER_NOT_FOUND',
                    message: 'Assessment provider not found',
                },
            });
            return;
        }

        logger.error('Failed to update provider', { error });
        res.status(500).json({
            success: false,
            error: {
                code: 'INTERNAL_ERROR',
                message: 'Failed to update provider',
            },
        });
    }
});

/**
 * DELETE /api/admin/assessment-providers/:id
 * Soft delete an assessment provider
 */
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = ProviderIdParamSchema.parse(req.params);

        if (!req.user?.id) {
            res.status(401).json({
                success: false,
                error: {
                    code: 'UNAUTHORIZED',
                    message: 'Authentication required',
                },
            });
            return;
        }

        await deleteProvider(id, req.user.id);

        res.status(204).send();
    } catch (error) {
        if (error instanceof z.ZodError) {
            res.status(400).json({
                success: false,
                error: {
                    code: 'VALIDATION_ERROR',
                    message: 'Invalid provider ID',
                    details: error.errors,
                },
            });
            return;
        }

        if (error instanceof Error && error.message === 'Provider not found') {
            res.status(404).json({
                success: false,
                error: {
                    code: 'PROVIDER_NOT_FOUND',
                    message: 'Assessment provider not found',
                },
            });
            return;
        }

        logger.error('Failed to delete provider', { error });
        res.status(500).json({
            success: false,
            error: {
                code: 'INTERNAL_ERROR',
                message: 'Failed to delete provider',
            },
        });
    }
});

export default router;
