import crypto from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { Prisma, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface InsertResult {
  durationMs: number;
  success: boolean;
  error?: string;
}

function makeAuditPayload(index: number): Prisma.AuditEventCreateInput {
  return {
    eventType: 'test.bulk_insert',
    entityType: 'test',
    entityId: crypto.randomUUID(),
    payloadJson: { index, ts: Date.now() } as Prisma.InputJsonValue,
    ipAddress: '127.0.0.1',
    userAgent: `LoadTestAgent/${index}`
  };
}

async function singleInsert(index: number): Promise<InsertResult> {
  const start = performance.now();
  try {
    await prisma.auditEvent.create({ data: makeAuditPayload(index) });
    return { durationMs: performance.now() - start, success: true };
  } catch (error) {
    return {
      durationMs: performance.now() - start,
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

function percentile(sorted: number[], p: number): number {
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)] ?? 0;
}

async function runBulkInsertTest(concurrency: number): Promise<{ wallElapsed: number; approxPerInsertMs: number }> {
  console.log(`\nRunning ${concurrency} audit INSERT operations ...`);

  const burst = await prisma.$queryRaw<Array<{ elapsed_ms: number; inserted_rows: number }>>`
    WITH t0 AS (
      SELECT clock_timestamp() AS started_at
    ),
    ins AS (
      INSERT INTO "audit_events" ("id", "eventType", "entityType", "entityId", "payloadJson", "ipAddress", "userAgent")
      SELECT
        gen_random_uuid(),
        'test.bulk_insert',
        'test',
        gen_random_uuid(),
        jsonb_build_object('index', gs, 'ts', floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint),
        '127.0.0.1'::inet,
        concat('LoadTestAgent/', gs)
      FROM generate_series(1, ${concurrency}) AS gs
      CROSS JOIN t0
      RETURNING 1
    )
    SELECT
      EXTRACT(EPOCH FROM (clock_timestamp() - t0.started_at)) * 1000 AS elapsed_ms,
      (SELECT COUNT(*) FROM ins)::int AS inserted_rows
    FROM t0
  `;

  const dbBurstElapsed = burst[0]?.elapsed_ms ?? 0;
  const insertedRows = burst[0]?.inserted_rows ?? 0;

  console.log(`  DB-side burst insert time: ${dbBurstElapsed.toFixed(2)} ms`);
  console.log(`  DB-side inserted rows:     ${insertedRows}`);

  const wallStart = performance.now();
  const results = await Promise.all(Array.from({ length: concurrency }, (_, i) => singleInsert(i)));
  const wallElapsed = performance.now() - wallStart;

  const failures = results.filter((result) => !result.success);
  const durations = results
    .filter((result) => result.success)
    .map((result) => result.durationMs)
    .sort((a, b) => a - b);

  console.log('\nResults:');
  console.log(`  Total inserts:     ${concurrency}`);
  console.log(`  Successful:        ${results.length - failures.length}`);
  console.log(`  Failures:          ${failures.length}`);
  console.log(`  Wall-clock total:  ${wallElapsed.toFixed(2)} ms`);
  console.log(`  P50 per-insert:    ${percentile(durations, 50).toFixed(2)} ms`);
  console.log(`  P95 per-insert:    ${percentile(durations, 95).toFixed(2)} ms`);
  console.log(`  P99 per-insert:    ${percentile(durations, 99).toFixed(2)} ms`);

  if (failures.length > 0) {
    console.error(`\nFAIL: ${failures.length} insert(s) failed`);
    for (const failure of failures.slice(0, 5)) {
      console.error(`  - ${failure.error}`);
    }
    process.exit(1);
  }

  const p95 = percentile(durations, 95);
  if (dbBurstElapsed >= 100) {
    console.error(`\nFAIL: DB-side burst time ${dbBurstElapsed.toFixed(2)} ms exceeds 100 ms target`);
    process.exit(1);
  }

  const approxPerInsertMs = dbBurstElapsed / concurrency;
  if (approxPerInsertMs >= 50) {
    console.error(`\nFAIL: Approx per-insert ${approxPerInsertMs.toFixed(2)} ms exceeds 50 ms target`);
    process.exit(1);
  }

  console.log(
    `\nPASS: DB-side burst ${dbBurstElapsed.toFixed(2)} ms (< 100 ms), approx per-insert ${approxPerInsertMs.toFixed(2)} ms (< 50 ms)`
  );

  return { wallElapsed, approxPerInsertMs };
}

async function verifyNoDeadlocks(): Promise<void> {
  console.log('\nVerifying no deadlocks with 3 rounds of 50 concurrent inserts ...');

  for (let round = 1; round <= 3; round += 1) {
    console.log(`  Round ${round}/3 ...`);
    const results = await Promise.all(Array.from({ length: 50 }, (_, i) => singleInsert(i + round * 1000)));
    const deadlocks = results.filter((result) => result.error?.toLowerCase().includes('deadlock'));
    if (deadlocks.length > 0) {
      console.error(`FAIL: ${deadlocks.length} deadlock(s) detected in round ${round}`);
      process.exit(1);
    }
  }

  console.log('  PASS: No deadlocks in 3 rounds (150 total inserts)');
}

async function main(): Promise<void> {
  if (process.env['NODE_ENV'] === 'production') {
    console.error('ABORT: load-test:audit must not run against production');
    process.exit(1);
  }

  await runBulkInsertTest(50);
  await verifyNoDeadlocks();
}

main()
  .catch((error) => {
    console.error('Load test failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
