import { Resend } from 'resend';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import {
  ResendApiError,
  PermanentEmailError,
  TransientEmailError,
  isTransientError,
} from './errors/emailErrors';

// Initialize Resend client (lazy initialization to support optional config)
let resendClient: Resend | null = null;

/**
 * Get or create Resend client instance.
 * 
 * @returns Resend client
 * @throws Error if RESEND_API_KEY is not configured
 */
function getResendClient(): Resend {
  if (!resendClient) {
    if (!env.RESEND_API_KEY) {
      throw new Error('RESEND_API_KEY is not configured');
    }
    resendClient = new Resend(env.RESEND_API_KEY);
  }
  return resendClient;
}

/**
 * Input parameters for sending an email via Resend.
 */
export interface SendEmailViaResendInput {
  /** Recipient email address */
  to: string;
  /** Email subject line */
  subject: string;
  /** HTML content of the email */
  html: string;
  /** Plain text content of the email */
  text: string;
  /** Idempotency key to prevent duplicate sends */
  idempotencyKey: string;
}

/**
 * Result of sending an email via Resend.
 */
export interface SendEmailViaResendResult {
  /** Resend message ID */
  messageId: string;
  /** Whether the send was successful */
  success: boolean;
}

/**
 * Send an email via Resend API with idempotency.
 * 
 * @param input - Email parameters including recipient, content, and idempotency key
 * @returns Result containing message ID and success status
 * @throws TransientEmailError for retryable failures (5xx, timeouts)
 * @throws PermanentEmailError for permanent failures (4xx client errors)
 * 
 * @security OWASP A07 - API key from environment variable only
 * @security OWASP A09 - Logs metadata only, not email content
 * 
 * @example
 * ```typescript
 * const result = await sendEmailViaResend({
 *   to: 'candidate@example.com',
 *   subject: 'Application Received',
 *   html: '<p>Thank you for applying!</p>',
 *   text: 'Thank you for applying!',
 *   idempotencyKey: 'abc123...'
 * });
 * console.log('Message ID:', result.messageId);
 * ```
 */
export async function sendEmailViaResend(
  input: SendEmailViaResendInput
): Promise<SendEmailViaResendResult> {
  const resend = getResendClient();
  
  if (!env.RESEND_FROM_EMAIL) {
    throw new PermanentEmailError(
      'RESEND_FROM_EMAIL is not configured',
      undefined,
      undefined
    );
  }

  logger.debug({
    to: input.to,
    subject: input.subject,
    idempotencyKey: input.idempotencyKey,
  }, 'Sending email via Resend');

  try {
    // Call Resend API with idempotency header
    const result = await resend.emails.send({
      from: env.RESEND_FROM_EMAIL,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
      headers: {
        'X-Idempotency-Key': input.idempotencyKey,
      },
    });

    // Check for API error in response
    if (result.error) {
      const statusCode = result.error.statusCode || 
                        (result.error as any).status || 
                        undefined;
      
      logger.error({
        error: result.error,
        statusCode,
        to: input.to,
        subject: input.subject,
        idempotencyKey: input.idempotencyKey,
      }, 'Resend API returned error');

      // Classify error by status code
      if (statusCode && isTransientError(statusCode)) {
        throw new TransientEmailError(
          result.error.message || 'Resend API transient error',
          statusCode,
          result.error
        );
      } else {
        throw new PermanentEmailError(
          result.error.message || 'Resend API permanent error',
          statusCode,
          result.error
        );
      }
    }

    // Validate response has message ID
    if (!result.data || !result.data.id) {
      throw new ResendApiError(
        'Resend API response missing message ID',
        undefined,
        result
      );
    }

    logger.info({
      messageId: result.data.id,
      to: input.to,
      subject: input.subject,
      idempotencyKey: input.idempotencyKey,
    }, 'Email sent successfully via Resend');

    return {
      messageId: result.data.id,
      success: true,
    };
  } catch (error) {
    // If already classified, re-throw
    if (error instanceof PermanentEmailError || error instanceof TransientEmailError) {
      throw error;
    }

    // Handle timeout errors
    if (error && typeof error === 'object' && 'code' in error) {
      const code = (error as any).code;
      if (code === 'ETIMEDOUT' || code === 'ECONNABORTED') {
        logger.warn({
          error,
          to: input.to,
          idempotencyKey: input.idempotencyKey,
        }, 'Resend API timeout - will retry');
        
        throw new TransientEmailError(
          'Resend API timeout',
          undefined,
          error
        );
      }
    }

    // Handle HTTP errors from fetch/axios
    if (error && typeof error === 'object' && 'response' in error) {
      const response = (error as any).response;
      const statusCode = response?.status || response?.statusCode;
      
      if (statusCode) {
        logger.error({
          error,
          statusCode,
          to: input.to,
          idempotencyKey: input.idempotencyKey,
        }, 'Resend API HTTP error');

        if (isTransientError(statusCode)) {
          throw new TransientEmailError(
            `Resend API error: ${statusCode}`,
            statusCode,
            error
          );
        } else {
          throw new PermanentEmailError(
            `Resend API error: ${statusCode}`,
            statusCode,
            error
          );
        }
      }
    }

    // Unknown error: log and classify as transient (safer to retry)
    logger.error({
      error,
      to: input.to,
      idempotencyKey: input.idempotencyKey,
    }, 'Unknown Resend API error - treating as transient');

    throw new TransientEmailError(
      error instanceof Error ? error.message : 'Unknown Resend API error',
      undefined,
      error
    );
  }
}
