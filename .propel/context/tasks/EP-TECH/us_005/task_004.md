---
id: task_004
us_id: us_005
epic: EP-TECH
title: "Implement HTTP to HTTPS Redirect Middleware via Proxy Header Detection"
status: not-started
layer: backend
effort: 2h
priority: critical
created: 2026-07-22
---

# TASK-004 — Implement HTTP to HTTPS Redirect Middleware via Proxy Header Detection

## Context

**User Story**: US-005 — Security Middleware, Structured Logging, and OpenTelemetry Observability  
**Epic**: EP-TECH — Technical Bootstrap  
**Addresses Acceptance Criteria**: Scenario 4 (HTTP request → HTTP 301 redirect to HTTPS URL)

Railway.app terminates TLS at its edge proxy and forwards traffic to the Node.js container over internal HTTP. The server itself never sees a TLS connection directly. TLS enforcement must therefore be implemented by inspecting the `X-Forwarded-Proto` header that Railway injects: if the value is `http`, redirect the client to the HTTPS equivalent.

HSTS is already set by Helmet (TASK-001), which prevents future non-TLS connections at the browser level. This middleware handles clients that do not honour HSTS (first-time visitors, non-browser clients, or misconfigured tools).

---

## Objective

Create an Express middleware module that checks `X-Forwarded-Proto` on every incoming request and issues an HTTP 301 redirect to the HTTPS URL when the value is `http`. The middleware is a no-op in local development (where no proxy is present) to avoid breaking `curl http://localhost:3001` during development.

---

## Technical Specifications

| Attribute | Value |
|-----------|-------|
| Detection method | `req.headers['x-forwarded-proto'] === 'http'` |
| Redirect status | 301 (Permanent) |
| Redirect target | `https://<host><path><querystring>` |
| Active in | `production` and `staging` environments only |
| Development behaviour | No-op (pass-through) |
| Exemptions | `/health`, `/ready` (Railway health checks come over HTTP internally) |

---

## Implementation Steps

### Step 1 — Create the HTTPS redirect middleware

Create `backend/src/middleware/httpsRedirect.ts`:

```typescript
import { Request, Response, NextFunction } from 'express';

/**
 * Redirects HTTP requests to HTTPS using the Railway/Vercel proxy forwarding header.
 *
 * Railway terminates TLS at its edge and forwards to Node.js over plain HTTP.
 * The `X-Forwarded-Proto` header indicates the original protocol used by the client.
 *
 * Exemptions:
 * - Development environment (no proxy; direct localhost access)
 * - /health and /ready paths (Railway's own health checks use HTTP internally)
 *
 * Security note: trust `X-Forwarded-Proto` only when running behind a known proxy.
 * Railway and Vercel are the only ingress paths — this is safe in the deployment context.
 */
export function httpsRedirect(req: Request, res: Response, next: NextFunction): void {
  const isProduction = process.env['NODE_ENV'] === 'production' || process.env['NODE_ENV'] === 'staging';

  // Skip in local development — no proxy is present
  if (!isProduction) {
    next();
    return;
  }

  // Exempt Railway health check paths — they arrive over internal HTTP
  const exemptPaths = ['/health', '/ready'];
  if (exemptPaths.some((p) => req.path.startsWith(p))) {
    next();
    return;
  }

  const proto = req.headers['x-forwarded-proto'];

  // Only redirect if the original client request was HTTP (not HTTPS)
  if (typeof proto === 'string' && proto.split(',')[0]?.trim() === 'http') {
    const host = req.headers['host'] ?? req.hostname;
    const httpsUrl = `https://${host}${req.originalUrl}`;
    res.redirect(301, httpsUrl);
    return;
  }

  next();
}
```

### Step 2 — Mount the middleware at the top of `app.ts`

Update `backend/src/app.ts` — add `httpsRedirect` before Helmet so that HTTP clients receive the redirect before any other processing:

```typescript
import { httpsRedirect } from './middleware/httpsRedirect';

