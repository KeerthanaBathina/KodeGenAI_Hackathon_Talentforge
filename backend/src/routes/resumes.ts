import express from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/authenticate';
import {
    generatePresignedUrl,
    ResumeUploadError,
} from '../services/resumeService';
import prisma from '../db/prisma';
import logger from '../utils/logger';

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

/**
 * POST /api/resumes/presigned-url
 * Generate presigned URL for resume upload
 */
router.post('/presigned-url', authenticate, async (req, res) => {
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
        const candidateId = req.user!.id;

        // Verify candidate owns the application
        const application = await prisma.application.findUnique({
            where: { id: applicationId },
        });

        if (!application || application.candidateId !== candidateId) {
            return res.status(403).json({
                error: {
                    code: 'UNAUTHORIZED',
                    message: 'You are not authorized to upload a resume for this application',
                },
            });
        }

        const result = await generatePresignedUrl({
            candidateId,
            applicationId,
            fileName,
            fileSize,
            mimeType,
        });

        return res.status(200).json(result);
    } catch (error) {
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

export default router;
