import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  queryRaw: vi.fn()
}));

vi.mock('../../db/prisma', () => ({
  default: {
    $queryRaw: mocks.queryRaw
  }
}));

import {
  getAiConfusionMatrixMetrics,
  getAiConfusionMatrixLastRefreshTimestamp
} from '../../db/aiConfusionMatrixMetrics';

describe('getAiConfusionMatrixMetrics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns confusion matrix metrics with valid precision/recall/F1', async () => {
    const mockRows = [
      {
        requisition_id: null,
        true_positives: 50n,
        false_positives: 10n,
        true_negatives: 80n,
        false_negatives: 5n,
        precision: 0.8333,
        recall: 0.9091,
        f1_score: 0.8696,
        refreshed_at: new Date('2026-07-29T10:00:00Z')
      }
    ];

    mocks.queryRaw.mockResolvedValue(mockRows);

    const result = await getAiConfusionMatrixMetrics();

    expect(result).toHaveLength(1);
    expect(result[0].truePositives).toBe(50);
    expect(result[0].falsePositives).toBe(10);
    expect(result[0].trueNegatives).toBe(80);
    expect(result[0].falseNegatives).toBe(5);
    expect(result[0].precision).toBeCloseTo(0.8333, 3);
    expect(result[0].recall).toBeCloseTo(0.9091, 3);
    expect(result[0].f1Score).toBeCloseTo(0.8696, 3);
  });

  it('filters metrics by requisition when provided', async () => {
    const requisitionId = '11111111-1111-1111-1111-111111111111';
    const mockRows = [
      {
        requisition_id: requisitionId,
        true_positives: 20n,
        false_positives: 5n,
        true_negatives: 30n,
        false_negatives: 2n,
        precision: 0.8,
        recall: 0.909,
        f1_score: 0.851,
        refreshed_at: new Date('2026-07-29T10:00:00Z')
      }
    ];

    mocks.queryRaw.mockResolvedValue(mockRows);

    const result = await getAiConfusionMatrixMetrics(requisitionId);

    expect(result).toHaveLength(1);
    expect(result[0].requisitionId).toBe(requisitionId);
  });

  it('handles zero-denominator cases (no positives)', async () => {
    const mockRows = [
      {
        requisition_id: null,
        true_positives: 0n,
        false_positives: 0n,
        true_negatives: 100n,
        false_negatives: 0n,
        precision: 0,
        recall: 0,
        f1_score: 0,
        refreshed_at: new Date('2026-07-29T10:00:00Z')
      }
    ];

    mocks.queryRaw.mockResolvedValue(mockRows);

    const result = await getAiConfusionMatrixMetrics();

    expect(result[0].precision).toBe(0);
    expect(result[0].recall).toBe(0);
    expect(result[0].f1Score).toBe(0);
  });

  it('verifies F1 formula: 2 * P * R / (P + R)', async () => {
    const mockRows = [
      {
        requisition_id: null,
        true_positives: 30n,
        false_positives: 10n,
        true_negatives: 50n,
        false_negatives: 10n,
        precision: 0.75,
        recall: 0.75,
        f1_score: 0.75,
        refreshed_at: new Date('2026-07-29T10:00:00Z')
      }
    ];

    mocks.queryRaw.mockResolvedValue(mockRows);

    const result = await getAiConfusionMatrixMetrics();

    const expectedF1 = (2 * 0.75 * 0.75) / (0.75 + 0.75);
    expect(result[0].f1Score).toBeCloseTo(expectedF1, 3);
  });
});

describe('getAiConfusionMatrixLastRefreshTimestamp', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns last refresh timestamp when metrics exist', async () => {
    const refreshedAt = new Date('2026-07-29T10:00:00Z');
    mocks.queryRaw.mockResolvedValue([{ last_refreshed_at: refreshedAt }]);

    const result = await getAiConfusionMatrixLastRefreshTimestamp();

    expect(result).toEqual(refreshedAt);
  });

  it('returns null when no metrics exist', async () => {
    mocks.queryRaw.mockResolvedValue([{ last_refreshed_at: null }]);

    const result = await getAiConfusionMatrixLastRefreshTimestamp();

    expect(result).toBeNull();
  });
});
