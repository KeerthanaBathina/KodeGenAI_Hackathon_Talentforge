---
id: task_001
us_id: us_003
epic: EP-DATA
title: "Extend audit_events Schema with user_agent Column and Verify Full Column Contract"
status: done
layer: backend
effort: 2h
priority: critical
created: 2026-07-22
---

# TASK-001 — Extend audit_events Schema with user_agent Column and Verify Full Column Contract

## Context

**User Story**: US-003 — Immutable Audit Events Table with PostgreSQL Trigger Guard  
**Epic**: EP-DATA — Data Foundation  
**Addresses Acceptance Criteria**: Scenario 3 (INSERT succeeds with all required schema fields: `id`, `actor_id`, `event_type`, `entity_type`, `entity_id`, `payload` JSONB, `ip_address`, `user_agent`, `created_at` auto-set)

The `audit_events` table was defined in EP-DATA / US-001 / TASK-002 with most required columns. Scenario 3 adds `user_agent` to the required field set — this is needed to satisfy GDPR recital 49 (security logging) and ISMS TR-008.1, which require the originating client identity to be recorded alongside each event. This task adds the missing column via a non-breaking Prisma migration.

---

## Objective

Add a nullable `userAgent` column (`VARCHAR(512)`) to the `audit_events` Prisma model, generate and apply a migration, and document the complete column contract as the authoritative reference for the `auditEvent()` service function in TASK-003.

---

## Technical Specifications

### Complete audit_events column contract (post-migration)

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | `UUID` | NOT NULL | `gen_random_uuid()` | PK |
| `actor_id` | `UUID` | NULL | — | FK → users (SetNull on delete) |
| `event_type` | `VARCHAR(100)` | NOT NULL | — | e.g. `application.submitted` |
| `entity_type` | `VARCHAR(50)` | NOT NULL | — | e.g. `application` |
| `entity_id` | `UUID` | NOT NULL | — | ID of the affected entity |
| `payload_json` | `JSONB` | NOT NULL | — | Event-specific data payload |
| `ip_address` | `INET` | NULL | — | Originating request IP |
| `user_agent` | `VARCHAR(512)` | NULL | — | HTTP `User-Agent` header (**new**) |
| `created_at` | `TIMESTAMPTZ` | NOT NULL | `now()` | Immutable — set on INSERT |

---

## Implementation Steps

### Step 1 — Update the `AuditEvent` model in `schema.prisma`

Open `backend/prisma/schema.prisma` and replace the existing `AuditEvent` model:

**Before** (from US-001 / TASK-002):

```prisma
model AuditEvent {
  id          String   @id @default(uuid()) @db.Uuid
  actorId     String?  @db.Uuid
  eventType   String   @db.VarChar(100)
  entityType  String   @db.VarChar(50)
  entityId    String   @db.Uuid
  payloadJson Json     @db.JsonB
  ipAddress   String?  @db.Inet
  createdAt   DateTime @default(now())

  // Relations
  actor User? @relation("AuditActor", fields: [actorId], references: [id], onDelete: SetNull)

  @@map("audit_events")
}
```

**After** (add `userAgent`):

```prisma
model AuditEvent {
  id          String   @id @default(uuid()) @db.Uuid
  actorId     String?  @db.Uuid
  eventType   String   @db.VarChar(100)
  entityType  String   @db.VarChar(50)
  entityId    String   @db.Uuid
  payloadJson Json     @db.JsonB
  ipAddress   String?  @db.Inet
  userAgent   String?  @db.VarChar(512)
  createdAt   DateTime @default(now()) @db.Timestamptz

  // Relations
  actor User? @relation("AuditActor", fields: [actorId], references: [id], onDelete: SetNull)

  @@index([entityType, entityId, createdAt(sort: Desc)], name: "idx_audit_events_entity")
  @@index([actorId, createdAt(sort: Desc)], name: "idx_audit_events_actor")
  @@map("audit_events")
}
```

> **Note**: The `@@index` directives consolidate the indexes previously added in EP-DATA / US-001 / TASK-003. If those indexes already exist in a prior migration, Prisma will detect no change and skip them.

### Step 2 — Generate and apply the migration

```bash
cd backend
npx prisma migrate dev --name "add_audit_events_user_agent"
npx prisma generate
```

Verify the migration SQL contains:

```sql
ALTER TABLE "audit_events" ADD COLUMN "user_agent" VARCHAR(512);
```

And does NOT drop or alter any existing column (this is additive-only).

### Step 3 — Confirm the full column set

```bash
npx prisma db execute --stdin <<'SQL'
SELECT column_name, data_type, character_maximum_length, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'audit_events'
ORDER BY ordinal_position;
SQL
```

**Expected** (9 columns):

| column_name | data_type | is_nullable |
|-------------|-----------|-------------|
| id | uuid | NO |
| actor_id | uuid | YES |
| event_type | character varying | NO |
| entity_type | character varying | NO |
| entity_id | uuid | NO |
| payload_json | jsonb | NO |
| ip_address | inet | YES |
| user_agent | character varying | YES |
| created_at | timestamp with time zone | NO |

---

## Validation

| Check | Method | Expected Result |
|-------|--------|-----------------|
| `user_agent` column added | `information_schema.columns` query | `user_agent VARCHAR(512)` present |
| No existing columns dropped | Inspect migration SQL | Only `ADD COLUMN` — no `DROP COLUMN` |
| `created_at` has `TIMESTAMPTZ` type | Column info query | `timestamp with time zone` |
| `prisma migrate status` | CLI | No pending migrations |
| `npx prisma generate` | CLI | Exit 0 |
| `npm run type-check` | CLI | `AuditEvent.userAgent: string \| null` in generated types |

---

## Dependencies

- **EP-DATA / US-001 / TASK-002** — `audit_events` table must exist before this additive migration runs

## Security Constraints

- **OWASP A09 (Security Logging and Monitoring Failures)**: `user_agent` is captured from the HTTP `User-Agent` header. It is an observable field — not PII per se — but may contain browser version and OS details. It is stored as a VARCHAR (max 512 characters) and truncated rather than rejected if longer, to prevent log injection through overlong user-agent strings. **Never** log or store the full request body alongside user-agent in audit events.
- `VARCHAR(512)` provides sufficient space for typical browser user-agent strings (~150 chars) and leaves headroom for extended/custom agents, while preventing unbounded storage from crafted headers.

---

## Definition of Done

- [ ] `AuditEvent` model updated with `userAgent String? @db.VarChar(512)` and `@db.Timestamptz` on `createdAt`
- [ ] Migration `add_audit_events_user_agent` generated and applied
- [ ] `information_schema.columns` confirms all 9 columns present
- [ ] `npm run type-check` exits 0

## Traceability

| Artefact | ID |
|----------|----|
| User Story | US-003 |
| Epic | EP-DATA |
| Scenario | 3 (INSERT with full schema including user_agent) |
| Spec ref | FR-010, TR-008.1, spec §"audit_events table" |
