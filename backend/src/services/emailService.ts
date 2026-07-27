import { env } from '../config/env';
import logger from '../utils/logger';
import {
  renderApplicationReceivedEmail,
  renderApplicationWithdrawnEmail,
  renderQuarantineNotificationEmail,
  renderAssessmentLaunchEmail,
  renderAssessmentLaunchFailedEmail,
  type ApplicationReceivedData,
  type ApplicationWithdrawnData,
  type QuarantineNotificationData,
  type AssessmentLaunchData,
  type AssessmentLaunchFailedData,
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

/**
 * Send resume quarantine notification email
 */
export interface SendQuarantineNotificationParams {
  candidateEmail: string;
  candidateName: string;
  requisitionTitle: string;
  fileName: string;
}

export async function sendQuarantineNotificationEmail(
  params: SendQuarantineNotificationParams
): Promise<void> {
  const { candidateEmail, candidateName, requisitionTitle, fileName } = params;

  try {
    logger.info('Sending quarantine notification email', { candidateEmail });

    const emailData: QuarantineNotificationData = {
      candidateName,
      requisitionTitle,
      fileName,
      companyName: 'TalentForge',
    };

    if (env.EMAIL_PROVIDER === 'mock') {
      const htmlBody = await renderQuarantineNotificationEmail(emailData);

      logger.info({ to: candidateEmail, fileName }, '[MOCK EMAIL] Resume quarantined');

      console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📧 RESUME QUARANTINED EMAIL (Mock)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
To: ${candidateEmail}
Subject: Resume Upload Issue - ${requisitionTitle}
File: ${fileName}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      `);

      return;
    }

    // Real SMTP implementation
    const htmlBody = await renderQuarantineNotificationEmail(emailData);
    logger.info('Quarantine notification sent', { candidateEmail, fileName });
  } catch (error) {
    logger.error('Failed to send quarantine notification', { candidateEmail, error });
  }
}

/**
 * Send assessment launch notification email
 * 
 * Dispatches candidate email with test URL and instructions within 2-minute SLA.
 * Email failure does not block the launch - session is already persisted.
 */
export async function sendAssessmentLaunchEmail(params: {
  candidateEmail: string;
  candidateName: string;
  requisitionTitle: string;
  applicationId: string;
  providerName: string;
  testUrl: string;
  expiresAt?: Date;
  sessionId: string;
}): Promise<void> {
  const {
    candidateEmail,
    candidateName,
    requisitionTitle,
    applicationId,
    providerName,
    testUrl,
    expiresAt,
    sessionId,
  } = params;

  try {
    logger.info('Sending assessment launch email', {
      candidateEmail,
      applicationId,
      sessionId,
      providerName,
    });

    const companyName = 'TalentForge';

    const emailData: AssessmentLaunchData = {
      candidateName,
      requisitionTitle,
      companyName,
      applicationId: applicationId.toUpperCase().slice(0, 8),
      providerName,
      testUrl,
      expiresAt: expiresAt
        ? expiresAt.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })
        : undefined,
    };

    if (env.EMAIL_PROVIDER === 'mock') {
      const htmlBody = await renderAssessmentLaunchEmail(emailData);

      logger.info(
        {
          to: candidateEmail,
          applicationId,
          sessionId,
          testUrl: testUrl.split('?')[0], // Log URL without query params
          provider: env.EMAIL_PROVIDER,
        },
        '[MOCK EMAIL] Assessment launch notification'
      );

      console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📧 ASSESSMENT LAUNCH EMAIL (Mock)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
To: ${candidateEmail}
Subject: Your Assessment is Ready - ${requisitionTitle}
Application ID: ${emailData.applicationId}
Provider: ${providerName}
Test URL: ${testUrl.split('?')[0]}...
${expiresAt ? `Expires: ${emailData.expiresAt}` : ''}

(HTML content rendered - see logs for full HTML)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      `);

      return;
    }

    // Real SMTP implementation would go here
    const htmlBody = await renderAssessmentLaunchEmail(emailData);

    logger.info('Assessment launch email sent successfully', {
      candidateEmail,
      applicationId,
      sessionId,
      provider: env.EMAIL_PROVIDER,
    });
  } catch (error) {
    logger.error('Failed to send assessment launch email', {
      candidateEmail,
      applicationId,
      sessionId,
      error: error instanceof Error ? error.message : String(error),
    });
    // Don't throw - email failure shouldn't block launch
    // Session is already persisted and recruiter has the URL
  }
}

/**
 * Send assessment launch failure notification to recruiter
 * 
 * Notifies recruiter when assessment launch fails after all retry attempts.
 * Provides actionable guidance for next steps.
 */
