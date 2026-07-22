---
id: task_002
us_id: us_003
epic: EP-TECH
title: "Formalise Upstash Redis Typed Client Singleton with Sub-50ms PING Health Check"
status: not-started
layer: backend
effort: 2h
priority: critical
created: 2026-07-22
---

# TASK-002 — Formalise Upstash Redis Typed Client Singleton with Sub-50ms PING Health Check

## Context

**User Story**: US-003 — Configure Supabase PostgreSQL with Prisma ORM and Upstash Redis  
**Epic**: EP-TECH — Technical Bootstrap  
**Addresses Acceptance Criteria**: Scenario 2 (Redis PING succeeds on startup, `redis: "ok"` in health response, round-trip latency < 50 ms)

The `@upstash/redis` import was introduced inline in the US-002 health route. This task extracts it into a typed singleton module, adds latency instrumentation, and tightens the `/health` response to surface `redis_ms` so that the < 50 ms SLA can be continuously monitored. The rate limiting module (TASK-003) will reuse this singleton.

---

## Objective

Create `backend/src/db/redis.ts` as a typed singleton export, update `/health` to measure PING round-trip latency, log a warning when it exceeds 50 ms, and verify the constraint is met against the live Upstash instance.

---

## Technical Specifications

| Attribute | Value |
|-----------|-------|
| Client Library | `@upstash/redis` (REST-based, edge-compatible) |
| Connection | REST over HTTPS — no persistent TCP socket |
| PING target latency | < 50 ms round-trip |
| Health field | `redis: "ok"` + `redis_ms: "<n>"` |
| Singleton scope | Module-level (one instance per Node.js process) |
| Error behaviour | Redis unavailable → `redis: "error"`, HTTP 503 from `/health` |

---

## Implementation Steps

### Step 1 — Verify `@upstash/redis` is installed

`@upstash/redis` was listed in US-002/TASK-001. Confirm it is present:

```bash
cd backend
npm list @upstash/redis
```

If missing:

```bash
npm install @upstash/redis
```

### Step 2 — Create the Redis singleton module

Create `backend/src/db/redis.ts`:

```typescript
import { Redis } from '@upstash/redis';
import { env } from '../config/env';

/**
 * Singleton Upstash Redis REST client.
 * Reused across the application — import `redis` directly, never call `new Redis()` elsewhere.
 */
export const redis = new Redis({
  url: env.UPSTASH_REDIS_REST_URL,
  token: env.UPSTASH_REDIS_REST_TOKEN,
  // Retry on transient network errors (3 attempts, 200 ms apart)
  retry: {
    retries: 3,
    backoff: (retryCount) => Math.min(200 * Math.pow(2, retryCount), 2000),
  },
});

/**
 * Sends a PING and returns round-trip latency in milliseconds.
 * Throws if the PING fails or does not return "PONG".
 */
export async function pingRedis(): Promise<number> {
  const start = Date.now();
  const result = await redis.ping();
  const latencyMs = Date.now() - start;

  if (result !== 'PONG') {
    throw new Error(`Unexpected PING response: ${String(result)}`);
  }

  return latencyMs;
}
```

### Step 3 — Update `/health` to use the singleton and surface latency

Replace the inline Redis block in `backend/src/routes/health.ts`:

```typescript
import { Router, Request, Response } from 'express';
import prisma from '../db/prisma';
import { pingRedis } from '../db/redis';

const router = Router();

router.get('/health', async (_req: Request, res: Response) => {
  const checks: Record<string, string> = { status: 'ok' };
  let statusCode = 200;

  // Database check
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

  // Redis PING check with latency guard
  try {
    const redisMs = await pingRedis();
    checks['redis'] = 'ok';
    checks['redis_ms'] = String(redisMs);
    if (redisMs > 50) {
      console.warn(`[health] Redis PING latency ${redisMs}ms exceeds 50ms target`);
    }
  } catch (err) {
    console.error('[health] Redis check failed:', err);
    checks['redis'] = 'error';
    checks['status'] = 'degraded';
    statusCode = 503;
  }

  res.status(statusCode).json(checks);
});

router.get('/ready', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ready' });
});

export default router;
```

