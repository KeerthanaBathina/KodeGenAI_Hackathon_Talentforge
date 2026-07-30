#!/usr/bin/env tsx

import prisma from '../src/db/prisma';

interface FunnelViolation {
  requisition_id: string | null;
  stage_name: string;
  stage_count: number | bigint;
  conversion_rate_pct: number;
  drop_count: number | bigint;
}

async function main(): Promise<void> {
  console.log('[analytics:funnel:validate] starting funnel stage validation...');

  // Check 1: Verify conversion rates are between 0-100%
  const conversionViolations = await prisma.$queryRaw<FunnelViolation[]>`
    SELECT
      "requisition_id",
      "stage_name",
      "stage_count",
      "conversion_rate_pct",
      "drop_count"
    FROM "funnel_stage_metrics_mv"
    WHERE "conversion_rate_pct" < 0 OR "conversion_rate_pct" > 100
  `;

  if (conversionViolations.length > 0) {
    console.error(
      `[analytics:funnel:validate] found ${conversionViolations.length} conversion rate violation(s)`
    );
    console.error(JSON.stringify(conversionViolations.slice(0, 10), null, 2));
    process.exitCode = 1;
    return;
  }

  // Check 2: Verify drop counts are non-negative
  const dropViolations = await prisma.$queryRaw<FunnelViolation[]>`
    SELECT
      "requisition_id",
      "stage_name",
      "stage_count",
      "conversion_rate_pct",
      "drop_count"
    FROM "funnel_stage_metrics_mv"
    WHERE "drop_count" < 0
  `;

  if (dropViolations.length > 0) {
    console.error(
      `[analytics:funnel:validate] found ${dropViolations.length} drop count violation(s)`
    );
    console.error(JSON.stringify(dropViolations.slice(0, 10), null, 2));
    process.exitCode = 1;
    return;
  }

  // Check 3: Verify at most one largest drop per requisition
  const largestDropViolations = await prisma.$queryRaw<
    Array<{ requisition_id: string | null; largest_drop_count: number }>
  >`
    SELECT
      "requisition_id",
      COUNT(*) FILTER (WHERE "is_largest_drop_transition" = TRUE) AS largest_drop_count
    FROM "funnel_stage_metrics_mv"
    GROUP BY "requisition_id"
    HAVING COUNT(*) FILTER (WHERE "is_largest_drop_transition" = TRUE) > 1
  `;

  if (largestDropViolations.length > 0) {
    console.error(
      `[analytics:funnel:validate] found ${largestDropViolations.length} requisition(s) with multiple largest drops`
    );
    console.error(JSON.stringify(largestDropViolations, null, 2));
    process.exitCode = 1;
    return;
  }

  // Check 4: Verify stage order and monotonic decrease
  const stages = ['applications', 'shortlisted', 'interviews_complete', 'offer_extended', 'offer_accepted'];
  const stageMap = new Map(stages.map((s, i) => [s, i]));

  const requisitions = await prisma.$queryRaw<Array<{ requisition_id: string | null }>>`
    SELECT DISTINCT "requisition_id" FROM "funnel_stage_metrics_mv"
  `;

  for (const { requisition_id } of requisitions) {
    const reqStages = await prisma.$queryRaw<FunnelViolation[]>`
      SELECT
        "requisition_id",
        "stage_name",
        "stage_count",
        "conversion_rate_pct",
        "drop_count"
      FROM "funnel_stage_metrics_mv"
      WHERE "requisition_id" = ${requisition_id}
      ORDER BY 
        CASE "stage_name"
          WHEN 'applications' THEN 1
          WHEN 'shortlisted' THEN 2
          WHEN 'interviews_complete' THEN 3
          WHEN 'offer_extended' THEN 4
          WHEN 'offer_accepted' THEN 5
        END
    `;

    for (let i = 1; i < reqStages.length; i++) {
      const prev = Number(reqStages[i - 1].stage_count);
      const curr = Number(reqStages[i].stage_count);
      if (curr > prev) {
        console.error(
          `[analytics:funnel:validate] stage order violation: ${reqStages[i - 1].stage_name} (${prev}) > ${reqStages[i].stage_name} (${curr}) for requisition ${requisition_id}`
        );
        process.exitCode = 1;
        return;
      }
    }
  }

  console.log('[analytics:funnel:validate] all validations passed');
}

main()
  .catch((error) => {
    console.error('[analytics:funnel:validate] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
