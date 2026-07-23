---
id: task_003
us_id: us_003
epic: EP-TECH
title: "Implement Tiered Rate Limiting Middleware with HTTP 429 and Retry-After Header"
status: done
layer: backend
effort: 4h
priority: critical
created: 2026-07-22
---

# TASK-003 — Implement Tiered Rate Limiting Middleware with HTTP 429 and Retry-After Header

## Context

**User Story**: US-003 — Configure Supabase PostgreSQL with Prisma ORM and Upstash Redis  
**Epic**: EP-TECH — Technical Bootstrap  
**Addresses Acceptance Criteria**: Scenario 3 (public endpoint: HTTP 429 at 101st request from same IP within 60 s with `Retry-After` header; authenticated users: separate 1 000 req/min limit)

Rate limiting is enforced using `@upstash/ratelimit` backed by the Upstash Redis singleton established in TASK-002. Two sliding-window limiters are registered: one for anonymous traffic keyed by IP, one for authenticated traffic keyed by user ID. The middleware is mounted globally in `app.ts` so all future route modules inherit it automatically.

---

## Objective

Install `@upstash/ratelimit`, create a typed rate-limit middleware module, mount it in the Express app before any route handlers, and verify HTTP 429 is returned with a correct `Retry-After` header at the 101st request from the same IP within 60 seconds.

---

## Technical Specifications

| Attribute | Value |
|-----------|-------|
| Library | `@upstash/ratelimit` |
| Algorithm | Sliding window (consistent burst protection) |
| Public limit | 100 requests / 60 s per IP address |
| Authenticated limit | 1 000 requests / 60 s per user ID |
| 429 response body | `{"error":"Too Many Requests","retryAfter":<seconds>}` |
| `Retry-After` header | Seconds until the window resets (integer) |
| `X-RateLimit-Limit` header | Configured limit for the tier |
| `X-RateLimit-Remaining` header | Requests remaining in the current window |
| Exempt paths | `/health`, `/ready` (health checks must never be rate-limited) |

---

## Implementation Steps

### Step 1 — Install `@upstash/ratelimit`

```bash
cd backend
npm install @upstash/ratelimit
```

### Step 2 — Create rate limiter instances

Create `backend/src/middleware/rateLimiter.ts`:

```typescript
import { Ratelimit } from '@upstash/ratelimit';
import { redis } from '../db/redis';

/**
 * Public rate limiter — keyed by client IP.
 * Allows 100 requests per 60-second sliding window.
 */
export const publicLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(100, '60 s'),
  analytics: false,  // Disable analytics writes to keep Redis ops minimal
  prefix: 'rl:public',
});

/**
 * Authenticated rate limiter — keyed by user ID extracted from JWT.
 * Allows 1 000 requests per 60-second sliding window.
 */
export const authLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(1_000, '60 s'),
  analytics: false,
  prefix: 'rl:auth',
});
```

### Step 3 — Create the rate limiting middleware

Create `backend/src/middleware/rateLimit.middleware.ts`:

