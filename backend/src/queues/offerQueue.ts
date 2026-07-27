import { Queue, Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import { env } from '../config/env';
import logger from '../utils/logger';

const connection = new IORedis(env.REDIS_URL, {
  maxRetriesPerRequest: null
});

// Create offer queue
export const offerQueue = new Queue('offers', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000
    },
    removeOnComplete: {
      age: 7 * 24 * 60 * 60, // Keep completed jobs for 7 days
      count: 1000
    },
    removeOnFail: {
      age: 30 * 24 * 60 * 60 // Keep failed jobs for 30 days
    }
  }
});

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
  const jobId = `offer-expiry-${offerId}`;
  const job = await offerQueue.getJob(jobId);

  if (job) {
    await job.remove();
    logger.info({ offerId }, 'Offer expiry job cancelled');
  }
}

// Export connection for worker
export { connection };
