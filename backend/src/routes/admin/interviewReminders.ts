import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { interviewReminderQueue } from '../../queues/interviewReminderQueue';
import logger from '../../utils/logger';

const router = Router();

/**
 * GET /api/admin/interview-reminders/pending
 * Get all pending interview reminder jobs
 * Admin only
 */
router.get('/pending', authenticate, authorize(['admin']), async (req, res) => {
    try {
        // Get all delayed jobs (scheduled but not yet processed)
        const delayedJobs = await interviewReminderQueue.getJobs(['delayed']);
        
        // Get all waiting jobs (ready to be processed)
        const waitingJobs = await interviewReminderQueue.getJobs(['waiting']);

        const allPendingJobs = [...delayedJobs, ...waitingJobs];

        const pendingReminders = allPendingJobs.map((job) => {
            const delay = job.opts?.delay || 0;
            const scheduledFor = new Date(job.timestamp + delay);

            return {
                jobId: job.id,
                interviewId: job.data?.interviewId,
                applicationId: job.data?.applicationId,
                reminderType: job.data?.reminderType,
                scheduledAt: job.data?.scheduledAt,
                scheduledFor: scheduledFor.toISOString(),
                status: job.delay ? 'delayed' : 'waiting',
                attempts: job.attemptsMade,
                createdAt: new Date(job.timestamp).toISOString(),
            };
        });

        // Sort by scheduled time
        pendingReminders.sort(
            (a, b) => new Date(a.scheduledFor).getTime() - new Date(b.scheduledFor).getTime()
        );

        logger.info(
            { count: pendingReminders.length },
            '[admin] Fetched pending interview reminders'
        );

        res.status(200).json({
            count: pendingReminders.length,
            reminders: pendingReminders,
        });
    } catch (error) {
        logger.error({ error }, '[admin] Failed to fetch pending reminders');
        res.status(500).json({
            error: {
                code: 'INTERNAL_ERROR',
                message: 'Failed to fetch pending reminders',
            },
        });
    }
});

/**
 * GET /api/admin/interview-reminders/stats
 * Get reminder queue statistics
 * Admin only
 */
router.get('/stats', authenticate, authorize(['admin']), async (req, res) => {
    try {
        const [completed, failed, delayed, active, waiting] = await Promise.all([
            interviewReminderQueue.getJobCounts('completed'),
            interviewReminderQueue.getJobCounts('failed'),
            interviewReminderQueue.getJobCounts('delayed'),
            interviewReminderQueue.getJobCounts('active'),
            interviewReminderQueue.getJobCounts('waiting'),
        ]);

        const stats = {
            completed: completed.completed || 0,
            failed: failed.failed || 0,
            delayed: delayed.delayed || 0,
            active: active.active || 0,
            waiting: waiting.waiting || 0,
            total:
                (completed.completed || 0) +
                (failed.failed || 0) +
                (delayed.delayed || 0) +
                (active.active || 0) +
                (waiting.waiting || 0),
        };

        logger.info({ stats }, '[admin] Fetched reminder queue stats');

        res.status(200).json(stats);
    } catch (error) {
        logger.error({ error }, '[admin] Failed to fetch reminder queue stats');
        res.status(500).json({
            error: {
                code: 'INTERNAL_ERROR',
                message: 'Failed to fetch reminder queue stats',
            },
        });
    }
});

/**
 * GET /api/admin/interview-reminders/failed
 * Get failed reminder jobs for investigation
 * Admin only
 */
router.get('/failed', authenticate, authorize(['admin']), async (req, res) => {
    try {
        const failedJobs = await interviewReminderQueue.getJobs(['failed']);

        const failedReminders = failedJobs.map((job) => ({
            jobId: job.id,
            interviewId: job.data?.interviewId,
            applicationId: job.data?.applicationId,
            reminderType: job.data?.reminderType,
            scheduledAt: job.data?.scheduledAt,
            attempts: job.attemptsMade,
            failedAt: job.finishedOn ? new Date(job.finishedOn).toISOString() : null,
            error: job.failedReason || 'Unknown error',
            stackTrace: job.stacktrace?.slice(0, 500), // Truncate for readability
        }));

        logger.info(
            { count: failedReminders.length },
            '[admin] Fetched failed interview reminders'
        );

        res.status(200).json({
            count: failedReminders.length,
            reminders: failedReminders,
        });
    } catch (error) {
        logger.error({ error }, '[admin] Failed to fetch failed reminders');
        res.status(500).json({
            error: {
                code: 'INTERNAL_ERROR',
                message: 'Failed to fetch failed reminders',
            },
        });
    }
});

export default router;