Full healthy response shape after this task:

```json
{
  "status": "ok",
  "db": "ok",
  "db_ms": "12",
  "redis": "ok",
  "redis_ms": "18",
  "socket": "ok",
  "connections": "0"
}
```

### Step 4 — Verify environment variables are already declared

`UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` were added to `env.ts` in US-002/TASK-001. Confirm they exist:

```bash
grep -n "UPSTASH_REDIS" backend/src/config/env.ts
```

Expected: both variables present with `.string()` validation.

### Step 5 — Test locally against Upstash

```bash
cd backend
npm run dev
curl -s http://localhost:3001/health | jq .
```

Expected (with real Upstash credentials in `.env`):

```json
{
  "status": "ok",
  "db": "ok",
  "db_ms": "14",
  "redis": "ok",
  "redis_ms": "22"
}
```

Confirm `redis_ms` is below 50 consistently (run 5 times; check for variance).

### Step 6 — Add Upstash region note to `.env.example`

Update the Redis section comment in `backend/.env.example`:

```env
# Upstash Redis — REST API (no persistent TCP socket; works in serverless & Railway)
# Select the closest region in Upstash console to minimise PING latency
# Target: PING < 50ms — use 'us-east-1' for Railway US regions
UPSTASH_REDIS_REST_URL=https://[endpoint].upstash.io
UPSTASH_REDIS_REST_TOKEN=your-token-here
```

---

## Validation

| Check | Command / Method | Expected Result |
|-------|-----------------|-----------------|
| `redis.ts` compiles | `npm run type-check` | Exit 0 |
| PING returns PONG | `pingRedis()` in isolation | No throw, returns number |
| `redis_ms` < 50 | `curl http://localhost:3001/health` (5× runs) | All `redis_ms` values < 50 |
| Redis unavailable → 503 | Set `UPSTASH_REDIS_REST_URL` to invalid URL | `/health` returns HTTP 503, `"redis":"error"` |
| Singleton reused | Import `redis` in two modules | Same instance (no second client log) |
| No `new Redis()` outside singleton | `grep -r "new Redis(" backend/src` | Only one occurrence in `src/db/redis.ts` |

---

## Dependencies

- **TASK-001** must be complete (Prisma singleton and updated `/health` structure must exist)
- `@upstash/redis` installed
- `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` in `backend/.env` and Railway Variables

## Security Constraints

- **OWASP A02 (Cryptographic Failures)**: `UPSTASH_REDIS_REST_TOKEN` is a server-only secret — stored only in `.env` (git-ignored) and Railway Variables. The `@upstash/redis` REST client uses HTTPS exclusively; no unencrypted Redis TCP connections.
- **OWASP A09 (Security Logging and Monitoring Failures)**: Latency warnings are logged when PING exceeds 50 ms, enabling proactive detection of Upstash region drift or network degradation.
- Retry configuration (3 attempts, exponential backoff) prevents transient network blips from marking the service as degraded in `/health`.

---

## Definition of Done

- [ ] `backend/src/db/redis.ts` singleton committed with `redis` export and `pingRedis()` helper
- [ ] No `new Redis()` call exists outside `backend/src/db/redis.ts`
- [ ] `/health` imports `pingRedis` from the singleton module (inline client removed)
- [ ] `/health` response includes `"redis":"ok"` and `"redis_ms":"<n>"`
- [ ] `redis_ms` value consistently < 50 ms against live Upstash (5 consecutive runs)
- [ ] Redis unavailable returns HTTP 503 with `"redis":"error"` (tested locally)
- [ ] `npm run type-check` exits 0

## Traceability

| Artefact | ID |
|----------|----|
| User Story | US-003 |
| Epic | EP-TECH |
| NFR | NFR-001 (Redis latency target), NFR-004 (secure credential handling) |
| Scenario | 2 (Redis PING < 50 ms, `redis: "ok"` in `/health`) |
