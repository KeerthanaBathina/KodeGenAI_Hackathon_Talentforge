---
id: task_005
us_id: us_001
epic: EP-DATA
title: "Validate All Schema Scenarios — FK Integrity, Unique Constraints, Index Performance, RLS — DoD Sign-off"
status: not-started
layer: backend
effort: 3h
priority: critical
created: 2026-07-22
---

# TASK-005 — Validate All Schema Scenarios — FK Integrity, Unique Constraints, Index Performance, RLS — DoD Sign-off

## Context

**User Story**: US-001 — Core Domain Schema — Candidates, Applications, Screenings, and Reviews  
**Epic**: EP-DATA — Data Foundation  
**Addresses**: All 5 acceptance criteria scenarios + all Definition of Done items

This task runs structured validation evidence for each acceptance criterion, collects terminal output and `EXPLAIN ANALYZE` output as proof artefacts, updates the user story status to `done`, and confirms the ERD is documented.

---

## Objective

Execute each scenario validation in sequence against the staging Supabase PostgreSQL instance, collect evidence, confirm all 5 scenarios pass, and update `us_001.md` to `status: done`.

---

## Pre-Validation Checklist

| Task | Description | Status |
|------|-------------|--------|
| TASK-001 | Foundation models + ENUMs migrated | ☐ Complete |
| TASK-002 | Pipeline models + FK onDelete policies migrated | ☐ Complete |
| TASK-003 | Composite indexes migrated + load test passed | ☐ Complete |
| TASK-004 | RLS policies migrated + RLS test passed | ☐ Complete |

---

## Validation Scenarios

### Scenario 1 — All Tables Exist with Correct Columns

**Acceptance Criterion**: All tables exist with correct column types, NOT NULL constraints, and default values.

#### Step 1a — Migration status check

```bash
cd backend
npx prisma migrate status
```

**Expected**:

```
Database schema is up to date!
```

#### Step 1b — Table count verification

```bash
npx prisma db execute --stdin <<'SQL'
SELECT COUNT(*) AS table_count
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_type = 'BASE TABLE';
SQL
```

**Expected**: `table_count = 19`

#### Step 1c — Column spot-check for core tables

```bash
npx prisma db execute --stdin <<'SQL'
SELECT
  table_name,
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('candidates', 'applications', 'screenings', 'users')
ORDER BY table_name, ordinal_position;
SQL
```

**Verification checklist**:
- [ ] `candidates.email` — `character varying(255)`, `NOT NULL`, no default
- [ ] `candidates.status` — enum type, `NOT NULL`, default `'pending'`
- [ ] `applications.status` — enum type, `NOT NULL`, default `'submitted'`
- [ ] `applications.candidate_id` — `uuid`, `NOT NULL`
- [ ] `applications.requisition_id` — `uuid`, `NOT NULL`
- [ ] `screenings.score` — `integer`, `NOT NULL`
- [ ] `screenings.confidence` — `numeric(5,4)`, `NOT NULL`
- [ ] `users.role` — enum type, `NOT NULL`

**Evidence**: Paste SQL output in `validation-evidence.md`.

---

### Scenario 2 — Foreign Key Integrity Enforced

**Acceptance Criterion**: DELETE on `requisitions` blocked when open applications reference it.

#### Step 2 — FK violation test

```bash
npx prisma db execute --stdin <<'SQL'
DO $$
DECLARE
  v_user_id    uuid := gen_random_uuid();
  v_jf_id      uuid := gen_random_uuid();
  v_req_id     uuid := gen_random_uuid();
  v_cand_id    uuid := gen_random_uuid();
  v_result     text;
BEGIN
  -- Setup: insert minimal prerequisite rows
  INSERT INTO users (id, email, role, full_name)
    VALUES (v_user_id, 'fk-test-user@test.internal', 'recruiter', 'FK Test');

  INSERT INTO job_families (id, name, match_score_threshold, confidence_threshold,
                            experience_threshold_years, effective_from, created_by_id)
    VALUES (v_jf_id, 'FK Test Family', 70, 0.8, 3, now(), v_user_id);

  INSERT INTO requisitions (id, title, department, job_family_id, location, job_type,
                            slots, status, eligibility_criteria, opened_at)
    VALUES (v_req_id, 'FK Test Req', 'Eng', v_jf_id, 'Remote', 'full_time',
            5, 'open', '{}', now());

  INSERT INTO candidates (id, email, phone, consent_version, consent_timestamp, status)
    VALUES (v_cand_id, 'fk-test-cand@example.com', '+10000000001', '1.0', now(), 'active');

  INSERT INTO applications (id, candidate_id, requisition_id, status, submitted_at)
    VALUES (gen_random_uuid(), v_cand_id, v_req_id, 'submitted', now());

  -- Attempt the FK-violating DELETE
  BEGIN
    DELETE FROM requisitions WHERE id = v_req_id;
    v_result := 'FAIL: DELETE succeeded — FK constraint is MISSING';
  EXCEPTION WHEN foreign_key_violation THEN
    v_result := 'PASS: DELETE blocked by FK constraint (foreign_key_violation raised)';
  END;

  RAISE NOTICE '%', v_result;

  -- Rollback all test data
  ROLLBACK;
END $$;
SQL
```

