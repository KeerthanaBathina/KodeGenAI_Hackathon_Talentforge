import { Queue } from 'bullmq';
import { env } from '../config/env';
import logger from '../utils/logger';

export interface ResumeParsingJobData {
    resumeId: string;
    applicationId: string;
    storageKey: string;
    candidateId: string;
}

const connection = {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD,
};

const REDIS_QUEUES_ENABLED =
    process.env.ENABLE_REDIS_QUEUES === 'true' || process.env.NODE_ENV !== 'development';

export const resumeParsingQueue: Queue<ResumeParsingJobData> | null = REDIS_QUEUES_ENABLED
    ? new Queue<ResumeParsingJobData>('resume-parsing', {
        connection,
        defaultJobOptions: {
            attempts: 3,
            backoff: {
                type: 'exponential',
                delay: 2000,
            },
            removeOnComplete: {
                age: 86400,
                count: 100,
            },
            removeOnFail: {
                age: 604800,
            },
        },
    })
    : null;

if (resumeParsingQueue) {
    resumeParsingQueue.on('error', (error) => {
        logger.error('Resume parsing queue error', { error });
    });
}

if (REDIS_QUEUES_ENABLED) {
    logger.info('Resume parsing queue initialized');
} else {
    logger.warn('Resume parsing queue disabled in development (set ENABLE_REDIS_QUEUES=true to enable)');
}

export async function enqueueResumeForParsing(data: ResumeParsingJobData): Promise<string> {
    if (!resumeParsingQueue) {
        throw new Error('Resume parsing queue is disabled in development. Set ENABLE_REDIS_QUEUES=true to enable.');
    }

    const job = await resumeParsingQueue.add('parse-resume', data, {
        jobId: `parse-${data.resumeId}`,
    });

    logger.info('Resume enqueued for parsing', {
        jobId: job.id,
        resumeId: data.resumeId,
        applicationId: data.applicationId,
    });

    return job.id!;
}
