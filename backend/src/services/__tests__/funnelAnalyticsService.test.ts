import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getFunnelStageMetrics: vi.fn(),
  getFunnelStageLastRefreshTimestamp: vi.fn()
}));

vi.mock('../../db/funnelStageMetrics', () => ({
  getFunnelStageMetrics: mocks.getFunnelStageMetrics,
  getFunnelStageLastRefreshTimestamp: mocks.getFunnelStageLastRefreshTimestamp
}));

import { getFunnelAnalytics } from '../../services/funnelAnalyticsService';

describe('getFunnelAnalytics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns formatted funnel stages with conversion rates and drop metadata', async () => {
    const refreshedAt = new Date('2026-07-30T10:00:00Z');
    mocks.getFunnelStageMetrics.mockResolvedValue([
      {
        requisitionId: null,
        stageName: 'applications',
        stageCount: 100n,
        conversionRatePct: 100,
        dropCount: 0n,
        dropRatePct: 0,
        isLargestDropTransition: false,
        refreshedAt
      },
      {
        requisitionId: null,
        stageName: 'shortlisted',
        stageCount: 50n,
        conversionRatePct: 50,
        dropCount: 50n,
        dropRatePct: 50,
        isLargestDropTransition: true,
        refreshedAt
      }
    ]);
    mocks.getFunnelStageLastRefreshTimestamp.mockResolvedValue(refreshedAt);

    const result = await getFunnelAnalytics();

    expect(result.stages).toHaveLength(2);
    expect(result.stages[0].stageName).toBe('applications');
    expect(result.stages[0].stageCount).toBe(100);
    expect(result.stages[1].stageName).toBe('shortlisted');
    expect(result.stages[1].conversionRatePct).toBe(50);
    expect(result.stages[1].dropCount).toBe(50);
    expect(result.largestDropTransition).toBe('shortlisted');
    expect(result.lastRefreshedAt).toBe(refreshedAt.toISOString());
  });

  it('rounds conversion and drop rates to 2 decimal places', async () => {
    const refreshedAt = new Date('2026-07-30T10:00:00Z');
    mocks.getFunnelStageMetrics.mockResolvedValue([
      {
        requisitionId: null,
        stageName: 'applications',
        stageCount: 100n,
        conversionRatePct: 100,
        dropCount: 0n,
        dropRatePct: 0,
        isLargestDropTransition: false,
        refreshedAt
      },
      {
        requisitionId: null,
        stageName: 'shortlisted',
        stageCount: 33n,
        conversionRatePct: 33.3333,
        dropCount: 67n,
        dropRatePct: 66.6667,
        isLargestDropTransition: true,
        refreshedAt
      }
    ]);
    mocks.getFunnelStageLastRefreshTimestamp.mockResolvedValue(refreshedAt);

    const result = await getFunnelAnalytics();

    expect(result.stages[1].conversionRatePct).toBe(33.33);
    expect(result.stages[1].dropRatePct).toBe(66.67);
  });

  it('filters by requisition when provided', async () => {
    const requisitionId = '11111111-1111-1111-1111-111111111111';
    mocks.getFunnelStageMetrics.mockResolvedValue([]);
    mocks.getFunnelStageLastRefreshTimestamp.mockResolvedValue(null);

    await getFunnelAnalytics(requisitionId);

    expect(mocks.getFunnelStageMetrics).toHaveBeenCalledWith(requisitionId);
  });

  it('returns null largestDropTransition when no stage has the flag', async () => {
    mocks.getFunnelStageMetrics.mockResolvedValue([
      {
        requisitionId: null,
        stageName: 'applications',
        stageCount: 100n,
        conversionRatePct: 100,
        dropCount: 0n,
        dropRatePct: 0,
        isLargestDropTransition: false,
        refreshedAt: new Date('2026-07-30T10:00:00Z')
      }
    ]);
    mocks.getFunnelStageLastRefreshTimestamp.mockResolvedValue(null);

    const result = await getFunnelAnalytics();

    expect(result.largestDropTransition).toBeNull();
  });

  it('returns null lastRefreshedAt when no refresh timestamp exists', async () => {
    mocks.getFunnelStageMetrics.mockResolvedValue([]);
    mocks.getFunnelStageLastRefreshTimestamp.mockResolvedValue(null);

    const result = await getFunnelAnalytics();

    expect(result.lastRefreshedAt).toBeNull();
  });
});
