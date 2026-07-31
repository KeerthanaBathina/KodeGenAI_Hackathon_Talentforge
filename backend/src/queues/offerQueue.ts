import { Queue, Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import { env } from '../config/env';
import logger from '../utils/logger';

const REDIS_QUEUES_ENABLED =
  process.env.ENABLE_REDIS_QUEUES === 'true' || process.env.NODE_ENV !== 'development';

const connection = new IORedis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  lazyConnect: !REDIS_QUEUES_ENABLED
});

// Create offer queue
export const offerQueue: Queue | null = REDIS_QUEUES_ENABLED
  ? new Queue('offers', {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000
      },
      removeOnComplete: {
        age: 7 * 24 * 60 * 60,
        count: 1000
      },
      removeOnFail: {
        age: 30 * 24 * 60 * 60
      }
    }
  })
  : null;

// Job payload interfaces
export interface OfferExpiryJobData {
  offerId: string;
  applicationId: string;
  candidateEmail: string;
  expiresAt: Date;
}

/**
 * Schedule offer expiry job
 * 
 * @param data - Job data
 * @param delay - Delay in milliseconds until job executes
 */
export async function scheduleOfferExpiry(
  data: OfferExpiryJobData,
  delay: number
): Promise<void> {
  if (!offerQueue) {
    logger.warn(
      {
        offerId: data.offerId,
        applicationId: data.applicationId
      },
      'Offer queue disabled in development; scheduling skipped'
    );
    return;
  }

  const jobId = `offer-expiry-${data.offerId}`;

  await offerQueue.add(
    'expire-offer',
    data,
    {
      jobId,
      delay,
      attempts: 3
    }
  );

  logger.info({
    offerId: data.offerId,
    expiresAt: data.expiresAt,
    delayMs: delay
  }, 'Offer expiry job scheduled');
}

/**
 * Cancel scheduled offer expiry job
 * 
 * Used when offer is accepted or declined before expiry.
 * 
 * @param offerId - Offer ID
 */
export async function cancelOfferExpiry(offerId: string): Promise<void> {
  if (!offerQueue) {
    return;
  }

  const jobId = `offer-expiry-${offerId}`;
  const job = await offerQueue.getJob(jobId);

  if (job) {
    await job.remove();
    logger.info({ offerId }, 'Offer expiry job cancelled');
  }
}

// Export connection for worker
export { connection };
