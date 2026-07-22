---
id: task_003
us_id: us_004
epic: EP-DATA
title: "Write Database Migration Rollback Runbook with Nullable Column Example"
status: not-started
layer: backend
effort: 3h
priority: high
created: 2026-07-22
---

# TASK-003 — Write Database Migration Rollback Runbook with Nullable Column Example

## Context

**User Story**: US-004 — Prisma Migration Framework with Seed Scripts and Rollback Procedures  
**Epic**: EP-DATA — Data Foundation  
**Addresses Acceptance Criteria**: Scenario 3 (rollback of a nullable column migration executes without data loss)

Prisma does not support automatic rollbacks — `prisma migrate dev` and `prisma migrate deploy` are forward-only. Rollback requires creating a new forward migration that reverses the schema change. The risk of data loss depends on the type of change being reversed: dropping a column is destructive; the runbook must distinguish safe from destructive rollback operations.

---

## Objective

Commit `docs/ops/database-rollback.md` documenting the standard rollback decision tree, the step-by-step runbook for the nullable column case, and a worked example using a `candidate_source` column that can be added and removed safely. Also create a companion `backend/scripts/verify-rollback.ts` script that validates data integrity before and after the rollback.

---

## Technical Specifications

### Migration safety classification

| Change type | Rollback safety | Notes |
|-------------|----------------|-------|
| Add nullable column | Safe — drop column removes it; existing data unaffected | Use `ALTER TABLE ... DROP COLUMN` |
| Add NOT NULL column with default | Safe — drop column removes it | Same as nullable |
| Add new table | Safe — drop table if no data | Destructive if data was written |
| Add index | Safe — drop index non-blocking | `DROP INDEX CONCURRENTLY` |
| Remove column | **Destructive** — data is lost | Must restore from backup |
| Rename column | **Destructive equivalent** — application code breaks | Deploy app rollback first |
| Change column type | **Destructive** — possible data loss | Must restore from backup |

---

## Implementation Steps

### Step 1 — Create the rollback runbook document

Create `backend/docs/ops/database-rollback.md`:

```markdown
# Database Migration Rollback Runbook

**Version**: 1.0  
**Date**: 2026-07-22  
**Owner**: Platform Engineering

---

## Overview

Prisma migrations are **forward-only**. There is no `prisma migrate rollback` command.
Rolling back a schema change requires one of:

1. **Forward rollback migration** — create a new migration that reverses the change (preferred)
2. **Database restore** — restore from the most recent Supabase snapshot (last resort, causes data loss)

Always prefer option 1. Use option 2 only for destructive changes where forward rollback would also lose data.

---

## Decision Tree

```
Is the migration destructive? (DROP COLUMN, TYPE CHANGE, DROP TABLE with data)
├── No (nullable add, index add, new table, default add)
│   └── Use forward rollback migration (this runbook, Step 3)
└── Yes
    ├── Has the column/table been written to by the application?
    │   ├── No → Forward rollback migration (no data loss)
    │   └── Yes → Database restore required (see §Database Restore Runbook)
    └── Has the migration been in production for < 1 hour?
        ├── No → Data loss is significant — contact compliance team
        └── Yes → Restore from most recent snapshot
```

---

## Pre-Rollback Checklist

Before executing any rollback:

- [ ] Confirm staging rollback succeeded before applying to production
- [ ] Notify on-call engineer (production rollbacks require two-person confirmation)
- [ ] Take a manual Supabase snapshot (Project → Backups → Manual Snapshot)
- [ ] Confirm the application version to roll back to is available in Railway
- [ ] Ensure no active writes are in-flight to the affected column/table (check Railway metrics)

---

## Step-by-Step: Rolling Back a Nullable Column Addition

This is the most common safe rollback scenario.

### Example: Rolling back `candidates.candidate_source` (nullable VARCHAR)

**Scenario**: A migration added `candidate_source VARCHAR(100)` to `candidates`. The column is nullable and no application code has written to it yet. We need to remove it.

#### Step 1 — Create the rollback migration

```bash
cd backend
npx prisma migrate dev --create-only --name "rollback_add_candidate_source"
```

Open the generated migration file and paste:

```sql
-- Rollback: remove candidates.candidate_source
-- Safe: column is nullable; no data written; existing rows unaffected.
-- Verified: SELECT COUNT(*) FROM candidates WHERE candidate_source IS NOT NULL = 0

