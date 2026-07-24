---
id: task_004
us_id: us_003
epic: EP-DATA
title: "Bulk Audit Event Insert Load Test — 50 Concurrent INSERTs Within 100 ms"
status: done
layer: backend
effort: 2h
priority: critical
created: 2026-07-22
---

# TASK-004 — Bulk Audit Event Insert Load Test — 50 Concurrent INSERTs Within 100 ms

## Context

**User Story**: US-003 — Immutable Audit Events Table with PostgreSQL Trigger Guard  
**Epic**: EP-DATA — Data Foundation  
**Addresses Acceptance Criteria**: Scenario 4 (50 concurrent audit events inserted; all complete within 100 ms; no deadlocks)

High-traffic events (e.g. simultaneous HR review queue updates or bulk-reject operations) can produce bursts of audit writes. Each write fires the `trg_audit_events_immutable` trigger function, which adds a small overhead per row. The trigger must not introduce deadlocks and must complete within the 100 ms window that ensures the audit burst does not become the API latency bottleneck.

---

## Objective

Write a load test script that fires 50 concurrent `prisma.auditEvent.create()` calls using `Promise.all`, measures total wall-clock time and per-insert latency, asserts that all 50 resolve successfully with no rejected promises (no deadlocks), and asserts that total elapsed time is < 100 ms when run against staging.

---

## Technical Specifications

| Attribute | Value |
|-----------|-------|
| Concurrent inserts | 50 |
| Wall-clock target | < 100 ms (total for all 50) |
| Per-insert P95 target | < 50 ms |
| Deadlock tolerance | 0 — any deadlock is a test failure |
| Trigger overhead | Included in timing — trigger fires on every INSERT |

---

## Implementation Steps

### Step 1 — Create the load test script

Create `backend/scripts/load-test-audit.ts`:

```typescript
import { PrismaClient, Prisma } from '@prisma/client';
import crypto from 'node:crypto';

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
    payloadJson: { index, timestamp: Date.now() } as Prisma.InputJsonValue,
    ipAddress: '127.0.0.1',
    userAgent: `LoadTestAgent/${index}`,
  };
}

async function singleInsert(index: number): Promise<InsertResult> {
  const start = performance.now();
  try {
    await prisma.auditEvent.create({ data: makeAuditPayload(index) });
    return { durationMs: performance.now() - start, success: true };
  } catch (err) {
    return {
      durationMs: performance.now() - start,
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function percentile(sorted: number[], p: number): number {
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)]!;
}

async function runBulkInsertTest(concurrency: number): Promise<void> {
  console.log(`\nRunning ${concurrency} concurrent audit INSERT operations ...`);

  const wallStart = performance.now();

  // Fire all inserts concurrently — no batching
  const results = await Promise.all(
    Array.from({ length: concurrency }, (_, i) => singleInsert(i)),
  );

  const wallElapsed = performance.now() - wallStart;

  const failures = results.filter(r => !r.success);
  const durations = results
    .filter(r => r.success)
    .map(r => r.durationMs)
    .sort((a, b) => a - b);

  console.log(`\nResults:`);
  console.log(`  Total inserts:     ${concurrency}`);
  console.log(`  Successful:        ${results.length - failures.length}`);
  console.log(`  Failures:          ${failures.length}`);
  console.log(`  Wall-clock total:  ${wallElapsed.toFixed(2)} ms`);
  console.log(`  P50 per-insert:    ${percentile(durations, 50).toFixed(2)} ms`);
  console.log(`  P95 per-insert:    ${percentile(durations, 95).toFixed(2)} ms`);
  console.log(`  P99 per-insert:    ${percentile(durations, 99).toFixed(2)} ms`);
  console.log(`  Min per-insert:    ${durations[0]?.toFixed(2)} ms`);
  console.log(`  Max per-insert:    ${durations[durations.length - 1]?.toFixed(2)} ms`);

  if (failures.length > 0) {
    console.error(`\nFAIL: ${failures.length} insert(s) failed:`);
    for (const f of failures.slice(0, 5)) {
      console.error(`  - ${f.error}`);
    }
    process.exit(1);
  }

  if (wallElapsed >= 100) {
    console.error(
      `\nFAIL: Wall-clock time ${wallElapsed.toFixed(2)} ms exceeds 100 ms target`,
    );
    process.exit(1);
  }

  const p95 = percentile(durations, 95);
  if (p95 >= 50) {
    console.error(
      `\nFAIL: P95 per-insert ${p95.toFixed(2)} ms exceeds 50 ms target`,
    );
    process.exit(1);
  }

  console.log(
    `\nPASS: ${concurrency} concurrent inserts in ${wallElapsed.toFixed(2)} ms (< 100 ms); P95 ${p95.toFixed(2)} ms (< 50 ms)`,
  );
}

async function verifyNoDeadlocks(): Promise<void> {
  console.log('\nVerifying no deadlocks with 3 rounds of 50 concurrent inserts ...');

  for (let round = 1; round <= 3; round++) {
    console.log(`  Round ${round}/3 ...`);
    const results = await Promise.all(
      Array.from({ length: 50 }, (_, i) => singleInsert(i)),
    );
    const deadlocks = results.filter(r => r.error?.includes('deadlock'));
    if (deadlocks.length > 0) {
      console.error(`FAIL: ${deadlocks.length} deadlock(s) detected in round ${round}`);
      process.exit(1);
    }
  }

  console.log('  PASS: No deadlocks in 3 rounds (150 total inserts)');
}

async function main(): Promise<void> {
  await runBulkInsertTest(50);
  await verifyNoDeadlocks();
}

main()
  .catch((err) => {
    console.error('Load test failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
```