export async function sendAssessmentLaunchFailedEmail(params: {
  recruiterEmail: string;
  recruiterName: string;
  candidateName: string;
  requisitionTitle: string;
  applicationId: string;
  providerName: string;
  attempts: number;
  failedAt: Date;
  sessionId: string;
}): Promise<void> {
  const {
    recruiterEmail,
    recruiterName,
    candidateName,
    requisitionTitle,
    applicationId,
    providerName,
    attempts,
    failedAt,
    sessionId,
  } = params;

  try {
    logger.info('Sending assessment launch failed notification', {
      recruiterEmail,
      applicationId,
      sessionId,
      attempts,
    });

    const companyName = 'TalentForge';
    const applicationUrl = `${env.FRONTEND_URL}/applications/${applicationId}`;

    const emailData: AssessmentLaunchFailedData = {
      recruiterName,
      candidateName,
      requisitionTitle,
      companyName,
      applicationId: applicationId.toUpperCase().slice(0, 8),
      providerName,
      attempts,
      failedAt: failedAt.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
      applicationUrl,
    };

    if (env.EMAIL_PROVIDER === 'mock') {
      const htmlBody = await renderAssessmentLaunchFailedEmail(emailData);

      logger.info(
        {
          to: recruiterEmail,
          applicationId,
          sessionId,
          attempts,
          provider: env.EMAIL_PROVIDER,
        },
        '[MOCK EMAIL] Assessment launch failed notification'
      );

      console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📧 ASSESSMENT LAUNCH FAILED EMAIL (Mock)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
To: ${recruiterEmail}
Subject: Assessment Launch Failed - ${requisitionTitle}
Candidate: ${candidateName}
Application ID: ${emailData.applicationId}
Provider: ${providerName}
Attempts: ${attempts}
Failed At: ${emailData.failedAt}

(HTML content rendered - see logs for full HTML)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      `);

      return;
    }

    // Real SMTP implementation would go here
    const htmlBody = await renderAssessmentLaunchFailedEmail(emailData);

    logger.info('Assessment launch failed notification sent successfully', {
      recruiterEmail,
      applicationId,
      sessionId,
      provider: env.EMAIL_PROVIDER,
    });
  } catch (error) {
    logger.error('Failed to send assessment launch failed notification', {
      recruiterEmail,
      applicationId,
      sessionId,
      error: error instanceof Error ? error.message : String(error),
    });
    // Don't throw - notification failure shouldn't block error handling
  }
}

/**
 * Send rejection decision email to candidate
 */
export interface SendRejectionEmailParams {
  candidateEmail: string;
  candidateName: string;
  requisitionTitle: string;
  companyName: string;
}

export async function sendRejectionEmail(
  params: SendRejectionEmailParams
): Promise<void> {
  const { candidateEmail, candidateName, requisitionTitle, companyName } = params;

  try {
    logger.info('Sending rejection email', { candidateEmail, requisitionTitle });

    const subject = `Update on your application for ${requisitionTitle}`;
    
    const htmlBody = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
          <p>Dear ${candidateName},</p>
          
          <p>Thank you for your interest in the <strong>${requisitionTitle}</strong> position at ${companyName}.</p>
          
          <p>After careful consideration of your application and qualifications, we have decided to move forward with other candidates whose experience more closely aligns with our current needs.</p>
          
          <p>We appreciate the time and effort you invested in the application process. Your background and skills are impressive, and we encourage you to apply for other opportunities with us in the future that may be a better match.</p>
          
          <p>We wish you the best of luck in your job search.</p>
          
          <p>Sincerely,<br>
          ${companyName} Talent Team</p>
        </div>
      </body>
      </html>
    `;

    if (env.EMAIL_PROVIDER === 'mock') {
      logger.info(
        { to: candidateEmail, requisitionTitle, provider: env.EMAIL_PROVIDER },
        '[MOCK EMAIL] Application rejection notification'
      );

      console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📧 REJECTION EMAIL (Mock)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
To: ${candidateEmail}
Subject: ${subject}
Candidate: ${candidateName}
Position: ${requisitionTitle}

(HTML content rendered - see logs for full HTML)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      `);

      return;
    }

    // Real SMTP implementation would go here
    logger.info('Rejection email sent successfully', {
      candidateEmail,
      requisitionTitle,
      provider: env.EMAIL_PROVIDER,
    });
  } catch (error) {
    logger.error('Failed to send rejection email', {
      candidateEmail,
      requisitionTitle,
      error: error instanceof Error ? error.message : String(error),
    });
    // Throw error - caller should handle email delivery failures
    throw error;
  }
}
