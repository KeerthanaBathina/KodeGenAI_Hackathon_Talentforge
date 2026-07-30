import { z } from 'zod';
import {
  getAiConfusionMatrixMetrics,
  getAiConfusionMatrixLastRefreshTimestamp,
  type AiConfusionMatrixMetric
} from '../db/aiConfusionMatrixMetrics';

export const confusionMatrixQuerySchema = z.object({
  requisitionId: z.string().uuid().optional()
});

export interface ConfusionMatrixAnalyticsResponse {
  truePositives: number;
  falsePositives: number;
  trueNegatives: number;
  falseNegatives: number;
  precision: number;
  recall: number;
  f1Score: number;
  accuracy: number;
  lastRefreshedAt: string | null;
  generatedAt: string;
}

function roundToFour(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function toResponse(
  metrics: AiConfusionMatrixMetric[] | undefined,
  generatedAt: Date,
  lastRefreshedAt: Date | null
): ConfusionMatrixAnalyticsResponse {
  if (!metrics || metrics.length === 0) {
    return {
      truePositives: 0,
      falsePositives: 0,
      trueNegatives: 0,
      falseNegatives: 0,
      precision: 0,
      recall: 0,
      f1Score: 0,
      accuracy: 0,
      lastRefreshedAt: lastRefreshedAt?.toISOString() ?? null,
      generatedAt: generatedAt.toISOString()
    };
  }

  const metric = metrics[0];
  const tp = Number(metric.truePositives);
  const fp = Number(metric.falsePositives);
  const tn = Number(metric.trueNegatives);
  const fn = Number(metric.falseNegatives);

  const total = tp + fp + tn + fn;
  const accuracy = total === 0 ? 0 : roundToFour((tp + tn) / total);

  return {
    truePositives: tp,
    falsePositives: fp,
    trueNegatives: tn,
    falseNegatives: fn,
    precision: roundToFour(metric.precision),
    recall: roundToFour(metric.recall),
    f1Score: roundToFour(metric.f1Score),
    accuracy,
    lastRefreshedAt: lastRefreshedAt?.toISOString() ?? null,
    generatedAt: generatedAt.toISOString()
  };
}

export async function getConfusionMatrixAnalytics(
  requisitionId?: string
): Promise<ConfusionMatrixAnalyticsResponse> {
  const generatedAt = new Date();
  const [metrics, lastRefreshedAt] = await Promise.all([
    getAiConfusionMatrixMetrics(requisitionId),
    getAiConfusionMatrixLastRefreshTimestamp()
  ]);

  return toResponse(metrics.length > 0 ? metrics : undefined, generatedAt, lastRefreshedAt);
}
