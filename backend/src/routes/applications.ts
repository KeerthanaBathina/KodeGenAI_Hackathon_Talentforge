import express from 'express';
import { z } from 'zod';
import {
    saveDraft,
    getDraft,
    submitDraft,
    DraftError,
    type DraftData,
} from '../services/applicationDraftService';
import {
    withdrawApplication,
    canWithdrawApplication,
    WithdrawalError,
} from '../services/applicationWithdrawalService';
import { authenticate } from '../middleware/authenticate';
import logger from '../utils/logger';
import prisma from '../db/prisma';

const router = express.Router();

// ==================== Draft Routes ====================

// Zod schemas for validation
const DraftDataStep1Schema = z.object({
    fullName: z.string().optional(),
    email: z.string().email().optional(),
    phone: z.string().optional(),
    linkedinUrl: z.string().url().optional(),
});

const DraftDataStep2Schema = z.object({
    yearsExperience: z.number().int().min(0).optional(),
    currentRole: z.string().optional(),
    currentCompany: z.string().optional(),
});

const DraftDataStep3Schema = z.object({
    coverLetter: z.string().optional(),
});

const DraftDataSchema = z.object({
    step1_personal: DraftDataStep1Schema.optional(),
    step2_experience: DraftDataStep2Schema.optional(),
    step3_coverLetter: DraftDataStep3Schema.optional(),
    currentStep: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
});

const SaveDraftBodySchema = z.object({
    requisitionId: z.string().uuid(),
    draftData: DraftDataSchema,
});

/**
 * POST /api/applications/drafts
 * Save or update application draft (auto-save endpoint)
 */
router.post('/drafts', authenticate, async (req, res) => {
    try {
        const validationResult = SaveDraftBodySchema.safeParse(req.body);

        if (!validationResult.success) {
            return res.status(400).json({
                error: {
                    code: 'INVALID_REQUEST_BODY',
                    message: 'Invalid request payload',
                    details: validationResult.error.errors,
                },
            });
        }

        const { requisitionId, draftData } = validationResult.data;
        const candidateId = req.user!.id;

        const application = await saveDraft({
            candidateId,
            requisitionId,
            draftData: draftData as DraftData,
        });

        return res.status(200).json({
            id: application.id,
            status: application.status,
            draftSavedAt: application.draftSavedAt,
            message: 'Draft saved successfully',
        });
    } catch (error) {
        if (error instanceof DraftError) {
            return res.status(400).json({
                error: {
                    code: error.code,
                    message: error.message,
                },
            });
        }

        logger.error('Error saving draft', {
            error: error instanceof Error ? error.message : String(error),
            candidateId: req.user?.id,
        });

        return res.status(500).json({
            error: {
                code: 'INTERNAL_SERVER_ERROR',
                message: 'An error occurred while saving the draft',
            },
        });
    }
});

/**
 * GET /api/applications/drafts/:requisitionId
 * Get draft for a specific requisition
 */
router.get('/drafts/:requisitionId', authenticate, async (req, res) => {
    try {
        const { requisitionId } = req.params;

        if (!z.string().uuid().safeParse(requisitionId).success) {
            return res.status(400).json({
                error: {
                    code: 'INVALID_REQUISITION_ID',
                    message: 'Invalid requisition ID format',
                },
            });
        }

        const candidateId = req.user!.id;

        const draft = await getDraft({ candidateId, requisitionId });

        if (!draft) {
            return res.status(404).json({
                error: {
                    code: 'DRAFT_NOT_FOUND',
                    message: 'No draft found for this requisition',
                },
            });
        }

        return res.status(200).json({
            id: draft.id,
            requisitionId: draft.requisitionId,
            draftData: draft.draftData,
            draftSavedAt: draft.draftSavedAt,
        });
    } catch (error) {
        logger.error('Error fetching draft', {
            error: error instanceof Error ? error.message : String(error),
            candidateId: req.user?.id,
            requisitionId: req.params.requisitionId,
        });

        return res.status(500).json({
            error: {
                code: 'INTERNAL_SERVER_ERROR',
                message: 'An error occurred while fetching the draft',
            },
        });
    }
});

/**
 * POST /api/applications/drafts/:requisitionId/submit
 * Submit final application (transitions draft to submitted)
 * Returns HTTP 409 for duplicate applications or cooling period violations
 */
router.post('/drafts/:requisitionId/submit', authenticate, async (req, res) => {
    try {
        const { requisitionId } = req.params;

        if (!z.string().uuid().safeParse(requisitionId).success) {
            return res.status(400).json({
                error: {
                    code: 'INVALID_REQUISITION_ID',
                    message: 'Invalid requisition ID format',
                },
            });
        }

        const candidateId = req.user!.id;

        const application = await submitDraft({ candidateId, requisitionId });

        return res.status(200).json({
            id: application.id,
            status: application.status,
            submittedAt: application.submittedAt,
            message: 'Application submitted successfully',
        });
    } catch (error) {
        if (error instanceof DraftError) {
            // Return HTTP 409 for duplicate/cooling period conflicts
            if (error.code === 'DUPLICATE_APPLICATION' || error.code === 'COOLING_PERIOD_ACTIVE') {
                return res.status(409).json({
                    error: {
                        code: error.code,
                        message: error.message,
                    },
                });
            }

            // Other draft errors (404, 400, etc.)
            return res.status(400).json({
                error: {
                    code: error.code,
                    message: error.message,
                },
            });
        }

        logger.error('Error submitting draft', {
            error: error instanceof Error ? error.message : String(error),
            candidateId: req.user?.id,
            requisitionId: req.params.requisitionId,
        });

        return res.status(500).json({
            error: {
                code: 'INTERNAL_SERVER_ERROR',
                message: 'An error occurred while submitting the application',
            },
        });
    }
});

