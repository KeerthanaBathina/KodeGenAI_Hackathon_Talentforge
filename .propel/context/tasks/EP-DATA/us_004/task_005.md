---
id: task_005
us_id: us_004
epic: EP-DATA
title: "Validate All Migration Framework Scenarios and Sign Off US-004 DoD"
status: not-started
layer: backend
effort: 3h
priority: high
created: 2026-07-22
---

# TASK-005 — Validate All Migration Framework Scenarios and Sign Off US-004 DoD

## Context

**User Story**: US-004 — Prisma Migration Framework with Seed Scripts and Rollback Procedures  
**Epic**: EP-DATA — Data Foundation  
**Addresses Acceptance Criteria**: All 4 scenarios validated end-to-end; US-004 status updated to `done`

This task executes all four acceptance-criteria scenarios defined in the US-004 user story and records the evidence in a validation document. It is the final quality gate before marking US-004 done and updating the epic-level progress tracker.

---

## Objective

Run each scenario against the staging environment, capture evidence, commit `docs/validation/ep_data_us_004_validation_evidence.md`, and update `.propel/context/epics/EP-DATA.md` to reflect US-004 completion.

---

## Technical Specifications

| Scenario | Acceptance Criterion | Validation Method |
|----------|---------------------|-------------------|
| 1 | CI fails with "database drift detected" when unapplied migration exists | Intentional drift on staging, confirm CI failure annotation |
| 2 | `npx prisma db seed` populates dev DB with at least one candidate, recruiter, HR user, requisition, and application | Fresh local DB, run seed, query entity counts |
| 3 | Rollback of nullable column migration completes without data loss | `verify-rollback.ts pre/post` exits 0 |
| 4 | `prisma migrate deploy` runs before app start; health endpoint stays responsive | `test-zero-downtime-migration.ts` reports 100% success rate |

---

## Implementation Steps

### Step 1 — Validate Scenario 1: Drift Detection

```bash
# 1. Apply a raw SQL change directly to staging to simulate drift
npx prisma db execute \
  --url "$STAGING_DIRECT_URL" \
  --stdin <<'SQL'
ALTER TABLE applications ADD COLUMN drift_test_col TEXT;
SQL

# 2. Push any branch to GitHub and open a PR
# 3. Observe the CI workflow in GitHub Actions
# 4. Verify the "Migration Drift Check" job fails with the annotation:
#    ::error title=Database Drift Detected::...

# 5. Clean up: remove the drift column
npx prisma db execute \
  --url "$STAGING_DIRECT_URL" \
  --stdin <<'SQL'
ALTER TABLE applications DROP COLUMN IF EXISTS drift_test_col;
SQL
```

**Expected evidence**:
- CI job `Migration Drift Check` shows status: Failure
- GitHub Actions log includes `::error title=Database Drift Detected::`
- SQL diff output shows `ALTER TABLE applications ADD COLUMN drift_test_col TEXT;`

---

### Step 2 — Validate Scenario 2: Dev Seed

```bash
# 1. Create a fresh local Postgres or point to a local Supabase instance
# 2. Apply all migrations
NODE_ENV=development npx prisma migrate deploy

# 3. Run the dev seed
NODE_ENV=development npx prisma db seed

# 4. Query entity counts
npx prisma db execute --stdin <<'SQL'
SELECT 'users'        AS entity, COUNT(*) AS count FROM users
UNION ALL
SELECT 'candidates',           COUNT(*) FROM candidates
UNION ALL
SELECT 'requisitions',         COUNT(*) FROM requisitions
UNION ALL
SELECT 'applications',         COUNT(*) FROM applications
UNION ALL
SELECT 'screenings',           COUNT(*) FROM screenings;
SQL
```

**Expected evidence**:
| Entity | Expected min. count |
|--------|-------------------|
| users | ≥ 5 (admin, recruiter, hr_reviewer, hr_manager, tech_interviewer) |
| candidates | ≥ 2 |
| requisitions | ≥ 1 |
| applications | ≥ 2 (at least one shortlisted, one submitted) |
| screenings | ≥ 1 |

