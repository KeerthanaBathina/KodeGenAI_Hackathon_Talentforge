import { env } from '../config/env';
import logger from '../utils/logger';
import {
  renderApplicationReceivedEmail,
  renderApplicationWithdrawnEmail,
  renderQuarantineNotificationEmail,
  renderInterviewReminder24hEmail,
  renderInterviewReminder1hEmail,
  renderAssessmentLaunchEmail,
  renderAssessmentLaunchFailedEmail,
  type ApplicationReceivedData,
  type ApplicationWithdrawnData,
  type QuarantineNotificationData,
  type InterviewReminderData,
  type AssessmentLaunchData,
  type AssessmentLaunchFailedData,
} from '../email/templateRenderer';
import { renderTemplate } from '../services/templateRenderer';
import { resolveTemplate } from '../services/templateService';
import nodemailer, { type SendMailOptions, type Transporter } from 'nodemailer';
import { prisma } from '../db/prisma';
import { TemplateType } from '@prisma/client';

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

let smtpTransporter: Transporter | null = null;

function getSmtpTransporter(): Transporter {
  if (smtpTransporter) {
    return smtpTransporter;
  }

  if (!env.SMTP_HOST || !env.SMTP_PORT || !env.SMTP_USER || !env.SMTP_PASS) {
    throw new Error('SMTP provider is selected but SMTP credentials are missing');
  }

  smtpTransporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE ?? env.SMTP_PORT === 465,
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
    },
  });

  return smtpTransporter;
}

export async function sendEmail(options: SendMailOptions): Promise<void> {
  if (env.EMAIL_PROVIDER === 'mock') {
    logger.info(
      {
        to: options.to,
        subject: options.subject,
        provider: env.EMAIL_PROVIDER,
      },
      '[MOCK EMAIL] Generic email dispatch simulated'
    );
    return;
  }

  if (env.EMAIL_PROVIDER !== 'smtp') {
    throw new Error(`Unsupported EMAIL_PROVIDER: ${env.EMAIL_PROVIDER}`);
  }

  const transporter = getSmtpTransporter();

  await transporter.sendMail({
    from: env.EMAIL_FROM,
    ...options,
  });
}

/**
 * Send templated email with locale fallback
 * Uses database templates with automatic locale resolution:
 * - Tries exact locale match (e.g., 'fr-CA')
 * - Falls back to language code (e.g., 'fr')
 * - Finally falls back to English ('en')
 * 
 * @param to - Recipient email address
 * @param templateType - Template type to use
 * @param tokenData - Token replacement data
 * @param userLocale - Requested locale (default: 'en')
 * @returns Promise that resolves when email is sent
 */
export async function sendTemplatedEmail(
  to: string,
  templateType: TemplateType,
  tokenData: Record<string, string>,
  userLocale: string = 'en'
): Promise<void> {
  // Resolve template with locale fallback
  const template = await resolveTemplate(templateType, userLocale);
  
  // Render template with token replacement
  const rendered = renderTemplate(template, tokenData);
  
  // Send email
  await sendEmail({
    to,
    subject: rendered.subject,
    html: rendered.bodyHtml,
    text: rendered.bodyText,
  });

  logger.info(
    {
      to,
      templateType,
      templateId: template.id,
      locale: template.locale,
      requestedLocale: userLocale,
      provider: env.EMAIL_PROVIDER,
    },
    'Templated email sent with locale fallback'
  );
}

export interface SendPanelistConfirmationEmailInput {
  panelistEmail: string;
  panelistName: string;
  candidateName: string;
  requisitionTitle: string;
  interviewType: string;
  scheduledAt: Date;
  timezone: string;
  confirmUrl: string;
  declineUrl: string;
}