export function createApp() {
  const app = express();

  // TLS enforcement — redirect HTTP to HTTPS in production (before all other middleware)
  app.use(httpsRedirect);

  // Security headers (Helmet)
  app.use(buildSecurityHeaders());

  // ... rest of middleware unchanged ...
}
```

> **Why before Helmet**: Clients that arrive over HTTP should receive the redirect as quickly as possible, without Helmet adding response headers that are meaningless for a 301. Both approaches are correct; placing it first is marginally more efficient.

### Step 3 — Configure Express to trust Railway's proxy

Railway is a trusted proxy. Add `trust proxy` to prevent `req.ip` from being spoofed and to enable correct protocol detection in Express's built-in mechanisms:

In `app.ts`, immediately after `const app = express()`:

```typescript
const app = express();

// Trust Railway's load balancer proxy — enables req.protocol and X-Forwarded-* headers
// '1' = trust the first hop (Railway edge proxy) only
app.set('trust proxy', 1);
```

### Step 4 — Write unit tests for the redirect middleware

Create `backend/src/middleware/__tests__/httpsRedirect.test.ts`:

```typescript
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

function makeReq(overrides: Partial<Request> = {}): Request {
  return {
    path: '/api/test',
    originalUrl: '/api/test',
    hostname: 'api.example.com',
    headers: {},
    ...overrides,
  } as unknown as Request;
}

function makeRes(): { res: Response; redirectCalled: boolean; redirectArgs: [number, string] | null } {
  let redirectCalled = false;
  let redirectArgs: [number, string] | null = null;

  const res = {
    redirect: (status: number, url: string) => {
      redirectCalled = true;
      redirectArgs = [status, url];
    },
  } as unknown as Response;

  return { res, redirectCalled, redirectArgs };
}

describe('httpsRedirect', () => {
  const originalEnv = process.env['NODE_ENV'];

  afterEach(() => {
    process.env['NODE_ENV'] = originalEnv;
  });

  it('is a no-op in development', async () => {
    process.env['NODE_ENV'] = 'development';
    const { httpsRedirect } = await import('../httpsRedirect');

    const req = makeReq({ headers: { 'x-forwarded-proto': 'http', host: 'api.example.com' } });
    const { res, redirectCalled } = makeRes();
    const next = vi.fn() as NextFunction;

    httpsRedirect(req, res, next);

    expect(redirectCalled).toBe(false);
    expect(next).toHaveBeenCalledOnce();
  });

  it('redirects HTTP to HTTPS with 301 in production', async () => {
    process.env['NODE_ENV'] = 'production';
    const { httpsRedirect } = await import('../httpsRedirect');

    const req = makeReq({
      headers: { 'x-forwarded-proto': 'http', host: 'api.example.com' },
      originalUrl: '/api/jobs',
    });
    const { res, redirectCalled, redirectArgs } = makeRes();
    const next = vi.fn() as NextFunction;

    httpsRedirect(req, res, next);

    expect(redirectCalled).toBe(true);
    expect(redirectArgs).toEqual([301, 'https://api.example.com/api/jobs']);
    expect(next).not.toHaveBeenCalled();
  });

  it('does not redirect HTTPS requests', async () => {
    process.env['NODE_ENV'] = 'production';
    const { httpsRedirect } = await import('../httpsRedirect');

    const req = makeReq({ headers: { 'x-forwarded-proto': 'https', host: 'api.example.com' } });
    const { res, redirectCalled } = makeRes();
    const next = vi.fn() as NextFunction;

    httpsRedirect(req, res, next);

    expect(redirectCalled).toBe(false);
    expect(next).toHaveBeenCalledOnce();
  });

  it('exempts /health from redirect in production', async () => {
    process.env['NODE_ENV'] = 'production';
    const { httpsRedirect } = await import('../httpsRedirect');

    const req = makeReq({
      path: '/health',
      headers: { 'x-forwarded-proto': 'http', host: 'api.example.com' },
    });
    const { res, redirectCalled } = makeRes();
    const next = vi.fn() as NextFunction;

    httpsRedirect(req, res, next);

    expect(redirectCalled).toBe(false);
    expect(next).toHaveBeenCalledOnce();
  });

  it('exempts /ready from redirect in production', async () => {
    process.env['NODE_ENV'] = 'production';
    const { httpsRedirect } = await import('../httpsRedirect');

    const req = makeReq({
      path: '/ready',
      headers: { 'x-forwarded-proto': 'http', host: 'api.example.com' },
    });
    const { res, redirectCalled } = makeRes();
    const next = vi.fn() as NextFunction;

    httpsRedirect(req, res, next);

    expect(redirectCalled).toBe(false);
    expect(next).toHaveBeenCalledOnce();
  });
});
```

### Step 5 — Verify redirect on deployed staging URL

Once deployed to Railway staging (which enforces `NODE_ENV=staging`):

```bash
# Use the Railway HTTP URL (no HTTPS scheme)
# Railway redirects HTTP → HTTPS at the edge, but this confirms our middleware fires first
STAGING_HTTP_URL="http://api-staging.ai-interview.railway.app"

