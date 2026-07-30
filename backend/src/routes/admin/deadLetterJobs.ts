import { Router } from 'express';
import { resumeParseDeadLetterQueue, resumeParseQueue } from '../../queues/resumeParseQueue';
import { authenticate } from '../../middleware/authenticate';
import logger from '../../utils/logger';

const router = Router();

/**
 * GET /api/admin/dead-letter-jobs
 * List all jobs in dead-letter queue
 */
router.get('/', authenticate, async (req, res) => {
    try {
        const jobs = await resumeParseDeadLetterQueue.getJobs([
            'completed',
            'failed',
            'waiting',
        ]);

        const jobDetails = jobs.map((job) => ({
            id: job.id,
            resumeId: job.data.resumeId,
            failedReason: job.data.failedReason,
            failedAt: job.data.failedAt,
            attempts: job.data.attempts,
            originalJobId: job.data.originalJobId,
        }));

        res.json({
            jobs: jobDetails,
            count: jobDetails.length,
        });
    } catch (error) {
        logger.error('Failed to fetch dead-letter jobs', { error });
        res.status(500).json({
            error: {
                code: 'INTERNAL_ERROR',
                message: 'Failed to fetch dead-letter jobs',
            },
        });
    }
});

/**
 * POST /api/admin/dead-letter-jobs/:jobId/retry
 * Retry a job from dead-letter queue
 */
router.post('/:jobId/retry', authenticate, async (req, res) => {
    try {
        const { jobId } = req.params;

        const job = await resumeParseDeadLetterQueue.getJob(`dlq-${jobId}`);

        if (!job) {
            return res.status(404).json({
                error: {
                    code: 'JOB_NOT_FOUND',
                    message: 'Dead-letter job not found',
                },
            });
        }

        // Re-enqueue in main queue
        await resumeParseQueue.add('parse-resume', job.data, {
            jobId: `retry-${jobId}-${Date.now()}`,
        });

        // Remove from dead-letter queue
        await job.remove();

        logger.info('Dead-letter job re-queued', { jobId, resumeId: job.data.resumeId });

        res.json({
            success: true,
            message: 'Job re-queued successfully',
        });
    } catch (error) {
        logger.error('Failed to retry job', { error, jobId: req.params.jobId });
        res.status(500).json({
            error: {
                code: 'INTERNAL_ERROR',
                message: 'Failed to retry job',
            },
        });
    }
});

/**
 * DELETE /api/admin/dead-letter-jobs/:jobId
 * Delete a job from dead-letter queue
 */
router.delete('/:jobId', authenticate, async (req, res) => {
    try {
        const { jobId } = req.params;

        const job = await resumeParseDeadLetterQueue.getJob(`dlq-${jobId}`);

        if (!job) {
            return res.status(404).json({
                error: {
                    code: 'JOB_NOT_FOUND',
                    message: 'Dead-letter job not found',
                },
            });
        }

        await job.remove();

        logger.info('Dead-letter job deleted', { jobId });

        res.json({
            success: true,
            message: 'Job deleted successfully',
        });
    } catch (error) {
        logger.error('Failed to delete job', { error, jobId: req.params.jobId });
        res.status(500).json({
            error: {
                code: 'INTERNAL_ERROR',
                message: 'Failed to delete job',
            },
        });
    }
});

export default router;