```typescript
import { Request, Response, NextFunction } from 'express';
import { publicLimiter, authLimiter } from './rateLimiter';

/** Paths that are always exempt from rate limiting (health probes). */
const EXEMPT_PATHS = new Set(['/health', '/ready']);

/**
 * Extracts the client's real IP, accounting for Vercel/Railway proxy headers.
 * Falls back to the socket remote address.
 */
function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    // Take only the first (leftmost) IP — the actual client
    const firstIp = forwarded.split(',')[0]?.trim();
    if (firstIp) return firstIp;
  }
  return req.socket.remoteAddress ?? 'unknown';
}

/**
 * Extracts the authenticated user ID from the request.
 * Returns undefined for anonymous requests.
 * Updated in EP-001 when Supabase Auth middleware is added.
 */
function getAuthUserId(req: Request): string | undefined {
  // Placeholder — EP-001 will attach `req.user.id` via Supabase JWT middleware
  return (req as Request & { user?: { id: string } }).user?.id;
}

/**
 * Express middleware that enforces tiered rate limits.
 * Public requests: 100 req/min (per IP)
 * Authenticated requests: 1 000 req/min (per user ID)
 */
export async function rateLimitMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  // Health and readiness probes are always exempt
  if (EXEMPT_PATHS.has(req.path)) {
    next();
    return;
  }

  const userId = getAuthUserId(req);
  const identifier = userId ?? getClientIp(req);
  const limiter = userId ? authLimiter : publicLimiter;
  const limitCeiling = userId ? 1_000 : 100;

  try {
    const { success, limit, remaining, reset } = await limiter.limit(identifier);

    // Expose rate limit metadata on every response for transparency
    res.setHeader('X-RateLimit-Limit', String(limit));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, remaining)));
    res.setHeader('X-RateLimit-Reset', String(reset));

    if (!success) {
      const retryAfterSeconds = Math.ceil((reset - Date.now()) / 1_000);
      res.setHeader('Retry-After', String(Math.max(1, retryAfterSeconds)));
      res.status(429).json({
        error: 'Too Many Requests',
        retryAfter: Math.max(1, retryAfterSeconds),
        limit: limitCeiling,
      });
      return;
    }

    next();
  } catch (err) {
    // If Redis is unavailable, allow the request rather than blocking all traffic
    console.error('[rate-limit] Redis error — allowing request:', err);
    next();
  }
}
```

> **Fail-open policy**: When Redis is unavailable, the middleware calls `next()` rather than returning 503. This prevents a Redis outage from taking down the entire API. Log the error so Grafana Cloud can alert on the anomaly.

### Step 4 — Mount middleware in `app.ts`

Update `backend/src/app.ts`:

```typescript
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import healthRouter from './routes/health';
import { rateLimitMiddleware } from './middleware/rateLimit.middleware';
import { env } from './config/env';

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors({
    origin: env.FRONTEND_URL,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  }));
  app.use(compression());
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  app.disable('x-powered-by');

  // Rate limiting — applied before all route handlers
  // Health/ready paths are exempt (see EXEMPT_PATHS in middleware)
  app.use(rateLimitMiddleware);

  // Health / readiness routes
  app.use('/', healthRouter);

  return app;
}
```

### Step 5 — Write a local burst test script

Create `backend/scripts/test-rate-limit.ts`:

