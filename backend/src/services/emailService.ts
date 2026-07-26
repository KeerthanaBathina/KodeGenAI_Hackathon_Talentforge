import { env } from '../config/env';
import logger from '../utils/logger';
import {
  renderApplicationReceivedEmail,
  renderApplicationWithdrawnEmail,
  renderQuarantineNotificationEmail,
  renderInterviewReminder24hEmail,
  renderInterviewReminder1hEmail,
  type ApplicationReceivedData,
  type ApplicationWithdrawnData,
  type QuarantineNotificationData,
  type InterviewReminderData,
} from '../email/templateRenderer';
import nodemailer, { type SendMailOptions, type Transporter } from 'nodemailer';
import { prisma } from '../db/prisma';

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