```bash
# 5. Confirm idempotency — re-run seed
NODE_ENV=development npx prisma db seed
# Row counts must not increase
```

---

### Step 3 — Validate Scenario 3: Rollback Runbook

```bash
# 1. Take pre-rollback snapshot
DATABASE_URL=$STAGING_DIRECT_URL npm run rollback:pre

# 2. Create and apply test migration (add nullable column)
npx prisma migrate dev --create-only --name "test_validate_rollback_us004"
# Paste into generated SQL file:
# ALTER TABLE applications ADD COLUMN rollback_test_col TEXT;
DATABASE_URL=$STAGING_DIRECT_URL npx prisma migrate deploy

# 3. Verify column exists
npx prisma db execute --url "$STAGING_DIRECT_URL" --stdin <<'SQL'
SELECT column_name FROM information_schema.columns
WHERE table_name = 'applications' AND column_name = 'rollback_test_col';
SQL
# Expected: 1 row

# 4. Create and apply rollback migration
npx prisma migrate dev --create-only --name "rollback_test_validate_us004"
# Paste into generated SQL file:
# ALTER TABLE applications DROP COLUMN IF EXISTS rollback_test_col;
DATABASE_URL=$STAGING_DIRECT_URL npx prisma migrate deploy

# 5. Verify column is gone
npx prisma db execute --url "$STAGING_DIRECT_URL" --stdin <<'SQL'
SELECT column_name FROM information_schema.columns
WHERE table_name = 'applications' AND column_name = 'rollback_test_col';
SQL
# Expected: 0 rows

# 6. Verify data integrity
DATABASE_URL=$STAGING_DIRECT_URL npm run rollback:post
# Expected: PASS: All row counts match — rollback completed without data loss.
```

---

### Step 4 — Validate Scenario 4: Zero-Downtime Deployment

```bash
# 1. Create a new index migration (additive — safe for zero-downtime test)
npx prisma migrate dev --create-only --name "test_zdt_index_us004"
# Paste into generated SQL file:
# CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_applications_zdt_test
#   ON applications (id);

# 2. Push the migration and trigger a Railway deployment
# (Merge PR or manually deploy in Railway dashboard)

# 3. Immediately run the zero-downtime test script in a separate terminal
BACKEND_URL=https://your-backend.railway.app npm run zero-downtime:test

# 4. Wait for the 60-second polling window to complete
# Expected output:
#   Total polls:  120
#   Successful:   120 (100.0%)
#   Failed:       0
#   PASS: Zero downtime confirmed — 100% success rate during deployment.

# 5. Verify Railway deployment logs show migration ran before server start:
#   "Running prisma migrate deploy..."
#   "Applied 1 migration"
#   "Server listening on port 3001"
```

---

### Step 5 — Commit validation evidence document

Create `backend/docs/validation/ep_data_us_004_validation_evidence.md`:

