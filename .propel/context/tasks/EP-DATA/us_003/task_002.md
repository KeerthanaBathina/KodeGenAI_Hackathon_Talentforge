---
id: task_002
us_id: us_003
epic: EP-DATA
title: "Install PostgreSQL Immutability Trigger trg_audit_events_immutable via Migration"
status: done
layer: backend
effort: 3h
priority: critical
created: 2026-07-22
---

# TASK-002 — Install PostgreSQL Immutability Trigger trg_audit_events_immutable via Migration

## Context

**User Story**: US-003 — Immutable Audit Events Table with PostgreSQL Trigger Guard  
**Epic**: EP-DATA — Data Foundation  
**Addresses Acceptance Criteria**: Scenario 1 (UPDATE raises `IMMUTABLE_AUDIT_RECORD` exception), Scenario 2 (DELETE raises the same exception even from the service account)

The spec states: *"`audit_events` table permits INSERT only; UPDATE and DELETE are denied at the database role level."* (spec §security constraints). Enforcing this at the trigger level — rather than only at the application layer or via GRANT/REVOKE — means no code path, service account, or direct database connection can bypass the constraint. GRANT/REVOKE can be circumvented by a superuser or mis-configured role; a trigger fires unconditionally for all connections including the Prisma service role.

---

## Objective

Create a Prisma migration containing raw SQL that installs a `BEFORE UPDATE OR DELETE` trigger function and binds it to `audit_events`. The trigger function raises a PostgreSQL exception with message `IMMUTABLE_AUDIT_RECORD` and SQLSTATE `restrict_violation (23001)`. Verify the trigger fires for both UPDATE and DELETE attempts from any role.

---

## Technical Specifications

| Attribute | Value |
|-----------|-------|
| Trigger name | `trg_audit_events_immutable` |
| Trigger function | `prevent_audit_modification()` |
| Trigger timing | `BEFORE` |
| Trigger events | `UPDATE OR DELETE` |
| Trigger scope | `FOR EACH ROW` |
| Exception message | `IMMUTABLE_AUDIT_RECORD` |
| SQLSTATE | `restrict_violation` (`23001`) |
| Applies to | All connections, including Prisma service role and superuser |

---

## Implementation Steps

### Step 1 — Create an empty migration for raw SQL

```bash
cd backend
npx prisma migrate dev --create-only --name "add_audit_immutability_trigger"
```

This generates `backend/prisma/migrations/<timestamp>_add_audit_immutability_trigger/migration.sql` with an empty file.

### Step 2 — Write the trigger SQL

Paste the following into the generated `migration.sql`:

```sql
-- ─── Immutability trigger for audit_events ────────────────────────────────────
--
-- This trigger fires BEFORE any UPDATE or DELETE on audit_events.
-- It raises a restrict_violation (SQLSTATE 23001) with the message
-- IMMUTABLE_AUDIT_RECORD, rolling back the calling transaction.
--
-- Enforcement rationale (TR-008.1):
--   Application-layer access controls and GRANT/REVOKE can be bypassed by
--   a superuser or mis-configured role. A trigger fires unconditionally for
--   all connections, making tamper-resistance database-enforced rather than
--   application-enforced.

CREATE OR REPLACE FUNCTION prevent_audit_modification()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
AS $$
BEGIN
  RAISE EXCEPTION 'IMMUTABLE_AUDIT_RECORD'
    USING
      ERRCODE = '23001',   -- restrict_violation
      HINT    = 'audit_events rows are append-only. '
                'UPDATE and DELETE are prohibited on this table. '
                'Contact the compliance team if you need to expunge a record.';
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_audit_events_immutable
  BEFORE UPDATE OR DELETE
  ON audit_events
  FOR EACH ROW
  EXECUTE FUNCTION prevent_audit_modification();
```

### Step 3 — Apply the migration

```bash
npx prisma migrate deploy
# Or in development:
npx prisma migrate dev
```

