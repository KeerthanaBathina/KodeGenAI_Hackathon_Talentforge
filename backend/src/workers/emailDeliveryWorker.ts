import { Worker, Job } from 'bullmq';
import { connection, EmailDeliveryJobData } from '../queues/emailDeliveryQueue';
import { resolveTemplate } from '../services/templateService';
import { renderTemplate } from '../services/templateRenderer';
import { sendEmailViaResend } from '../services/resendEmailService';
import {
  updateCommunicationStatus,
  updateCommunicationRetryCount,
} from '../services/communicationService';
import {
  PermanentEmailError,
  TransientEmailError,
} from '../services/errors/emailErrors';
import { triggerDLQAlert, DLQAlertPayload } from '../services/alertService';
import { updateWorkerHeartbeat } from '../services/healthMetricsService';
import { WORKER_HEARTBEAT_KEYS } from '../constants/workerHeartbeats';
import { logger } from '../utils/logger';

/**
 * Process an email delivery job.
 * 
 * Workflow:
 * 1. Resolve template with locale fallback
 * 2. Render template with token data
 * 3. Send email via Resend API
 * 4. Update Communication status to 'sent'
 * 
 * Error handling:
 * - Transient errors: throw to trigger BullMQ retry
 * - Permanent errors: mark as failed, do not retry
 * 
 * @param job - BullMQ job containing email delivery data
 */
async function processEmailDeliveryJob(
  job: Job<EmailDeliveryJobData>
): Promise<void> {
  const {
    communicationId,
    to,
    templateType,
    templateId,
    tokenData,
    idempotencyKey,
  } = job.data;

  // Update worker heartbeat
  await updateWorkerHeartbeat(WORKER_HEARTBEAT_KEYS.EMAIL_DELIVERY);

  logger.info(
    {
      communicationId,
      jobId: job.id,
      to,
      templateType,
      attemptsMade: job.attemptsMade,
    },
    'Processing email delivery job'
  );

  try {
    // Step 1: Resolve template with locale fallback
    // TODO: Get locale from job data if needed, default to 'en' for now
    const template = await resolveTemplate(templateType, 'en');

    if (!template) {
      throw new PermanentEmailError(
        `Template not found for type: ${templateType}`,
        404
      );
    }

    logger.debug(
      {
        communicationId,
        templateId: template.id,
        locale: template.locale,
      },
      'Template resolved'
    );

    // Step 2: Render template with token data
    const rendered = renderTemplate(template, tokenData);

    logger.debug(
      {
        communicationId,
        subject: rendered.subject,
      },
      'Template rendered'
    );

    // Step 3: Send email via Resend
    const result = await sendEmailViaResend({
      to,
      subject: rendered.subject,
      html: rendered.bodyHtml,
      text: rendered.bodyText,
      idempotencyKey,
    });

    // Step 4: Update Communication record with success
    await updateCommunicationStatus(communicationId, {
      status: 'sent',
      messageId: result.messageId,
      sentAt: new Date(),
      retryCount: job.attemptsMade,
    });

    logger.info(
      {
        communicationId,
        messageId: result.messageId,
        to,
      },
      'Email sent successfully'
    );
  } catch (error) {
    // Update retry count on every attempt
    await updateCommunicationRetryCount(communicationId, job.attemptsMade);

    // Handle permanent errors (do not retry)
    if (error instanceof PermanentEmailError) {
      await updateCommunicationStatus(communicationId, {
        status: 'failed',
        retryCount: job.attemptsMade,
      });

      logger.error(
        {
          communicationId,
          error: error.message,
          statusCode: error.statusCode,
          attemptsMade: job.attemptsMade,
        },
        'Permanent email delivery failure - not retrying'
      );

      // Do not throw - prevents BullMQ retry
      return;
    }

    // Handle transient errors (retry)
    logger.warn(
      {
        communicationId,
        error: error instanceof Error ? error.message : String(error),
        attemptsMade: job.attemptsMade,
        maxAttempts: job.opts.attempts || 5,
      },
      'Transient email delivery failure - will retry'
    );

    // Throw to trigger BullMQ exponential backoff retry
    throw error;
  }
}

/**
 * BullMQ worker for email delivery queue.
 * 
 * Configuration:
 * - Concurrency: 5 (process up to 5 emails concurrently)
 * - Lock duration: 30 seconds
 * - Retry strategy: exponential backoff (configured in queue)
 */
export const emailDeliveryWorker = new Worker(
  'email-delivery',
  processEmailDeliveryJob,
  {
    connection,
    concurrency: 5,
    lockDuration: 30000, // 30 seconds
  }
);



// Event: Job completed successfully
emailDeliveryWorker.on('completed', (job) => {
  logger.info(
    {
      jobId: job.id,
      communicationId: job.data.communicationId,
      to: job.data.to,
    },
    'Email delivery job completed'
  );
});

// Event: Job failed
emailDeliveryWorker.on('failed', async (job, error) => {
  if (!job) return;

  const { communicationId } = job.data;
  const isFinalAttempt = job.attemptsMade >= (job.opts.attempts || 5);

  logger.error(
    {
      jobId: job.id,
      communicationId,
      to: job.data.to,
      attemptsMade: job.attemptsMade,
      maxAttempts: job.opts.attempts || 5,
      error: error.message,
      isFinalAttempt,
    },
    'Email delivery job failed'
  );

  // If this was the final attempt, trigger DLQ alert
  if (isFinalAttempt) {
    logger.error(
      {
        communicationId,
        jobId: job.id,
        attempts: job.attemptsMade,
        error: error.message,
      },
      'Email delivery job exhausted - moving to DLQ'
    );

    // Update Communication to failed status
    await updateCommunicationStatus(communicationId, {
      status: 'failed',
      retryCount: job.attemptsMade,
    });

    // Trigger ops alert with full context
    const alertPayload: DLQAlertPayload = {
      alertType: 'email_delivery_dlq',
      communicationId,
      jobId: job.id,
      attempts: job.attemptsMade,
      errorMessage: error.message,
      timestamp: new Date().toISOString(),
      metadata: {
        to: job.data.to,
        templateType: job.data.templateType,
        eventType: job.data.eventType,
      },
    };

    await triggerDLQAlert(alertPayload);
  }
});

// Event: Worker error
emailDeliveryWorker.on('error', (error) => {
  logger.error(
    { error: error.message },
    'Email delivery worker error'
  );
});

/**
 * Gracefully shutdown the email delivery worker.
 * 
 * Waits for active jobs to complete before closing.
 */
export async function shutdownEmailDeliveryWorker(): Promise<void> {
  logger.info('Shutting down email delivery worker...');
  await emailDeliveryWorker.close();
  logger.info('Email delivery worker shut down');
}

// Graceful shutdown on process termination
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, closing email delivery worker');
  await shutdownEmailDeliveryWorker();
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, closing email delivery worker');
  await shutdownEmailDeliveryWorker();
});

export default emailDeliveryWorker;
