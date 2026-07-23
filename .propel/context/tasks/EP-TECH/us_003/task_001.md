---
id: task_001
us_id: us_003
epic: EP-TECH
title: "Install and Configure Prisma ORM with Supabase PostgreSQL Connection Pooling"
status: done
layer: backend
effort: 4h
priority: critical
created: 2026-07-22
---

# TASK-001 — Install and Configure Prisma ORM with Supabase PostgreSQL Connection Pooling

## Context

**User Story**: US-003 — Configure Supabase PostgreSQL with Prisma ORM and Upstash Redis  
**Epic**: EP-TECH — Technical Bootstrap  
**Addresses Acceptance Criteria**: Scenario 1 (Prisma client connects on startup, connection pool min 2 / max 10, SELECT 1 returns within 100 ms), Scenario 4 (P95 query latency < 500 ms — pool sizing is the primary lever)

This task replaces the temporary `pg` raw client used in the US-002 `/health` endpoint with a production-grade Prisma 5 client backed by Supabase PostgreSQL. The Supabase connection pooler (PgBouncer on port 6543) is used for application queries; the direct connection (port 5432) is reserved for Prisma migrations.

---

## Objective

Install Prisma 5, define the base `schema.prisma`, create the typed singleton `PrismaClient`, configure connection pool bounds, update `/health` to use `$queryRaw<[{one: bigint}]>` for the liveness check, and verify the SELECT 1 query completes in under 100 ms on startup.

---

## Technical Specifications

| Attribute | Value |
|-----------|-------|
| ORM | Prisma 5.x |
| Database | PostgreSQL 15 (Supabase managed) |
| Application connection | Supabase connection pooler — `DATABASE_URL` (port **6543**, pgbouncer mode) |
| Migration connection | Supabase direct — `DIRECT_URL` (port **5432**) |
| Connection pool min | 2 |
| Connection pool max | 10 |
| Query timeout | 10 000 ms |
| SELECT 1 target latency | < 100 ms |

---

## Implementation Steps

### Step 1 — Install Prisma

```bash
cd backend
npm install @prisma/client
npm install -D prisma
```

### Step 2 — Initialise Prisma

```bash
npx prisma init --datasource-provider postgresql
```

This creates:
- `backend/prisma/schema.prisma`
- `backend/.env` (if not already present — do not commit)

### Step 3 — Configure `schema.prisma`

Replace the generated `backend/prisma/schema.prisma`:

```prisma
// This is the Prisma schema for the AI Interview Application.
// Feature epics (EP-001 through EP-011) will add models to this file.
// US-003 establishes the connection configuration only.

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")      // Supabase connection pooler (port 6543)
  directUrl = env("DIRECT_URL")        // Supabase direct (port 5432) — migrations only
}

// Placeholder model required by Prisma to generate a valid client.
// Remove when feature models are added in EP-DATA.
model _MigrationSentinel {
  id        Int      @id @default(autoincrement())
  createdAt DateTime @default(now())

  @@map("_migration_sentinel")
}
```

> **Why two URLs**: Supabase's PgBouncer (port 6543) operates in transaction-pooling mode. Prisma's migration engine requires a direct session-mode connection (port 5432). Using the pooler for migrations causes schema-level operations to fail silently.

### Step 4 — Update environment variable contract

Update `backend/.env.example` to add `DIRECT_URL`:

```env
# Database — Supabase PgBouncer connection pooler (transaction mode)
# Used by Prisma Client for all application queries
DATABASE_URL=postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=10

# Database — Supabase direct connection (session mode)
# Used by Prisma Migrate ONLY — never used by the application at runtime
DIRECT_URL=postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres
```

Update `backend/src/config/env.ts` to require `DIRECT_URL`:

```typescript
const envSchema = z.object({
  // ... existing fields ...
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  DIRECT_URL: z.string().min(1, 'DIRECT_URL is required'),
  // ... rest of fields ...
});
```

### Step 5 — Create the Prisma client singleton

Create `backend/src/db/prisma.ts`:

```typescript
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env['NODE_ENV'] === 'development'
        ? ['query', 'error', 'warn']
        : ['error'],
    datasources: {
      db: {
        url: process.env['DATABASE_URL'],
      },
    },
  });

if (process.env['NODE_ENV'] !== 'production') {
  globalForPrisma.prisma = prisma;
}

export default prisma;
```

> **Singleton pattern**: Prevents multiple `PrismaClient` instances during hot reloads in development, which would exhaust the connection pool.

### Step 6 — Configure connection pool parameters

Supabase PgBouncer manages pooling at the infrastructure level. Prisma respects the `connection_limit` query parameter in `DATABASE_URL`. Set this in the connection string:

```
DATABASE_URL=...?pgbouncer=true&connection_limit=10&pool_timeout=30
```

| Parameter | Value | Effect |
|-----------|-------|--------|
| `pgbouncer=true` | Required | Disables Prisma's prepared statement cache (incompatible with PgBouncer transaction mode) |
| `connection_limit=10` | max 10 | Matches NFR pool ceiling |
| `pool_timeout=30` | 30 s | Fails fast if no connection available rather than hanging |

> The `connection_limit` is applied per Prisma client instance. With one Node.js process, this sets the effective pool max to 10. Minimum pool size (keep-alive connections = 2) is managed by PgBouncer's `min_pool_size` setting on the Supabase dashboard.

### Step 7 — Update `/health` to use Prisma SELECT 1

Replace the raw `pg` import in `backend/src/routes/health.ts`:

