import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  schedule: vi.fn(),
  shouldSendWeeklyDigest: vi.fn(),
  resolveDigestRecipients: vi.fn(),
  composeWeeklyAnalyticsDigestPayload: vi.fn(),
  auditEvent: vi.fn(),
  sendTemplatedEmail: vi.fn(),
  loggerInfo: vi.fn(),
  loggerWarn: vi.fn(),
  loggerError: vi.fn(),
  loggerDebug: vi.fn()
}));

vi.mock('node-cron', () => ({
  default: {
    schedule: mocks.schedule
  }
}));

vi.mock('../../services/weeklyAnalyticsDigestService', async () => {
  const actual = await vi.importActual<typeof import('../../services/weeklyAnalyticsDigestService')>(
    '../../services/weeklyAnalyticsDigestService'
  );

  return {
    ...actual,
    shouldSendWeeklyDigest: mocks.shouldSendWeeklyDigest,
    resolveDigestRecipients: mocks.resolveDigestRecipients,
    composeWeeklyAnalyticsDigestPayload: mocks.composeWeeklyAnalyticsDigestPayload
  };
});

vi.mock('../../services/auditService', () => ({
  auditEvent: mocks.auditEvent
}));

vi.mock('../../services/emailService', () => ({
  sendTemplatedEmail: mocks.sendTemplatedEmail
}));

vi.mock('../../utils/logger', () => ({
  default: {
    info: mocks.loggerInfo,
    warn: mocks.loggerWarn,
    error: mocks.loggerError,
    debug: mocks.loggerDebug
  }
}));

import {
  startWeeklyAnalyticsDigestWorker,
  __resetWeeklyAnalyticsDigestWorkerStateForTests
} from '../../workers/weeklyAnalyticsDigestWorker';

type ScheduledCallback = () => Promise<void>;

function getScheduledCallback(): ScheduledCallback {
  const callback = mocks.schedule.mock.calls[0]?.[1];
  if (!callback) {
    throw new Error('Scheduled callback not registered');
  }

  return callback as ScheduledCallback;
}

describe('weeklyAnalyticsDigestWorker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-03T08:00:00.000Z'));

    __resetWeeklyAnalyticsDigestWorkerStateForTests();

    mocks.schedule.mockReturnValue({ stop: vi.fn() });
    mocks.shouldSendWeeklyDigest.mockResolvedValue(true);
    mocks.resolveDigestRecipients.mockResolvedValue(['manager@example.com']);
    mocks.composeWeeklyAnalyticsDigestPayload.mockResolvedValue({
      totalApplications: 120,
      shortlistRatePct: 41.67,
      avgTimeToHireDays: 14.25,
      offerAcceptanceRatePct: 66.67,
      noShowRatePct: 20,
      generatedAt: '2026-08-03T08:00:00.000Z'
    });
    mocks.auditEvent.mockResolvedValue(undefined);
    mocks.sendTemplatedEmail.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('registers Monday 08:00 cron schedule', () => {
    startWeeklyAnalyticsDigestWorker();

    expect(mocks.schedule).toHaveBeenCalledTimes(1);
    expect(mocks.schedule).toHaveBeenCalledWith('0 8 * * 1', expect.any(Function));
  });

  it('sends weekly digest for active week and logs audit metadata', async () => {
    startWeeklyAnalyticsDigestWorker();
    const callback = getScheduledCallback();

    await callback();

    expect(mocks.shouldSendWeeklyDigest).toHaveBeenCalledTimes(1);
    expect(mocks.resolveDigestRecipients).toHaveBeenCalledTimes(1);
    expect(mocks.composeWeeklyAnalyticsDigestPayload).toHaveBeenCalledTimes(1);
    expect(mocks.sendTemplatedEmail).toHaveBeenCalledWith(
      'manager@example.com',
      'weekly_analytics_digest',
      expect.objectContaining({
        totalApplications: '120',
        shortlistRatePct: '41.67',
        avgTimeToHireDays: '14.25',
        offerAcceptanceRatePct: '66.67',
        noShowRatePct: '20'
      }),
      'en'
    );

    expect(mocks.auditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'weekly_digest_sent',
        payload: expect.objectContaining({
          recipientCount: 1,
          attemptedRecipientCount: 1,
          failedRecipientCount: 0
        })
      })
    );
  });

  it('skips digest and logs reason when prior week has no activity', async () => {
    mocks.shouldSendWeeklyDigest.mockResolvedValue(false);

    startWeeklyAnalyticsDigestWorker();
    const callback = getScheduledCallback();

    await callback();

    expect(mocks.resolveDigestRecipients).not.toHaveBeenCalled();
    expect(mocks.sendTemplatedEmail).not.toHaveBeenCalled();
    expect(mocks.auditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'weekly_digest_skipped',
        payload: expect.objectContaining({
          reason: 'No activity - digest skipped'
        })
      })
    );
  });

  it('skips duplicate trigger within the same weekly window to avoid duplicate delivery', async () => {
    startWeeklyAnalyticsDigestWorker();
    const callback = getScheduledCallback();

    await callback();
    await callback();

    expect(mocks.sendTemplatedEmail).toHaveBeenCalledTimes(1);
    expect(mocks.auditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'weekly_digest_skipped',
        payload: expect.objectContaining({
          reason: 'duplicate_trigger_same_window'
        })
      })
    );
  });

  it('prevents concurrent in-flight executions from sending duplicates', async () => {
    let releaseSend: (() => void) | null = null;
    const firstSend = new Promise<void>((resolve) => {
      releaseSend = resolve;
    });

    mocks.sendTemplatedEmail.mockImplementationOnce(async () => firstSend);

    startWeeklyAnalyticsDigestWorker();
    const callback = getScheduledCallback();

    const runOne = callback();
    const runTwo = callback();

    await vi.waitFor(() => {
      expect(mocks.sendTemplatedEmail).toHaveBeenCalledTimes(1);
    });

    if (releaseSend) {
      releaseSend();
    }

    await runOne;
    await runTwo;

    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      '[WeeklyDigestWorker] digest job skipped because previous run is still in progress'
    );
  });

  it('logs failed event when no recipients are resolved', async () => {
    mocks.resolveDigestRecipients.mockResolvedValue([]);

    startWeeklyAnalyticsDigestWorker();
    const callback = getScheduledCallback();

    await callback();

    expect(mocks.sendTemplatedEmail).not.toHaveBeenCalled();
    expect(mocks.auditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'weekly_digest_failed',
        payload: expect.objectContaining({
          reason: 'No recipients found'
        })
      })
    );
  });
});
