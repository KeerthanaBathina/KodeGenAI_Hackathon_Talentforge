---
id: task_003
us_id: us_001
epic: EP-DATA
title: "Add Composite Indexes for High-Frequency Query Patterns and Validate P95 < 50ms"
status: not-started
layer: backend
effort: 4h
priority: critical
created: 2026-07-22
---

# TASK-003 — Add Composite Indexes for High-Frequency Query Patterns and Validate P95 < 50ms

## Context

**User Story**: US-001 — Core Domain Schema — Candidates, Applications, Screenings, and Reviews  
**Epic**: EP-DATA — Data Foundation  
**Addresses Acceptance Criteria**: Scenario 4 (100 000 application rows, filter by `(requisition_id, status)` → `EXPLAIN ANALYZE` shows index scan, execution time < 50 ms P95)

PostgreSQL performs sequential scans on unindexed columns. At 100 000 rows a sequential scan on `applications` for a given requisition's candidates would take ~200–800 ms depending on I/O. Composite indexes on the most common filter combinations eliminate full-table scans and keep API response times inside the 200 ms SLA.

---

## Objective

Analyse the high-frequency query patterns from the spec (HR review queue, screening queue, decision dashboard, audit feed, communication retry queue), add `@@index` directives to the Prisma schema for each pattern, generate and apply a migration, and write a validation script that loads 100 000 `applications` rows and confirms P95 `EXPLAIN ANALYZE` execution time < 50 ms for the `(requisition_id, status)` filter.

---

## Technical Specifications

| Index Name | Table | Columns | Query Pattern |
|-----------|-------|---------|--------------|
| `idx_applications_requisition_status` | `applications` | `(requisition_id, status)` | HR review queue: all applications for a requisition filtered by status |
| `idx_applications_candidate_status` | `applications` | `(candidate_id, status)` | Candidate portal: show own applications by status |
| `idx_applications_status_submitted_at` | `applications` | `(status, submitted_at DESC)` | Pipeline dashboard: all applications in a given status ordered by date |
| `idx_screenings_application_version` | `screenings` | `(application_id, version DESC)` | Fetch latest screening result for an application |
| `idx_reviews_application_decided_at` | `reviews` | `(application_id, decided_at DESC)` | Audit trail: reviews for an application ordered newest first |
| `idx_interview_stages_application_type` | `interview_stages` | `(application_id, type)` | Check if an application has completed a specific interview stage type |
| `idx_communications_application_status` | `communications` | `(application_id, status)` | Communication retry queue: failed/bounced emails per application |
| `idx_audit_events_entity` | `audit_events` | `(entity_type, entity_id, created_at DESC)` | Audit feed: all events for a given entity ordered newest first |
| `idx_audit_events_actor` | `audit_events` | `(actor_id, created_at DESC)` | Audit feed: all events performed by a given user |

---

## Implementation Steps

### Step 1 — Add `@@index` directives to Prisma models

Open `backend/prisma/schema.prisma` and add the indexes as shown. Each `@@index` is placed at the end of the relevant model's body:

**`Application` model** — add after the `@@map` line:

```prisma
  @@index([requisitionId, status], name: "idx_applications_requisition_status")
  @@index([candidateId, status], name: "idx_applications_candidate_status")
  @@index([status, submittedAt(sort: Desc)], name: "idx_applications_status_submitted_at")
```

**`Screening` model** — add after `@@map`:

```prisma
  @@index([applicationId, version(sort: Desc)], name: "idx_screenings_application_version")
```

**`Review` model** — add after `@@map`:

```prisma
  @@index([applicationId, decidedAt(sort: Desc)], name: "idx_reviews_application_decided_at")
```

**`InterviewStage` model** — add after `@@map`:

```prisma
  @@index([applicationId, type], name: "idx_interview_stages_application_type")
```

**`Communication` model** — add after `@@map`:

```prisma
  @@index([applicationId, status], name: "idx_communications_application_status")
```

**`AuditEvent` model** — add after `@@map`:

```prisma
  @@index([entityType, entityId, createdAt(sort: Desc)], name: "idx_audit_events_entity")
  @@index([actorId, createdAt(sort: Desc)], name: "idx_audit_events_actor")
```

### Step 2 — Generate the index migration

```bash
cd backend
npx prisma migrate dev --name "add_query_indexes"
```

Verify the generated SQL contains `CREATE INDEX` statements (not `UNIQUE INDEX`):