**Expected output**:

```
NOTICE:  PASS: DELETE blocked by FK constraint (foreign_key_violation raised)
```

**Evidence**: Paste terminal output in `validation-evidence.md`.

---

### Scenario 3 — Unique Constraints Prevent Duplicates

**Acceptance Criterion**: Second INSERT with duplicate `candidates.email` raises unique constraint violation.

#### Step 3 — Unique constraint test

```bash
npx prisma db execute --stdin <<'SQL'
DO $$
DECLARE
  v_result text;
BEGIN
  -- First insert
  INSERT INTO candidates (id, email, phone, consent_version, consent_timestamp, status)
    VALUES (gen_random_uuid(), 'unique-test@example.com', '+19000000001', '1.0', now(), 'active');

  -- Second insert — same email, different phone
  BEGIN
    INSERT INTO candidates (id, email, phone, consent_version, consent_timestamp, status)
      VALUES (gen_random_uuid(), 'unique-test@example.com', '+19000000002', '1.0', now(), 'active');
    v_result := 'FAIL: Duplicate email INSERT succeeded — UNIQUE constraint is MISSING';
  EXCEPTION WHEN unique_violation THEN
    v_result := 'PASS: Duplicate email rejected (unique_violation raised)';
  END;

  RAISE NOTICE '%', v_result;
  ROLLBACK;
END $$;
SQL
```

**Expected output**:

```
NOTICE:  PASS: Duplicate email rejected (unique_violation raised)
```

Also verify the unique constraint on `candidates.phone`:

```bash
npx prisma db execute --stdin <<'SQL'
DO $$
DECLARE
  v_result text;
BEGIN
  INSERT INTO candidates (id, email, phone, consent_version, consent_timestamp, status)
    VALUES (gen_random_uuid(), 'phone-test-1@example.com', '+19000000099', '1.0', now(), 'active');

  BEGIN
    INSERT INTO candidates (id, email, phone, consent_version, consent_timestamp, status)
      VALUES (gen_random_uuid(), 'phone-test-2@example.com', '+19000000099', '1.0', now(), 'active');
    v_result := 'FAIL: Duplicate phone INSERT succeeded — UNIQUE constraint is MISSING';
  EXCEPTION WHEN unique_violation THEN
    v_result := 'PASS: Duplicate phone rejected (unique_violation raised)';
  END;

  RAISE NOTICE '%', v_result;
  ROLLBACK;
END $$;
SQL
```

**Evidence**: Paste both outputs in `validation-evidence.md`.

---

### Scenario 4 — Indexed Queries Perform Within P95 Target

**Acceptance Criterion**: 100 000 application rows; filter `(requisition_id, status)` uses index scan; execution time P95 < 50 ms.

#### Step 4 — Run the index load test

```bash
cd backend
npm run load-test:indexes
```

**Expected output** (example):

```
Running EXPLAIN ANALYZE on requisition_id = <uuid>
Row count for this requisition: 10000

Results:
  P50:  0.248 ms
  P95:  1.934 ms
  P99:  2.311 ms

PASS: P95 1.934 ms < 50 ms target
```

**Evidence**: Paste full output in `validation-evidence.md`.

#### Step 4b — Confirm `EXPLAIN ANALYZE` plan manually

```bash
npx prisma db execute --stdin <<'SQL'
EXPLAIN (ANALYZE, FORMAT TEXT)
SELECT id, status, submitted_at
FROM applications
WHERE requisition_id = (SELECT requisition_id FROM applications LIMIT 1)
  AND status IN ('submitted', 'screening')
ORDER BY submitted_at DESC
LIMIT 50;
SQL
```

**Expected**: Plan contains `Index Scan using idx_applications_requisition_status` (or `Bitmap Index Scan`). No `Seq Scan` on `applications`.

**Evidence**: Paste plan in `validation-evidence.md`.

---

### Scenario 5 — Row-Level Security Restricts Candidates to Own Data

**Acceptance Criterion**: JWT with `role = candidate` returns only rows where `candidate_id = auth.uid()`.

