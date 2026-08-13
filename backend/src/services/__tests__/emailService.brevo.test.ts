import { beforeEach, describe, expect, it, vi } from 'vitest';

const brevoMocks = vi.hoisted(() => {
  const sendTransacEmailMock = vi.fn().mockResolvedValue({ messageId: 'brevo-msg-1' });
  const brevoClientMock = vi.fn().mockImplementation(() => ({
    transactionalEmails: {
      sendTransacEmail: sendTransacEmailMock,
    },
  }));

  return {
    sendTransacEmailMock,
    brevoClientMock,
  };
});

vi.mock('@getbrevo/brevo', () => ({
  BrevoClient: brevoMocks.brevoClientMock,
}));

vi.mock('../../config/env', () => ({
  env: {
    EMAIL_PROVIDER: 'brevo',
    BREVO_API_KEY: 'xkeysib-test-key',
    BREVO_SENDER_NAME: 'Recruitment Portal',
    EMAIL_FROM: 'sender@example.com',
  },
}));

vi.mock('../../db/prisma', () => ({
  prisma: {},
}));

vi.mock('../../utils/logger', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { sendEmail } from '../emailService';

describe('emailService brevo transport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    brevoMocks.sendTransacEmailMock.mockResolvedValue({ messageId: 'brevo-msg-1' });
  });

  it('sends via BrevoClient transactional emails API', async () => {
    await sendEmail({
      to: 'candidate@example.com',
      subject: 'Interview Scheduled - Backend Engineer',
      text: 'Interview details',
      attachments: [
        {
          filename: 'invite.ics',
          content: 'BEGIN:VCALENDAR',
          contentType: 'text/calendar',
        },
      ],
    });

    expect(brevoMocks.brevoClientMock).toHaveBeenCalledWith({
      apiKey: 'xkeysib-test-key',
    });
    expect(brevoMocks.sendTransacEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        sender: {
          name: 'Recruitment Portal',
          email: 'sender@example.com',
        },
        to: [{ email: 'candidate@example.com' }],
        subject: 'Interview Scheduled - Backend Engineer',
        textContent: 'Interview details',
        attachment: [
          expect.objectContaining({
            name: 'invite.ics',
          }),
        ],
      })
    );
  });
});