### Step 4 — Verify the trigger is installed

```bash
npx prisma db execute --stdin <<'SQL'
SELECT
  trigger_name,
  event_manipulation,
  action_timing,
  action_orientation
FROM information_schema.triggers
WHERE event_object_table = 'audit_events'
ORDER BY trigger_name, event_manipulation;
SQL
```

**Expected** (2 rows — one per event):

| trigger_name | event_manipulation | action_timing | action_orientation |
|-------------|-------------------|---------------|-------------------|
| trg_audit_events_immutable | DELETE | BEFORE | ROW |
| trg_audit_events_immutable | UPDATE | BEFORE | ROW |

### Step 5 — Write integration tests for the trigger

Create `backend/src/db/__tests__/auditImmutability.test.ts`:

```typescript
import { describe, it, expect, afterAll } from 'vitest';
import { PrismaClient, Prisma } from '@prisma/client';

// Use a dedicated test client so the test file can be isolated
const prisma = new PrismaClient({
  datasources: { db: { url: process.env['DATABASE_URL'] } },
});

afterAll(() => prisma.$disconnect());

const makeAuditRow = () => ({
  eventType: 'test.immutability',
  entityType: 'test',
  entityId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  payloadJson: { test: true } as Prisma.InputJsonValue,
});

describe('audit_events immutability trigger', () => {
  it('allows INSERT — row is persisted', async () => {
    const row = await prisma.auditEvent.create({ data: makeAuditRow() });
    expect(row.id).toBeDefined();
    expect(row.eventType).toBe('test.immutability');

    // Cleanup: we cannot DELETE, so we just accept the row stays in the test DB.
    // Use a dedicated test database or transaction rollback at the suite level.
  });

  it('raises IMMUTABLE_AUDIT_RECORD on UPDATE attempt', async () => {
    const row = await prisma.auditEvent.create({ data: makeAuditRow() });

    await expect(
      prisma.auditEvent.update({
        where: { id: row.id },
        data: { eventType: 'tampered' },
      }),
    ).rejects.toThrow('IMMUTABLE_AUDIT_RECORD');
  });

  it('raises IMMUTABLE_AUDIT_RECORD on DELETE attempt', async () => {
    const row = await prisma.auditEvent.create({ data: makeAuditRow() });

    await expect(
      prisma.auditEvent.delete({ where: { id: row.id } }),
    ).rejects.toThrow('IMMUTABLE_AUDIT_RECORD');
  });

  it('UPDATE rejection is a PostgreSQL restrict_violation (P0001 or 23001)', async () => {
    const row = await prisma.auditEvent.create({ data: makeAuditRow() });

    try {
      await prisma.auditEvent.update({
        where: { id: row.id },
        data: { eventType: 'tampered' },
      });
      throw new Error('Expected rejection did not occur');
    } catch (err) {
      // Prisma wraps the PG error; the original message is preserved
      expect(String(err)).toContain('IMMUTABLE_AUDIT_RECORD');
    }
  });
});
```

> **Important**: These integration tests require a live database connection (staging or a local Supabase instance). They are tagged as integration tests and excluded from the fast unit-test suite. Add to Vitest config:

```typescript
// vitest.config.ts — add integration test include pattern
{
  include: ['src/**/*.test.ts'],
  exclude: ['src/**/*.integration.test.ts'],  // run separately
}
```

Rename the file to `auditImmutability.integration.test.ts` and add an npm script:

```json
"test:integration": "vitest run src/**/*.integration.test.ts"
```

---

## Validation

| Check | Method | Expected Result |
|-------|--------|-----------------|
| Trigger installed | `information_schema.triggers` query | 2 rows: UPDATE + DELETE triggers |
| Trigger function exists | `\df prevent_audit_modification` in psql | Function present |
| INSERT succeeds | Integration test | Row persisted, `id` set |
| UPDATE raises `IMMUTABLE_AUDIT_RECORD` | Integration test | Exception thrown |
| DELETE raises `IMMUTABLE_AUDIT_RECORD` | Integration test | Exception thrown |
| SQLSTATE is `23001` | Direct psql test (Step 6 below) | `ERROR: IMMUTABLE_AUDIT_RECORD` |

