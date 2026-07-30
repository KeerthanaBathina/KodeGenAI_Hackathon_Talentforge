#!/usr/bin/env tsx

import prisma from '../src/db/prisma';

async function main(): Promise<void> {
  console.log('[analytics:funnel:benchmark] starting funnel stage performance benchmark...');

  // Warm up query cache
  await prisma.$queryRaw`SELECT 1`;

  // Benchmark global (unfiltered) query
  const globalStart = performance.now();
  const globalResult = await prisma.$queryRaw`
    SELECT COUNT(*) as row_count
    FROM "funnel_stage_metrics_mv"
  `;
  const globalEnd = performance.now();
  const globalDurationMs = globalEnd - globalStart;

  console.log(`[analytics:funnel:benchmark] global funnel query: ${globalDurationMs.toFixed(2)}ms`);

  if (globalDurationMs > 2000) {
    console.error(
      `[analytics:funnel:benchmark] global query exceeded 2s SLA: ${globalDurationMs.toFixed(2)}ms`
    );
    process.exitCode = 1;
    return;
  }

  // Benchmark requisition-filtered query (if any requisitions exist)
  const requisitions = await prisma.$queryRaw<Array<{ requisition_id: string }>>`
    SELECT DISTINCT "requisition_id" FROM "funnel_stage_metrics_mv"
    WHERE "requisition_id" IS NOT NULL
    LIMIT 5
  `;

  for (const { requisition_id } of requisitions) {
    const reqStart = performance.now();
    await prisma.$queryRaw`
      SELECT *
      FROM "funnel_stage_metrics_mv"
      WHERE "requisition_id" = ${requisition_id}
    `;
    const reqEnd = performance.now();
    const reqDurationMs = reqEnd - reqStart;

    console.log(
      `[analytics:funnel:benchmark] requisition ${requisition_id} query: ${reqDurationMs.toFixed(2)}ms`
    );

    if (reqDurationMs > 2000) {
      console.error(
        `[analytics:funnel:benchmark] requisition query exceeded 2s SLA: ${reqDurationMs.toFixed(2)}ms`
      );
      process.exitCode = 1;
      return;
    }
  }

  console.log('[analytics:funnel:benchmark] all performance checks passed');
}

main()
  .catch((error) => {
    console.error('[analytics:funnel:benchmark] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
