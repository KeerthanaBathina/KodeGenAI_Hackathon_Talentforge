---
id: task_004
us_id: us_004
epic: EP-DATA
title: "Integrate prisma migrate deploy into Railway CD Pipeline with Zero-Downtime Guidelines"
status: not-started
layer: ci-cd
effort: 3h
priority: high
created: 2026-07-22
---

# TASK-004 — Integrate prisma migrate deploy into Railway CD Pipeline with Zero-Downtime Guidelines

## Context

**User Story**: US-004 — Prisma Migration Framework with Seed Scripts and Rollback Procedures  
**Epic**: EP-DATA — Data Foundation  
**Addresses Acceptance Criteria**: Scenario 4 (`prisma migrate deploy` runs automatically before app start during production deployment; health endpoint remains responsive throughout)

Railway deploys backend containers in a rolling fashion: the new container starts, must pass a health check, then the old container is stopped. This means there is a window where both the old container (serving traffic) and the new container (running migrations) are alive simultaneously.

For **additive migrations** (new columns with defaults, new tables, new indexes), the old container's code continues to work while the new schema is applied — zero downtime is achievable without any coordination beyond the migration itself. For **destructive migrations**, the old container's queries against removed columns will fail during this window — these require a two-deploy strategy.

---

## Objective

Update `backend/railway.json` `startCommand` to run `prisma migrate deploy` before starting the app. Document zero-downtime migration classification rules and add a `migrate:deploy` npm script. Create `backend/scripts/test-zero-downtime-migration.ts` that polls `/health` during a deployment to verify 100% availability.

---

## Technical Specifications

| Attribute | Value |
|-----------|-------|
| Railway startCommand (before) | `node dist/server.js` |
| Railway startCommand (after) | `npx prisma migrate deploy && node dist/server.js` |
| Migration env var | `DATABASE_URL` must be `DIRECT_URL` in Railway (port 5432) |
| Health poll interval | 500ms |
| Acceptable downtime | 0% (no 5xx responses during additive migration deploy) |
| npm script | `"migrate:deploy": "prisma migrate deploy"` |

### Zero-downtime migration classification

| Migration type | Zero-downtime safe? | Strategy |
|----------------|---------------------|----------|
| `ADD COLUMN` (nullable, or with default) | Yes | Apply in one deploy |
| `CREATE TABLE` | Yes | Apply in one deploy |
| `CREATE INDEX CONCURRENTLY` | Yes | Apply in one deploy |
| `ADD CONSTRAINT ... NOT VALID` | Yes | Apply in one deploy |
| `DROP COLUMN` | No — breaks running app queries | Deploy 1: remove app code; Deploy 2: drop column |
| `NOT NULL` without default | No — existing rows fail INSERT | Deploy 1: backfill + NOT VALID; Deploy 2: VALIDATE |
| `RENAME COLUMN` | No — breaks all queries referencing old name | Deploy 1: add new column + dual-write; Deploy 2: drop old |
| `DROP TABLE` | No — breaks running app queries | Same dual-deploy strategy |

---

## Implementation Steps

### Step 1 — Update `backend/railway.json`

Read the existing file and update `startCommand`:

**Before:**
```json
{
  "build": {
    "builder": "NIXPACKS"
  },
  "deploy": {
    "startCommand": "node dist/server.js",
    "healthcheckPath": "/health",
    "healthcheckTimeout": 30,
    "restartPolicyType": "ON_FAILURE"
  }
}
```

**After:**
```json
{
  "build": {
    "builder": "NIXPACKS"
  },
  "deploy": {
    "startCommand": "npx prisma migrate deploy && node dist/server.js",
    "healthcheckPath": "/health",
    "healthcheckTimeout": 60,
    "restartPolicyType": "ON_FAILURE"
  }
}
```

**Changes:**
- `startCommand`: prepend `npx prisma migrate deploy && ` so migrations run before the app process starts
- `healthcheckTimeout`: increased from 30 → 60 seconds to allow for migration execution time on large schemas (the migration step adds a few seconds; 60s is generous enough for schemas up to ~1GB)

> **Railway execution model**: When the new container's `startCommand` is `npx prisma migrate deploy && node dist/server.js`, the Railway health check does not pass until `node dist/server.js` is running and responding to `/health`. During this time the old container continues handling production traffic. Once the new container passes its health check, Railway routes traffic to it and stops the old container. This means the migration runs while the old container is still live — requiring that the migration be backward-compatible with the old app code.

