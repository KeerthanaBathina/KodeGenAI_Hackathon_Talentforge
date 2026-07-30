import prisma from '../db/prisma';
import logger from '../utils/logger';

export interface PipelineKpiRefreshResult {
  lastRefreshedAt: Date;
  durationMs: number;
  status: 'success';
}

const ANALYTICS_KEY = 'pipeline_kpi';
const ERROR_MESSAGE_MAX_LENGTH = 2000;

function truncateErrorMessage(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return text.slice(0, ERROR_MESSAGE_MAX_LENGTH);
}

export async function refreshPipelineKpiMaterializedView(): Promise<PipelineKpiRefreshResult> {
  const startedAt = Date.now();

  try {
    await prisma.$executeRawUnsafe('REFRESH MATERIALIZED VIEW "pipeline_kpi_metrics_mv"');

    const durationMs = Date.now() - startedAt;
    const lastRefreshedAt = new Date();

    await prisma.$executeRaw`
      INSERT INTO "analytics_refresh_runs" ("analytics_key", "last_refreshed_at", "duration_ms", "status", "error_message", "updated_at")
      VALUES (${ANALYTICS_KEY}, ${lastRefreshedAt}, ${durationMs}, 'success', NULL, ${lastRefreshedAt})
      ON CONFLICT ("analytics_key") DO UPDATE SET
        "last_refreshed_at" = EXCLUDED."last_refreshed_at",
        "duration_ms" = EXCLUDED."duration_ms",
        "status" = EXCLUDED."status",
        "error_message" = EXCLUDED."error_message",
        "updated_at" = EXCLUDED."updated_at"
    `;

    logger.info({ durationMs, lastRefreshedAt }, '[PipelineKPI] materialized view refresh complete');

    return {
      lastRefreshedAt,
      durationMs,
      status: 'success'
    };
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    const failedAt = new Date();
    const errorMessage = truncateErrorMessage(error);

    await prisma.$executeRaw`
      INSERT INTO "analytics_refresh_runs" ("analytics_key", "last_refreshed_at", "duration_ms", "status", "error_message", "updated_at")
      VALUES (${ANALYTICS_KEY}, ${failedAt}, ${durationMs}, 'failed', ${errorMessage}, ${failedAt})
      ON CONFLICT ("analytics_key") DO UPDATE SET
        "last_refreshed_at" = EXCLUDED."last_refreshed_at",
        "duration_ms" = EXCLUDED."duration_ms",
        "status" = EXCLUDED."status",
        "error_message" = EXCLUDED."error_message",
        "updated_at" = EXCLUDED."updated_at"
    `;

    logger.error({ error, durationMs }, '[PipelineKPI] materialized view refresh failed');
    throw error;
  }
}
