import { Queue, Worker, Job } from 'bullmq';
import logger from '../utils/logger';
import { sendInterviewReminder } from '../services/emailService';

export interface InterviewReminderJobData {
    interviewId: string;
    applicationId: string;
    reminderType: '24h' | '1h';
    recipientEmails: string[];
    scheduledAt: string;
}

const connection = {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD,
};

export const interviewReminderQueue = new Queue<InterviewReminderJobData>('interview-reminders', {
    connection,
    defaultJobOptions: {
        attempts: 3,
        backoff: {
            type: 'exponential',
            delay: 5000,
        },
        removeOnComplete: {
            age: 86400,
            count: 500,
        },
        removeOnFail: {
            age: 604800,
        },
    },
});

interviewReminderQueue.on('error', (error) => {
    logger.error('Interview reminder queue error', { error });
});

export async function enqueueInterviewReminder(
    data: InterviewReminderJobData,
    delayMs: number
): Promise<string> {
    const job = await interviewReminderQueue.add(`interview-reminder-${data.reminderType}`, data, {
        jobId: `${data.interviewId}:${data.reminderType}`,
        delay: Math.max(0, delayMs),
    });

    logger.info('Interview reminder enqueued', {
        jobId: job.id,
        interviewId: data.interviewId,
        reminderType: data.reminderType,
        delayMs,
    });

    return String(job.id);
}

/**
 * Cancel all reminder jobs for an interview
 */
export async function cancelInterviewReminders(interviewId: string): Promise<void> {
    try {
        await interviewReminderQueue.remove(`${interviewId}:24h`);
        await interviewReminderQueue.remove(`${interviewId}:1h`);

        logger.info({ interviewId }, '[reminders] Cancelled reminder jobs');
    } catch (error) {
        logger.error(
            { error, interviewId },
            '[reminders] Failed to cancel reminder jobs'
        );
        // Don't throw - if jobs don't exist, that's fine
    }
}

/**
 * Worker to process reminder jobs
 */
export const interviewReminderWorker = new Worker<InterviewReminderJobData>(
    'interview-reminders',
    async (job: Job<InterviewReminderJobData>) => {
        const { interviewId, reminderType } = job.data;

        logger.info(
            { interviewId, reminderType, jobId: job.id },
            '[reminders] Processing reminder job'
        );

        try {
            await sendInterviewReminder(interviewId, reminderType);

            logger.info(
                { interviewId, reminderType },
                '[reminders] Reminder sent successfully'
            );
        } catch (error) {
            logger.error(
                { error, interviewId, reminderType },
                '[reminders] Failed to send reminder'
            );
            throw error; // BullMQ will retry
        }
    },
    {
        connection,
        concurrency: 5,
    }
);

// Error handling
interviewReminderWorker.on('failed', (job, err) => {
    logger.error(
        {
            jobId: job?.id,
            interviewId: job?.data?.interviewId,
            error: err,
        },
        '[reminders] Reminder job failed'
    );
});
