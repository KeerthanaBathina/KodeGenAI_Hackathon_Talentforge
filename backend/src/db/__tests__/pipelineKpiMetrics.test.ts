import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../prisma', () => ({
  default: {
    $queryRaw: vi.fn()
  }
}));

import prisma from '../prisma';
import { getPipelineKpiLastRefreshTimestamp, getPipelineKpiMetrics } from '../pipelineKpiMetrics';

const mockQueryRaw = vi.mocked((prisma as unknown as { $queryRaw: ReturnType<typeof vi.fn> }).$queryRaw);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getPipelineKpiMetrics', () => {
  it('returns null when no KPI row exists', async () => {
    mockQueryRaw.mockResolvedValueOnce([]);

    const result = await getPipelineKpiMetrics();

    expect(result).toBeNull();
  });

  it('maps global KPI row to typed result', async () => {
    const refreshedAt = new Date('2026-07-29T10:00:00.000Z');
    mockQueryRaw.mockResolvedValueOnce([
      {
        requisition_id: null,
        total_applications: BigInt(100),
        shortlisted_count: BigInt(40),
        shortlist_rate_pct: '40.00',
        offers_extended: BigInt(10),
        offers_accepted: BigInt(5),
        offer_acceptance_rate_pct: '50.00',
        time_to_hire_count: BigInt(5),
        avg_time_to_hire_days: '12.50',
        refreshed_at: refreshedAt
      }
    ]);

    const result = await getPipelineKpiMetrics();

    expect(result).toEqual({
      requisitionId: null,
      totalApplications: 100,
      shortlistedCount: 40,
      shortlistRatePct: 40,
      offersExtended: 10,
      offersAccepted: 5,
      offerAcceptanceRatePct: 50,
      timeToHireCount: 5,
      avgTimeToHireDays: 12.5,
      refreshedAt
    });
  });

  it('queries requisition-scoped row when requisitionId is provided', async () => {
    mockQueryRaw.mockResolvedValueOnce([
      {
        requisition_id: '11111111-1111-1111-1111-111111111111',
        total_applications: BigInt(7),
        shortlisted_count: BigInt(2),
        shortlist_rate_pct: '28.57',
        offers_extended: BigInt(1),
        offers_accepted: BigInt(1),
        offer_acceptance_rate_pct: '100.00',
        time_to_hire_count: BigInt(1),
        avg_time_to_hire_days: '6.00',
        refreshed_at: new Date('2026-07-29T10:00:00.000Z')
      }
    ]);

    await getPipelineKpiMetrics('11111111-1111-1111-1111-111111111111');

    expect(mockQueryRaw).toHaveBeenCalledTimes(1);
  });
});

describe('getPipelineKpiLastRefreshTimestamp', () => {
  it('returns null when refresh metadata row is absent', async () => {
    mockQueryRaw.mockResolvedValueOnce([]);

    const result = await getPipelineKpiLastRefreshTimestamp();

    expect(result).toBeNull();
  });

  it('returns last refresh timestamp when metadata exists', async () => {
    const lastRefreshedAt = new Date('2026-07-29T12:34:56.000Z');
    mockQueryRaw.mockResolvedValueOnce([{ last_refreshed_at: lastRefreshedAt }]);

    const result = await getPipelineKpiLastRefreshTimestamp();

    expect(result).toEqual(lastRefreshedAt);
  });
});
