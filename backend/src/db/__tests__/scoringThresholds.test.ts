import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../prisma', () => ({
  default: {
    scoringThreshold: {
      findFirst: vi.fn()
    }
  }
}));

import prisma from '../prisma';
import { getActiveThreshold } from '../scoringThresholds';

const mockFindFirst = vi.mocked(
  (prisma as unknown as { scoringThreshold: { findFirst: ReturnType<typeof vi.fn> } }).scoringThreshold.findFirst
);

const makeRow = (threshold: number, effectiveDaysAgo: number) => ({
  aiShortlistThreshold: { toNumber: () => threshold },
  confidenceThreshold: { toNumber: () => 0.8 },
  experienceThresholdYears: 3,
  effectiveFrom: new Date(Date.now() - effectiveDaysAgo * 86_400_000)
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getActiveThreshold', () => {
  it('returns null when no threshold is configured', async () => {
    mockFindFirst.mockResolvedValue(null);
    const result = await getActiveThreshold('jf-uuid-1');
    expect(result).toBeNull();
  });

  it('returns the most recent threshold with effectiveFrom <= asOf', async () => {
    mockFindFirst.mockResolvedValue(makeRow(0.75, 1));
    const result = await getActiveThreshold('jf-uuid-1');
    expect(result?.aiShortlistThreshold).toBe(0.75);
  });

  it('queries with lte: asOf to enforce effective-date isolation', async () => {
    const asOf = new Date('2026-08-01T00:00:00Z');
    mockFindFirst.mockResolvedValue(makeRow(0.7, 5));

    await getActiveThreshold('jf-uuid-1', asOf);

    expect(mockFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          effectiveFrom: { lte: asOf }
        }),
        orderBy: { effectiveFrom: 'desc' }
      })
    );
  });

  it('orders by effectiveFrom desc so newest active threshold is returned', async () => {
    mockFindFirst.mockResolvedValue(makeRow(0.75, 0));
    await getActiveThreshold('jf-uuid-1');

    expect(mockFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { effectiveFrom: 'desc' }
      })
    );
  });
});
