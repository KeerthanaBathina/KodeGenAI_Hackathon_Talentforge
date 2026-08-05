import express from 'express';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { authenticate } from '../middleware/authenticate';
import {
    generatePresignedUrl,
    ResumeUploadError,
} from '../services/resumeService';
import { auditEvent } from '../services/auditService';
import { buildAuditContextFromRequest } from '../services/auditContextService';
import { AUDIT_EVENT_TYPES } from '../constants/auditEventTypes';
import prisma from '../db/prisma';
import logger from '../utils/logger';
import {
    isLocalResumeProcessingEnabled,
    processResumeLocally,
} from '../services/localResumeProcessingService';

const router = express.Router();

const GenerateUploadUrlSchema = z.object({
    applicationId: z.string().uuid(),
    fileName: z.string().min(1).max(255),
    fileSize: z.number().int().positive().max(10 * 1024 * 1024),
    mimeType: z.enum([
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ]),
});

const ProcessLocallySchema = z.object({
    resumeId: z.string().uuid(),
});

/**
 * POST /api/resumes/presigned-url
 * Generate presigned URL for resume upload
 */
router.post('/presigned-url', authenticate, async (req, res) => {
    const auditContext = buildAuditContextFromRequest(req);
    const uploadRequestId = randomUUID();
    let requestedApplicationId: string | null = null;

    try {
        const validation = GenerateUploadUrlSchema.safeParse(req.body);

        if (!validation.success) {
            return res.status(400).json({
                error: {
                    code: 'INVALID_REQUEST',
                    message: 'Invalid request payload',
                    details: validation.error.errors,
                },
            });
        }

        const { applicationId, fileName, fileSize, mimeType } = validation.data;
        requestedApplicationId = applicationId;
        const candidateId = req.user!.id;

        // Verify candidate owns the application
        const application = await prisma.application.findUnique({
            where: { id: applicationId },
        });

        if (!application || application.candidateId !== candidateId) {
            await auditEvent({
                actorId: auditContext.actorId,
                actorRole: auditContext.actorRole,
                eventType: AUDIT_EVENT_TYPES.UPLOAD_RESUME_FAILED,
                entityType: 'application',
                entityId: applicationId,
                payload: {
                    uploadRequestId,
                    reason: 'unauthorized_application_access',
                },
                ipAddress: auditContext.ipAddress,
                userAgent: auditContext.userAgent,
            });

            return res.status(403).json({
                error: {
                    code: 'UNAUTHORIZED',
                    message: 'You are not authorized to upload a resume for this application',
                },
            });
        }

        await auditEvent({
            actorId: auditContext.actorId,
            actorRole: auditContext.actorRole,
            eventType: AUDIT_EVENT_TYPES.UPLOAD_RESUME_STARTED,
            entityType: 'application',
            entityId: applicationId,
            payload: {
                uploadRequestId,
                fileName,
                fileSize,
                mimeType,
            },
            ipAddress: auditContext.ipAddress,
            userAgent: auditContext.userAgent,
        });

        const result = await generatePresignedUrl({
            candidateId,
            applicationId,
            fileName,
            fileSize,
            mimeType,
        });

        await auditEvent({
            actorId: auditContext.actorId,
            actorRole: auditContext.actorRole,
            eventType: AUDIT_EVENT_TYPES.UPLOAD_RESUME_COMPLETED,
            entityType: 'application',
            entityId: applicationId,
            payload: {
                uploadRequestId,
                resumeId: result.resumeId,
                storageKey: result.storageKey,
                expiresIn: result.expiresIn,
            },
            ipAddress: auditContext.ipAddress,
            userAgent: auditContext.userAgent,
        });

        return res.status(200).json(result);
    } catch (error) {
        if (requestedApplicationId) {
            await auditEvent({
                actorId: auditContext.actorId,
                actorRole: auditContext.actorRole,
                eventType: AUDIT_EVENT_TYPES.UPLOAD_RESUME_FAILED,
                entityType: 'application',
                entityId: requestedApplicationId,
                payload: {
                    uploadRequestId,
                    errorCode:
                        error instanceof ResumeUploadError ? error.code : 'INTERNAL_SERVER_ERROR',
                    errorMessage: error instanceof Error ? error.message : 'Unknown error',
                },
                ipAddress: auditContext.ipAddress,
                userAgent: auditContext.userAgent,
            });
        }

        if (error instanceof ResumeUploadError) {
            const statusCode =
                error.code === 'INVALID_FILE_TYPE' || error.code === 'FILE_TOO_LARGE' ? 400 : 500;
            return res.status(statusCode).json({
                error: {
                    code: error.code,
                    message: error.message,
                },
            });
        }

        logger.error('Error generating presigned URL', {
            error: error instanceof Error ? error.message : String(error),
            candidateId: req.user?.id,
        });

        return res.status(500).json({
            error: {
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Failed to generate upload URL',
            },
        });
    }
});

/**
 * POST /api/resumes/process-locally
 * Candidate-triggered local parse fallback for development environments.
 */
router.post('/process-locally', authenticate, async (req, res) => {
    if (!isLocalResumeProcessingEnabled()) {
        return res.status(403).json({
            error: {
                code: 'LOCAL_PROCESSING_DISABLED',
                message: 'Local resume processing is disabled',
            },
        });
    }

    const validation = ProcessLocallySchema.safeParse(req.body);
    if (!validation.success) {
        return res.status(400).json({
            error: {
                code: 'INVALID_REQUEST',
                message: 'Invalid request payload',
                details: validation.error.errors,
            },
        });
    }

    const candidateId = req.user?.candidateId ?? req.user?.id;
    if (!candidateId) {
        return res.status(403).json({
            error: {
                code: 'UNAUTHORIZED',
                message: 'Candidate access required',
            },
        });
    }

    const { resumeId } = validation.data;
    const resume = await prisma.resume.findFirst({
        where: {
            id: resumeId,
            application: {
                candidateId,
            },
        },
        select: {
            id: true,
        },
    });

    if (!resume) {
        return res.status(404).json({
            error: {
                code: 'RESUME_NOT_FOUND',
                message: 'Resume not found',
            },
        });
    }

    try {
        const result = await processResumeLocally(resumeId);
        return res.status(200).json(result);
    } catch (error) {
        logger.error('Local resume processing failed', {
            resumeId,
            candidateId,
            error: error instanceof Error ? error.message : String(error),
        });

        return res.status(500).json({
            error: {
                code: 'LOCAL_PROCESSING_FAILED',
                message: 'Unable to process resume locally',
            },
        });
    }
});

export default router;