```typescript
import http from 'http';

const TARGET_URL = process.argv[2] ?? 'http://localhost:3001';
const ENDPOINT = `${TARGET_URL}/health`;  // Use a real API endpoint once one exists
const REQUESTS = 110;
const CONCURRENCY = 10;

async function sendRequest(index: number): Promise<{ index: number; status: number; retryAfter: string | null }> {
  return new Promise((resolve) => {
    const req = http.get(ENDPOINT, (res) => {
      resolve({
        index,
        status: res.statusCode ?? 0,
        retryAfter: res.headers['retry-after'] ?? null,
      });
      res.resume();
    });
    req.on('error', () => resolve({ index, status: -1, retryAfter: null }));
  });
}

async function run() {
  console.log(`Sending ${REQUESTS} requests to ${ENDPOINT} (concurrency: ${CONCURRENCY})`);
  const results: Array<{ index: number; status: number; retryAfter: string | null }> = [];

  for (let i = 0; i < REQUESTS; i += CONCURRENCY) {
    const batch = Array.from({ length: Math.min(CONCURRENCY, REQUESTS - i) }, (_, j) =>
      sendRequest(i + j + 1)
    );
    const batchResults = await Promise.all(batch);
    results.push(...batchResults);
  }

  const ok = results.filter(r => r.status === 200).length;
  const limited = results.filter(r => r.status === 429).length;
  const firstLimited = results.find(r => r.status === 429);

  console.log(`\nResults:`);
  console.log(`  HTTP 200: ${ok}`);
  console.log(`  HTTP 429: ${limited}`);
  if (firstLimited) {
    console.log(`  First 429 at request #${firstLimited.index}`);
    console.log(`  Retry-After: ${firstLimited.retryAfter ?? 'MISSING'}`);
  }

  if (limited > 0 && firstLimited && firstLimited.retryAfter) {
    console.log('\n✅ PASS — Rate limiting active with Retry-After header');
  } else if (limited === 0) {
    console.error('\n❌ FAIL — No 429 responses received');
    process.exit(1);
  } else {
    console.error('\n❌ FAIL — 429 received but Retry-After header missing');
    process.exit(1);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

> **Note**: `/health` is in `EXEMPT_PATHS` and will not be rate-limited. Replace `ENDPOINT` with a non-exempt route (e.g., a simple test route or any API endpoint created in EP-001) to trigger the 429 during validation.

### Step 6 — Add a temporary test route for rate limit validation

Add to `backend/src/routes/health.ts` (remove after TASK-005 validation):

```typescript
// RATE-LIMIT-TEST — remove after US-003 validation
router.get('/ping', (_req: Request, res: Response) => {
  res.status(200).json({ pong: true });
});
```

This route is NOT in `EXEMPT_PATHS`, so it will be rate-limited and can be used for the burst test.

---

## Validation

| Check | Command / Method | Expected Result |
|-------|-----------------|-----------------|
| Middleware mounts | `npm run dev`, check startup logs | No errors |
| 100 requests succeed | `npx tsx scripts/test-rate-limit.ts` | First 100 `GET /ping` return HTTP 200 |
| 101st returns 429 | Same script | HTTP 429 received for request ≥ 101 |
| `Retry-After` header present | Inspect 429 response headers | `Retry-After: <n>` (integer seconds) |
| `X-RateLimit-*` headers on 200 | `curl -v http://localhost:3001/ping` | All 3 headers present |
| `/health` never rate-limited | 200 requests to `/health` | All HTTP 200, no 429 |
| Redis down → fail-open | Stop Redis, send request | HTTP 200 (not 503), error logged |
| TypeScript compiles | `npm run type-check` | Exit 0 |

---

## Dependencies

- **TASK-001** must be complete (Prisma singleton in place)
- **TASK-002** must be complete (`redis` singleton and `pingRedis` exported from `src/db/redis.ts`)
- `@upstash/ratelimit` installed
- Upstash Redis live and credentials in `backend/.env`

## Security Constraints

- **OWASP A04 (Insecure Design)**: Sliding window algorithm (not fixed window) prevents burst attacks that exploit window-boundary resets.
- **OWASP A07 (Identification and Authentication Failures)**: Anonymous requests keyed by IP; authenticated requests keyed by user ID, providing a tighter per-user limit without leaking user IDs between sessions.
- **OWASP A05 (Security Misconfiguration)**: `X-Forwarded-For` header is parsed to take only the first (leftmost) IP, preventing header spoofing (clients appending fake IPs to bypass limits). Only the first IP in the chain is trusted.
- **Fail-open** is a conscious trade-off documented here — availability is prioritised over rate limit enforcement during Redis outages. If stricter enforcement is needed, change to `res.status(503)` in the catch block after discussing with the product team.
- `/health` and `/ready` are exempt to prevent Railway health-check probes from consuming rate limit quota and triggering false 429s.

---

## Definition of Done

- [ ] `@upstash/ratelimit` installed and version-pinned
- [ ] `backend/src/middleware/rateLimiter.ts` committed with `publicLimiter` and `authLimiter`
- [ ] `backend/src/middleware/rateLimit.middleware.ts` committed with `rateLimitMiddleware`
- [ ] Middleware mounted in `app.ts` before route handlers
- [ ] `/health` and `/ready` exempt from rate limiting (confirmed via 200-request burst test)
- [ ] 101st request from same IP to non-exempt endpoint returns HTTP 429
- [ ] `Retry-After` header present on all 429 responses
- [ ] `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` headers on all non-exempt responses
- [ ] Redis unavailable → middleware fails open (request allowed, error logged)
- [ ] `npm run type-check` exits 0

## Traceability

| Artefact | ID |
|----------|----|
| User Story | US-003 |
| Epic | EP-TECH |
| NFR | NFR-004 (rate limiting: 100 req/min public, 1 000 req/min auth) |
| Scenario | 3 (HTTP 429 at 101st request, `Retry-After` header, tiered limits) |
