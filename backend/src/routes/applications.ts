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
import { getApplicationStageStatus } from '../services/stagePrerequisiteService';
import { scoreResumeWithAi } from '../services/resumeAiScoringService';
import { authenticate } from '../middleware/authenticate';
import logger from '../utils/logger';
import prisma from '../db/prisma';

const router = express.Router();

const ACTIVE_APPLICATION_STATUSES = [
    'submitted',
    'screening',
    'pending_review',
    'shortlisted',
    'interviewing',
    'offer_pending',
    'offered',
] as const;
const INTERNAL_APTITUDE_PROVIDER_NAME = 'Internal Aptitude Portal';

// Accept PostgreSQL UUID textual format without enforcing specific RFC version bits.
const UUID_COMPATIBLE_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RequisitionIdSchema = z.string().regex(UUID_COMPATIBLE_REGEX);

// ==================== Draft Routes ====================

// Zod schemas for validation
const DraftDataStep1Schema = z.object({
    fullName: z.string().optional(),
    email: z.string().optional(),
    phone: z.string().optional(),
    linkedinUrl: z.string().optional(),
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
    resumeSetupOnly: z.boolean().optional(),
    currentStep: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
});

const SaveDraftBodySchema = z.object({
    requisitionId: RequisitionIdSchema,
    draftData: DraftDataSchema,
});

const CandidateApplicationsQuerySchema = z.object({
    scope: z.enum(['all', 'active']).optional().default('all'),
    limit: z.coerce.number().int().min(1).max(100).optional().default(50),
});

type ResumeParsePopulationStatus = 'pending_consent' | 'pending_profile_sync' | 'applied';

function isJsonRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readResumeParsePopulationStatus(scanResult: unknown): ResumeParsePopulationStatus | null {
    if (!isJsonRecord(scanResult)) {
        return null;
    }

    const status = scanResult.parsePopulationStatus;
    if (status === 'pending_consent' || status === 'pending_profile_sync' || status === 'applied') {
        return status;
    }

    return null;
}

function readResumeParseMergeSummary(scanResult: unknown): Record<string, unknown> | null {
    if (!isJsonRecord(scanResult)) {
        return null;
    }

    const summary = scanResult.parseMergeSummary;
    return isJsonRecord(summary) ? summary : null;
}

