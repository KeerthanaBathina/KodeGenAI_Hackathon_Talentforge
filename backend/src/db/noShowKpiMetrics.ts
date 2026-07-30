import prisma from './prisma';

export interface NoShowKpiMetric {
  requisitionId: string | null;
  scheduledCount7d: number;
  noShowCount7d: number;
  noShowRatePct7d: number;
  refreshedAt: Date;
  scope: 'global' | 'by_requisition';
}

/**
 * Get no-show KPI metrics from materialized view
 * Optionally filter by requisition ID
 * @param requisitionId - Optional UUID to filter by specific requisition
 * @returns Array of no-show metrics
 */
export async function getNoShowKpiMetrics(requisitionId?: string): Promise<NoShowKpiMetric[]> {
  const query = requisitionId
    ? `
      SELECT
        "requisition_id" AS "requisitionId",
        "scheduled_count_7d" AS "scheduledCount7d",
        "no_show_count_7d" AS "noShowCount7d",
        "no_show_rate_pct_7d" AS "noShowRatePct7d",
        "refreshed_at" AS "refreshedAt",
        "scope"
      FROM "no_show_kpi_metrics_mv"
      WHERE "requisition_id" = $1 OR "scope" = 'global'
      ORDER BY "scope" DESC, "requisition_id"
    `
    : `
      SELECT
        "requisition_id" AS "requisitionId",
        "scheduled_count_7d" AS "scheduledCount7d",
        "no_show_count_7d" AS "noShowCount7d",
        "no_show_rate_pct_7d" AS "noShowRatePct7d",
        "refreshed_at" AS "refreshedAt",
        "scope"
      FROM "no_show_kpi_metrics_mv"
      ORDER BY "scope" DESC
    `;

  const params = requisitionId ? [requisitionId] : [];
  const rows = await prisma.$queryRawUnsafe<NoShowKpiMetric[]>(query, ...params);

  return rows.map((row) => ({
    ...row,
    scheduledCount7d: Number(row.scheduledCount7d),
    noShowCount7d: Number(row.noShowCount7d),
    noShowRatePct7d: Number(row.noShowRatePct7d)
  }));
}

/**
 * Get global no-show KPI (across all requisitions)
 * @returns Global no-show metrics or null if no data
 */
export async function getGlobalNoShowKpi(): Promise<NoShowKpiMetric | null> {
  const metrics = await getNoShowKpiMetrics();
  return metrics.find((m) => m.scope === 'global') || null;
}

/**
 * Get last refresh timestamp for no-show KPI metrics
 * @returns Date of last refresh or null if never refreshed
 */
export async function getNoShowKpiLastRefreshTimestamp(): Promise<Date | null> {
  const result = await prisma.$queryRaw<
    Array<{ last_refreshed_at: Date | null }>
  >`
    SELECT "last_refreshed_at"
    FROM "analytics_refresh_runs"
    WHERE "analytics_key" = 'no_show_kpi'
    LIMIT 1
  `;

  return result.length > 0 && result[0]?.last_refreshed_at ? result[0].last_refreshed_at : null;
}