ALTER TABLE candidates DROP COLUMN IF EXISTS candidate_source;
```

> **Always include a verification comment** confirming the data-safety check you ran.

#### Step 2 — Remove the column from `schema.prisma`

Delete the `candidateSource` field from the `Candidate` model:

```diff
- candidateSource String? @db.VarChar(100)
```

#### Step 3 — Verify the rollback migration matches schema.prisma

```bash
npm run migrate:diff
```

Exit 0 confirms no drift.

#### Step 4 — Apply to staging first

```bash
DATABASE_URL=$STAGING_DIRECT_URL npx prisma migrate deploy
```

Verify:
```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'candidates' AND column_name = 'candidate_source';
-- Expected: 0 rows (column gone)
```

#### Step 5 — Confirm existing candidate data is intact

```sql
SELECT COUNT(*) FROM candidates;
-- Must equal the count BEFORE the rollback was applied
```

#### Step 6 — Deploy the rollback to production

```bash
# Via CD pipeline — merge the rollback migration PR to main
# prisma migrate deploy runs automatically before app start (see US-004 / TASK-004)
```

#### Step 7 — Remove the original forward migration from git history?

**Do NOT** delete migration files from `prisma/migrations/`. Each file is a historical record.
Prisma tracks applied migrations in `_prisma_migrations`. The rollback migration is a new entry in the table — both the original and the rollback remain in history. This is expected and correct.

---

## Worked Example — Complete Script

Create `backend/scripts/verify-rollback.ts`:

```typescript
/**
 * Pre/post rollback data integrity checker.
 *
 * Usage:
 *   npx tsx scripts/verify-rollback.ts pre  (before applying rollback migration)
 *   npx tsx scripts/verify-rollback.ts post (after applying rollback migration)
 */
import { PrismaClient } from '@prisma/client';
import fs from 'node:fs';
import path from 'node:path';

const prisma = new PrismaClient();
const SNAPSHOT_FILE = '/tmp/rollback-snapshot.json';

interface Snapshot {
  candidateCount: number;
  applicationCount: number;
  auditEventCount: number;
  timestamp: string;
}

async function takeSnapshot(): Promise<Snapshot> {
  const [candidateCount, applicationCount, auditEventCount] = await Promise.all([
    prisma.candidate.count(),
    prisma.application.count(),
    prisma.auditEvent.count(),
  ]);

  return {
    candidateCount,
    applicationCount,
    auditEventCount,
    timestamp: new Date().toISOString(),
  };
}

