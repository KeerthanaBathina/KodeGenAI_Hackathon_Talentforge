import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { env } from '../config/env';
import { TemplateType } from '@prisma/client';
import logger from '../utils/logger';

const REDIS_QUEUES_ENABLED =
  process.env.ENABLE_REDIS_QUEUES === 'true' || process.env.NODE_ENV !== 'development';

const connection = new IORedis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  lazyConnect: !REDIS_QUEUES_ENABLED
});

// Job payload interface
export interface EmailDeliveryJobData {
  communicationId: string;
  to: string;
  templateType: TemplateType;
  templateId: string;
  tokenData: Record<string, string>;
  idempotencyKey: string;
  eventType: string;
  entityId: string;
}

// Create email delivery queue
export const emailDeliveryQueue: Queue | null = REDIS_QUEUES_ENABLED
  ? new Queue('email-delivery', {
    connection,
    defaultJobOptions: {
      attempts: 5,
      backoff: {
        type: 'exponential',
        delay: 30000
      },
      removeOnComplete: {
        age: 86400
      },
      removeOnFail: false
    }
  })
  : null;

/**
 * Enqueue email delivery job
 * 
 * @param data - Email delivery job data
 * @returns Promise that resolves when job is enqueued
 */
export async function enqueueEmailDelivery(
  data: EmailDeliveryJobData
): Promise<void> {
  if (!emailDeliveryQueue) {
    logger.warn(
      {
        communicationId: data.communicationId,
        eventType: data.eventType
      },
      'Email delivery queue disabled in development; enqueue skipped'
    );
    return;
  }

  const jobId = `email-${data.communicationId}`;

  await emailDeliveryQueue.add(
    'send-email',
    data,
    {
      jobId,
      attempts: 5
    }
  );

  logger.info(
    {
      communicationId: data.communicationId,
      to: data.to,
      templateType: data.templateType,
      eventType: data.eventType
    },
    'Email delivery job enqueued'
  );
}

/**
 * Cancel scheduled email delivery job
 * 
 * Used when email should not be sent (e.g., application withdrawn).
 * 
 * @param communicationId - Communication ID
 */
export async function cancelEmailDelivery(communicationId: string): Promise<void> {
  if (!emailDeliveryQueue) {
    return;
  }

  const jobId = `email-${communicationId}`;
  const job = await emailDeliveryQueue.getJob(jobId);

  if (job) {
    await job.remove();
    logger.info({ communicationId }, 'Email delivery job cancelled');
  } else {
    logger.debug({ communicationId }, 'Email delivery job not found for cancellation');
  }
}

/**
 * Get queue statistics
 * 
 * @returns Queue metrics
 */
export async function getQueueStats(): Promise<{
  waiting: number;
  active: number;
  completed: number;
  failed: number;
}> {
  if (!emailDeliveryQueue) {
    return {
      waiting: 0,
      active: 0,
      completed: 0,
      failed: 0
    };
  }

  const [waiting, active, completed, failed] = await Promise.all([
    emailDeliveryQueue.getWaitingCount(),
    emailDeliveryQueue.getActiveCount(),
    emailDeliveryQueue.getCompletedCount(),
    emailDeliveryQueue.getFailedCount()
  ]);

  return {
    waiting,
    active,
    completed,
    failed
  };
}

/**
 * Close email delivery queue gracefully
 * 
 * Call this during application shutdown.
 */
export async function closeEmailQueue(): Promise<void> {
  await emailDeliveryQueue?.close();
  logger.info('Email delivery queue closed');
}

// Export connection for worker
export { connection };