// ==================== Application Routes ====================

/**
 * GET /api/applications/by-requisition/:requisitionId
 * Get candidate's application for a specific requisition
 */
router.get('/by-requisition/:requisitionId', authenticate, async (req, res) => {
    try {
        const requisitionId = req.params.requisitionId;
        const candidateId = req.user!.id;

        const application = await prisma.application.findFirst({
            where: {
                candidateId,
                requisitionId,
            },
            orderBy: {
                createdAt: 'desc',
            },
        });

        if (!application) {
            return res.status(404).json({
                error: {
                    code: 'APPLICATION_NOT_FOUND',
                    message: 'No application found for this requisition',
                },
            });
        }

        return res.status(200).json(application);
    } catch (error) {
        logger.error('Error fetching application by requisition', {
            error: error instanceof Error ? error.message : String(error),
            candidateId: req.user?.id,
            requisitionId: req.params.requisitionId,
        });

        return res.status(500).json({
            error: {
                code: 'INTERNAL_SERVER_ERROR',
                message: 'An error occurred while fetching the application',
            },
        });
    }
});

/**
 * GET /api/applications/:id/can-withdraw
 * Check if application can be withdrawn
 */
router.get('/:id/can-withdraw', authenticate, async (req, res) => {
    try {
        const applicationId = req.params.id;
        const candidateId = req.user!.id;

        const result = await canWithdrawApplication({ applicationId, candidateId });

        return res.status(200).json(result);
    } catch (error) {
        logger.error('Error checking withdrawal eligibility', {
            error: error instanceof Error ? error.message : String(error),
            candidateId: req.user?.id,
            applicationId: req.params.id,
        });

        return res.status(500).json({
            error: {
                code: 'INTERNAL_SERVER_ERROR',
                message: 'An error occurred while checking withdrawal eligibility',
            },
        });
    }
});

/**
 * GET /api/applications/:id
 * Get single application by ID (candidate must own it)
 */
router.get('/:id', authenticate, async (req, res) => {
    try {
        const applicationId = req.params.id;
        const candidateId = req.user!.id;

        const application = await prisma.application.findUnique({
            where: { id: applicationId },
        });

        if (!application) {
            return res.status(404).json({
                error: {
                    code: 'APPLICATION_NOT_FOUND',
                    message: 'Application not found',
                },
            });
        }

        // Verify ownership
        if (application.candidateId !== candidateId) {
            return res.status(403).json({
                error: {
                    code: 'UNAUTHORIZED',
                    message: 'You are not authorized to view this application',
                },
            });
        }

        return res.status(200).json(application);
    } catch (error) {
        logger.error('Error fetching application', {
            error: error instanceof Error ? error.message : String(error),
            candidateId: req.user?.id,
            applicationId: req.params.id,
        });

        return res.status(500).json({
            error: {
                code: 'INTERNAL_SERVER_ERROR',
                message: 'An error occurred while fetching the application',
            },
        });
    }
});

/**
 * PATCH /api/applications/:id/withdraw
 * Withdraw application before HR review
 */
router.patch('/:id/withdraw', authenticate, async (req, res) => {
    try {
        const applicationId = req.params.id;

        if (!z.string().uuid().safeParse(applicationId).success) {
            return res.status(400).json({
                error: {
                    code: 'INVALID_APPLICATION_ID',
                    message: 'Invalid application ID format',
                },
            });
        }

        const candidateId = req.user!.id;

        const application = await withdrawApplication({ applicationId, candidateId });

        return res.status(200).json({
            id: application.id,
            status: application.status,
            message: 'Application withdrawn successfully',
        });
    } catch (error) {
        if (error instanceof WithdrawalError) {
            const statusCode =
                error.code === 'APPLICATION_NOT_FOUND'
                    ? 404
                    : error.code === 'UNAUTHORIZED'
                        ? 403
                        : error.code === 'WITHDRAWAL_NOT_ALLOWED'
                            ? 409
                            : 400;

            return res.status(statusCode).json({
                error: {
                    code: error.code,
                    message: error.message,
                },
            });
        }

        logger.error('Error withdrawing application', {
            error: error instanceof Error ? error.message : String(error),
            candidateId: req.user?.id,
            applicationId: req.params.id,
        });

        return res.status(500).json({
            error: {
                code: 'INTERNAL_SERVER_ERROR',
                message: 'An error occurred while withdrawing the application',
            },
        });
    }
});

export default router;
