import { beforeEach, describe, expect, it, vi } from 'vitest';

const sendEmailMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock('../emailService', () => ({
    sendEmail: sendEmailMock,
}));

vi.mock('../../config/env', () => ({
    env: {
        EMAIL_PROVIDER: 'smtp',
    },
}));
import {
    buildInterviewInviteIcs,
    buildInviteEmailBody,
    dispatchInterviewInviteEmail,
} from '../interviewInviteService';

describe('interviewInviteService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    const payload = {
        interviewId: 'stage-1',
        applicationId: 'app-1',
        interviewType: 'technical',
        startAt: new Date('2026-07-25T04:30:00.000Z'),
        endAt: new Date('2026-07-25T05:00:00.000Z'),
        timezone: 'Asia/Kolkata',
        candidateName: 'Rahul Kumar',
        requisitionTitle: 'Senior Frontend Engineer',
        recipients: [
            {
                email: 'rahul@example.com',
                name: 'Rahul Kumar',
                timezone: 'Asia/Kolkata',
                role: 'candidate' as const,
            },
        ],
    };

    it('builds an RFC 5545 style ICS payload', () => {
        const ics = buildInterviewInviteIcs(payload);

        expect(ics).toContain('BEGIN:VCALENDAR');
        expect(ics).toContain('BEGIN:VEVENT');
        expect(ics).toContain('SUMMARY:technical Interview - Senior Frontend Engineer');
        expect(ics).toContain('END:VCALENDAR');
    });

    it('renders participant-local invite body content', () => {
        const body = buildInviteEmailBody(payload, payload.recipients[0]!);

        expect(body).toContain('Hello Rahul Kumar');
        expect(body).toContain('Timezone: Asia/Kolkata');
        expect(body).toContain('An .ics calendar invite is attached');
    });

    it('dispatches invite email with ICS attachment through provider-backed sender', async () => {
        const recipient = payload.recipients[0]!;

        await dispatchInterviewInviteEmail(payload, recipient);

        expect(sendEmailMock).toHaveBeenCalledWith(
            expect.objectContaining({
                to: recipient.email,
                subject: 'Interview Scheduled - Senior Frontend Engineer',
                attachments: [
                    expect.objectContaining({
                        filename: 'interview-stage-1.ics',
                    }),
                ],
            })
        );
    });
});
