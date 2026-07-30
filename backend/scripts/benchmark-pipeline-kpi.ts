#!/usr/bin/env tsx

import prisma from '../src/db/prisma';

interface BenchmarkResult {
  ms: number;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) {
    return 0;
  }

  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx] ?? 0;
}

async function runQueryBench(queryName: string, query: () => Promise<unknown>, runs = 20): Promise<BenchmarkResult> {
  const latencies: number[] = [];

  for (let i = 0; i < runs; i += 1) {
    const started = performance.now();
    await query();
    latencies.push(performance.now() - started);
  }

  latencies.sort((a, b) => a - b);

  const p95 = percentile(latencies, 95);
  const p50 = percentile(latencies, 50);
  const max = latencies[latencies.length - 1] ?? 0;
  const min = latencies[0] ?? 0;

  console.log(
    `[analytics:pipeline:benchmark] ${queryName} -> min=${min.toFixed(2)}ms p50=${p50.toFixed(2)}ms p95=${p95.toFixed(2)}ms max=${max.toFixed(2)}ms`
  );

  return { ms: p95 };
}

async function main(): Promise<void> {
  const [{ application_count: applicationCount }] = await prisma.$queryRaw<Array<{ application_count: number | bigint }>>`
    SELECT COUNT(*)::BIGINT AS application_count
    FROM "applications"
  `;

  const totalApplications = Number(applicationCount);
  const strict = process.env.STRICT_PIPELINE_BENCHMARK === 'true';

  console.log(`[analytics:pipeline:benchmark] applications in dataset: ${totalApplications}`);

  if (totalApplications < 100000) {
    const message =
      '[analytics:pipeline:benchmark] dataset has fewer than 100k applications; benchmark still runs but does not fully represent target load.';

    if (strict) {
      console.error(message);
      process.exitCode = 1;
      return;
    }

    console.warn(message);
  }

  const globalBench = await runQueryBench('global KPI row', async () => {
    await prisma.$queryRaw`
      SELECT *
      FROM "pipeline_kpi_metrics_mv"
      WHERE "requisition_id" IS NULL
      LIMIT 1
    `;
  });

  const [{ requisition_id: sampleRequisitionId }] = await prisma.$queryRaw<Array<{ requisition_id: string | null }>>`
    SELECT "requisition_id"
    FROM "pipeline_kpi_metrics_mv"
    WHERE "requisition_id" IS NOT NULL
    ORDER BY "total_applications" DESC
    LIMIT 1
  `;

  if (sampleRequisitionId) {
    const requisitionBench = await runQueryBench('requisition KPI row', async () => {
      await prisma.$queryRaw`
        SELECT *
        FROM "pipeline_kpi_metrics_mv"
        WHERE "requisition_id" = ${sampleRequisitionId}::uuid
        LIMIT 1
      `;
    });

    if (requisitionBench.ms > 2000) {
      throw new Error(`Requisition KPI query P95 exceeded 2s target: ${requisitionBench.ms.toFixed(2)}ms`);
    }
  }

  if (globalBench.ms > 2000) {
    throw new Error(`Global KPI query P95 exceeded 2s target: ${globalBench.ms.toFixed(2)}ms`);
  }

  console.log('[analytics:pipeline:benchmark] PASS - P95 < 2s for benchmarked KPI queries');
}

main()
  .catch((error) => {
    console.error('[analytics:pipeline:benchmark] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
