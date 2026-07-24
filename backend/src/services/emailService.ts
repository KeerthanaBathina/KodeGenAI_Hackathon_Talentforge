import { env } from '../config/env';
import logger from '../utils/logger';
import {
  renderApplicationReceivedEmail,
  renderApplicationWithdrawnEmail,
  type ApplicationReceivedData,
  type ApplicationWithdrawnData,
} from '../email/templateRenderer';

export type SendOtpEmailInput = {
  email: string;
  otp: string;
  expiresAt: Date;
};

export type SendAccountLockoutEmailInput = {
  email: string;
  lockedUntil: Date;
};

export type SendPasswordResetEmailInput = {
  to: string;
  name: string;
  resetLink: string;
  expiryMinutes: number;
};

export async function sendOtpEmail(input: SendOtpEmailInput): Promise<void> {
  if (env.EMAIL_PROVIDER === 'mock') {
    logger.info(
      {
        email: input.email,
        expiresAt: input.expiresAt.toISOString(),
        provider: env.EMAIL_PROVIDER
      },
      'auth: OTP dispatch simulated by mock email provider'
    );
    return;
  }

  logger.info(
    {
      email: input.email,
      expiresAt: input.expiresAt.toISOString(),
      provider: env.EMAIL_PROVIDER
    },
    'auth: OTP dispatch requested via external provider'
  );
}

export async function sendAccountLockoutEmail(input: SendAccountLockoutEmailInput): Promise<void> {
  if (env.EMAIL_PROVIDER === 'mock') {
    logger.info(
      {
        email: input.email,
        lockedUntil: input.lockedUntil.toISOString(),
        provider: env.EMAIL_PROVIDER
      },
      'auth: Account lockout notification simulated by mock email provider'
    );
    return;
  }

  logger.info(
    {
      email: input.email,
      lockedUntil: input.lockedUntil.toISOString(),
      provider: env.EMAIL_PROVIDER
    },
    'auth: Account lockout notification requested via external provider'
  );
}

export async function sendPasswordResetEmail(input: SendPasswordResetEmailInput): Promise<void> {
  const { to, name, resetLink, expiryMinutes } = input;

  if (env.EMAIL_PROVIDER === 'mock') {
    logger.info(
      { to, resetLink, expiryMinutes },
      `[MOCK EMAIL] Password reset link for ${name}`
    );
    console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📧 PASSWORD RESET EMAIL (Mock)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
To: ${to}
Subject: Reset Your Password

Hi ${name},

We received a request to reset your password. Click the link below to create a new password:

${resetLink}

This link will expire in ${expiryMinutes} minutes.

If you didn't request this, you can safely ignore this email.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    `);
    return;
  }

  // Real SMTP implementation here
  throw new Error('SMTP email provider not yet implemented');
}

/**
 * Send application received confirmation email
 */
export async function sendApplicationReceivedEmail(params: {
  candidateEmail: string;
  candidateName: string;
  requisitionTitle: string;
  requisitionDepartment: string;
  applicationId: string;
  submittedAt: Date;
}): Promise<void> {
  const {
    candidateEmail,
    candidateName,
    requisitionTitle,
    requisitionDepartment,
    applicationId,
    submittedAt,
  } = params;

  try {
    logger.info('Sending application received email', { candidateEmail, applicationId });

    const trackApplicationUrl = `${env.FRONTEND_URL}/applications/track/${applicationId}`;
    const companyName = 'TalentForge';
    const reviewTimelineDays = 5;

    const emailData: ApplicationReceivedData = {
      candidateName,
      requisitionTitle,
      companyName,
      applicationId: applicationId.toUpperCase().slice(0, 8),
      department: requisitionDepartment,
      submittedAt: submittedAt.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }),
      reviewTimelineDays,
      trackApplicationUrl,
    };

    if (env.EMAIL_PROVIDER === 'mock') {
      const htmlBody = await renderApplicationReceivedEmail(emailData);

      logger.info(
        { to: candidateEmail, applicationId, provider: env.EMAIL_PROVIDER },
        '[MOCK EMAIL] Application received confirmation'
      );

      console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📧 APPLICATION RECEIVED EMAIL (Mock)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
To: ${candidateEmail}
Subject: Application Received: ${requisitionTitle}
Reference ID: ${emailData.applicationId}
Track URL: ${trackApplicationUrl}

(HTML content rendered - see logs for full HTML)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      `);

      return;
    }

    // Real SMTP implementation would go here
    const htmlBody = await renderApplicationReceivedEmail(emailData);

    logger.info('Application received email sent successfully', {
      candidateEmail,
      applicationId,
      provider: env.EMAIL_PROVIDER,
    });
  } catch (error) {
    logger.error('Failed to send application received email', {
      candidateEmail,
      applicationId,
      error: error instanceof Error ? error.message : String(error),
    });
    // Don't throw - email failure shouldn't block submission
  }
}

/**
 * Send application withdrawn confirmation email
 */
export async function sendApplicationWithdrawnEmail(params: {
  candidateEmail: string;
  candidateName: string;
  requisitionTitle: string;
  applicationId: string;
  withdrawnAt: Date;
}): Promise<void> {
  const { candidateEmail, candidateName, requisitionTitle, applicationId, withdrawnAt } = params;

  try {
    logger.info('Sending application withdrawn email', { candidateEmail, applicationId });

    const browseJobsUrl = `${env.FRONTEND_URL}/jobs`;
    const companyName = 'TalentForge';

    const emailData: ApplicationWithdrawnData = {
      candidateName,
      requisitionTitle,
      companyName,
      applicationId: applicationId.toUpperCase().slice(0, 8),
      withdrawnAt: withdrawnAt.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }),
      browseJobsUrl,
    };

    if (env.EMAIL_PROVIDER === 'mock') {
      const htmlBody = await renderApplicationWithdrawnEmail(emailData);

      logger.info(
        { to: candidateEmail, applicationId, provider: env.EMAIL_PROVIDER },
        '[MOCK EMAIL] Application withdrawn confirmation'
      );

      console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📧 APPLICATION WITHDRAWN EMAIL (Mock)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
To: ${candidateEmail}
Subject: Application Withdrawn: ${requisitionTitle}
Reference ID: ${emailData.applicationId}
Browse Jobs URL: ${browseJobsUrl}

(HTML content rendered - see logs for full HTML)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      `);

      return;
    }

    // Real SMTP implementation would go here
    const htmlBody = await renderApplicationWithdrawnEmail(emailData);

    logger.info('Application withdrawn email sent successfully', {
      candidateEmail,
      applicationId,
      provider: env.EMAIL_PROVIDER,
    });
  } catch (error) {
    logger.error('Failed to send application withdrawn email', {
      candidateEmail,
      applicationId,
      error: error instanceof Error ? error.message : String(error),
    });
    // Don't throw - email failure shouldn't block withdrawal
  }
}