curl -v -L "${STAGING_HTTP_URL}/api/test" 2>&1 | grep -E "HTTP/|location:|< "
```

Expected output:

```
> GET /api/test HTTP/1.1
< HTTP/1.1 301 Moved Permanently
< location: https://api-staging.ai-interview.railway.app/api/test
< ...
> GET /api/test HTTP/2
< HTTP/2 404
```

The 301 confirms our middleware fired. The 404 is expected (the route doesn't exist yet).

Also confirm that `/health` still returns HTTP 200 without redirect:

```bash
curl -v "${STAGING_HTTP_URL}/health"
# Expected: HTTP 200 (no redirect)
```

---

## Validation

| Check | Method | Expected Result |
|-------|--------|-----------------|
| HTTP → HTTPS redirect in production | `curl -v http://<staging-url>/api/test` | HTTP 301, `location: https://...` header |
| `/health` exempt from redirect | `curl -v http://<staging-url>/health` | HTTP 200, no redirect |
| `/ready` exempt from redirect | `curl -v http://<staging-url>/ready` | HTTP 200, no redirect |
| No redirect in development | `curl http://localhost:3001/health` | HTTP 200, no redirect |
| HTTPS requests pass through | `curl https://<staging-url>/health` | HTTP 200 directly |
| `trust proxy` set | `req.ip` in staging logs | Real client IP (not proxy IP) |
| Unit tests pass | `npm test` | 5 redirect tests green |
| TypeScript compiles | `npm run type-check` | Exit 0 |

---

## Dependencies

- **TASK-001** must be complete (Helmet `securityHeaders.ts` exists — `httpsRedirect` mounts before it)
- Railway staging deployment must be active (`NODE_ENV=staging` set in Railway Variables from US-002/TASK-003)

## Security Constraints

- **OWASP A02 (Cryptographic Failures)**: HTTP 301 (permanent redirect) trains browsers and HTTP clients to always use HTTPS. HTTP 302 (temporary) would not benefit from browser caching.
- **OWASP A05 (Security Misconfiguration)**: `app.set('trust proxy', 1)` trusts only the first proxy hop. Setting this to `true` (trust all hops) would allow clients to spoof `X-Forwarded-For` and `X-Forwarded-Proto`, enabling the redirect to be bypassed.
- `/health` and `/ready` are exempted because Railway's health check system sends HTTP probes over the internal network — they do not have `X-Forwarded-Proto: https`. Redirecting them would cause Railway to see a 301 instead of 200 and trigger a rollback.
- The middleware reads only `x-forwarded-proto`, never `req.protocol`, because Express's `req.protocol` respects `trust proxy` but can be influenced by multiple hops in ways that `x-forwarded-proto` is not in our single-hop Railway setup.

---

## Definition of Done

- [ ] `backend/src/middleware/httpsRedirect.ts` committed
- [ ] `app.use(httpsRedirect)` added as first middleware in `app.ts` (before Helmet)
- [ ] `app.set('trust proxy', 1)` added to `app.ts`
- [ ] `backend/src/middleware/__tests__/httpsRedirect.test.ts` committed (5 tests)
- [ ] `npm test` exits 0 (5 redirect tests pass)
- [ ] HTTP 301 with `location: https://` confirmed on Railway staging via `curl`
- [ ] `/health` and `/ready` return HTTP 200 without redirect on Railway staging

## Traceability

| Artefact | ID |
|----------|----|
| User Story | US-005 |
| Epic | EP-TECH |
| NFR | NFR-004 (TLS enforced — HTTP redirected to HTTPS) |
| Scenario | 4 (HTTP client receives 301 to HTTPS URL) |
