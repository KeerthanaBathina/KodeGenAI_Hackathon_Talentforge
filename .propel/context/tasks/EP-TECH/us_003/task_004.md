---
id: task_004
us_id: us_003
epic: EP-TECH
title: "P95 Database Query Latency Load Test Under 50 Concurrent Connections"
status: not-started
layer: backend
effort: 3h
priority: critical
created: 2026-07-22
---

# TASK-004 — P95 Database Query Latency Load Test Under 50 Concurrent Connections

## Context

**User Story**: US-003 — Configure Supabase PostgreSQL with Prisma ORM and Upstash Redis  
**Epic**: EP-TECH — Technical Bootstrap  
**Addresses Acceptance Criteria**: Scenario 4 (P95 query latency stays below 500 ms under 50 concurrent database requests; no connection timeout errors)

This task writes and executes a concurrency load test that fires 50 simultaneous Prisma queries, collects per-query latency, computes the P95 percentile, and fails if P95 ≥ 500 ms or any query throws a timeout/pool-exhaustion error. The results calibrate the connection pool settings established in TASK-001.

---

## Objective

Create a standalone Node.js/TypeScript load test script that issues 50 concurrent Prisma `$queryRaw\`SELECT 1\`` calls, measures P95 latency, and exits non-zero if the SLA is missed. Run it locally against a Supabase dev instance and capture the output as evidence.

---

## Technical Specifications

| Attribute | Value |
|-----------|-------|
| Concurrency | 50 simultaneous Prisma queries |
| Query | `prisma.$queryRaw\`SELECT 1\`` (lowest overhead; purely tests connection pool) |
| P95 target | < 500 ms |
| Timeout per query | 10 000 ms (Prisma default; no individual query should approach this) |
| Pool config | `connection_limit=10` as set in TASK-001 |
| Pass condition | P95 < 500 ms AND zero connection errors |

---

## Implementation Steps

### Step 1 — Create the load test script

Create `backend/scripts/load-test-db.ts`:

```typescript
import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';

// Load local environment for standalone execution
dotenv.config({ path: '../.env' });

const prisma = new PrismaClient({
  log: ['error'],
  datasources: {
    db: { url: process.env['DATABASE_URL'] },
  },
});

const CONCURRENCY = 50;
const ITERATIONS = 3;  // Run 3 rounds of 50 concurrent queries

function percentile(sortedValues: number[], p: number): number {
  if (sortedValues.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sortedValues.length) - 1;
  return sortedValues[Math.max(0, idx)] ?? 0;
}

async function runBatch(batchNumber: number): Promise<number[]> {
  console.log(`\n[batch ${batchNumber}] Firing ${CONCURRENCY} concurrent SELECT 1 queries...`);
  const latencies: number[] = [];
  const errors: string[] = [];

  const queries = Array.from({ length: CONCURRENCY }, async (_, i) => {
    const start = Date.now();
    try {
      await prisma.$queryRaw`SELECT 1`;
      latencies.push(Date.now() - start);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Query ${i + 1}: ${msg}`);
    }
  });

  await Promise.all(queries);

  if (errors.length > 0) {
    console.error(`[batch ${batchNumber}] ${errors.length} errors:`);
    errors.forEach(e => console.error(`  ${e}`));
  }

  console.log(`[batch ${batchNumber}] ${latencies.length} succeeded, ${errors.length} errors`);
  return latencies;
}