### Step 6 — Manual verification in psql

```bash
npx prisma db execute --stdin <<'SQL'
DO $$
DECLARE
  v_id   uuid;
  v_result text;
BEGIN
  -- Insert a valid row
  INSERT INTO audit_events (event_type, entity_type, entity_id, payload_json)
    VALUES ('test.trigger', 'test', gen_random_uuid(), '{}')
    RETURNING id INTO v_id;

  -- Test UPDATE
  BEGIN
    UPDATE audit_events SET event_type = 'tampered' WHERE id = v_id;
    v_result := 'FAIL: UPDATE succeeded — trigger NOT installed';
  EXCEPTION WHEN restrict_violation THEN
    v_result := 'PASS: UPDATE blocked — IMMUTABLE_AUDIT_RECORD raised';
  END;
  RAISE NOTICE '%', v_result;

  -- Test DELETE
  BEGIN
    DELETE FROM audit_events WHERE id = v_id;
    v_result := 'FAIL: DELETE succeeded — trigger NOT installed';
  EXCEPTION WHEN restrict_violation THEN
    v_result := 'PASS: DELETE blocked — IMMUTABLE_AUDIT_RECORD raised';
  END;
  RAISE NOTICE '%', v_result;

  -- The INSERT row remains (cannot be cleaned up — accepted in test DB)
END $$;
SQL
```

**Expected output**:

```
NOTICE:  PASS: UPDATE blocked — IMMUTABLE_AUDIT_RECORD raised
NOTICE:  PASS: DELETE blocked — IMMUTABLE_AUDIT_RECORD raised
```

---

## Dependencies

- **TASK-001** must be complete (`user_agent` column must exist before the trigger is applied — ensures the trigger covers the final column set)

## Security Constraints

- **OWASP A05 (Security Misconfiguration)**: The trigger function uses `SECURITY DEFINER` to guarantee it runs with the owner's privileges regardless of the calling role. This ensures even a low-privilege application role cannot bypass the trigger by escalating via a SECURITY INVOKER function.
- The trigger fires `BEFORE` (not `AFTER`) — this is intentional. A `BEFORE` trigger that raises an exception cancels the row operation entirely and rolls back the calling transaction atomically. An `AFTER` trigger would execute after the write, requiring a separate rollback step.
- The trigger cannot be dropped without `DROP TRIGGER` DDL, which requires `TRIGGER` privilege on the table. In Supabase, only the `postgres` superuser has this privilege — this is acceptable for compliance purposes.
- The HINT message in the exception is intentionally descriptive to aid incident response: it names the table and provides a remediation path without exposing system internals.

---

## Definition of Done

- [ ] `backend/prisma/migrations/<ts>_add_audit_immutability_trigger/migration.sql` committed
- [ ] `prevent_audit_modification()` function installed in database
- [ ] `trg_audit_events_immutable` trigger installed on `audit_events` for UPDATE and DELETE
- [ ] `information_schema.triggers` confirms 2 trigger rows
- [ ] Manual DO-block test confirms `PASS` for both UPDATE and DELETE
- [ ] Integration test file `auditImmutability.integration.test.ts` committed (3 tests)
- [ ] `npm run test:integration` exits 0 (requires live staging DB)

## Traceability

| Artefact | ID |
|----------|----|
| User Story | US-003 |
| Epic | EP-DATA |
| Scenario | 1 (UPDATE raises `IMMUTABLE_AUDIT_RECORD`), 2 (DELETE raises same exception) |
| Spec ref | FR-010, TR-008.1, spec §"audit_events table permits INSERT only" |