```bash
cat backend/prisma/migrations/*_add_query_indexes/migration.sql
```

Expected: 9 `CREATE INDEX` statements matching the names in the Technical Specifications table.

### Step 3 — Create the 100k-row load test script

Create `backend/scripts/load-test-indexes.ts`:

```typescript
import { PrismaClient } from '@prisma/client';
import crypto from 'node:crypto';

const prisma = new PrismaClient();

async function seed100kApplications(): Promise<void> {
  // Check if seed data already exists
  const existing = await prisma.application.count();
  if (existing >= 100_000) {
    console.log(`Seed already present: ${existing} rows`);
    return;
  }

  console.log('Seeding 100 000 application rows ...');

  // Create prerequisite records
  const userId = crypto.randomUUID();
  await prisma.user.upsert({
    where: { email: 'seed-user@test.internal' },
    update: {},
    create: {
      id: userId,
      email: 'seed-user@test.internal',
      role: 'recruiter',
      fullName: 'Seed User',
    },
  });

  const jobFamily = await prisma.jobFamily.create({
    data: {
      name: 'Seed Family',
      matchScoreThreshold: 70,
      confidenceThreshold: 0.8,
      experienceThresholdYears: 3,
      effectiveFrom: new Date(),
      createdById: userId,
    },
  });

  // Create 10 requisitions
  const requisitions = await Promise.all(
    Array.from({ length: 10 }, (_, i) =>
      prisma.requisition.create({
        data: {
          title: `Test Requisition ${i}`,
          department: 'Engineering',
          jobFamilyId: jobFamily.id,
          location: 'Remote',
          jobType: 'full_time',
          slots: 10_000,
          status: 'open',
          eligibilityCriteria: {},
          openedAt: new Date(),
        },
      }),
    ),
  );

  const statuses: Array<'submitted' | 'screening' | 'shortlisted' | 'rejected'> = [
    'submitted', 'screening', 'shortlisted', 'rejected',
  ];

  // Batch-insert 100k applications in chunks of 1000
  const batchSize = 1000;
  const totalRows = 100_000;

  for (let offset = 0; offset < totalRows; offset += batchSize) {
    const candidates = await Promise.all(
      Array.from({ length: batchSize }, () =>
        prisma.candidate.create({
          data: {
            email: `seed-${crypto.randomUUID()}@example.com`,
            phone: `+1${Math.floor(Math.random() * 9_000_000_000 + 1_000_000_000)}`,
            consentVersion: '1.0',
            consentTimestamp: new Date(),
            status: 'active',
          },
        }),
      ),
    );

    await prisma.application.createMany({
      data: candidates.map((c, i) => ({
        candidateId: c.id,
        requisitionId: requisitions[(offset + i) % requisitions.length]!.id,
        status: statuses[Math.floor(Math.random() * statuses.length)]!,
        submittedAt: new Date(Date.now() - Math.random() * 30 * 24 * 3600 * 1000),
      })),
    });

    if ((offset + batchSize) % 10_000 === 0) {
      console.log(`  ... ${offset + batchSize} rows inserted`);
    }
  }

  console.log('Seed complete.');
}

async function runExplainAnalyze(requisitionId: string): Promise<number> {
  const result = await prisma.$queryRaw<Array<{ 'QUERY PLAN': string }>>`
    EXPLAIN (ANALYZE, FORMAT TEXT, BUFFERS)
    SELECT id, status, submitted_at
    FROM applications
    WHERE requisition_id = ${requisitionId}::uuid
      AND status IN ('submitted', 'screening')
    ORDER BY submitted_at DESC
    LIMIT 50
  `;

  const plan = result.map(r => r['QUERY PLAN']).join('\n');

  // Confirm index scan is used
  if (!plan.includes('Index Scan') && !plan.includes('Index Only Scan') && !plan.includes('Bitmap Index Scan')) {
    throw new Error(`Sequential scan detected!\n${plan}`);
  }

  // Extract "Execution Time: X.XXX ms"
  const match = /Execution Time:\s+([\d.]+) ms/.exec(plan);
  if (!match || !match[1]) throw new Error(`Could not parse execution time from plan:\n${plan}`);
  return parseFloat(match[1]);
}

async function main(): Promise<void> {
  await seed100kApplications();

  // Pick the requisition with the most applications
  const [topRequisition] = await prisma.$queryRaw<Array<{ requisition_id: string; cnt: bigint }>>`
    SELECT requisition_id, COUNT(*) as cnt
    FROM applications
    GROUP BY requisition_id
    ORDER BY cnt DESC
    LIMIT 1
  `;

  if (!topRequisition) throw new Error('No applications found');

  console.log(`\nRunning EXPLAIN ANALYZE on requisition_id = ${topRequisition.requisition_id}`);
  console.log(`Row count for this requisition: ${topRequisition.cnt}`);

  // Run 10 iterations and collect execution times
  const times: number[] = [];
  for (let i = 0; i < 10; i++) {
    times.push(await runExplainAnalyze(topRequisition.requisition_id));
  }

  times.sort((a, b) => a - b);
  const p50 = times[Math.floor(times.length * 0.5)]!;
  const p95 = times[Math.floor(times.length * 0.95)]!;
  const p99 = times[Math.floor(times.length * 0.99) ?? times.length - 1]!;

  console.log('\nResults:');
  console.log(`  P50: ${p50.toFixed(3)} ms`);
  console.log(`  P95: ${p95.toFixed(3)} ms`);
  console.log(`  P99: ${p99.toFixed(3)} ms`);

  if (p95 >= 50) {
    throw new Error(`P95 ${p95.toFixed(3)} ms exceeds the 50 ms target — check index usage`);
  }

  console.log(`\nPASS: P95 ${p95.toFixed(3)} ms < 50 ms target`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
```

