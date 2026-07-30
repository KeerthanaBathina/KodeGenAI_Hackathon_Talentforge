import { z } from 'zod';
import {
  getNoShowKpiMetrics,
  getNoShowKpiLastRefreshTimestamp,
  type NoShowKpiMetric
} from '../db/noShowKpiMetrics';
import {
  getNoShowTrend30d,
  type NoShowTrendPoint
} from '../db/noShowTrend30d';

export const noShowAnalyticsQuerySchema = z.object({
  requisitionId: z.string().uuid().optional()
});

export interface NoShowTrendData {
  date: string;
  scheduledCount: number;
  noShowCount: number;
  noShowRatePct: number;
}

export interface NoShowAnalyticsResponse {
  noShowRatePct: number;
  noShowCount: number;
  scheduledCount: number;
  trend30d: NoShowTrendData[];
  lastRefreshedAt: string | null;
  generatedAt: string;
}

function roundToTwo(value: number): number {
  return Math.round(value * 100) / 100;
}

function toResponse(
  kpiMetrics: NoShowKpiMetric[],
  trendPoints: NoShowTrendPoint[],
  generatedAt: Date,
  lastRefreshedAt: Date | null
): NoShowAnalyticsResponse {
  // Get the relevant KPI metric (global if no filter, or specific if filtered)
  const kpiMetric = kpiMetrics.length > 0 ? kpiMetrics[0] : null;

  // Convert trend points to response format
  const trend30d = trendPoints.map((point) => ({
    date: point.date.toISOString().split('T')[0], // ISO date string (YYYY-MM-DD)
    scheduledCount: Number(point.scheduledCount),
    noShowCount: Number(point.noShowCount),
    noShowRatePct: roundToTwo(Number(point.noShowRatePct))
  }));

  return {
    noShowRatePct: kpiMetric ? roundToTwo(Number(kpiMetric.noShowRatePct7d)) : 0,
    noShowCount: kpiMetric ? Number(kpiMetric.noShowCount7d) : 0,
    scheduledCount: kpiMetric ? Number(kpiMetric.scheduledCount7d) : 0,
    trend30d,
    lastRefreshedAt: (lastRefreshedAt ?? kpiMetric?.refreshedAt)?.toISOString() ?? null,
    generatedAt: generatedAt.toISOString()
  };
}

export async function getNoShowAnalytics(requisitionId?: string): Promise<NoShowAnalyticsResponse> {
  const generatedAt = new Date();

  const [kpiMetrics, trendPoints, lastRefreshedAt] = await Promise.all([
    getNoShowKpiMetrics(requisitionId),
    getNoShowTrend30d(),
    getNoShowKpiLastRefreshTimestamp()
  ]);

  return toResponse(kpiMetrics, trendPoints, generatedAt, lastRefreshedAt);
}
