import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getPipelineKpiMetrics: vi.fn(),
  getPipelineKpiLastRefreshTimestamp: vi.fn()
}));

vi.mock('../../db/pipelineKpiMetrics', () => ({
  getPipelineKpiMetrics: mocks.getPipelineKpiMetrics,
  getPipelineKpiLastRefreshTimestamp: mocks.getPipelineKpiLastRefreshTimestamp
}));

import { getPipelineAnalytics } from '../pipelineAnalyticsService';

describe('getPipelineAnalytics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns rounded metrics and refresh metadata when row exists', async () => {
    const refreshedAt = new Date('2026-07-29T09:30:00.000Z');
    mocks.getPipelineKpiMetrics.mockResolvedValue({
      requisitionId: null,
      totalApplications: 10,
      shortlistedCount: 4,
      shortlistRatePct: 40.001,
      offersExtended: 3,
      offersAccepted: 2,
      offerAcceptanceRatePct: 66.666,
      timeToHireCount: 2,
      avgTimeToHireDays: 12.345,
      refreshedAt
    });
    mocks.getPipelineKpiLastRefreshTimestamp.mockResolvedValue(refreshedAt);

    const result = await getPipelineAnalytics();

    expect(result.totalApplications).toBe(10);
    expect(result.shortlistRatePct).toBe(40);
    expect(result.offerAcceptanceRatePct).toBe(66.67);
    expect(result.avgTimeToHireDays).toBe(12.35);
    expect(result.lastRefreshedAt).toBe(refreshedAt.toISOString());
    expect(new Date(result.generatedAt).toString()).not.toBe('Invalid Date');
  });

  it('returns zeroed payload when no KPI row exists', async () => {
    mocks.getPipelineKpiMetrics.mockResolvedValue(null);
    mocks.getPipelineKpiLastRefreshTimestamp.mockResolvedValue(null);

    const result = await getPipelineAnalytics('11111111-1111-1111-1111-111111111111');

    expect(result.totalApplications).toBe(0);
    expect(result.shortlistRatePct).toBe(0);
    expect(result.avgTimeToHireDays).toBe(0);
    expect(result.offerAcceptanceRatePct).toBe(0);
    expect(result.lastRefreshedAt).toBeNull();
    expect(new Date(result.generatedAt).toString()).not.toBe('Invalid Date');
  });

  it('passes requisitionId through to the KPI data source', async () => {
    const requisitionId = '11111111-1111-1111-1111-111111111111';
    mocks.getPipelineKpiMetrics.mockResolvedValue(null);
    mocks.getPipelineKpiLastRefreshTimestamp.mockResolvedValue(null);

    await getPipelineAnalytics(requisitionId);

    expect(mocks.getPipelineKpiMetrics).toHaveBeenCalledWith(requisitionId);
  });

  it('falls back to KPI row refreshedAt when refresh metadata is absent', async () => {
    const metricsRefreshedAt = new Date('2026-07-29T09:30:00.000Z');
    mocks.getPipelineKpiMetrics.mockResolvedValue({
      requisitionId: null,
      totalApplications: 3,
      shortlistedCount: 1,
      shortlistRatePct: 33.333,
      offersExtended: 1,
      offersAccepted: 1,
      offerAcceptanceRatePct: 100,
      timeToHireCount: 1,
      avgTimeToHireDays: 5.25,
      refreshedAt: metricsRefreshedAt
    });
    mocks.getPipelineKpiLastRefreshTimestamp.mockResolvedValue(null);

    const result = await getPipelineAnalytics();

    expect(result.lastRefreshedAt).toBe(metricsRefreshedAt.toISOString());
  });
});
