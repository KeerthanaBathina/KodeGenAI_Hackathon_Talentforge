import { z } from 'zod';
import {
  getPipelineKpiLastRefreshTimestamp,
  getPipelineKpiMetrics,
  type PipelineKpiMetrics
} from '../db/pipelineKpiMetrics';

export const pipelineAnalyticsQuerySchema = z.object({
  requisitionId: z.string().uuid().optional()
});

export interface PipelineAnalyticsResponse {
  totalApplications: number;
  shortlistRatePct: number;
  avgTimeToHireDays: number;
  offerAcceptanceRatePct: number;
  lastRefreshedAt: string | null;
  generatedAt: string;
}

function roundToTwo(value: number): number {
  return Math.round(value * 100) / 100;
}

function toResponse(metrics: PipelineKpiMetrics | null, generatedAt: Date, lastRefreshedAt: Date | null): PipelineAnalyticsResponse {
  if (!metrics) {
    return {
      totalApplications: 0,
      shortlistRatePct: 0,
      avgTimeToHireDays: 0,
      offerAcceptanceRatePct: 0,
      lastRefreshedAt: lastRefreshedAt?.toISOString() ?? null,
      generatedAt: generatedAt.toISOString()
    };
  }

  return {
    totalApplications: metrics.totalApplications,
    shortlistRatePct: roundToTwo(metrics.shortlistRatePct),
    avgTimeToHireDays: roundToTwo(metrics.avgTimeToHireDays),
    offerAcceptanceRatePct: roundToTwo(metrics.offerAcceptanceRatePct),
    lastRefreshedAt: (lastRefreshedAt ?? metrics.refreshedAt).toISOString(),
    generatedAt: generatedAt.toISOString()
  };
}

export async function getPipelineAnalytics(requisitionId?: string): Promise<PipelineAnalyticsResponse> {
  const generatedAt = new Date();
  const [metrics, lastRefreshedAt] = await Promise.all([
    getPipelineKpiMetrics(requisitionId),
    getPipelineKpiLastRefreshTimestamp()
  ]);

  return toResponse(metrics, generatedAt, lastRefreshedAt);
}
