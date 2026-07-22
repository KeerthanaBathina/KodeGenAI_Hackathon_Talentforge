---
id: task_005
us_id: us_003
epic: EP-DATA
title: "RLS Policies for audit_events + Validate All Immutability Scenarios — DoD Sign-off"
status: not-started
layer: backend
effort: 2h
priority: critical
created: 2026-07-22
---

# TASK-005 — RLS Policies for audit_events + Validate All Immutability Scenarios — DoD Sign-off

## Context

**User Story**: US-003 — Immutable Audit Events Table with PostgreSQL Trigger Guard  
**Epic**: EP-DATA — Data Foundation  
**Addresses**: All 4 acceptance criteria scenarios + Definition of Done (RLS: INSERT for service role; SELECT for admin role only)

This task installs Row-Level Security policies on `audit_events` to complement the trigger-based immutability, runs all scenario validations, and updates the user story status to `done`.

---

## Objective

Create a Prisma migration with raw SQL to enable RLS on `audit_events`, define policies restricting direct-client reads to `admin` role only (the service role used by Prisma bypasses RLS), then execute each of the four scenario validations and collect evidence.

---

## Technical Specifications

### RLS policy matrix for audit_events

| Role | Operation | Policy | Rationale |
|------|-----------|--------|-----------|
| Service role (Prisma) | ALL | Bypasses RLS | Prisma connects via `DATABASE_URL` service role which bypasses RLS by design |
| `admin` | SELECT | `true` (all rows) | Full audit log access for compliance officers (FR-066) |
| `hr_manager` | SELECT | `actor_id = auth.uid()` OR `entity_id IN (apps managed by role)` | HR managers can see audit events for their own actions |
| `candidate` | SELECT | `actor_id = auth.uid()` | Candidates can see their own audit trail (GDPR subject access request) |
| Any role | INSERT | Denied via policy | All writes go through service role (Prisma) — direct-client writes are blocked |
| Any role | UPDATE | Blocked by trigger | Belt-and-suspenders: trigger fires even if RLS policy were relaxed |
| Any role | DELETE | Blocked by trigger | Belt-and-suspenders |

---

## Implementation Steps

### Step 1 — Create the RLS migration

```bash
cd backend
npx prisma migrate dev --create-only --name "add_audit_events_rls"
```

Paste the following into the generated `migration.sql`:

```sql
-- ─── RLS for audit_events ─────────────────────────────────────────────────────
--
-- Immutability is enforced by trg_audit_events_immutable (UPDATE/DELETE blocked).
-- RLS here restricts which roles can SELECT audit rows via Supabase anon/authed clients.
-- The Prisma service role (DATABASE_URL) bypasses RLS for application writes.

ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;

-- Admin: full read access (compliance officer, audit log viewer — FR-066)
CREATE POLICY audit_events_admin_select ON audit_events
  FOR SELECT
  USING (auth.role() = 'admin');

-- HR Manager: can see events where they are the actor
CREATE POLICY audit_events_hr_manager_select ON audit_events
  FOR SELECT
  USING (
    auth.role() = 'hr_manager'
    AND actor_id = auth.uid()
  );

-- Candidate: can see events where they are the actor (GDPR subject access)
CREATE POLICY audit_events_candidate_select ON audit_events
  FOR SELECT
  USING (
    auth.role() = 'candidate'
    AND actor_id = auth.uid()
  );

-- Block direct-client INSERT: all writes must go through the service role
-- (Supabase PostgREST uses anon/authed role; service role bypasses this policy)
-- No INSERT policy = INSERT denied for all non-service roles.
```

Apply the migration:

```bash
npx prisma migrate deploy
```

### Step 2 — Verify RLS is enabled and policies installed

```bash
npx prisma db execute --stdin <<'SQL'
-- Confirm RLS is enabled
SELECT relname, relrowsecurity
FROM pg_class
WHERE relname = 'audit_events';

-- Confirm policy count
SELECT policyname, cmd, qual
FROM pg_policies
WHERE tablename = 'audit_events'
ORDER BY policyname;
SQL
```

**Expected**:
- `relrowsecurity = true`
- 3 policies: `audit_events_admin_select`, `audit_events_candidate_select`, `audit_events_hr_manager_select`

---

## Validation Scenarios

### Scenario 1 — UPDATE raises IMMUTABLE_AUDIT_RECORD

Run the DO block from TASK-002 / Step 6:

```bash
npx prisma db execute --stdin <<'SQL'
DO $$
DECLARE
  v_id uuid;
  v_result text;
BEGIN
  INSERT INTO audit_events (event_type, entity_type, entity_id, payload_json)
    VALUES ('validate.s1', 'test', gen_random_uuid(), '{"scenario":1}')
    RETURNING id INTO v_id;

  BEGIN
    UPDATE audit_events SET event_type = 'tampered' WHERE id = v_id;
    v_result := 'FAIL: UPDATE succeeded — trigger NOT installed';
  EXCEPTION WHEN restrict_violation THEN
    v_result := 'PASS: UPDATE blocked — IMMUTABLE_AUDIT_RECORD raised';
  END;
  RAISE NOTICE '%', v_result;
END $$;
SQL
```

**Expected**: `NOTICE: PASS: UPDATE blocked — IMMUTABLE_AUDIT_RECORD raised`

---

### Scenario 2 — DELETE raises IMMUTABLE_AUDIT_RECORD