async function main() {
  console.log('=== Prisma Connection Pool P95 Load Test ===');
  console.log(`Pool: connection_limit=10, concurrency=${CONCURRENCY}, iterations=${ITERATIONS}`);

  try {
    const allLatencies: number[] = [];

    for (let i = 1; i <= ITERATIONS; i++) {
      const batchLatencies = await runBatch(i);
      allLatencies.push(...batchLatencies);

      // Brief pause between batches to allow pool to stabilise
      if (i < ITERATIONS) await new Promise(r => setTimeout(r, 500));
    }

    if (allLatencies.length === 0) {
      console.error('\n❌ FAIL — All queries errored. Check DATABASE_URL and connection pool.');
      process.exit(1);
    }

    const sorted = [...allLatencies].sort((a, b) => a - b);
    const p50 = percentile(sorted, 50);
    const p95 = percentile(sorted, 95);
    const p99 = percentile(sorted, 99);
    const min = sorted[0] ?? 0;
    const max = sorted[sorted.length - 1] ?? 0;
    const avg = Math.round(allLatencies.reduce((sum, v) => sum + v, 0) / allLatencies.length);

    const totalQueries = CONCURRENCY * ITERATIONS;
    const errorCount = totalQueries - allLatencies.length;

    console.log('\n=== Results ===');
    console.log(`Total queries: ${totalQueries}`);
    console.log(`Successful:    ${allLatencies.length}`);
    console.log(`Errors:        ${errorCount}`);
    console.log(`Min:           ${min}ms`);
    console.log(`Avg:           ${avg}ms`);
    console.log(`P50:           ${p50}ms`);
    console.log(`P95:           ${p95}ms  ${p95 < 500 ? '✅' : '❌'}`);
    console.log(`P99:           ${p99}ms`);
    console.log(`Max:           ${max}ms`);

    const passed = p95 < 500 && errorCount === 0;

    if (passed) {
      console.log('\n✅ PASS — P95 < 500ms and zero errors');
      process.exit(0);
    } else {
      if (p95 >= 500) console.error(`\n❌ FAIL — P95 ${p95}ms >= 500ms target`);
      if (errorCount > 0) console.error(`❌ FAIL — ${errorCount} connection errors occurred`);
      process.exit(1);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
```

### Step 2 — Add a `load-test` script to `package.json`

```json
{
  "scripts": {
    "load-test:db": "tsx scripts/load-test-db.ts"
  }
}
```

### Step 3 — Run the load test locally

Ensure `DATABASE_URL` points to the Supabase development instance:

```bash
cd backend
npm run load-test:db
```

Expected passing output:

```
=== Prisma Connection Pool P95 Load Test ===
Pool: connection_limit=10, concurrency=50, iterations=3

[batch 1] Firing 50 concurrent SELECT 1 queries...
[batch 1] 50 succeeded, 0 errors
[batch 2] Firing 50 concurrent SELECT 1 queries...
[batch 2] 50 succeeded, 0 errors
[batch 3] Firing 50 concurrent SELECT 1 queries...
[batch 3] 50 succeeded, 0 errors

=== Results ===
Total queries: 150
Successful:    150
Errors:        0
Min:           11ms
Avg:           84ms
P50:           72ms
P95:           312ms  ✅
P99:           480ms
Max:           521ms

✅ PASS — P95 < 500ms and zero errors
```

### Step 4 — Interpret results and tune if needed

**If P95 ≥ 500 ms:**

| Root Cause | Diagnosis | Remediation |
|------------|-----------|-------------|
| Pool exhaustion | `Max` is very high; `Avg` is low | Increase `connection_limit` to 15 or 20 and re-test |
| Supabase region distance | All latencies elevated uniformly | Ensure Railway and Supabase are in the same AWS region |
| PgBouncer `pool_mode` mismatch | Random failures or timeouts | Confirm `pgbouncer=true` in `DATABASE_URL`; check Supabase pooler settings |
| Supabase free-tier throttle | Intermittent slow queries | Upgrade Supabase plan or reduce `CONCURRENCY` to 25 |

**If errors occur (connection timeouts):**

- Increase `pool_timeout` from 30 to 60 in `DATABASE_URL`
- Check Supabase connection pooler max connections (default 15 on free tier — adjust `connection_limit` accordingly)

Document any changes to `DATABASE_URL` parameters in `backend/.env.example` with rationale.

### Step 5 — Run against staging Railway deployment (optional but recommended)

```bash
# Set DATABASE_URL to the staging Supabase connection string
DATABASE_URL="<staging-pooler-url>" npm run load-test:db
```

This validates that the Railway production environment behaves the same as local.

---

## Validation

| Check | Command / Method | Expected Result |
|-------|-----------------|-----------------|
| Script runs without import errors | `npm run load-test:db` | No module resolution errors |
| 150 queries complete (0 errors) | Script output | `Errors: 0` |
| P95 < 500 ms | Script output | `P95: <n>ms ✅` |
| Script exits 0 on pass | `echo $?` after run | `0` |
| Script exits 1 on fail | Artificially lower pool (set `connection_limit=1`) | `P95: <high>ms ❌`, exit 1 |
| TypeScript compiles | `npm run type-check` | Exit 0 |

---

## Dependencies

- **TASK-001** must be complete (Prisma singleton, `connection_limit=10` in `DATABASE_URL`)
- Supabase development instance must be live with `DATABASE_URL` in `backend/.env`
- `dotenv` installed (`npm install dotenv`)

## Security Constraints

- **OWASP A05 (Security Misconfiguration)**: Load test script uses `dotenv` to load `.env` locally — `DATABASE_URL` is never hardcoded in the script.
- The script is in `scripts/` and excluded from the compiled `dist/` output via `tsconfig.json` (only `src/**` is included in `rootDir`). It will not be deployed to Railway.
- Do not run this script against the **production** Supabase database — use only the development or staging instance to avoid impacting live candidate data.

---

## Definition of Done

- [ ] `backend/scripts/load-test-db.ts` committed
- [ ] `load-test:db` script added to `backend/package.json`
- [ ] Local run produces `✅ PASS — P95 < 500ms and zero errors`
- [ ] P95 value, error count, and pool config (`connection_limit`) recorded in evidence document
- [ ] Any pool parameter changes from tuning committed to `.env.example` with explanation
- [ ] `npm run type-check` exits 0

## Traceability

| Artefact | ID |
|----------|----|
| User Story | US-003 |
| Epic | EP-TECH |
| NFR | NFR-001 (P95 query < 500 ms), NFR-002 (50 concurrent sessions — pool headroom) |
| TR | TR-008.6 (connection pooling — empirical validation) |
| Scenario | 4 (P95 < 500 ms under 50 concurrent queries, zero errors) |
