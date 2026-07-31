import { Queue, Worker } from 'bullmq';
import { performScreening } from '../services/screeningService';
import { FallbackModeService } from '../services/fallbackModeService';
import { SystemHealthWorker } from '../workers/systemHealthWorker';
import prisma from '../db/prisma';
import logger from '../utils/logger';

export interface ScreeningJobData {
    applicationId: string;
    resumeId: string;
    triggeredBy: 'parsing' | 'manual';
}

const connection = {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD,
};

const REDIS_QUEUES_ENABLED =
    process.env.ENABLE_REDIS_QUEUES === 'true' || process.env.NODE_ENV !== 'development';

export const screeningQueue: Queue<ScreeningJobData> | null = REDIS_QUEUES_ENABLED
    ? new Queue<ScreeningJobData>('resume-screening', {
        connection,
        defaultJobOptions: {
            attempts: 3,
            backoff: {
                type: 'exponential',
                delay: 5000,
            },
            timeout: 60000,
            removeOnComplete: {
                age: 86400,
                count: 1000,
            },
            removeOnFail: {
                age: 604800,
            },
        },
    })
    : null;

if (screeningQueue) {
    screeningQueue.on('error', (error) => {
        logger.error('Screening queue error', { error });
    });
}

export async function enqueueScreening(data: ScreeningJobData): Promise<string | null> {
    if (!REDIS_QUEUES_ENABLED || !screeningQueue) {
        await prisma.application.update({
            where: { id: data.applicationId },
            data: {
                status: 'pending_review',
                manualReviewReason: 'queue_unavailable_dev',
            },
        });
        return null;
    }

    // Check if fallback mode is active
    const fallbackActive = await FallbackModeService.isFallbackModeActive();

    if (fallbackActive) {
        // Route directly to manual review instead of queueing
        logger.info('Fallback mode active - routing to manual review', {
            applicationId: data.applicationId,
        });

        await prisma.application.update({
            where: { id: data.applicationId },
            data: {
                status: 'pending_review',
                manualReviewReason: 'fallback_mode',
            },
        });

        return null; // No job created
    }

    // Normal path - enqueue for AI screening
    const job = await screeningQueue.add('screen-application', data, {
        jobId: `screen-${data.applicationId}`,
        priority: data.triggeredBy === 'manual' ? 1 : 2,
    });

    logger.info('Application enqueued for screening', {
        jobId: job.id,
        applicationId: data.applicationId,
    });

    return job.id!;
}

// Screening worker
export const screeningWorker: Worker<ScreeningJobData> | null = REDIS_QUEUES_ENABLED
    ? new Worker<ScreeningJobData>(
        'resume-screening',
        async (job) => {
            const { applicationId, triggeredBy } = job.data;

        // Update worker heartbeat
        await SystemHealthWorker.updateWorkerHeartbeat();

        logger.info('Processing screening job', {
            jobId: job.id,
            applicationId,
            triggeredBy,
        });

        const startTime = Date.now();

        try {
            const result = await performScreening(applicationId);

            const elapsed = Date.now() - startTime;

            logger.info('Screening job completed', {
                jobId: job.id,
                applicationId,
                score: result.score,
                recommendation: result.recommendation,
                elapsed: `${elapsed}ms`,
            });

            return result;
        } catch (error) {
            const elapsed = Date.now() - startTime;

            logger.error('Screening job failed', {
                jobId: job.id,
                applicationId,
                elapsed: `${elapsed}ms`,
                error: error instanceof Error ? error.message : String(error),
            });

            throw error;
        }
        },
        {
            connection,
            concurrency: 5,
        }
    )
    : null;

if (screeningWorker) {
    screeningWorker.on('completed', (job, result) => {
        logger.info('Screening worker completed job', {
            jobId: job.id,
            applicationId: job.data.applicationId,
            score: result.score,
        });
    });

    screeningWorker.on('failed', (job, error) => {
        logger.error('Screening worker failed job', {
            jobId: job?.id,
            applicationId: job?.data.applicationId,
            error: error.message,
        });
    });
}

export async function getScreeningQueueHealth() {
    if (!screeningQueue) {
        return {
            queue: 'resume-screening',
            waiting: 0,
            active: 0,
            completed: 0,
            failed: 0,
            delayed: 0,
            healthy: true,
        };
    }

    const [waiting, active, completed, failed, delayed] = await Promise.all([
        screeningQueue.getWaitingCount(),
        screeningQueue.getActiveCount(),
        screeningQueue.getCompletedCount(),
        screeningQueue.getFailedCount(),
        screeningQueue.getDelayedCount(),
    ]);

    return {
        queue: 'resume-screening',
        waiting,
        active,
        completed,
        failed,
        delayed,
        healthy: active < 50 && failed < 10,
    };
}

if (REDIS_QUEUES_ENABLED) {
    logger.info('Screening queue and worker initialized');
} else {
    logger.warn('Screening queue disabled in development (set ENABLE_REDIS_QUEUES=true to enable)');
}