async function main(): Promise<void> {
  const mode = process.argv[2];

  if (mode === 'pre') {
    const snapshot = await takeSnapshot();
    fs.writeFileSync(SNAPSHOT_FILE, JSON.stringify(snapshot, null, 2));
    console.log('Pre-rollback snapshot saved:');
    console.table(snapshot);
    console.log(`Snapshot written to ${SNAPSHOT_FILE}`);
    return;
  }

  if (mode === 'post') {
    if (!fs.existsSync(SNAPSHOT_FILE)) {
      console.error('No pre-rollback snapshot found. Run with "pre" first.');
      process.exit(1);
    }

    const before: Snapshot = JSON.parse(fs.readFileSync(SNAPSHOT_FILE, 'utf-8'));
    const after = await takeSnapshot();

    console.log('\nData integrity check:');
    const checks = [
      ['candidates', before.candidateCount, after.candidateCount],
      ['applications', before.applicationCount, after.applicationCount],
      ['audit_events', before.auditEventCount, after.auditEventCount],
    ] as const;

    let allPassed = true;
    for (const [table, b, a] of checks) {
      const pass = b === a;
      if (!pass) allPassed = false;
      console.log(`  ${pass ? 'PASS' : 'FAIL'} ${table}: before=${b}, after=${a}`);
    }

    if (!allPassed) {
      console.error('\nFAIL: Row count mismatch — data may have been lost during rollback.');
      process.exit(1);
    }

    console.log('\nPASS: All row counts match — rollback completed without data loss.');
    fs.unlinkSync(SNAPSHOT_FILE);
    return;
  }

  console.error('Usage: npx tsx scripts/verify-rollback.ts [pre|post]');
  process.exit(1);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
```

Add to `package.json`:

```json
"rollback:pre":  "tsx scripts/verify-rollback.ts pre",
"rollback:post": "tsx scripts/verify-rollback.ts post"
```

---

## Emergency Database Restore Procedure

> Use only when a forward rollback migration would cause data loss.

1. Open Supabase dashboard → Project → Database → Backups
2. Select the most recent snapshot before the offending migration was applied
3. Click **Restore** — confirm in the confirmation modal
4. After restore completes (~5 min), run `npx prisma migrate status` to confirm state
5. Re-deploy the application version that matches the restored schema

**Estimated restore time**: 5–15 minutes depending on database size. Plan for API downtime during this window.

---

## Cross-References

| Topic | Reference |
|-------|-----------|
| Applying migrations in CD | US-004 / TASK-004 |
| Zero-downtime migration patterns | US-004 / TASK-004 §Zero-Downtime Guidelines |
| Drift detection in CI | US-004 / TASK-001 |
| Supabase backup schedule | [Supabase docs — Point-in-time recovery](https://supabase.com/docs/guides/platform/backups) |
```

### Step 2 — Add npm scripts

Update `backend/package.json`:

```json
"scripts": {
  "rollback:pre":  "tsx scripts/verify-rollback.ts pre",
  "rollback:post": "tsx scripts/verify-rollback.ts post"
}
```

### Step 3 — Demonstrate the nullable column scenario on staging

To validate Scenario 3, execute the full add-then-rollback lifecycle on the staging database:

```bash
# Step A: Create a test migration that adds a nullable column
cd backend
npx prisma migrate dev --create-only --name "test_add_candidate_source"
# Add to generated SQL:
#   ALTER TABLE candidates ADD COLUMN candidate_source VARCHAR(100);
npx prisma migrate deploy

# Step B: Verify column exists
npx prisma db execute --stdin <<'SQL'
SELECT column_name FROM information_schema.columns
WHERE table_name = 'candidates' AND column_name = 'candidate_source';
SQL
# Expected: 1 row

# Step C: Take pre-rollback snapshot
npm run rollback:pre

# Step D: Create and apply rollback migration
npx prisma migrate dev --create-only --name "rollback_test_candidate_source"
# Add to SQL: ALTER TABLE candidates DROP COLUMN IF EXISTS candidate_source;
npx prisma migrate deploy

# Step E: Verify post-rollback integrity
npm run rollback:post
# Expected: PASS: All row counts match
```

---

## Validation

| Check | Method | Expected Result |
|-------|--------|-----------------|
| `database-rollback.md` committed | File exists | Document present at `docs/ops/database-rollback.md` |
| `verify-rollback.ts` script works | `npm run rollback:pre && npm run rollback:post` | PASS: All row counts match |
| Nullable column add → rollback | Scenario 3 lifecycle on staging | Column removed; no data loss |
| Runbook cross-references valid | Review links | All referenced files exist |

---

## Dependencies

- **EP-DATA / US-001–003** — Database tables exist to measure row counts
- Staging Supabase accessible for the demonstration scenario

## Security Constraints

- **OWASP A05 (Security Misconfiguration)**: The rollback runbook explicitly warns against deleting migration files from `prisma/migrations/`. Deletion of migration history would break `prisma migrate status` and cause drift detection to give false negatives.
- The `verify-rollback.ts` script writes a snapshot file to `/tmp/rollback-snapshot.json`. This file contains row counts only — no PII or data contents. It is automatically deleted by the `post` command.
- Production rollbacks require a manual Supabase snapshot before execution. This is a procedural control documented in the Pre-Rollback Checklist and must be followed; it cannot be automated.

---

## Definition of Done

- [ ] `backend/docs/ops/database-rollback.md` committed with decision tree, runbook, and cross-references
- [ ] `backend/scripts/verify-rollback.ts` committed
- [ ] `rollback:pre` and `rollback:post` npm scripts added
- [ ] Nullable column add → rollback scenario executed on staging
- [ ] `npm run rollback:post` exits 0 (no data loss)

## Traceability

| Artefact | ID |
|----------|----|
| User Story | US-004 |
| Epic | EP-DATA |
| Scenario | 3 (nullable column add rollback without data loss) |
| Spec ref | TR-008 (data integrity and migration management) |