```markdown
# EP-DATA / US-004 — Migration Framework Validation Evidence

**Date**: YYYY-MM-DD  
**Validated by**: <GitHub handle>  
**Environment**: Staging (Supabase) + Railway backend

## Scenario 1: CI Drift Detection

| Check | Result |
|-------|--------|
| Raw SQL drift applied to staging | ✓ |
| CI "Migration Drift Check" job failed | ✓ |
| `::error title=Database Drift Detected::` annotation present | ✓ |
| SQL diff in CI log shows the drifted DDL | ✓ |
| Drift cleaned up; CI passes on clean state | ✓ |

**Screenshot / CI run URL**: <paste URL>

---

## Scenario 2: Dev Seed

| Entity | Count (before seed) | Count (after seed) | Count (after re-seed) |
|--------|--------------------|--------------------|----------------------|
| users | 0 | X | X (no change) |
| candidates | 0 | X | X (no change) |
| requisitions | 0 | X | X (no change) |
| applications | 0 | X | X (no change) |
| screenings | 0 | X | X (no change) |

**Notes**: All `upsert` operations are idempotent on fixed UUIDs.

---

## Scenario 3: Rollback Without Data Loss

| Step | Result |
|------|--------|
| Pre-rollback snapshot captured | ✓ |
| Nullable column added (`rollback_test_col TEXT`) | ✓ |
| Column visible in `information_schema.columns` | ✓ |
| Rollback migration created and deployed | ✓ |
| Column absent from `information_schema.columns` | ✓ |
| `verify-rollback.ts post` exits 0 | ✓ |
| Row counts unchanged | ✓ |

---

## Scenario 4: Zero-Downtime Deployment

| Metric | Value |
|--------|-------|
| Poll interval | 500ms |
| Duration | 60s |
| Total polls | 120 |
| Successful (2xx) | 120 |
| Failed | 0 |
| Success rate | 100.0% |

**Railway deploy log**: Migration lines appear before "Server listening" line ✓

---

## Definition of Done Checklist

- [ ] Scenario 1 CI failure confirmed
- [ ] Scenario 2 entity counts meet minimum requirements
- [ ] Scenario 3 `rollback:post` exits 0
- [ ] Scenario 4 100% health check success rate
- [ ] All task files `task_001` through `task_005` have status `not-started` updated to `done`
- [ ] `EP-DATA.md` updated: US-004 status → `done`
```

### Step 6 — Update US-004 user story and EP-DATA epic status

Update `.propel/context/epics/EP-DATA.md` to mark US-004 as done and update the EP-DATA progress summary.

If the user story file `.propel/context/user-stories/EP-DATA/us_004.md` has a `status` field in its front matter, update it from `in-progress` to `done`.

---

## Validation

| Check | Method | Expected Result |
|-------|--------|-----------------|
| Scenario 1: drift CI failure | GitHub Actions log | "Database Drift Detected" annotation |
| Scenario 2: entity counts | SQL query | ≥ 5 users, ≥ 2 candidates, ≥ 1 requisition, ≥ 2 applications, ≥ 1 screening |
| Scenario 2: idempotency | Re-run seed | Row counts unchanged |
| Scenario 3: rollback:post exits 0 | Terminal | "PASS: All row counts match" |
| Scenario 4: zero-downtime script | Terminal | "100.0%" success rate, exit 0 |
| Evidence doc committed | File exists | `docs/validation/ep_data_us_004_validation_evidence.md` |
| US-004 marked done | `.propel/context/epics/EP-DATA.md` | `status: done` |

---

## Dependencies

- **US-004 / TASK-001** — Drift detection CI job deployed
- **US-004 / TASK-002** — Dev seed scripts available
- **US-004 / TASK-003** — `verify-rollback.ts` and npm scripts available
- **US-004 / TASK-004** — Railway startCommand updated, `zero-downtime:test` script available
- Staging Supabase accessible via `STAGING_DIRECT_URL`
- Railway backend deployed and `/health` accessible

## Security Constraints

- **OWASP A05 (Security Misconfiguration)**: The drift column (`drift_test_col`) added in Scenario 1 must be cleaned up immediately after the test. A forgotten test column in staging is benign but inconsistent with the drift-free baseline required for the CI check.
- **OWASP A07 (Identification and Authentication Failures)**: Scenario 2 dev seed creates users with deterministic IDs. Confirm that `seed.dev.ts` cannot be invoked in staging or production (enforced by the `NODE_ENV === 'production'` guard and the `seed.staging.ts` router).

---

## Definition of Done

- [ ] All 4 scenario validations executed on staging
- [ ] `docs/validation/ep_data_us_004_validation_evidence.md` committed with evidence table filled in
- [ ] US-004 status updated to `done` in `.propel/context/epics/EP-DATA.md`
- [ ] All task_00X.md files for US-004 updated to `status: done`

## Traceability

| Artefact | ID |
|----------|----|
| User Story | US-004 |
| Epic | EP-DATA |
| Scenarios covered | 1, 2, 3, 4 |
| Spec ref | TR-008 (data integrity and migration management) |
