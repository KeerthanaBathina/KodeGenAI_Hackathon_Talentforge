import { env } from '../config/env';
import logger from '../utils/logger';
import { sendEmail } from './emailService';

export interface InterviewInviteRecipient {
    email: string;
    name: string;
    timezone: string;
    role: 'candidate' | 'panelist' | 'recruiter';
}

export interface InterviewInvitePayload {
    interviewId: string;
    applicationId: string;
    interviewType: string;
    startAt: Date;
    endAt: Date;
    timezone: string;
    candidateName: string;
    requisitionTitle: string;
    location?: string | null;
    joinUrl?: string | null;
    recipients: InterviewInviteRecipient[];
}

function formatDateForTimezone(date: Date, timezone: string): string {
    return new Intl.DateTimeFormat('en-US', {
        dateStyle: 'full',
        timeStyle: 'short',
        timeZone: timezone,
    }).format(date);
}

export function buildInterviewInviteIcs(payload: InterviewInvitePayload): string {
    const dtStamp = payload.startAt.toISOString().replace(/[-:]/g, '').replace('.000Z', 'Z');
    const dtEnd = payload.endAt.toISOString().replace(/[-:]/g, '').replace('.000Z', 'Z');

    return [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//TalentForge//Interview Scheduler//EN',
        'CALSCALE:GREGORIAN',
        'BEGIN:VEVENT',
        `UID:${payload.interviewId}@talentforge.local`,
        `DTSTAMP:${dtStamp}`,
        `DTSTART:${dtStamp}`,
        `DTEND:${dtEnd}`,
        `SUMMARY:${payload.interviewType} Interview - ${payload.requisitionTitle}`,
        `DESCRIPTION:Interview for ${payload.candidateName} (${payload.interviewType})`,
        `LOCATION:${payload.location ?? payload.joinUrl ?? 'Virtual interview'}`,
        'END:VEVENT',
        'END:VCALENDAR',
    ].join('\r\n');
}

export function buildInviteEmailBody(
    payload: InterviewInvitePayload,
    recipient: InterviewInviteRecipient
): string {
    return [
        `Hello ${recipient.name},`,
        '',
        `You have been invited to a ${payload.interviewType} interview for ${payload.candidateName}.`,
        `Local time: ${formatDateForTimezone(payload.startAt, recipient.timezone)} to ${formatDateForTimezone(payload.endAt, recipient.timezone)}.`,
        `Timezone: ${recipient.timezone}.`,
        payload.joinUrl ? `Join link: ${payload.joinUrl}` : 'Location: Virtual interview',
        '',
        'An .ics calendar invite is attached to this message.',
    ].join('\n');
}

export async function dispatchInterviewInviteEmail(
    payload: InterviewInvitePayload,
    recipient: InterviewInviteRecipient
): Promise<void> {
    try {
        const ics = buildInterviewInviteIcs(payload);
        const body = buildInviteEmailBody(payload, recipient);

        if (env.EMAIL_PROVIDER === 'mock') {
            logger.info(
                {
                    to: recipient.email,
                    interviewId: payload.interviewId,
                    role: recipient.role,
                },
                '[MOCK EMAIL] Interview invite queued for delivery'
            );
            console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📧 INTERVIEW INVITE EMAIL (Mock)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
To: ${recipient.email}
Subject: Interview Scheduled - ${payload.requisitionTitle}
Timezone: ${recipient.timezone}
Preview: ${body}
ICS Length: ${ics.length}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            `);
            return;
        }

        await sendEmail({
            to: recipient.email,
            subject: `Interview Scheduled - ${payload.requisitionTitle}`,
            text: body,
            attachments: [
                {
                    filename: `interview-${payload.interviewId}.ics`,
                    content: ics,
                    contentType: 'text/calendar; charset=utf-8; method=REQUEST',
                },
            ],
        });

        logger.info(
            {
                to: recipient.email,
                interviewId: payload.interviewId,
                role: recipient.role,
                provider: env.EMAIL_PROVIDER,
            },
            'Interview invite sent via configured email provider'
        );
    } catch (error) {
        logger.error('Failed to dispatch interview invite email', {
            interviewId: payload.interviewId,
            recipient: recipient.email,
            error: error instanceof Error ? error.message : String(error),
        });
        throw error;
    }
}