### Step 2 — Set `DATABASE_URL` to `DIRECT_URL` in Railway environment variables

`prisma migrate deploy` requires a direct connection to PostgreSQL (not PgBouncer). In Railway:

1. Go to Railway project → Backend service → Variables
2. Confirm `DATABASE_URL` is set to the Supabase direct connection string (port 5432, **not** 6543)
3. Confirm `DIRECT_URL` is also set to the same value (Prisma uses `DIRECT_URL` for migrations automatically when both are set)

**Recommended configuration** (both vars present, different values):
- `DATABASE_URL` → `postgresql://postgres.[ref]:[password]@aws-[region].pooler.supabase.com:6543/postgres?pgbouncer=true` (PgBouncer — used for app queries)
- `DIRECT_URL` → `postgresql://postgres.[ref]:[password]@db.[ref].supabase.co:5432/postgres` (direct — used for migrations)

Prisma automatically uses `DIRECT_URL` for `migrate deploy` when it is set, and `DATABASE_URL` (PgBouncer) for `prisma.$queryRaw` and model queries. This is the correct dual-URL configuration.

### Step 3 — Add npm scripts to `package.json`

```json
"scripts": {
  "migrate:deploy":  "prisma migrate deploy",
  "migrate:status":  "prisma migrate status",
  "migrate:diff":    "prisma migrate diff --from-migrations prisma/migrations --to-schema-datasource prisma/schema.prisma --exit-code --script"
}
```

### Step 4 — Create `backend/scripts/test-zero-downtime-migration.ts`

This script polls `/health` at 500ms intervals for 60 seconds, capturing the HTTP status of each response. Use it during a Railway deployment to verify no 5xx responses occur:

```typescript
/**
 * Zero-downtime migration health check validator.
 *
 * Polls the backend /health endpoint every 500ms for 60 seconds while a
 * Railway deployment (with prisma migrate deploy) is in progress.
 *
 * Usage:
 *   BACKEND_URL=https://your-app.railway.app npx tsx scripts/test-zero-downtime-migration.ts
 *
 * Expected: 100% 2xx responses throughout the deployment window.
 */
import https from 'node:https';
import http from 'node:http';

const BACKEND_URL = process.env['BACKEND_URL'];
const POLL_INTERVAL_MS = 500;
const DURATION_MS = 60_000;
const HEALTH_PATH = '/health';

if (!BACKEND_URL) {
  console.error('BACKEND_URL environment variable is required.');
  process.exit(1);
}

const results: Array<{ ts: string; status: number; ok: boolean }> = [];

function poll(url: string): Promise<number> {
  return new Promise((resolve) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(`${url}${HEALTH_PATH}`, (res) => {
      res.resume(); // consume response body
      resolve(res.statusCode ?? 0);
    });
    req.on('error', () => resolve(0)); // 0 = network error
    req.setTimeout(2000, () => {
      req.destroy();
      resolve(0);
    });
  });
}

async function main(): Promise<void> {
  const startTime = Date.now();
  console.log(`Polling ${BACKEND_URL}${HEALTH_PATH} every ${POLL_INTERVAL_MS}ms for ${DURATION_MS / 1000}s`);
  console.log('Start deployment now and watch for failures...\n');

  while (Date.now() - startTime < DURATION_MS) {
    const status = await poll(BACKEND_URL!);
    const ok = status >= 200 && status < 300;
    const ts = new Date().toISOString();
    results.push({ ts, status, ok });

    if (!ok) {
      console.error(`  ${ts}  ${ok ? 'OK' : 'FAIL'} ${status === 0 ? 'CONN_ERR' : status}`);
    } else {
      process.stdout.write('.');
    }

    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }

  console.log('\n\n--- Results ---');
  const total = results.length;
  const passed = results.filter((r) => r.ok).length;
  const failed = total - passed;
  const successRate = ((passed / total) * 100).toFixed(1);

  console.log(`Total polls:  ${total}`);
  console.log(`Successful:   ${passed} (${successRate}%)`);
  console.log(`Failed:       ${failed}`);

  if (failed > 0) {
    console.error('\nFAIL: Downtime detected during migration deployment.');
    console.error('Failures:');
    results.filter((r) => !r.ok).forEach((r) => console.error(`  ${r.ts}  ${r.status}`));
    process.exit(1);
  }

  console.log('\nPASS: Zero downtime confirmed — 100% success rate during deployment.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

Add npm script:
```json
"zero-downtime:test": "tsx scripts/test-zero-downtime-migration.ts"
```

### Step 5 — Document two-phase deploy pattern for breaking changes

Create `backend/docs/ops/two-phase-deploy.md`:

```markdown
# Two-Phase Deploy Pattern for Breaking Schema Changes