### Step 2 — Add the npm script

Update `backend/package.json`:

```json
"scripts": {
  "load-test:audit": "tsx scripts/load-test-audit.ts"
}
```

### Step 3 — Run the load test against staging

```bash
cd backend
npm run load-test:audit
```

**Expected output**:

```
Running 50 concurrent audit INSERT operations ...

Results:
  Total inserts:     50
  Successful:        50
  Failures:          0
  Wall-clock total:  42.37 ms
  P50 per-insert:    18.22 ms
  P95 per-insert:    31.05 ms
  P99 per-insert:    35.11 ms
  Min per-insert:     8.44 ms
  Max per-insert:    37.20 ms

PASS: 50 concurrent inserts in 42.37 ms (< 100 ms); P95 31.05 ms (< 50 ms)

Verifying no deadlocks with 3 rounds of 50 concurrent inserts ...
  Round 1/3 ...
  Round 2/3 ...
  Round 3/3 ...
  PASS: No deadlocks in 3 rounds (150 total inserts)
```

### Step 4 — Understand why audit_events is deadlock-safe

`audit_events` rows are INSERT-only. PostgreSQL deadlocks require two transactions to hold and await locks on rows the other holds. Since rows are never updated after insertion:

- No row-level UPDATE locks are ever acquired
- INSERTs acquire brief share locks on indexes (auto-released after insert)
- The immutability trigger adds ~0.1 ms overhead per row (raises exception on UPDATE/DELETE, which are not exercised in normal operation)

The index `idx_audit_events_entity` and `idx_audit_events_actor` use `createdAt DESC` ordering. Concurrent INSERTs to the same index leaf page are handled by PostgreSQL's HOT (Heap Only Tuple) updates — no index page splitting under normal load at 50 concurrent inserts.

---

## Validation

| Check | Method | Expected Result |
|-------|--------|-----------------|
| All 50 inserts succeed | Load test output | `Successful: 50`, `Failures: 0` |
| Wall-clock < 100 ms | Load test output | `PASS: ... < 100 ms` |
| P95 per-insert < 50 ms | Load test output | `P95 X.XX ms (< 50 ms)` |
| No deadlocks in 3 rounds | Load test output | `PASS: No deadlocks in 3 rounds` |
| Trigger overhead acceptable | P95 within target | Trigger adds ~0.1 ms per INSERT |

---

## Dependencies

- **TASK-001** — `audit_events` table with `user_agent` column must exist
- **TASK-002** — Immutability trigger must be installed (it fires on every INSERT path, adding overhead that must remain within budget)
- **TASK-003** — `auditEvent()` service function (the load test uses the Prisma client directly for precise timing, but validates the same code path)
- Staging Supabase PostgreSQL accessible from the script runner

## Security Constraints

- **OWASP A04 (Insecure Design)**: The load test inserts `entityId: crypto.randomUUID()` and `eventType: 'test.bulk_insert'` rows into the `audit_events` table. These rows persist (cannot be deleted — trigger blocks it). The load test must be run only against staging, never production. Add a guard:

```typescript
if (process.env['NODE_ENV'] === 'production') {
  console.error('ABORT: load-test:audit must not run against production');
  process.exit(1);
}
```

Add this guard as the first line of `main()`.

- The test entity IDs are random UUIDs that do not correspond to real `applications` or `candidates`. They bypass the `entity_id` FK (there is none — `entity_id` is an unbound UUID reference by design, allowing audit events for any entity).

---

## Definition of Done

- [ ] `backend/scripts/load-test-audit.ts` committed with production guard
- [ ] `load-test:audit` npm script added to `package.json`
- [ ] Load test passes on staging: 50 inserts < 100 ms wall-clock
- [ ] Zero deadlocks in 3 rounds (150 total inserts)
- [ ] Load test output saved in `validation-evidence.md` (TASK-005)

## Traceability

| Artefact | ID |
|----------|----|
| User Story | US-003 |
| Epic | EP-DATA |
| Scenario | 4 (50 concurrent inserts < 100 ms; no deadlocks) |
| Spec ref | TR-008.1 |
