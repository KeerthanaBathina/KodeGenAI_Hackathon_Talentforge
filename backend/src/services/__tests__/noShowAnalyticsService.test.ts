import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getNoShowKpiMetrics: vi.fn(),
  getNoShowKpiLastRefreshTimestamp: vi.fn(),
  getNoShowTrend30d: vi.fn()
}));

vi.mock('../../db/noShowKpiMetrics', async () => {
  const actual = await vi.importActual<typeof import('../../db/noShowKpiMetrics')>(
    '../../db/noShowKpiMetrics'
  );

  return {
    ...actual,
    getNoShowKpiMetrics: mocks.getNoShowKpiMetrics,
    getNoShowKpiLastRefreshTimestamp: mocks.getNoShowKpiLastRefreshTimestamp
  };
});

vi.mock('../../db/noShowTrend30d', async () => {
  const actual = await vi.importActual<typeof import('../../db/noShowTrend30d')>(
    '../../db/noShowTrend30d'
  );

  return {
    ...actual,
    getNoShowTrend30d: mocks.getNoShowTrend30d
  };
});

import { getNoShowAnalytics } from '../../services/noShowAnalyticsService';

describe('noShowAnalyticsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('maps KPI and trend payload with rounded percentage values', async () => {
    const refreshedAt = new Date('2026-07-30T08:00:00.000Z');

    mocks.getNoShowKpiMetrics.mockResolvedValue([
      {
        requisitionId: null,
        scheduledCount7d: 12,
        noShowCount7d: 3,
        noShowRatePct7d: 25.555,
        refreshedAt,
        scope: 'global'
      }
    ]);
    mocks.getNoShowTrend30d.mockResolvedValue([
      {
        date: new Date('2026-07-30T00:00:00.000Z'),
        scheduledCount: 8,
        noShowCount: 2,
        noShowRatePct: 25.555,
        refreshedAt
      }
    ]);
    mocks.getNoShowKpiLastRefreshTimestamp.mockResolvedValue(refreshedAt);

    const result = await getNoShowAnalytics();

    expect(result.noShowRatePct).toBe(25.56);
    expect(result.noShowCount).toBe(3);
    expect(result.scheduledCount).toBe(12);
    expect(result.trend30d).toEqual([
      {
        date: '2026-07-30',
        scheduledCount: 8,
        noShowCount: 2,
        noShowRatePct: 25.56
      }
    ]);
    expect(result.lastRefreshedAt).toBe(refreshedAt.toISOString());
    expect(result.generatedAt).toBeTypeOf('string');
  });

  it('returns zero-safe defaults when KPI metrics are empty', async () => {
    mocks.getNoShowKpiMetrics.mockResolvedValue([]);
    mocks.getNoShowTrend30d.mockResolvedValue([]);
    mocks.getNoShowKpiLastRefreshTimestamp.mockResolvedValue(null);

    const result = await getNoShowAnalytics();

    expect(result.noShowRatePct).toBe(0);
    expect(result.noShowCount).toBe(0);
    expect(result.scheduledCount).toBe(0);
    expect(result.trend30d).toEqual([]);
    expect(result.lastRefreshedAt).toBeNull();
  });

  it('passes requisition filter through to KPI query', async () => {
    const requisitionId = '11111111-1111-1111-1111-111111111111';

    mocks.getNoShowKpiMetrics.mockResolvedValue([]);
    mocks.getNoShowTrend30d.mockResolvedValue([]);
    mocks.getNoShowKpiLastRefreshTimestamp.mockResolvedValue(null);

    await getNoShowAnalytics(requisitionId);

    expect(mocks.getNoShowKpiMetrics).toHaveBeenCalledWith(requisitionId);
  });

  it('preserves trend ordering from backend materialized view and supports 30 points', async () => {
    const trend = Array.from({ length: 30 }, (_, index) => ({
      date: new Date(`2026-07-${String(30 - index).padStart(2, '0')}T00:00:00.000Z`),
      scheduledCount: 10 + index,
      noShowCount: index % 4,
      noShowRatePct: Number((((index % 4) / (10 + index)) * 100).toFixed(2)),
      refreshedAt: new Date('2026-07-30T08:00:00.000Z')
    }));

    mocks.getNoShowKpiMetrics.mockResolvedValue([]);
    mocks.getNoShowTrend30d.mockResolvedValue(trend);
    mocks.getNoShowKpiLastRefreshTimestamp.mockResolvedValue(null);

    const result = await getNoShowAnalytics();

    expect(result.trend30d).toHaveLength(30);
    expect(result.trend30d[0].date).toBe('2026-07-30');
    expect(result.trend30d[29].date).toBe('2026-07-01');
  });
});
