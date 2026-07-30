import prisma from '../db/prisma';
import logger from '../utils/logger';
import { computePriorWeekActivity, upsertWeeklyActivitySignal } from '../db/weeklyActivitySignals';

export interface NoShowAnalyticsRefreshResult {
  lastRefreshedAt: Date;
  durationMs: number;
  status: 'success';
}

const ANALYTICS_KEYS = {
  kpi: 'no_show_kpi',
  trend_30d: 'no_show_trend_30d',
  weekly_activity: 'weekly_activity_signals'
};

const ERROR_MESSAGE_MAX_LENGTH = 2000;

function truncateErrorMessage(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return text.slice(0, ERROR_MESSAGE_MAX_LENGTH);
}

/**
 * Refresh no-show KPI materialized view
 */
async function refreshNoShowKpiView(): Promise<void> {
  await prisma.$executeRawUnsafe('REFRESH MATERIALIZED VIEW "no_show_kpi_metrics_mv"');
}

/**
 * Refresh 30-day no-show trend materialized view
 */
async function refreshNoShowTrend30dView(): Promise<void> {
  await prisma.$executeRawUnsafe('REFRESH MATERIALIZED VIEW "no_show_trend_30d_mv"');
}

/**
 * Refresh weekly activity signals
 * Computes prior week activity and updates the signals table
 */
async function refreshWeeklyActivitySignals(): Promise<void> {
  // Get the week ending date (this Sunday)
  const today = new Date();
  const daysUntilSunday = (7 - today.getDay()) % 7 || 7;
  const weekEndingDate = new Date(today);
  weekEndingDate.setDate(today.getDate() + daysUntilSunday);
  weekEndingDate.setHours(0, 0, 0, 0);

  // Compute prior week activity
  const { applicationCount, interviewCount } = await computePriorWeekActivity();

  // Upsert the signal
  await upsertWeeklyActivitySignal(weekEndingDate, applicationCount, interviewCount);
}

/**
 * Refresh all no-show analytics views and signals
 * Handles KPI metrics, 30-day trend, and weekly activity signals
 */
export async function refreshNoShowAnalytics(): Promise<NoShowAnalyticsRefreshResult> {
  const startedAt = Date.now();

  try {
    // Refresh all views in parallel
    await Promise.all([refreshNoShowKpiView(), refreshNoShowTrend30dView(), refreshWeeklyActivitySignals()]);

    const durationMs = Date.now() - startedAt;
    const lastRefreshedAt = new Date();

    // Update refresh metadata for all analytics keys
    await Promise.all([
      prisma.$executeRaw`
        INSERT INTO "analytics_refresh_runs" ("analytics_key", "last_refreshed_at", "duration_ms", "status", "error_message", "updated_at")
        VALUES (${ANALYTICS_KEYS.kpi}, ${lastRefreshedAt}, ${durationMs}, 'success', NULL, ${lastRefreshedAt})
        ON CONFLICT ("analytics_key") DO UPDATE SET
          "last_refreshed_at" = EXCLUDED."last_refreshed_at",
          "duration_ms" = EXCLUDED."duration_ms",
          "status" = EXCLUDED."status",
          "error_message" = EXCLUDED."error_message",
          "updated_at" = EXCLUDED."updated_at"
      `,
      prisma.$executeRaw`
        INSERT INTO "analytics_refresh_runs" ("analytics_key", "last_refreshed_at", "duration_ms", "status", "error_message", "updated_at")
        VALUES (${ANALYTICS_KEYS.trend_30d}, ${lastRefreshedAt}, ${durationMs}, 'success', NULL, ${lastRefreshedAt})
        ON CONFLICT ("analytics_key") DO UPDATE SET
          "last_refreshed_at" = EXCLUDED."last_refreshed_at",
          "duration_ms" = EXCLUDED."duration_ms",
          "status" = EXCLUDED."status",
          "error_message" = EXCLUDED."error_message",
          "updated_at" = EXCLUDED."updated_at"
      `,
      prisma.$executeRaw`
        INSERT INTO "analytics_refresh_runs" ("analytics_key", "last_refreshed_at", "duration_ms", "status", "error_message", "updated_at")
        VALUES (${ANALYTICS_KEYS.weekly_activity}, ${lastRefreshedAt}, ${durationMs}, 'success', NULL, ${lastRefreshedAt})
        ON CONFLICT ("analytics_key") DO UPDATE SET
          "last_refreshed_at" = EXCLUDED."last_refreshed_at",
          "duration_ms" = EXCLUDED."duration_ms",
          "status" = EXCLUDED."status",
          "error_message" = EXCLUDED."error_message",
          "updated_at" = EXCLUDED."updated_at"
      `
    ]);

    logger.info(
      { durationMs, lastRefreshedAt },
      '[NoShowAnalytics] all analytics refresh complete (KPI, 30d trend, weekly activity)'
    );

    return {
      lastRefreshedAt,
      durationMs,
      status: 'success'
    };
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    const failedAt = new Date();
    const errorMessage = truncateErrorMessage(error);

    // Mark all analytics keys as failed
    await Promise.all([
      prisma.$executeRaw`
        INSERT INTO "analytics_refresh_runs" ("analytics_key", "last_refreshed_at", "duration_ms", "status", "error_message", "updated_at")
        VALUES (${ANALYTICS_KEYS.kpi}, ${failedAt}, ${durationMs}, 'failed', ${errorMessage}, ${failedAt})
        ON CONFLICT ("analytics_key") DO UPDATE SET
          "last_refreshed_at" = EXCLUDED."last_refreshed_at",
          "duration_ms" = EXCLUDED."duration_ms",
          "status" = EXCLUDED."status",
          "error_message" = EXCLUDED."error_message",
          "updated_at" = EXCLUDED."updated_at"
      `,
      prisma.$executeRaw`
        INSERT INTO "analytics_refresh_runs" ("analytics_key", "last_refreshed_at", "duration_ms", "status", "error_message", "updated_at")
        VALUES (${ANALYTICS_KEYS.trend_30d}, ${failedAt}, ${durationMs}, 'failed', ${errorMessage}, ${failedAt})
        ON CONFLICT ("analytics_key") DO UPDATE SET
          "last_refreshed_at" = EXCLUDED."last_refreshed_at",
          "duration_ms" = EXCLUDED."duration_ms",
          "status" = EXCLUDED."status",
          "error_message" = EXCLUDED."error_message",
          "updated_at" = EXCLUDED."updated_at"
      `,
      prisma.$executeRaw`
        INSERT INTO "analytics_refresh_runs" ("analytics_key", "last_refreshed_at", "duration_ms", "status", "error_message", "updated_at")
        VALUES (${ANALYTICS_KEYS.weekly_activity}, ${failedAt}, ${durationMs}, 'failed', ${errorMessage}, ${failedAt})
        ON CONFLICT ("analytics_key") DO UPDATE SET
          "last_refreshed_at" = EXCLUDED."last_refreshed_at",
          "duration_ms" = EXCLUDED."duration_ms",
          "status" = EXCLUDED."status",
          "error_message" = EXCLUDED."error_message",
          "updated_at" = EXCLUDED."updated_at"
      `
    ]);

    logger.error({ error, durationMs }, '[NoShowAnalytics] analytics refresh failed');
    throw error;
  }
}
