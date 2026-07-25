import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../utils/logger', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import {
  emitQueueNewApplicationEvent,
  emitReviewQueueBadgeCountSnapshot,
  type ManualReviewQueueItem,
  REVIEW_QUEUE_HR_ROOM,
  ReviewQueueRealtimeTicker,
} from '../reviewQueueRealtimeService';

function buildItem(
  id: string,
  severity: 'normal' | 'amber' | 'red'
): ManualReviewQueueItem {
  return {
    id,
    candidateId: `candidate-${id}`,
    candidateName: `Candidate ${id}`,
    candidateEmail: `${id}@example.com`,
    requisitionId: `req-${id}`,
    requisitionTitle: `Role ${id}`,
    requisitionDepartment: 'Engineering',
    status: 'pending_review',
    manualReviewReason: null,
    submittedAt: new Date('2026-07-25T00:00:00.000Z'),
    screeningScore: 88,
    screeningConfidence: 0.7,
    slaDeadlineAt: '2026-07-27T00:00:00.000Z',
    slaRemainingSeconds: severity === 'red' ? 100 : 3600,
    slaElapsedPercent: severity === 'red' ? 90 : severity === 'amber' ? 60 : 20,
    slaSeverity: severity,
    isUrgent: severity === 'red',
    canShortlist: true,
    canReject: true,
    decisionLocked: false,
  };
}

describe('ReviewQueueRealtimeTicker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('emits one SLA tick per 60-second cycle', async () => {
    const emit = vi.fn();
    const to = vi.fn(() => ({ emit }));
    const fetchQueueRows = vi.fn(async () => []);

    const ticker = new ReviewQueueRealtimeTicker({
      io: { to } as any,
      fetchQueueRows,
      intervalMs: 60_000,
      emitOnStart: false,
    });

    ticker.start();

    await vi.advanceTimersByTimeAsync(59_000);
    expect(fetchQueueRows).toHaveBeenCalledTimes(0);

    await vi.advanceTimersByTimeAsync(1_000);
    expect(fetchQueueRows).toHaveBeenCalledTimes(1);
    const slaTickCalls = emit.mock.calls.filter((call) => call[0] === 'review-queue:sla-tick');
    expect(slaTickCalls).toHaveLength(1);

    ticker.stop();
  });

  it('emits urgent event only on non-red to red transition', async () => {
    const emit = vi.fn();
    const to = vi.fn(() => ({ emit }));
    const snapshots: ManualReviewQueueItem[][] = [
      [buildItem('a1', 'amber')],
      [buildItem('a1', 'red')],
      [buildItem('a1', 'red')],
    ];

    const fetchQueueRows = vi.fn(async () => snapshots.shift() ?? []);
    const ticker = new ReviewQueueRealtimeTicker({
      io: { to } as any,
      fetchQueueRows,
      emitOnStart: false,
    });

    await ticker.tick();
    await ticker.tick();
    await ticker.tick();

    const urgentCalls = emit.mock.calls.filter((call) => call[0] === 'review-queue:urgent');
    expect(urgentCalls).toHaveLength(1);
    expect(urgentCalls[0]?.[1]).toMatchObject({
      id: 'a1',
      candidateName: 'Candidate a1',
      requisitionTitle: 'Role a1',
    });
  });

  it('emits badge count with accurate pending and urgent totals', async () => {
    const emit = vi.fn();
    const to = vi.fn(() => ({ emit }));
    const fetchQueueRows = vi.fn(async () => [
      buildItem('a1', 'red'),
      buildItem('a2', 'amber'),
      buildItem('a3', 'red'),
    ]);

    const ticker = new ReviewQueueRealtimeTicker({
      io: { to } as any,
      fetchQueueRows,
      emitOnStart: false,
    });

    await ticker.tick();

    const badgeCall = emit.mock.calls.find((call) => call[0] === 'review-queue:badge-count');
    expect(badgeCall).toBeDefined();
    expect(badgeCall?.[1]).toMatchObject({ pendingCount: 3, urgentCount: 2 });
    expect(to).toHaveBeenCalledWith(REVIEW_QUEUE_HR_ROOM);
  });

  it('emits queue:new_application with payload and refreshed badge count', async () => {
    const emit = vi.fn();
    const to = vi.fn(() => ({ emit }));
    const fetchQueueRows = vi.fn(async () => [buildItem('a1', 'amber'), buildItem('a2', 'red')]);

    const emitted = await emitQueueNewApplicationEvent(
      {
        applicationId: 'app-1',
        candidateName: 'Alex Jordan',
        requisitionTitle: 'Backend Engineer',
        queuedAt: '2026-07-25T10:00:00.000Z',
        correlationId: 'corr-1',
      },
      {
        io: { to } as any,
        fetchQueueRows,
      }
    );

    expect(emitted).toBe(true);

    const newAppCall = emit.mock.calls.find((call) => call[0] === 'queue:new_application');
    expect(newAppCall).toBeDefined();
    expect(newAppCall?.[1]).toMatchObject({
      applicationId: 'app-1',
      candidateName: 'Alex Jordan',
      requisitionTitle: 'Backend Engineer',
      queuedAt: '2026-07-25T10:00:00.000Z',
      queueCount: 2,
    });

    const badgeCall = emit.mock.calls.find((call) => call[0] === 'review-queue:badge-count');
    expect(badgeCall).toBeDefined();
    expect(badgeCall?.[1]).toMatchObject({ pendingCount: 2, urgentCount: 1 });
  });

  it('returns false for queue/new-app and badge snapshot when emitter is unavailable', async () => {
    const fetchQueueRows = vi.fn(async () => [buildItem('a1', 'normal')]);

    const newAppEmitted = await emitQueueNewApplicationEvent(
      {
        applicationId: 'app-1',
        candidateName: 'Alex Jordan',
        requisitionTitle: 'Backend Engineer',
      },
      { fetchQueueRows }
    );

    const badgeEmitted = await emitReviewQueueBadgeCountSnapshot({ fetchQueueRows });

    expect(newAppEmitted).toBe(false);
    expect(badgeEmitted).toBe(false);
  });
});