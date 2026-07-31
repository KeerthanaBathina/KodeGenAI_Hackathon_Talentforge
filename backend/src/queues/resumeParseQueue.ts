import { Queue, QueueEvents } from 'bullmq';
import prisma from '../db/prisma';
import logger from '../utils/logger';

export interface ResumeParseJobData {
    resumeId: string;
    applicationId: string;
    storageKey: string;
    candidateId: string;
    fileName: string;
    mimeType: string;
}

const connection = {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD,
};

const REDIS_QUEUES_ENABLED =
    process.env.ENABLE_REDIS_QUEUES === 'true' || process.env.NODE_ENV !== 'development';

export const resumeParseQueue: Queue<ResumeParseJobData> | null = REDIS_QUEUES_ENABLED
    ? new Queue<ResumeParseJobData>('resume-parse', {
        connection,
        defaultJobOptions: {
            attempts: 3,
            backoff: {
                type: 'exponential',
                delay: 2000,
            },
            timeout: 30000,
            removeOnComplete: {
                age: 86400,
                count: 500,
            },
            removeOnFail: {
                age: 604800,
            },
        },
    })
    : null;

// Dead-letter queue for permanently failed jobs
export const resumeParseDeadLetterQueue: Queue | null = REDIS_QUEUES_ENABLED
    ? new Queue('resume-parse-dead-letter', {
        connection,
        defaultJobOptions: {
            removeOnComplete: false,
            removeOnFail: false,
        },
    })
    : null;

if (resumeParseQueue) {
    resumeParseQueue.on('error', (error) => {
        logger.error('Resume parse queue error', { error });
    });
}

if (resumeParseDeadLetterQueue) {
    resumeParseDeadLetterQueue.on('error', (error) => {
        logger.error('Dead-letter queue error', { error });
    });
}

// Listen for failed events and move to dead-letter queue after final attempt
const queueEvents = REDIS_QUEUES_ENABLED ? new QueueEvents('resume-parse', { connection }) : null;

queueEvents?.on('failed', async ({ jobId, failedReason, prev }) => {
    if (prev === 'completed') return;

    try {
        const job = await resumeParseQueue.getJob(jobId!);
        if (!job) return;

        // Check if this was the final attempt
        if (job.attemptsMade >= (job.opts.attempts || 3)) {
            logger.error('Resume parsing failed permanently', {
                jobId,
                resumeId: job.data.resumeId,
                failedReason,
                attempts: job.attemptsMade,
            });

            // Move to dead-letter queue
            await resumeParseDeadLetterQueue.add(
                'dead-letter-job',
                {
                    ...job.data,
                    originalJobId: jobId,
                    failedReason,
                    failedAt: new Date().toISOString(),
                    attempts: job.attemptsMade,
                },
                {
                    jobId: `dlq-${jobId}`,
                }
            );

            // Update resume status to parse_failed
            await prisma.resume.update({
                where: { id: job.data.resumeId },
                data: {
                    scanResult: {
                        parseError: failedReason,
                        attempts: job.attemptsMade,
                        failedAt: new Date().toISOString(),
                    } as any,
                },
            });
        }
    } catch (error) {
        logger.error('Error handling failed job', {
            jobId,
            error: error instanceof Error ? error.message : String(error),
        });
    }
});

if (REDIS_QUEUES_ENABLED) {
    logger.info('Resume parse queue initialized');
} else {
    logger.warn('Resume parse queue disabled in development (set ENABLE_REDIS_QUEUES=true to enable)');
}

export async function enqueueResumeForParse(data: ResumeParseJobData): Promise<string> {
    if (!resumeParseQueue) {
        throw new Error('Resume parse queue is disabled in development. Set ENABLE_REDIS_QUEUES=true to enable.');
    }

    const job = await resumeParseQueue.add('parse-resume', data, {
        jobId: `parse-${data.resumeId}`,
        priority: 1,
    });

    logger.info('Resume enqueued for parsing', {
        jobId: job.id,
        resumeId: data.resumeId,
        applicationId: data.applicationId,
    });

    return job.id!;
}

export async function getQueueHealth() {
    if (!resumeParseQueue || !resumeParseDeadLetterQueue) {
        return {
            queue: 'resume-parse',
            waiting: 0,
            active: 0,
            failed: 0,
            delayed: 0,
            completed: 0,
            deadLetterCount: 0,
            healthy: true,
        };
    }

    const [waiting, active, failed, delayed, completed] = await Promise.all([
        resumeParseQueue.getWaitingCount(),
        resumeParseQueue.getActiveCount(),
        resumeParseQueue.getFailedCount(),
        resumeParseQueue.getDelayedCount(),
        resumeParseQueue.getCompletedCount(),
    ]);

    const deadLetterCount = await resumeParseDeadLetterQueue.getWaitingCount();

    return {
        queue: 'resume-parse',
        waiting,
        active,
        failed,
        delayed,
        completed,
        deadLetterCount,
        healthy: active < 100 && failed < 20 && deadLetterCount < 10,
    };
}