When a migration is **not** backward-compatible with the currently deployed application
code (e.g., dropping a column the old app reads), use the two-phase deploy strategy
to maintain zero downtime.

## Phase 1 — Backward-compatible application code, forward-compatible schema

**Goal**: Apply a migration that does NOT break the currently deployed code.

Examples:
- Add new nullable column (old code ignores it)
- Create new table (old code doesn't query it)
- Add `NOT VALID` constraint (deferred enforcement)

Railway deploy: migrations apply → new code ignores old column → old container serves traffic without errors.

## Phase 2 — Remove old behavior (column, table, constraint)

**Goal**: Now that all app servers are running new code that no longer references the old column,
apply the destructive migration safely.

Examples:
- `DROP COLUMN old_field`
- `DROP TABLE old_table`
- `VALIDATE CONSTRAINT` (makes deferred constraint strict)

## Worked Example: Renaming `candidates.phone` to `candidates.phone_number`

**Phase 1 migration** (`rename_candidates_phone_phase1`):
```sql
ALTER TABLE candidates ADD COLUMN phone_number VARCHAR(20);
UPDATE candidates SET phone_number = phone WHERE phone IS NOT NULL;
```

**Phase 1 application code**: Write to both `phone` and `phone_number`; read from `phone_number`.

**Deploy Phase 1** → verify, then deploy new app code.

**Phase 2 migration** (`rename_candidates_phone_phase2`):
```sql
ALTER TABLE candidates DROP COLUMN phone;
ALTER TABLE candidates ALTER COLUMN phone_number SET NOT NULL;
```

**Deploy Phase 2** → `phone` column is gone; app code only uses `phone_number`.
```

---

## Validation

| Check | Method | Expected Result |
|-------|--------|-----------------|
| `railway.json` startCommand updated | Read file | `npx prisma migrate deploy && node dist/server.js` |
| `healthcheckTimeout` updated | Read file | 60 |
| `migrate:deploy` npm script present | `npm run migrate:deploy --dry-run` | Command recognized |
| Zero-downtime script polls `/health` | `BACKEND_URL=... npm run zero-downtime:test` | 100% success rate |
| Migration runs before app start | Deploy to Railway; check logs | Migration log lines before server listening log |

---

## Dependencies

- **EP-TECH / US-002 / TASK-001** — `railway.json` exists with initial startCommand
- **EP-TECH / US-004 / TASK-001–002** — CI/CD pipelines active
- `DIRECT_URL` environment variable set in Railway

## Security Constraints

- **OWASP A05 (Security Misconfiguration)**: `prisma migrate deploy` should always run with `DIRECT_URL` (port 5432). If only `DATABASE_URL` pointing at PgBouncer (port 6543) is set, `migrate deploy` will fail — this is a desirable failure, not a problem to work around. Never set `DATABASE_URL` to PgBouncer and expect Prisma CLI to work.
- The `test-zero-downtime-migration.ts` script only makes GET requests to `/health`. It does not require authentication and does not transmit any sensitive data. The `BACKEND_URL` variable must not include credentials in the URL — Railway URLs do not use Basic Auth.

---

## Definition of Done

- [ ] `backend/railway.json` startCommand updated to `npx prisma migrate deploy && node dist/server.js`
- [ ] `healthcheckTimeout` increased to 60
- [ ] `migrate:deploy` npm script added to `package.json`
- [ ] `backend/scripts/test-zero-downtime-migration.ts` committed
- [ ] Zero-downtime test run during a Railway deployment confirms 100% success rate
- [ ] `backend/docs/ops/two-phase-deploy.md` committed with renaming example
- [ ] Railway environment variables confirm `DIRECT_URL` is set

## Traceability

| Artefact | ID |
|----------|----|
| User Story | US-004 |
| Epic | EP-DATA |
| Scenario | 4 (prisma migrate deploy runs before app start; health endpoint stays up) |
| Spec ref | TR-008 (data integrity and migration management) |
