import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

dotenv.config();

const prisma = new PrismaClient({
  log: ['error']
});

const CONCURRENCY = 50;
const ITERATIONS = 3;

function percentile(sortedValues: number[], p: number): number {
  if (sortedValues.length === 0) {
    return 0;
  }
  const idx = Math.ceil((p / 100) * sortedValues.length) - 1;
  return sortedValues[Math.max(0, idx)] ?? 0;
}

async function runBatch(batchNumber: number): Promise<{ latencies: number[]; errors: number }> {
  console.log(`\n[batch ${batchNumber}] Running ${CONCURRENCY} concurrent SELECT 1 queries...`);
  const latencies: number[] = [];
  let errors = 0;

  const queries = Array.from({ length: CONCURRENCY }, async () => {
    const start = Date.now();
    try {
      await prisma.$queryRaw`SELECT 1`;
      latencies.push(Date.now() - start);
    } catch {
      errors += 1;
    }
  });

  await Promise.all(queries);
  console.log(`[batch ${batchNumber}] ${latencies.length} succeeded, ${errors} failed`);
  return { latencies, errors };
}

async function main() {
  console.log('=== Prisma Connection Pool P95 Load Test ===');
  console.log(`Pool: connection_limit=10, concurrency=${CONCURRENCY}, iterations=${ITERATIONS}`);

  const allLatencies: number[] = [];
  let totalErrors = 0;

  try {
    for (let i = 1; i <= ITERATIONS; i += 1) {
      const { latencies, errors } = await runBatch(i);
      allLatencies.push(...latencies);
      totalErrors += errors;
      if (i < ITERATIONS) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    if (allLatencies.length === 0) {
      console.error('FAIL - All queries failed. Check DATABASE_URL and network access.');
      process.exit(1);
    }

    const sorted = [...allLatencies].sort((a, b) => a - b);
    const min = sorted[0] ?? 0;
    const max = sorted[sorted.length - 1] ?? 0;
    const avg = Math.round(allLatencies.reduce((sum, value) => sum + value, 0) / allLatencies.length);
    const p50 = percentile(sorted, 50);
    const p95 = percentile(sorted, 95);
    const p99 = percentile(sorted, 99);

    console.log('\n=== Results ===');
    console.log(`Total queries: ${CONCURRENCY * ITERATIONS}`);
    console.log(`Successful:    ${allLatencies.length}`);
    console.log(`Errors:        ${totalErrors}`);
    console.log(`Min:           ${min}ms`);
    console.log(`Avg:           ${avg}ms`);
    console.log(`P50:           ${p50}ms`);
    console.log(`P95:           ${p95}ms`);
    console.log(`P99:           ${p99}ms`);
    console.log(`Max:           ${max}ms`);

    if (p95 < 500 && totalErrors === 0) {
      console.log('\nPASS - P95 < 500ms and zero errors');
      return;
    }

    if (p95 >= 500) {
      console.error(`FAIL - P95 ${p95}ms exceeds 500ms target`);
    }
    if (totalErrors > 0) {
      console.error(`FAIL - ${totalErrors} query errors occurred`);
    }
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('Unhandled error during load test:', error);
  process.exit(1);
});