```typescript
import { Router, Request, Response } from 'express';
import prisma from '../db/prisma';
import { redis } from '../db/redis';  // Added in TASK-002; import after that task completes

const router = Router();

router.get('/health', async (_req: Request, res: Response) => {
  const checks: Record<string, string> = { status: 'ok' };
  let statusCode = 200;

  // Database check — Prisma SELECT 1 with timing
  try {
    const dbStart = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    const dbMs = Date.now() - dbStart;
    checks['db'] = 'ok';
    checks['db_ms'] = String(dbMs);
    if (dbMs > 100) {
      console.warn(`[health] DB latency ${dbMs}ms exceeds 100ms target`);
    }
  } catch (err) {
    console.error('[health] DB check failed:', err);
    checks['db'] = 'error';
    checks['status'] = 'degraded';
    statusCode = 503;
  }

  // Redis check — handled in TASK-002
  // ...

  res.status(statusCode).json(checks);
});

router.get('/ready', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ready' });
});

export default router;
```

### Step 8 — Update graceful shutdown to disconnect Prisma

Update `backend/src/server.ts` shutdown handler:

```typescript
import prisma from './db/prisma';

const shutdown = (signal: string) => {
  console.log(`[server] ${signal} received — initiating graceful shutdown`);

  io.close(async () => {
    console.log('[socket] All connections closed');
    await prisma.$disconnect();
    console.log('[db] Prisma disconnected');

    server.close((err) => {
      if (err) {
        console.error('[server] Error during shutdown:', err);
        process.exit(1);
      }
      console.log('[server] HTTP server closed. Exiting.');
      process.exit(0);
    });
  });

  setTimeout(() => {
    console.error('[server] Graceful shutdown timed out. Force exiting.');
    process.exit(1);
  }, 10_000);
};
```

### Step 9 — Run Prisma generate and initial migration

```bash
cd backend
npx prisma generate          # Generates TypeScript client from schema
npx prisma migrate dev --name init   # Creates first migration (uses DIRECT_URL)
```

Commit the generated migration:

```bash
git add prisma/
git commit -m "chore(db): initialise Prisma with Supabase connection pooling"
```

### Step 10 — Verify locally

```bash
npm run dev
curl http://localhost:3001/health
```

Expected response (with working Supabase):

```json
{
  "status": "ok",
  "db": "ok",
  "db_ms": "12",
  "redis": "ok"
}
```

Confirm `db_ms` is consistently below 100.

---

## Validation

| Check | Command / Method | Expected Result |
|-------|-----------------|-----------------|
| Prisma generates | `npx prisma generate` | Exit 0, no errors |
| Migration runs | `npx prisma migrate dev` | `init` migration applied successfully |
| TypeScript compiles | `npm run type-check` | Exit 0 |
| `/health` DB check | `curl http://localhost:3001/health` | `"db":"ok","db_ms":"<100"` |
| SELECT 1 latency | `db_ms` field in health response | Value < 100 |
| Pool exhaustion guard | `connection_limit=10` in `DATABASE_URL` | Queries queue rather than open unlimited connections |
| Graceful shutdown | `kill -SIGTERM <pid>` | `[db] Prisma disconnected` logged before exit |
| `DIRECT_URL` missing → exit 1 | Remove `DIRECT_URL`, run `npm start` | Startup fails with field error |

---

## Dependencies

- **US-002 / TASK-001** must be complete (Express server, `src/config/env.ts`, and `/health` route exist)
- Supabase project provisioned — both pooler URL (port 6543) and direct URL (port 5432) obtained from Supabase dashboard → Settings → Database
- `DATABASE_URL` and `DIRECT_URL` set in `backend/.env` (local) and Railway environment variables (cloud)

## Security Constraints

- **OWASP A02 (Cryptographic Failures)**: `DIRECT_URL` contains the Supabase database password — stored only in `.env` (git-ignored) and Railway Variables. Never committed.
- **OWASP A03 (Injection)**: Prisma uses parameterised queries by default. Raw SQL in health check uses tagged template `` prisma.$queryRaw`SELECT 1` `` — this is safe; no user input is interpolated.
- **OWASP A05 (Security Misconfiguration)**: `pgbouncer=true` disables prepared statements to prevent PgBouncer transaction-mode failures — without this flag, queries silently fail under load.
- `pool_timeout=30` prevents connection queue from growing unbounded during traffic spikes.

---

## Definition of Done

- [ ] `prisma` and `@prisma/client` installed and version-pinned in `package.json`
- [ ] `backend/prisma/schema.prisma` committed with dual-URL datasource configuration
- [ ] `DIRECT_URL` added to `backend/.env.example` and `backend/src/config/env.ts`
- [ ] `backend/src/db/prisma.ts` singleton committed
- [ ] `connection_limit=10&pgbouncer=true` present in `DATABASE_URL` pattern (`.env.example`)
- [ ] `npx prisma generate` and `npx prisma migrate dev --name init` run successfully
- [ ] `/health` response includes `"db":"ok"` using Prisma `$queryRaw`
- [ ] `db_ms` value in health response is consistently < 100
- [ ] Prisma `$disconnect()` called in SIGTERM graceful shutdown handler
- [ ] Raw `pg` client removed from health route (replaced by Prisma)

## Traceability

| Artefact | ID |
|----------|----|
| User Story | US-003 |
| Epic | EP-TECH |
| NFR | NFR-001 (P95 query < 500 ms), NFR-004 (connection pool bounds) |
| TR | TR-008.6 (connection pooling) |
| Scenario | 1 (Prisma connects, SELECT 1 < 100 ms), 4 (pool sizing for P95) |
