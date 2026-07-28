import { env } from '../config/env';
import { logger } from '../utils/logger';

/**
 * Payload structure for DLQ (Dead Letter Queue) alerts.
 * 
 * Sent to ops team when an email delivery job exhausts all retry attempts.
 */
export interface DLQAlertPayload {
  /** Type of alert - used for routing/filtering by ops team */
  alertType: 'email_delivery_dlq';
  /** UUID of the Communication record */
  communicationId: string;
  /** BullMQ job ID */
  jobId: string;
  /** Number of retry attempts made */
  attempts: number;
  /** Error message from final failure */
  errorMessage: string;
  /** ISO 8601 timestamp of alert */
  timestamp: string;
  /** Additional context for debugging */
  metadata: {
    /** Recipient email address */
    to: string;
    /** Template type (offer, rejection, etc.) */
    templateType: string;
    /** Event that triggered the email */
    eventType: string;
  };
}

/**
 * Send DLQ alert to configured webhook endpoint.
 * 
 * Called by email delivery worker when a job exhausts all retry attempts (5 attempts).
 * Alert provides ops team with context for manual intervention.
 * 
 * @param payload - Alert data including communication ID, error, and metadata
 * 
 * @security OWASP A09 - Does not include email content or sensitive token values
 * @security Webhook URL must use HTTPS in production
 * 
 * @example
 * ```typescript
 * await triggerDLQAlert({
 *   alertType: 'email_delivery_dlq',
 *   communicationId: 'comm-123',
 *   jobId: 'job-456',
 *   attempts: 5,
 *   errorMessage: 'Service unavailable',
 *   timestamp: new Date().toISOString(),
 *   metadata: {
 *     to: 'candidate@example.com',
 *     templateType: 'offer',
 *     eventType: 'offer_extended'
 *   }
 * });
 * ```
 */
export async function triggerDLQAlert(payload: DLQAlertPayload): Promise<void> {
  // Check if webhook URL is configured
  if (!env.ALERT_WEBHOOK_URL) {
    logger.warn(
      { communicationId: payload.communicationId },
      'ALERT_WEBHOOK_URL not configured - skipping DLQ alert'
    );
    return;
  }

  try {
    logger.info(
      {
        communicationId: payload.communicationId,
        attempts: payload.attempts,
        webhookUrl: env.ALERT_WEBHOOK_URL,
      },
      'Sending DLQ alert to webhook'
    );

    const response = await fetch(env.ALERT_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'TalentForge-EmailWorker/1.0',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(
        `Webhook returned ${response.status}: ${response.statusText}`
      );
    }

    logger.info(
      {
        communicationId: payload.communicationId,
        statusCode: response.status,
      },
      'DLQ alert sent successfully'
    );
  } catch (error) {
    // Log error but do not throw - alerting failure should not crash worker
    logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
        payload: {
          communicationId: payload.communicationId,
          attempts: payload.attempts,
        },
      },
      'Failed to send DLQ alert to webhook'
    );
  }
}
