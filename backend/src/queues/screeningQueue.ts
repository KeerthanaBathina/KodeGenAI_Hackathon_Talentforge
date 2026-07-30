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

export const screeningQueue = new Queue<ScreeningJobData>('resume-screening', {
    connection,
    defaultJobOptions: {
        attempts: 3,
        backoff: {
            type: 'exponential',
            delay: 5000, // 5s, then 10s, then 20s
        },
        timeout: 60000, // 60 seconds max
        removeOnComplete: {
            age: 86400, // 24 hours
            count: 1000,
        },
        removeOnFail: {
            age: 604800, // 7 days
        },
    },
});

screeningQueue.on('error', (error) => {
    logger.error('Screening queue error', { error });
});

export async function enqueueScreening(data: ScreeningJobData): Promise<string | null> {
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
export const screeningWorker = new Worker<ScreeningJobData>(
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
        concurrency: 5, // Process 5 screenings concurrently
    }
);

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

export async function getScreeningQueueHealth() {
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

logger.info('Screening queue and worker initialized');
