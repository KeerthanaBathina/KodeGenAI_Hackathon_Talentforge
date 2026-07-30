import prisma from './prisma';

export interface PipelineKpiMetrics {
  requisitionId: string | null;
  totalApplications: number;
  shortlistedCount: number;
  shortlistRatePct: number;
  offersExtended: number;
  offersAccepted: number;
  offerAcceptanceRatePct: number;
  timeToHireCount: number;
  avgTimeToHireDays: number;
  refreshedAt: Date;
}

interface PipelineKpiMetricsRow {
  requisition_id: string | null;
  total_applications: number | bigint;
  shortlisted_count: number | bigint;
  shortlist_rate_pct: number | string;
  offers_extended: number | bigint;
  offers_accepted: number | bigint;
  offer_acceptance_rate_pct: number | string;
  time_to_hire_count: number | bigint;
  avg_time_to_hire_days: number | string;
  refreshed_at: Date;
}

function asNumber(value: number | bigint | string): number {
  if (typeof value === 'number') {
    return value;
  }

  if (typeof value === 'bigint') {
    return Number(value);
  }

  return Number.parseFloat(value);
}

function mapRow(row: PipelineKpiMetricsRow): PipelineKpiMetrics {
  return {
    requisitionId: row.requisition_id,
    totalApplications: asNumber(row.total_applications),
    shortlistedCount: asNumber(row.shortlisted_count),
    shortlistRatePct: asNumber(row.shortlist_rate_pct),
    offersExtended: asNumber(row.offers_extended),
    offersAccepted: asNumber(row.offers_accepted),
    offerAcceptanceRatePct: asNumber(row.offer_acceptance_rate_pct),
    timeToHireCount: asNumber(row.time_to_hire_count),
    avgTimeToHireDays: asNumber(row.avg_time_to_hire_days),
    refreshedAt: row.refreshed_at
  };
}

export async function getPipelineKpiMetrics(requisitionId?: string): Promise<PipelineKpiMetrics | null> {
  const rows = requisitionId
    ? await prisma.$queryRaw<PipelineKpiMetricsRow[]>`
        SELECT *
        FROM "pipeline_kpi_metrics_mv"
        WHERE "requisition_id" = ${requisitionId}::uuid
        LIMIT 1
      `
    : await prisma.$queryRaw<PipelineKpiMetricsRow[]>`
        SELECT *
        FROM "pipeline_kpi_metrics_mv"
        WHERE "requisition_id" IS NULL
        LIMIT 1
      `;

  const row = rows[0];
  if (!row) {
    return null;
  }

  return mapRow(row);
}

export async function getPipelineKpiLastRefreshTimestamp(): Promise<Date | null> {
  const rows = await prisma.$queryRaw<Array<{ last_refreshed_at: Date }>>`
    SELECT "last_refreshed_at"
    FROM "analytics_refresh_runs"
    WHERE "analytics_key" = 'pipeline_kpi'
    LIMIT 1
  `;

  return rows[0]?.last_refreshed_at ?? null;
}
