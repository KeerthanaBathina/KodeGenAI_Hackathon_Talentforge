import { z } from 'zod';
import {
  getFunnelStageMetrics,
  getFunnelStageLastRefreshTimestamp,
  type FunnelStageMetric
} from '../db/funnelStageMetrics';

export const funnelAnalyticsQuerySchema = z.object({
  requisitionId: z.string().uuid().optional()
});

export interface FunnelStage {
  stageName: string;
  stageCount: number;
  conversionRatePct: number;
  dropCount: number;
  dropRatePct: number;
  isLargestDropTransition: boolean;
}

export interface FunnelAnalyticsResponse {
  stages: FunnelStage[];
  largestDropTransition: string | null;
  lastRefreshedAt: string | null;
  generatedAt: string;
}

function roundToTwo(value: number): number {
  return Math.round(value * 100) / 100;
}

function toResponse(
  metrics: FunnelStageMetric[],
  generatedAt: Date,
  lastRefreshedAt: Date | null
): FunnelAnalyticsResponse {
  const stages = metrics.map((m) => ({
    stageName: m.stageName,
    stageCount: Number(m.stageCount),
    conversionRatePct: roundToTwo(m.conversionRatePct),
    dropCount: Number(m.dropCount),
    dropRatePct: roundToTwo(m.dropRatePct),
    isLargestDropTransition: m.isLargestDropTransition
  }));

  const largestDropTransition = stages.find((s) => s.isLargestDropTransition)?.stageName ?? null;

  return {
    stages,
    largestDropTransition,
    lastRefreshedAt: lastRefreshedAt?.toISOString() ?? null,
    generatedAt: generatedAt.toISOString()
  };
}

export async function getFunnelAnalytics(requisitionId?: string): Promise<FunnelAnalyticsResponse> {
  const generatedAt = new Date();
  const [metrics, lastRefreshedAt] = await Promise.all([
    getFunnelStageMetrics(requisitionId),
    getFunnelStageLastRefreshTimestamp()
  ]);

  return toResponse(metrics, generatedAt, lastRefreshedAt);
}