Add script to `backend/package.json`:

```json
"scripts": {
  "load-test:indexes": "tsx scripts/load-test-indexes.ts"
}
```

### Step 4 — Run the load test against staging

```bash
cd backend
npm run load-test:indexes
```

Expected output:

```
Seeding 100 000 application rows ...
  ... 10 000 rows inserted
  ...
  ... 100 000 rows inserted
Seed complete.

Running EXPLAIN ANALYZE on requisition_id = <uuid>
Row count for this requisition: 10000

Results:
  P50:  0.312 ms
  P95:  1.847 ms
  P99:  2.103 ms

PASS: P95 1.847 ms < 50 ms target
```

### Step 5 — Document index coverage

Create `docs/architecture/data-model.md` (or update if it already exists) with the index table from Technical Specifications to serve as the living ERD reference.

---

## Validation

| Check | Method | Expected Result |
|-------|--------|-----------------|
| Migration SQL has 9 CREATE INDEX statements | `cat migration.sql \| grep -c "CREATE INDEX"` | `9` |
| `EXPLAIN ANALYZE` shows index scan | Script output | `Index Scan` or `Bitmap Index Scan` in plan |
| P95 execution time < 50 ms | Script output | `PASS: P95 X.XXX ms < 50 ms target` |
| Index names match spec | `\di` in psql | All 9 index names present |
| `prisma migrate status` | CLI | No pending migrations |
| `npm run type-check` | CLI | Exit 0 |

---

## Dependencies

- **TASK-002** must be complete (all 19 tables exist — indexes reference their columns)
- Staging database must be accessible for the load test

## Security Constraints

- **OWASP A04 (Insecure Design)**: The load test script creates synthetic `candidates` and `applications` rows. The seed emails use `@example.com` and `@test.internal` domains, which are reserved and guaranteed not to belong to real people. The script must **not** be run against the production database.
- The load test script uses `tsx` (TypeScript execute) which requires `tsconfig.json` — it must not be included in the production Docker image. Add `scripts/` to `.dockerignore`.
- `EXPLAIN (ANALYZE, BUFFERS)` returns execution metadata only — it does not return actual data rows. There is no PII leakage risk from running the EXPLAIN query.

---

## Definition of Done

- [ ] 9 `@@index` directives added to `schema.prisma`
- [ ] Migration `add_query_indexes` generated with 9 `CREATE INDEX` statements
- [ ] `backend/scripts/load-test-indexes.ts` committed
- [ ] `load-test:indexes` npm script added to `package.json`
- [ ] P95 < 50 ms confirmed on staging (script output saved in `validation-evidence.md`)
- [ ] `EXPLAIN ANALYZE` confirms index scan (not sequential scan)
- [ ] Index coverage documented in `docs/architecture/data-model.md`
- [ ] `npm run type-check` exits 0

## Traceability

| Artefact | ID |
|----------|----|
| User Story | US-001 |
| Epic | EP-DATA |
| Scenario | 4 (`EXPLAIN ANALYZE` index scan, P95 < 50 ms at 100 000 rows) |
| Spec ref | §7.3 (integrity constraints), TR-008.6 (connection pooling) |