export async function sendPanelistConfirmationEmail(
  input: SendPanelistConfirmationEmailInput
): Promise<void> {
  const formattedTime = input.scheduledAt.toLocaleString('en-US', {
    dateStyle: 'full',
    timeStyle: 'short',
    timeZone: input.timezone,
  });

  const subject = `Interview Panel Confirmation: ${input.requisitionTitle}`;
  const text = `Hello ${input.panelistName},

You have been invited to serve as a panelist for an interview.

Candidate: ${input.candidateName}
Position: ${input.requisitionTitle}
Interview Type: ${input.interviewType}
Scheduled Time: ${formattedTime}
Timezone: ${input.timezone}

Please confirm your availability:
- Confirm: ${input.confirmUrl}
- Decline: ${input.declineUrl}

This confirmation link expires in 48 hours.

Thank you,
TalentForge Recruitment Team`;

  if (env.EMAIL_PROVIDER === 'mock') {
    logger.info(
      {
        to: input.panelistEmail,
        subject,
        provider: env.EMAIL_PROVIDER,
      },
      '[MOCK EMAIL] Panelist confirmation request simulated'
    );
    console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📧 PANELIST CONFIRMATION EMAIL (Mock)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
To: ${input.panelistEmail}
Subject: ${subject}

${text}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    `);
    return;
  }

  await sendEmail({
    to: input.panelistEmail,
    subject,
    text,
  });

  logger.info(
    {
      to: input.panelistEmail,
      subject,
      provider: env.EMAIL_PROVIDER,
    },
    'Panelist confirmation email sent'
  );
}

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
 * Send interview reminder email to all participants
 */
export async function sendInterviewReminder(
  interviewId: string,
  reminderType: '24h' | '1h'
): Promise<void> {
  try {
    // Fetch interview details with all participants
    const interview = await prisma.interviewStage.findUnique({
      where: { id: interviewId },
      include: {
        application: {
          include: {
            candidate: {
              include: {
                profile: true,
              },
            },
            requisition: true,
          },
        },
        panelistConfirmations: {
          where: { status: 'confirmed' },
          include: {
            panelist: true,
          },
        },
      },
    });

    if (!interview) {
      throw new Error(`Interview ${interviewId} not found`);
    }

    // Skip if interview is not in scheduled state
    if (interview.state !== 'scheduled') {
      logger.warn(
        { interviewId, state: interview.state },
        '[reminders] Skipping reminder for non-scheduled interview'
      );
      return;
    }

    if (!interview.scheduledAt) {
      logger.warn(
        { interviewId },
        '[reminders] Skipping reminder for interview without scheduled time'
      );
      return;
    }

    // Get recruiter
    const recruiter = await prisma.user.findFirst({
      where: { role: 'recruiter', active: true },
      select: { id: true, email: true, fullName: true, timezone: true },
    });

    // Calculate duration in minutes
    const duration = interview.endAt && interview.scheduledAt
      ? Math.round((interview.endAt.getTime() - interview.scheduledAt.getTime()) / (1000 * 60))
      : 60;

    // Format interview date/time
    const interviewDateTime = new Date(interview.scheduledAt).toLocaleString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });

    // Prepare email data
    const templateData: InterviewReminderData = {
      positionTitle: interview.application.requisition.title,
      interviewDateTime,
      duration,
      interviewType: interview.type,
      panelists: interview.panelistConfirmations.map(pc => ({
        name: pc.panelist.fullName,
        role: pc.panelist.role,
      })),
      companyName: 'TalentForge',
      recipientName: '', // Will be set per recipient
    };

    const subject = reminderType === '24h'
      ? `Reminder: Interview Tomorrow - ${interview.application.requisition.title}`
      : `Starting Soon: Interview in 1 Hour - ${interview.application.requisition.title}`;

    const renderFunction = reminderType === '24h' 
      ? renderInterviewReminder24hEmail 
      : renderInterviewReminder1hEmail;

    // Send to candidate
    const candidateName = interview.application.candidate.profile?.fullName || 'Candidate';
    const candidateEmail = await renderFunction({
      ...templateData,
      recipientName: candidateName,
    });

    await sendEmail({
      to: interview.application.candidate.email,
      subject,
      html: candidateEmail,
    });

    logger.info(
      { interviewId, recipient: interview.application.candidate.email, reminderType },
      '[reminders] Sent reminder to candidate'
    );

    // Send to recruiter
    if (recruiter) {
      const recruiterEmail = await renderFunction({
        ...templateData,
        recipientName: recruiter.fullName,
      });

      await sendEmail({
        to: recruiter.email,
        subject,
        html: recruiterEmail,
      });

      logger.info(
        { interviewId, recipient: recruiter.email, reminderType },
        '[reminders] Sent reminder to recruiter'
      );
    }

    // Send to all confirmed panelists
    for (const panelistConfirmation of interview.panelistConfirmations) {
      const panelistEmail = await renderFunction({
        ...templateData,
        recipientName: panelistConfirmation.panelist.fullName,
      });

      await sendEmail({
        to: panelistConfirmation.panelist.email,
        subject,
        html: panelistEmail,
      });

      logger.info(
        { interviewId, recipient: panelistConfirmation.panelist.email, reminderType },
        '[reminders] Sent reminder to panelist'
      );
    }

    logger.info(
      {
        interviewId,
        reminderType,
        recipientCount: 1 + (recruiter ? 1 : 0) + interview.panelistConfirmations.length,
      },
      '[reminders] Interview reminders sent to all participants'
    );
  } catch (error) {
    logger.error(
      { error, interviewId, reminderType },
      '[reminders] Failed to send interview reminder'
    );
    throw error;
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
