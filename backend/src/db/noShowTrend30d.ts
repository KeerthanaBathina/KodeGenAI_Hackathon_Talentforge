import prisma from './prisma';

export interface NoShowTrendPoint {
  date: Date;
  scheduledCount: number;
  noShowCount: number;
  noShowRatePct: number;
  refreshedAt: Date;
}

/**
 * Get 30-day no-show trend series
 * Returns daily breakdown for last 30 calendar days in reverse chronological order
 * @returns Array of daily trend points
 */
export async function getNoShowTrend30d(): Promise<NoShowTrendPoint[]> {
  const rows = await prisma.$queryRaw<NoShowTrendPoint[]>`
    SELECT
      "date",
      "scheduled_count" AS "scheduledCount",
      "no_show_count" AS "noShowCount",
      "no_show_rate_pct" AS "noShowRatePct",
      "refreshed_at" AS "refreshedAt"
    FROM "no_show_trend_30d_mv"
    ORDER BY "date" DESC
  `;

  return rows.map((row) => ({
    ...row,
    date: new Date(row.date),
    scheduledCount: Number(row.scheduledCount),
    noShowCount: Number(row.noShowCount),
    noShowRatePct: Number(row.noShowRatePct)
  }));
}

/**
 * Get no-show trend for specific date range
 * @param startDate - Start date (inclusive)
 * @param endDate - End date (inclusive)
 * @returns Array of trend points within the date range
 */
export async function getNoShowTrendRange(startDate: Date, endDate: Date): Promise<NoShowTrendPoint[]> {
  const rows = await prisma.$queryRaw<NoShowTrendPoint[]>`
    SELECT
      "date",
      "scheduled_count" AS "scheduledCount",
      "no_show_count" AS "noShowCount",
      "no_show_rate_pct" AS "noShowRatePct",
      "refreshed_at" AS "refreshedAt"
    FROM "no_show_trend_30d_mv"
    WHERE "date" >= ${startDate} AND "date" <= ${endDate}
    ORDER BY "date" DESC
  `;

  return rows.map((row) => ({
    ...row,
    date: new Date(row.date),
    scheduledCount: Number(row.scheduledCount),
    noShowCount: Number(row.noShowCount),
    noShowRatePct: Number(row.noShowRatePct)
  }));
}

/**
 * Get most recent trend point (today or most recent day with data)
 * @returns Most recent trend point or null if no data
 */
export async function getLatestNoShowTrend(): Promise<NoShowTrendPoint | null> {
  const rows = await prisma.$queryRaw<NoShowTrendPoint[]>`
    SELECT
      "date",
      "scheduled_count" AS "scheduledCount",
      "no_show_count" AS "noShowCount",
      "no_show_rate_pct" AS "noShowRatePct",
      "refreshed_at" AS "refreshedAt"
    FROM "no_show_trend_30d_mv"
    ORDER BY "date" DESC
    LIMIT 1
  `;

  if (rows.length === 0) {
    return null;
  }

  const row = rows[0];
  return {
    ...row,
    date: new Date(row.date),
    scheduledCount: Number(row.scheduledCount),
    noShowCount: Number(row.noShowCount),
    noShowRatePct: Number(row.noShowRatePct)
  };
}

/**
 * Get last refresh timestamp for 30-day no-show trend
 * @returns Date of last refresh or null if never refreshed
 */
export async function getNoShowTrend30dLastRefreshTimestamp(): Promise<Date | null> {
  const result = await prisma.$queryRaw<
    Array<{ last_refreshed_at: Date | null }>
  >`
    SELECT "last_refreshed_at"
    FROM "analytics_refresh_runs"
    WHERE "analytics_key" = 'no_show_trend_30d'
    LIMIT 1
  `;

  return result.length > 0 && result[0]?.last_refreshed_at ? result[0].last_refreshed_at : null;
}