function readDraftPhoneFromDraftData(draftData: unknown): string | null {
    if (!isJsonRecord(draftData)) {
        return null;
    }

    const step1 = draftData.step1_personal;
    if (!isJsonRecord(step1)) {
        return null;
    }

    const phone = step1.phone;
    if (typeof phone !== 'string') {
        return null;
    }

    const normalized = phone.trim();
    return normalized.length > 0 ? normalized : null;
}

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

        if (!RequisitionIdSchema.safeParse(requisitionId).success) {
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

        if (!RequisitionIdSchema.safeParse(requisitionId).success) {
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
 * GET /api/applications/contact-info
 * Returns authenticated candidate contact info for application prefill.
 */
router.get('/contact-info', authenticate, async (req, res) => {
    try {
        const candidateId = req.user!.id;

        const candidate = await prisma.candidate.findUnique({
            where: { id: candidateId },
            select: {
                email: true,
                phone: true,
            },
        });

        if (!candidate) {
            return res.status(404).json({
                error: {
                    code: 'CANDIDATE_NOT_FOUND',
                    message: 'Candidate not found',
                },
            });
        }

        let resolvedPhone = candidate.phone?.trim() || null;

        if (!resolvedPhone) {
            const latestApplication = await prisma.application.findFirst({
                where: { candidateId },
                orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
                select: {
                    draftData: true,
                },
            });

            resolvedPhone = readDraftPhoneFromDraftData(latestApplication?.draftData);
        }

        return res.status(200).json({
            email: candidate.email,
            phone: resolvedPhone,
        });
    } catch (error) {
        logger.error('Error fetching candidate contact info', {
            error: error instanceof Error ? error.message : String(error),
            candidateId: req.user?.id,
        });

        return res.status(500).json({
            error: {
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Unable to fetch candidate contact info',
            },
        });
    }
});

/**
 * GET /api/applications/ai-score/:requisitionId
 * Scores candidate resume skills against job required/preferred skills.
 */
router.get('/ai-score/:requisitionId', authenticate, async (req, res) => {
    try {
        const requisitionId = req.params.requisitionId;
        const candidateId = req.user!.id;

        if (!RequisitionIdSchema.safeParse(requisitionId).success) {
            return res.status(400).json({
                error: {
                    code: 'INVALID_REQUISITION_ID',
                    message: 'Invalid requisition ID format',
                },
            });
        }

        const requisition = await prisma.requisition.findUnique({
            where: { id: requisitionId },
            select: {
                title: true,
                requiredSkills: true,
                preferredSkills: true,
            },
        });

        if (!requisition) {
            return res.status(404).json({
                error: {
                    code: 'REQUISITION_NOT_FOUND',
                    message: 'Requisition not found',
                },
            });
        }

        const application = await prisma.application.findFirst({
            where: {
                candidateId,
                requisitionId,
            },
            orderBy: {
                createdAt: 'desc',
            },
            select: {
                id: true,
                resume: {
                    select: {
                        id: true,
                        parsedData: true,
                        scanStatus: true,
                    },
                },
            },
        });

        let resumeContext = application?.resume ?? null;

        if (!resumeContext?.id || resumeContext.scanStatus !== 'clean') {
            const latestCleanResumeApplication = await prisma.application.findFirst({
                where: {
                    candidateId,
                    resume: {
                        is: {
                            scanStatus: 'clean',
                        },
                    },
                },
                orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
                select: {
                    resume: {
                        select: {
                            id: true,
                            parsedData: true,
                            scanStatus: true,
                        },
                    },
                },
            });

            resumeContext = latestCleanResumeApplication?.resume ?? null;
        }

        if (!resumeContext?.id || resumeContext.scanStatus !== 'clean') {
            return res.status(409).json({
                error: {
                    code: 'RESUME_NOT_READY',
                    message: 'Resume is not ready for AI scoring yet',
                },
            });
        }

        const parsedSkillsRaw = resumeContext.parsedData && typeof resumeContext.parsedData === 'object'
            ? (resumeContext.parsedData as Record<string, unknown>).skills
            : [];

        const resumeSkills = Array.isArray(parsedSkillsRaw)
            ? parsedSkillsRaw.filter((value): value is string => typeof value === 'string')
            : [];

        const aiScore = await scoreResumeWithAi({
            roleTitle: requisition.title,
            resumeSkills,
            requiredSkills: requisition.requiredSkills,
            preferredSkills: requisition.preferredSkills,
        });

        return res.status(200).json({
            applicationId: application?.id ?? null,
            requisitionId,
            ...aiScore,
        });
    } catch (error) {
        logger.error('Error calculating AI resume score', {
            error: error instanceof Error ? error.message : String(error),
            candidateId: req.user?.id,
            requisitionId: req.params.requisitionId,
        });

        return res.status(500).json({
            error: {
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Unable to calculate AI score',
            },
        });
    }
});

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
            include: {
                resume: {
                    select: {
                        id: true,
                        scanStatus: true,
                        uploadedAt: true,
                        parsedData: true,
                        scanResult: true,
                    },
                },
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

        const responsePayload = {
            ...application,
            resume: application.resume
                ? {
                      id: application.resume.id,
                      scanStatus: application.resume.scanStatus,
                      uploadedAt: application.resume.uploadedAt,
                      parsedData: application.resume.parsedData,
                      parsePopulationStatus: readResumeParsePopulationStatus(application.resume.scanResult),
                      parseMergeSummary: readResumeParseMergeSummary(application.resume.scanResult),
                  }
                : null,
        };

        return res.status(200).json(responsePayload);
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
 * GET /api/applications/mine
 * List authenticated candidate's applications (all or active only)
 */
router.get('/mine', authenticate, async (req, res) => {
    try {
        const validation = CandidateApplicationsQuerySchema.safeParse(req.query);

        if (!validation.success) {
            return res.status(400).json({
                error: {
                    code: 'INVALID_QUERY_PARAMS',
                    message: 'Invalid query parameters',
                    details: validation.error.errors,
                },
            });
        }

        const { scope, limit } = validation.data;
        const candidateId = req.user!.id;

        const applications = await prisma.application.findMany({
            where: {
                candidateId,
                ...(scope === 'active'
                    ? {
                          status: { in: [...ACTIVE_APPLICATION_STATUSES] },
                          draftSavedAt: null,
                      }
                    : {
                          OR: [
                              {
                                  status: 'draft',
                                  NOT: {
                                      draftData: {
                                          path: ['resumeSetupOnly'],
                                          equals: true,
                                      },
                                  },
                              },
                              { draftSavedAt: null },
                          ],
                      }),
            },
            orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
            take: limit,
            select: {
                id: true,
                candidateId: true,
                requisitionId: true,
                status: true,
                path: true,
                pathOverridden: true,
                draftSavedAt: true,
                submittedAt: true,
                createdAt: true,
                updatedAt: true,
                requisition: {
                    select: {
                        id: true,
                        title: true,
                        department: true,
                        location: true,
                        jobType: true,
                        slots: true,
                        filledSlots: true,
                        minExperienceYears: true,
                    },
                },
                assessmentSessions: {
                    where: {
                        provider: {
                            name: INTERNAL_APTITUDE_PROVIDER_NAME,
                        },
                        status: 'in_progress',
                    },
                    orderBy: [{ launchedAt: 'desc' }],
                    take: 1,
                    select: {
                        testUrl: true,
                    },
                },
                interviewStages: {
                    where: {
                        OR: [
                            {
                                state: 'scheduled',
                                scheduledAt: { not: null },
                            },
                            {
                                type: 'aptitude',
                                state: 'completed',
                            },
                        ],
                    },
                    orderBy: [{ scheduledAt: 'desc' }],
                    select: {
                        type: true,
                        state: true,
                        scheduledAt: true,
                        endAt: true,
                        timezone: true,
                    },
                },
            },
        });

        const responseData = applications.map(({ assessmentSessions, interviewStages, ...application }) => {
            const scheduledStage = interviewStages.find(
                (stage) => stage.state === 'scheduled' && stage.scheduledAt !== null
            );
            const hasCompletedAptitudeStep = interviewStages.some(
                (stage) => stage.type === 'aptitude' && stage.state === 'completed'
            );

            return {
                ...application,
                aptitudeTestUrl: assessmentSessions[0]?.testUrl ?? null,
                scheduledStage: scheduledStage
                    ? {
                          type: scheduledStage.type,
                          scheduledAt: scheduledStage.scheduledAt?.toISOString() ?? null,
                          endAt: scheduledStage.endAt?.toISOString() ?? null,
                          timezone: scheduledStage.timezone,
                      }
                    : null,
                hasCompletedAptitudeStep,
            };
        });

        return res.status(200).json({
            data: responseData,
            meta: {
                scope,
                count: responseData.length,
            },
        });
    } catch (error) {
        logger.error('Error listing candidate applications', {
            error: error instanceof Error ? error.message : String(error),
            candidateId: req.user?.id,
        });

        return res.status(500).json({
            error: {
                code: 'INTERNAL_SERVER_ERROR',
                message: 'An error occurred while listing applications',
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
            select: {
                id: true,
                status: true,
                submittedAt: true,
                requisitionId: true,
                path: true,
                pathOverridden: true,
                candidateId: true,
                interviewStages: {
                    where: {
                        state: 'scheduled',
                        scheduledAt: { not: null },
                    },
                    orderBy: {
                        scheduledAt: 'desc',
                    },
                    take: 1,
                    select: {
                        type: true,
                        scheduledAt: true,
                        endAt: true,
                        timezone: true,
                    },
                },
            },
        });

        if (!application) {
            return res.status(404).json({
                error: {
                    code: 'APPLICATION_NOT_FOUND',
                    message: 'Application not found',
                },
            });
        }

        if (application.candidateId !== candidateId) {
            return res.status(403).json({
                error: {
                    code: 'UNAUTHORIZED',
                    message: 'You are not authorized to view this application',
                },
            });
        }

        return res.status(200).json({
            id: application.id,
            status: application.status,
            submittedAt: application.submittedAt,
            requisitionId: application.requisitionId,
            path: application.path,
            pathOverridden: application.pathOverridden,
            scheduledStage: application.interviewStages[0]
                ? {
                      type: application.interviewStages[0].type,
                      scheduledAt: application.interviewStages[0].scheduledAt?.toISOString() ?? null,
                      endAt: application.interviewStages[0].endAt?.toISOString() ?? null,
                      timezone: application.interviewStages[0].timezone,
                  }
                : null,
        });
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
 * Withdraw a submitted application
 */
router.patch('/:id/withdraw', authenticate, async (req, res) => {
    try {
        const applicationId = req.params.id;
        const candidateId = req.user!.id;

        const application = await withdrawApplication({ applicationId, candidateId });

        return res.status(200).json({
            id: application.id,
            status: application.status,
            submittedAt: application.submittedAt,
            requisitionId: application.requisitionId,
            path: application.path,
            pathOverridden: application.pathOverridden,
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

// ==================== Interview Stage Status ====================

/**
 * GET /api/applications/:id/stage-status
 * Get interview stage status for an application
 */
router.get('/:id/stage-status', authenticate, async (req, res) => {
    try {
        const { id } = req.params;

        const stageStatus = await getApplicationStageStatus(id);

        return res.status(200).json(stageStatus);
    } catch (error) {
        if (error instanceof Error && error.message.includes('not found')) {
            return res.status(404).json({
                error: {
                    code: 'APPLICATION_NOT_FOUND',
                    message: 'Application not found',
                },
            });
        }

        logger.error('Error fetching stage status', {
            error: error instanceof Error ? error.message : String(error),
            applicationId: req.params.id,
        });

        return res.status(500).json({
            error: {
                code: 'INTERNAL_SERVER_ERROR',
                message: 'An error occurred while fetching stage status',
            },
        });
    }
});

export default router;
