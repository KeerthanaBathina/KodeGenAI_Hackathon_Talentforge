import { Router } from 'express';
import { performScreening, getScreeningByApplication } from '../services/screeningService';
import { enqueueScreening } from '../queues/screeningQueue';
import { authenticate } from '../middleware/authenticate';
import prisma from '../db/prisma';
import logger from '../utils/logger';

const router = Router();

// POST /api/screenings/perform
// Manually trigger screening (for testing/admin use)
router.post('/perform', authenticate, async (req, res) => {
    try {
        const { applicationId } = req.body;

        if (!applicationId) {
            return res.status(400).json({
                error: {
                    code: 'MISSING_APPLICATION_ID',
                    message: 'applicationId is required',
                },
            });
        }

        const result = await performScreening(applicationId);

        res.status(200).json(result);
    } catch (error) {
        logger.error('Screening endpoint error', { error });
        res.status(500).json({
            error: {
                code: 'SCREENING_FAILED',
                message: error instanceof Error ? error.message : 'Screening failed',
            },
        });
    }
});

// POST /api/screenings/trigger
// Manually trigger screening via queue
router.post('/trigger', authenticate, async (req, res) => {
    try {
        const { applicationId } = req.body;

        if (!applicationId) {
            return res.status(400).json({
                error: {
                    code: 'MISSING_APPLICATION_ID',
                    message: 'applicationId is required',
                },
            });
        }

        // Find resume for application
        const application = await prisma.application.findUnique({
            where: { id: applicationId },
            include: { resume: true },
        });

        if (!application || !application.resume) {
            return res.status(404).json({
                error: {
                    code: 'NOT_FOUND',
                    message: 'Application or resume not found',
                },
            });
        }

        const jobId = await enqueueScreening({
            applicationId,
            resumeId: application.resume.id,
            triggeredBy: 'manual',
        });

        res.status(202).json({
            message: 'Screening job enqueued',
            jobId,
        });
    } catch (error) {
        logger.error('Failed to trigger screening', { error });
        res.status(500).json({
            error: {
                code: 'INTERNAL_ERROR',
                message: 'Failed to trigger screening',
            },
        });
    }
});

// GET /api/screenings/application/:applicationId
// Get screening result for an application
router.get('/application/:applicationId', authenticate, async (req, res) => {
    try {
        const { applicationId } = req.params;

        const screening = await getScreeningByApplication(applicationId);

        if (!screening) {
            return res.status(404).json({
                error: {
                    code: 'SCREENING_NOT_FOUND',
                    message: 'No screening found for this application',
                },
            });
        }

        res.json(screening);
    } catch (error) {
        logger.error('Get screening error', { error });
        res.status(500).json({
            error: {
                code: 'INTERNAL_ERROR',
                message: 'Failed to fetch screening',
            },
        });
    }
});

export default router;
