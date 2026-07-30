#!/usr/bin/env tsx

import prisma from '../src/db/prisma';

interface FormulaViolation {
  requisition_id: string | null;
  total_applications: number | bigint;
  shortlisted_count: number | bigint;
  shortlist_rate_pct: number | string;
  offers_extended: number | bigint;
  offers_accepted: number | bigint;
  offer_acceptance_rate_pct: number | string;
  avg_time_to_hire_days: number | string;
  time_to_hire_count: number | bigint;
}

async function main(): Promise<void> {
  const violations = await prisma.$queryRaw<FormulaViolation[]>`
    SELECT
      "requisition_id",
      "total_applications",
      "shortlisted_count",
      "shortlist_rate_pct",
      "offers_extended",
      "offers_accepted",
      "offer_acceptance_rate_pct",
      "avg_time_to_hire_days",
      "time_to_hire_count"
    FROM "pipeline_kpi_metrics_mv"
    WHERE
      ABS(
        "shortlist_rate_pct" -
        CASE
          WHEN "total_applications" = 0 THEN 0
          ELSE ROUND(("shortlisted_count"::numeric * 100.0) / "total_applications"::numeric, 2)
        END
      ) > 0.01
      OR ABS(
        "offer_acceptance_rate_pct" -
        CASE
          WHEN "offers_extended" = 0 THEN 0
          ELSE ROUND(("offers_accepted"::numeric * 100.0) / "offers_extended"::numeric, 2)
        END
      ) > 0.01
      OR ("time_to_hire_count" = 0 AND "avg_time_to_hire_days" <> 0)
  `;

  if (violations.length > 0) {
    console.error(`[analytics:pipeline:validate] found ${violations.length} formula violation(s)`);
    console.error(JSON.stringify(violations.slice(0, 10), null, 2));
    process.exitCode = 1;
    return;
  }

  const [globalRow] = await prisma.$queryRaw<Array<{ total_applications: number | bigint }>>`
    SELECT "total_applications"
    FROM "pipeline_kpi_metrics_mv"
    WHERE "requisition_id" IS NULL
    LIMIT 1
  `;

  const [refreshMeta] = await prisma.$queryRaw<
    Array<{ last_refreshed_at: Date; duration_ms: number; status: string }>
  >`
    SELECT "last_refreshed_at", "duration_ms", "status"
    FROM "analytics_refresh_runs"
    WHERE "analytics_key" = 'pipeline_kpi'
    LIMIT 1
  `;

  if (!refreshMeta) {
    console.error('[analytics:pipeline:validate] missing analytics_refresh_runs metadata for pipeline_kpi');
    process.exitCode = 1;
    return;
  }

  if (refreshMeta.status !== 'success' && refreshMeta.status !== 'initialized') {
    console.error(
      `[analytics:pipeline:validate] latest refresh status is ${refreshMeta.status}, expected success/initialized`
    );
    process.exitCode = 1;
    return;
  }

  const freshnessLagMs = Date.now() - new Date(refreshMeta.last_refreshed_at).getTime();
  const maxLagMs = 5 * 60 * 1000;
  if (freshnessLagMs > maxLagMs) {
    console.error(
      `[analytics:pipeline:validate] freshness lag ${freshnessLagMs}ms exceeds max ${maxLagMs}ms`
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    `[analytics:pipeline:validate] formulas valid. global total applications = ${String(globalRow?.total_applications ?? 0)} freshnessLagMs=${freshnessLagMs}`
  );
}

main()
  .catch((error) => {
    console.error('[analytics:pipeline:validate] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
