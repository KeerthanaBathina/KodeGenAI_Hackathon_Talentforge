import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getAiConfusionMatrixMetrics: vi.fn(),
  getAiConfusionMatrixLastRefreshTimestamp: vi.fn()
}));

vi.mock('../../db/aiConfusionMatrixMetrics', () => ({
  getAiConfusionMatrixMetrics: mocks.getAiConfusionMatrixMetrics,
  getAiConfusionMatrixLastRefreshTimestamp: mocks.getAiConfusionMatrixLastRefreshTimestamp
}));

import { getConfusionMatrixAnalytics } from '../../services/confusionMatrixService';

describe('getConfusionMatrixAnalytics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns confusion matrix metrics with precision, recall, F1, and accuracy', async () => {
    const refreshedAt = new Date('2026-07-30T10:00:00Z');
    mocks.getAiConfusionMatrixMetrics.mockResolvedValue([
      {
        requisitionId: null,
        truePositives: 50n,
        falsePositives: 10n,
        trueNegatives: 80n,
        falseNegatives: 5n,
        precision: 0.8333,
        recall: 0.9091,
        f1Score: 0.8696,
        refreshedAt
      }
    ]);
    mocks.getAiConfusionMatrixLastRefreshTimestamp.mockResolvedValue(refreshedAt);

    const result = await getConfusionMatrixAnalytics();

    expect(result.truePositives).toBe(50);
    expect(result.falsePositives).toBe(10);
    expect(result.trueNegatives).toBe(80);
    expect(result.falseNegatives).toBe(5);
    expect(result.precision).toBeCloseTo(0.8333, 3);
    expect(result.recall).toBeCloseTo(0.9091, 3);
    expect(result.f1Score).toBeCloseTo(0.8696, 3);
    expect(result.accuracy).toBeCloseTo(0.8571, 3);
  });

  it('rounds metrics to 4 decimal places', async () => {
    const refreshedAt = new Date('2026-07-30T10:00:00Z');
    mocks.getAiConfusionMatrixMetrics.mockResolvedValue([
      {
        requisitionId: null,
        truePositives: 60n,
        falsePositives: 10n,
        trueNegatives: 80n,
        falseNegatives: 10n,
        precision: 0.857142857,
        recall: 0.857142857,
        f1Score: 0.857142857,
        refreshedAt
      }
    ]);
    mocks.getAiConfusionMatrixLastRefreshTimestamp.mockResolvedValue(refreshedAt);

    const result = await getConfusionMatrixAnalytics();

    expect(result.precision).toBe(0.8571);
    expect(result.recall).toBe(0.8571);
    expect(result.f1Score).toBe(0.8571);
    expect(result.accuracy).toBe(0.7);
  });

  it('filters by requisition when provided', async () => {
    const requisitionId = '11111111-1111-1111-1111-111111111111';
    mocks.getAiConfusionMatrixMetrics.mockResolvedValue([]);
    mocks.getAiConfusionMatrixLastRefreshTimestamp.mockResolvedValue(null);

    await getConfusionMatrixAnalytics(requisitionId);

    expect(mocks.getAiConfusionMatrixMetrics).toHaveBeenCalledWith(requisitionId);
  });

  it('returns zero metrics when no data exists', async () => {
    mocks.getAiConfusionMatrixMetrics.mockResolvedValue([]);
    mocks.getAiConfusionMatrixLastRefreshTimestamp.mockResolvedValue(null);

    const result = await getConfusionMatrixAnalytics();

    expect(result.truePositives).toBe(0);
    expect(result.falsePositives).toBe(0);
    expect(result.trueNegatives).toBe(0);
    expect(result.falseNegatives).toBe(0);
    expect(result.precision).toBe(0);
    expect(result.recall).toBe(0);
    expect(result.f1Score).toBe(0);
    expect(result.accuracy).toBe(0);
  });

  it('calculates accuracy correctly (TP + TN) / total', async () => {
    mocks.getAiConfusionMatrixMetrics.mockResolvedValue([
      {
        requisitionId: null,
        truePositives: 75n,
        falsePositives: 25n,
        trueNegatives: 75n,
        falseNegatives: 25n,
        precision: 0.75,
        recall: 0.75,
        f1Score: 0.75,
        refreshedAt: new Date('2026-07-30T10:00:00Z')
      }
    ]);
    mocks.getAiConfusionMatrixLastRefreshTimestamp.mockResolvedValue(null);

    const result = await getConfusionMatrixAnalytics();

    expect(result.accuracy).toBe(0.75);
  });
});