#### Step 5a — Confirm RLS is enabled on the 5 tables

```bash
npx prisma db execute --stdin <<'SQL'
SELECT relname AS table_name, relrowsecurity AS rls_enabled
FROM pg_class
WHERE relname IN ('candidates', 'applications', 'screenings', 'reviews', 'decisions')
ORDER BY relname;
SQL
```

**Expected**:

| table_name | rls_enabled |
|-----------|------------|
| applications | t |
| candidates | t |
| decisions | t |
| reviews | t |
| screenings | t |

#### Step 5b — Run the RLS test script

```bash
cd backend
npm run test:rls
```

**Expected**:

```
Testing RLS for candidate: candidate-a@example.com
  PASS: 3 rows returned, all owned by <candidate-a-uuid>

Testing RLS for candidate: candidate-b@example.com
  PASS: 5 rows returned, all owned by <candidate-b-uuid>

All RLS checks passed.
```

**Evidence**: Paste output in `validation-evidence.md`.

---

## Update User Story Status

Update `us_001.md` status from `draft` to `done`:

```yaml
# .propel/context/tasks/EP-DATA/us_001.md
# Change: status: draft
# To:     status: done
```

Tick all Definition of Done checkboxes in `us_001.md`.

---

## Create Validation Evidence Document

Create `docs/validation/ep_data_us_001_validation_evidence.md`:

```markdown
# EP-DATA / US-001 Validation Evidence

**Date**: YYYY-MM-DD  
**Environment**: Supabase Staging  
**Validator**: <your-name>

## Scenario 1 — All Tables Exist

### prisma migrate status
\`\`\`
<paste output>
\`\`\`

### Table count
\`\`\`
<paste output — expect 19>
\`\`\`

### Column spot-check
\`\`\`
<paste output>
\`\`\`

## Scenario 2 — FK Integrity

\`\`\`
<paste: NOTICE: PASS>
\`\`\`

## Scenario 3 — Unique Constraints

### email unique
\`\`\`
<paste: NOTICE: PASS>
\`\`\`

### phone unique
\`\`\`
<paste: NOTICE: PASS>
\`\`\`

## Scenario 4 — Index Performance

### load-test:indexes output
\`\`\`
<paste full output — PASS: P95 X.XXX ms < 50 ms>
\`\`\`

### EXPLAIN ANALYZE plan
\`\`\`
<paste plan — confirm Index Scan, no Seq Scan>
\`\`\`

## Scenario 5 — Row-Level Security

### RLS enabled check
\`\`\`
<paste: 5 rows with rls_enabled = t>
\`\`\`

### test:rls output
\`\`\`
<paste: All RLS checks passed>
\`\`\`

## Unit Tests

\`\`\`
<npm test output — all green>
\`\`\`

## Type Check

\`\`\`
<npm run type-check output — exit 0>
\`\`\`
```

---

## Final Validation Summary

| Scenario | Criterion | Status |
|----------|-----------|--------|
| 1 | 19 tables with correct types, NOT NULL, defaults | ☐ |
| 2 | `requisitions` DELETE blocked by open application FK | ☐ |
| 3 | Duplicate `candidates.email` + `phone` rejected | ☐ |
| 4 | P95 < 50 ms at 100 000 rows; `EXPLAIN ANALYZE` shows index scan | ☐ |
| 5 | Candidate JWT returns only own `applications` rows | ☐ |
| DoD | All migrations applied; `type-check` passes; ERD documented | ☐ |

---

## Dependencies

- **TASK-001** through **TASK-004** must be complete and migrated to staging
- Staging Supabase database accessible from local or CI environment
- Two test candidate accounts seeded in Supabase Auth for RLS test

## Security Constraints

- Validation SQL scripts use `DO $$ ... ROLLBACK $$` blocks to prevent test data from persisting in staging
- The evidence document must not contain real candidate emails, JWTs, or passwords — use only test/synthetic values
- The `load-test:indexes` seed data uses `@example.com` and `@test.internal` domains only

---

## Definition of Done

- [ ] All 5 scenarios confirmed with terminal evidence
- [ ] `docs/validation/ep_data_us_001_validation_evidence.md` committed
- [ ] ERD updated in `docs/architecture/data-model.md`
- [ ] `us_001.md` status updated to `done`
- [ ] All DoD checkboxes in `us_001.md` ticked
- [ ] `npm run type-check` exits 0

## Traceability

| Artefact | ID |
|----------|----|
| User Story | US-001 |
| Epic | EP-DATA |
| Scenarios | 1, 2, 3, 4, 5 |
| Spec ref | §7.1 (core entities), §7.2 (relationships), §7.3 (integrity constraints) |
