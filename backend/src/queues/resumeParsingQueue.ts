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

export const resumeParsingQueue = new Queue<ResumeParsingJobData>('resume-parsing', {
    connection,
    defaultJobOptions: {
        attempts: 3,
        backoff: {
            type: 'exponential',
            delay: 2000,
        },
        removeOnComplete: {
            age: 86400, // 24 hours
            count: 100,
        },
        removeOnFail: {
            age: 604800, // 7 days
        },
    },
});

resumeParsingQueue.on('error', (error) => {
    logger.error('Resume parsing queue error', { error });
});

logger.info('Resume parsing queue initialized');

export async function enqueueResumeForParsing(data: ResumeParsingJobData): Promise<string> {
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