```bash
npx prisma db execute --stdin <<'SQL'
DO $$
DECLARE
  v_id uuid;
  v_result text;
BEGIN
  INSERT INTO audit_events (event_type, entity_type, entity_id, payload_json)
    VALUES ('validate.s2', 'test', gen_random_uuid(), '{"scenario":2}')
    RETURNING id INTO v_id;

  BEGIN
    DELETE FROM audit_events WHERE id = v_id;
    v_result := 'FAIL: DELETE succeeded — trigger NOT installed';
  EXCEPTION WHEN restrict_violation THEN
    v_result := 'PASS: DELETE blocked — IMMUTABLE_AUDIT_RECORD raised';
  END;
  RAISE NOTICE '%', v_result;
END $$;
SQL
```

**Expected**: `NOTICE: PASS: DELETE blocked — IMMUTABLE_AUDIT_RECORD raised`

---

### Scenario 3 — INSERT succeeds with all required fields

Run the integration tests from TASK-002:

```bash
cd backend
npm run test:integration
```

**Expected**: 3 integration tests pass — INSERT row persisted, UPDATE rejected, DELETE rejected.

Also verify `user_agent` field persists correctly:

```bash
npx prisma db execute --stdin <<'SQL'
DO $$
DECLARE
  v_id uuid;
  v_ua text;
BEGIN
  INSERT INTO audit_events
    (event_type, entity_type, entity_id, payload_json, ip_address, user_agent)
  VALUES
    ('validate.s3', 'test', gen_random_uuid(), '{"scenario":3}',
     '203.0.113.42', 'Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36')
  RETURNING id INTO v_id;

  SELECT user_agent INTO v_ua FROM audit_events WHERE id = v_id;

  RAISE NOTICE 'PASS: user_agent stored: %', v_ua;
END $$;
SQL
```

**Expected**: `NOTICE: PASS: user_agent stored: Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36`

---

### Scenario 4 — 50 Concurrent INSERTs Within 100 ms

```bash
cd backend
npm run load-test:audit
```

**Expected**:

```
PASS: 50 concurrent inserts in XX.XX ms (< 100 ms); P95 XX.XX ms (< 50 ms)
PASS: No deadlocks in 3 rounds (150 total inserts)
```

Save full output as evidence.

---

### RLS Verification — DoD Item

#### Admin can see all rows

```bash
# Simulate admin JWT via Supabase test client
cd backend
npx tsx --eval "
import { createClient } from '@supabase/supabase-js';
const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
  global: { headers: { Authorization: 'Bearer <admin-jwt>' } }
});
const { data, error } = await client.from('audit_events').select('id').limit(5);
console.log(error ? 'ERROR: ' + error.message : 'PASS: admin sees ' + data.length + ' row(s)');
"
```

#### Candidate cannot see other candidates' events

Using the RLS test pattern from EP-DATA / US-001 / TASK-004 — confirm a `candidate` JWT only returns events where `actor_id = auth.uid()`.

---

## Final Validation Summary

| Scenario | Criterion | Status |
|----------|-----------|--------|
| 1 | UPDATE raises `IMMUTABLE_AUDIT_RECORD` | ☐ |
| 2 | DELETE raises `IMMUTABLE_AUDIT_RECORD` from any role | ☐ |
| 3 | INSERT persists all 9 columns including `user_agent` and auto `created_at` | ☐ |
| 4 | 50 concurrent inserts < 100 ms; zero deadlocks | ☐ |
| DoD | RLS enabled; admin SELECT policy installed; service role bypasses RLS | ☐ |

---

## Unit and Integration Test Summary

```bash
cd backend
npm test          # Unit tests (TASK-003: 8 auditService tests)
npm run test:integration  # Integration tests (TASK-002: 3 trigger tests, needs live DB)
```

**Verification checklist**:
- [ ] `auditService.test.ts` — 8 unit tests ✓
- [ ] `auditImmutability.integration.test.ts` — 3 integration tests ✓ (requires live DB)
- [ ] All prior tests from EP-TECH and EP-DATA US-001/US-002 remain green

---

## Update User Story Status

Update `.propel/context/tasks/EP-DATA/us_003.md`:

```yaml
# Change: status: draft
# To:     status: done
```

Tick all DoD checkboxes.

---

## Dependencies

- **TASK-001** through **TASK-004** complete and deployed to staging
- Supabase staging PostgreSQL accessible
- Test JWT tokens available for admin and candidate roles (RLS verification)

## Security Constraints

- The trigger (TASK-002) and RLS (this task) are complementary defence layers. The trigger is the primary tamper-proof control; RLS is the access-scoping control. Both must be present.
- The `audit_events_admin_select` policy grants full SELECT to `admin` role. This must be restricted to authenticated admin sessions only — the `admin` role is assigned in the JWT claims by Supabase Auth, not by the application.
- Audit rows generated by the load test (`eventType: 'test.bulk_insert'`) persist permanently. They are clearly identifiable by `event_type` and do not affect compliance audits. A comment in the migration documents this accepted condition.

---

## Definition of Done

- [ ] `audit_events` RLS enabled via migration `add_audit_events_rls`
- [ ] 3 RLS policies installed (`admin`, `hr_manager`, `candidate`)
- [ ] Scenario 1: UPDATE blocked by trigger — PASS
- [ ] Scenario 2: DELETE blocked by trigger — PASS
- [ ] Scenario 3: INSERT with all 9 fields persisted — PASS
- [ ] Scenario 4: 50 concurrent inserts < 100 ms, zero deadlocks — PASS
- [ ] `npm test` exits 0 (8 unit tests)
- [ ] `npm run test:integration` exits 0 (3 integration tests, live DB)
- [ ] `us_003.md` status updated to `done`

## Traceability

| Artefact | ID |
|----------|----|
| User Story | US-003 |
| Epic | EP-DATA |
| Scenarios | 1, 2, 3, 4 |
| Spec ref | FR-010, FR-066, TR-008.1, spec §"audit_events table permits INSERT only" |
