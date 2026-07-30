import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  queryRaw: vi.fn()
}));

vi.mock('../../db/prisma', () => ({
  default: {
    $queryRaw: mocks.queryRaw
  }
}));

import { getFunnelStageMetrics, getFunnelStageLastRefreshTimestamp } from '../../db/funnelStageMetrics';

describe('getFunnelStageMetrics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns funnel stage metrics for all requisitions', async () => {
    const mockRows = [
      {
        requisition_id: null,
        stage_name: 'applications',
        stage_count: 100n,
        conversion_rate_pct: 100,
        drop_count: 0n,
        drop_rate_pct: 0,
        is_largest_drop_transition: false,
        refreshed_at: new Date('2026-07-29T10:00:00Z')
      },
      {
        requisition_id: null,
        stage_name: 'shortlisted',
        stage_count: 50n,
        conversion_rate_pct: 50,
        drop_count: 50n,
        drop_rate_pct: 50,
        is_largest_drop_transition: false,
        refreshed_at: new Date('2026-07-29T10:00:00Z')
      }
    ];

    mocks.queryRaw.mockResolvedValue(mockRows);

    const result = await getFunnelStageMetrics();

    expect(result).toHaveLength(2);
    expect(result[0].stageName).toBe('applications');
    expect(result[0].stageCount).toBe(100);
    expect(result[1].stageName).toBe('shortlisted');
    expect(result[1].conversionRatePct).toBe(50);
    expect(result[1].dropCount).toBe(50);
  });

  it('filters metrics by requisition when provided', async () => {
    const requisitionId = '11111111-1111-1111-1111-111111111111';
    const mockRows = [
      {
        requisition_id: requisitionId,
        stage_name: 'applications',
        stage_count: 20n,
        conversion_rate_pct: 100,
        drop_count: 0n,
        drop_rate_pct: 0,
        is_largest_drop_transition: false,
        refreshed_at: new Date('2026-07-29T10:00:00Z')
      }
    ];

    mocks.queryRaw.mockResolvedValue(mockRows);

    const result = await getFunnelStageMetrics(requisitionId);

    expect(result).toHaveLength(1);
    expect(result[0].requisitionId).toBe(requisitionId);
  });

  it('identifies largest drop transition correctly', async () => {
    const mockRows = [
      {
        requisition_id: null,
        stage_name: 'applications',
        stage_count: 100n,
        conversion_rate_pct: 100,
        drop_count: 0n,
        drop_rate_pct: 0,
        is_largest_drop_transition: false,
        refreshed_at: new Date('2026-07-29T10:00:00Z')
      },
      {
        requisition_id: null,
        stage_name: 'shortlisted',
        stage_count: 30n,
        conversion_rate_pct: 30,
        drop_count: 70n,
        drop_rate_pct: 70,
        is_largest_drop_transition: true,
        refreshed_at: new Date('2026-07-29T10:00:00Z')
      }
    ];

    mocks.queryRaw.mockResolvedValue(mockRows);

    const result = await getFunnelStageMetrics();

    const shortlistedStage = result.find((r) => r.stageName === 'shortlisted');
    expect(shortlistedStage?.isLargestDropTransition).toBe(true);
  });
});

describe('getFunnelStageLastRefreshTimestamp', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns last refresh timestamp when metrics exist', async () => {
    const refreshedAt = new Date('2026-07-29T10:00:00Z');
    mocks.queryRaw.mockResolvedValue([{ last_refreshed_at: refreshedAt }]);

    const result = await getFunnelStageLastRefreshTimestamp();

    expect(result).toEqual(refreshedAt);
  });

  it('returns null when no metrics exist', async () => {
    mocks.queryRaw.mockResolvedValue([{ last_refreshed_at: null }]);

    const result = await getFunnelStageLastRefreshTimestamp();

    expect(result).toBeNull();
  });
});
