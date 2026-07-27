import { Worker, Job } from 'bullmq';
import { connection, OfferExpiryJobData } from '../queues/offerQueue';
import { processOfferExpiry } from '../services/offerExpiryService';
import logger from '../utils/logger';

/**
 * BullMQ worker for processing offer-related jobs
 */
export const offerWorker = new Worker(
  'offers',
  async (job: Job<OfferExpiryJobData>) => {
    logger.info({
      jobId: job.id,
      jobName: job.name,
      offerId: job.data.offerId
    }, 'Processing offer job');

    try {
      switch (job.name) {
        case 'expire-offer':
          await processOfferExpiry(job.data.offerId);
          break;

        default:
          logger.warn({ jobName: job.name }, 'Unknown job type');
      }
    } catch (error: any) {
      logger.error({
        error: error.message,
        jobId: job.id,
        offerId: job.data.offerId
      }, 'Offer job processing failed');
      throw error; // Re-throw to trigger retry
    }
  },
  {
    connection,
    concurrency: 5,
    limiter: {
      max: 10,
      duration: 1000 // Max 10 jobs per second
    }
  }
);

// Worker event handlers
offerWorker.on('completed', (job) => {
  logger.info({
    jobId: job.id,
    jobName: job.name,
    offerId: job.data.offerId
  }, 'Offer job completed');
});

offerWorker.on('failed', (job, error) => {
  logger.error({
    jobId: job?.id,
    jobName: job?.name,
    error: error.message,
    attempts: job?.attemptsMade
  }, 'Offer job failed');
});

offerWorker.on('error', (error) => {
  logger.error({ error: error.message }, 'Worker error');
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, closing offer worker');
  await offerWorker.close();
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, closing offer worker');
  await offerWorker.close();
});

export default offerWorker;
