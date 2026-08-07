import { BrevoClient, BrevoError } from '@getbrevo/brevo';
import { env } from '../config/env';
import logger from '../utils/logger';

let apiInstance: BrevoClient | null = null;

function getBrevoApiInstance(): BrevoClient {
  if (apiInstance) {
    return apiInstance;
  }

  if (!env.BREVO_API_KEY) {
    throw new Error('BREVO_API_KEY is required to send email through Brevo');
  }

  apiInstance = new BrevoClient({
    apiKey: env.BREVO_API_KEY,
  });
  return apiInstance;
}

export async function sendEmail(
  to: string,
  subject: string,
  htmlContent: string
): Promise<void> {
  const email = {
    sender: {
      name: env.BREVO_SENDER_NAME || 'Recruitment Portal',
      email: env.EMAIL_FROM,
    },
    to: [
      {
        email: to,
      },
    ],
    subject,
    htmlContent,
  };

  try {
    const response = await getBrevoApiInstance().transactionalEmails.sendTransacEmail(email);
    logger.info({ to, subject, messageId: response.messageId }, 'Brevo email sent');
  } catch (error) {
    const details = error instanceof BrevoError
      ? {
          statusCode: error.statusCode,
          body: error.body,
        }
      : undefined;

    logger.error(
      {
        to,
        subject,
        error: error instanceof Error ? error.message : String(error),
        details,
      },
      'Brevo email send failed'
    );
    throw error;
  }
}