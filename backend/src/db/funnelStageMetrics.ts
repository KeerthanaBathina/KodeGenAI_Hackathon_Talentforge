import prisma from './prisma';

export interface FunnelStageMetric {
  requisitionId: string | null;
  stageName: string;
  stageCount: number | bigint;
  conversionRatePct: number;
  dropCount: number | bigint;
  dropRatePct: number;
  isLargestDropTransition: boolean;
  refreshedAt: Date;
}

export interface FunnelStageRow {
  requisition_id: string | null;
  stage_name: string;
  stage_count: number | bigint;
  conversion_rate_pct: number;
  drop_count: number | bigint;
  drop_rate_pct: number;
  is_largest_drop_transition: boolean;
  refreshed_at: Date;
}

/**
 * Fetch funnel stage metrics from materialized view
 * @param requisitionId Optional filter for specific requisition
 * @returns Array of FunnelStageMetric objects
 */
export async function getFunnelStageMetrics(
  requisitionId?: string
): Promise<FunnelStageMetric[]> {
  const rows = await prisma.$queryRaw<FunnelStageRow[]>`
    SELECT
      "requisition_id",
      "stage_name",
      "stage_count",
      "conversion_rate_pct",
      "drop_count",
      "drop_rate_pct",
      "is_largest_drop_transition",
      "refreshed_at"
    FROM "funnel_stage_metrics_mv"
    ${requisitionId ? prisma.$literal` WHERE "requisition_id" = ${requisitionId}` : prisma.$literal``}
    ORDER BY 
      "requisition_id",
      CASE "stage_name"
        WHEN 'applications' THEN 1
        WHEN 'shortlisted' THEN 2
        WHEN 'interviews_complete' THEN 3
        WHEN 'offer_extended' THEN 4
        WHEN 'offer_accepted' THEN 5
      END
  `;

  return rows.map((row) => ({
    requisitionId: row.requisition_id,
    stageName: row.stage_name,
    stageCount: Number(row.stage_count),
    conversionRatePct: Number(row.conversion_rate_pct),
    dropCount: Number(row.drop_count),
    dropRatePct: Number(row.drop_rate_pct),
    isLargestDropTransition: row.is_largest_drop_transition,
    refreshedAt: row.refreshed_at
  }));
}

/**
 * Get funnel last refresh timestamp
 */
export async function getFunnelStageLastRefreshTimestamp(): Promise<Date | null> {
  const result = await prisma.$queryRaw<Array<{ last_refreshed_at: Date }>>`
    SELECT MAX("refreshed_at") AS "last_refreshed_at"
    FROM "funnel_stage_metrics_mv"
    WHERE "requisition_id" IS NULL
  `;

  return result[0]?.last_refreshed_at ?? null;
}
