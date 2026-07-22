---
id: task_001
us_id: us_005
epic: EP-TECH
title: "Harden Helmet.js Security Headers to OWASP Baseline"
status: not-started
layer: backend
effort: 3h
priority: critical
created: 2026-07-22
---

# TASK-001 — Harden Helmet.js Security Headers to OWASP Baseline

## Context

**User Story**: US-005 — Security Middleware, Structured Logging, and OpenTelemetry Observability  
**Epic**: EP-TECH — Technical Bootstrap  
**Addresses Acceptance Criteria**: Scenario 1 (security headers present on all responses: HSTS, X-Frame-Options: DENY, X-Content-Type-Options: nosniff, CSP, Referrer-Policy: strict-origin)

Helmet was installed in US-002/TASK-001 with default settings. The default configuration does not fully satisfy the acceptance criteria — specifically, `X-Frame-Options` defaults to `SAMEORIGIN` (not `DENY`), and the CSP is not configured. This task replaces the default `app.use(helmet())` call with an explicit, fully-specified Helmet configuration that achieves a securityheaders.com grade of A or better.

---

## Objective

Replace the default `helmet()` call in `app.ts` with an explicitly configured Helmet middleware block. Each header directive is documented with its security rationale. Verify with `curl -I` that all five required headers are present on every API response.

---

## Technical Specifications

| Header | Required Value | OWASP Control |
|--------|---------------|---------------|
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` | A02 — force TLS |
| `X-Frame-Options` | `DENY` | A05 — prevent clickjacking |
| `X-Content-Type-Options` | `nosniff` | A05 — prevent MIME sniffing |
| `Content-Security-Policy` | Restrictive API-only policy (see Step 3) | A05 — XSS mitigation |
| `Referrer-Policy` | `strict-origin` | A02 — prevent referrer leakage |
| `X-Powered-By` | Removed | A05 — suppress fingerprint |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` | A05 — restrict browser APIs |

---

## Implementation Steps

### Step 1 — Install Helmet type definitions (if not present)

```bash
cd backend
npm list @types/helmet   # Check if already installed
# Helmet v7+ ships its own types — @types/helmet is not needed
npm list helmet          # Confirm version ≥ 7.x
```

If Helmet < 7.x, upgrade:

```bash
npm install helmet@latest
```

### Step 2 — Create a dedicated security headers module

Create `backend/src/middleware/securityHeaders.ts`:

```typescript
import helmet from 'helmet';
import { env } from '../config/env';

/**
 * Returns a fully-specified Helmet middleware configuration.
 *
 * Each directive is explicit — Helmet defaults are intentionally overridden
 * to satisfy the US-005 acceptance criteria and achieve securityheaders.com grade A.
 */
export function buildSecurityHeaders() {
  return helmet({
    // HSTS — force TLS for 2 years, include subdomains, submit to preload list
    strictTransportSecurity: {
      maxAge: 63_072_000,        // 2 years in seconds
      includeSubDomains: true,
      preload: true,
    },

    // Clickjacking — DENY prevents embedding in any frame (not just same origin)
    frameguard: { action: 'deny' },

    // MIME sniffing prevention
    noSniff: true,

    // Referrer policy — sends origin only, not full URL; prevents path leakage
    referrerPolicy: { policy: 'strict-origin' },

    // Permissions policy — disable browser APIs unused by this API server
    permissionsPolicy: {
      features: {
        camera: [],
        microphone: [],
        geolocation: [],
        payment: [],
        usb: [],
      },
    },

    // Content Security Policy — API server; no browser resources served here
    // Feature epics that serve HTML (e.g., webhooks) will tighten per-route
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'none'"],
        scriptSrc: ["'none'"],
        styleSrc: ["'none'"],
        imgSrc: ["'none'"],
        connectSrc: ["'self'"],
        fontSrc: ["'none'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'none'"],
        frameSrc: ["'none'"],
        // Allow CORS preflight responses to the frontend origin
        formAction: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'none'"],
        upgradeInsecureRequests: [],
      },
    },

    // Cross-Origin policies
    crossOriginEmbedderPolicy: false,    // Not relevant for a JSON API
    crossOriginOpenerPolicy: { policy: 'same-origin' },
    crossOriginResourcePolicy: { policy: 'cross-origin' },  // Allow CDN-served assets

    // Suppress X-Powered-By header
    hidePoweredBy: true,

    // DNS prefetch control
    dnsPrefetchControl: { allow: false },

    // Download options — prevent IE from executing downloads in site context
    ieNoOpen: true,

    // XSS filter — legacy browsers; modern browsers use CSP
    xssFilter: true,
  });
}
```

### Step 3 — Update `app.ts` to use the hardened headers module

Replace the existing `app.use(helmet())` line in `backend/src/app.ts`:

```typescript
import { buildSecurityHeaders } from './middleware/securityHeaders';

export function createApp() {
  const app = express();

  // Security headers — must be first middleware (before CORS, routes, etc.)
  app.use(buildSecurityHeaders());

  // CORS — after Helmet so security headers are always present even on CORS errors
  app.use(cors({
    origin: env.FRONTEND_URL,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
    exposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset', 'Retry-After'],
  }));

  // ... rest of middleware unchanged ...
}
```

> **Why Helmet before CORS**: Security headers are non-negotiable and must appear on every response, including CORS 4xx errors. Placing Helmet first ensures this invariant.

### Step 4 — Add a unit test for security headers

Create `backend/src/middleware/__tests__/securityHeaders.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import express from 'express';
import { buildSecurityHeaders } from '../securityHeaders';

// supertest does not make real HTTP calls — safe to use in unit tests
function buildTestApp() {
  const app = express();
  app.use(buildSecurityHeaders());
  app.get('/test', (_req, res) => res.json({ ok: true }));
  return app;
}

describe('buildSecurityHeaders', () => {
  it('sets Strict-Transport-Security with max-age 63072000', async () => {
    const res = await request(buildTestApp()).get('/test');
    expect(res.headers['strict-transport-security']).toContain('max-age=63072000');
    expect(res.headers['strict-transport-security']).toContain('includeSubDomains');
    expect(res.headers['strict-transport-security']).toContain('preload');
  });

  it('sets X-Frame-Options to DENY', async () => {
    const res = await request(buildTestApp()).get('/test');
    expect(res.headers['x-frame-options']).toBe('DENY');
  });

  it('sets X-Content-Type-Options to nosniff', async () => {
    const res = await request(buildTestApp()).get('/test');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('sets Referrer-Policy to strict-origin', async () => {
    const res = await request(buildTestApp()).get('/test');
    expect(res.headers['referrer-policy']).toBe('strict-origin');
  });

  it('sets Content-Security-Policy with default-src none', async () => {
    const res = await request(buildTestApp()).get('/test');
    expect(res.headers['content-security-policy']).toContain("default-src 'none'");
  });

  it('removes X-Powered-By header', async () => {
    const res = await request(buildTestApp()).get('/test');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});
```

Install `supertest` for Express integration testing:

```bash
cd backend
npm install -D supertest @types/supertest
```

### Step 5 — Verify headers locally

```bash
npm run dev
curl -I http://localhost:3001/health | grep -E "strict-transport|x-frame|x-content|content-security|referrer"
```

Expected output (approximate):

```
strict-transport-security: max-age=63072000; includeSubDomains; preload
x-frame-options: DENY
x-content-type-options: nosniff
referrer-policy: strict-origin
content-security-policy: default-src 'none'; ...
```

---

## Validation

| Check | Command | Expected Result |
|-------|---------|-----------------|
| HSTS header | `curl -I http://localhost:3001/health` | `strict-transport-security: max-age=63072000; includeSubDomains; preload` |
| X-Frame-Options DENY | Same | `x-frame-options: DENY` |
| X-Content-Type-Options nosniff | Same | `x-content-type-options: nosniff` |
| Referrer-Policy strict-origin | Same | `referrer-policy: strict-origin` |
| CSP default-src none | Same | `content-security-policy` present with `default-src 'none'` |
| X-Powered-By absent | Same | Header not present |
| Unit tests pass | `npm test` | All 6 header tests green |
| TypeScript compiles | `npm run type-check` | Exit 0 |

---

## Dependencies

- **US-002 / TASK-001** must be complete (Express app and `app.ts` must exist with `helmet()` call to replace)
- Helmet ≥ 7.x installed

## Security Constraints

- **OWASP A05 (Security Misconfiguration)**: Every header directive is explicitly set — no Helmet defaults are relied upon silently. This makes the security posture auditable from source.
- **OWASP A02 (Cryptographic Failures)**: HSTS `preload` is set now to enable future submission to the HSTS preload list. Removing this later requires a 2-year wait; including it from day one costs nothing.
- `X-Frame-Options: DENY` (not `SAMEORIGIN`) is required by the acceptance criterion. SAMEORIGIN would allow embedding within the same domain — DENY is stricter and correct for an API server.
- `connectSrc: ["'self'"]` in CSP allows only same-origin connections. Feature epics that add external API calls from server-side routes must update this list explicitly.

---

## Definition of Done

- [ ] `backend/src/middleware/securityHeaders.ts` committed with all 7 headers explicitly configured
- [ ] `app.use(buildSecurityHeaders())` replaces `app.use(helmet())` in `app.ts`
- [ ] `supertest` installed as dev dependency
- [ ] `backend/src/middleware/__tests__/securityHeaders.test.ts` committed (6 tests)
- [ ] `npm test` exits 0 (all 6 header tests pass)
- [ ] `curl -I http://localhost:3001/health` shows all 5 acceptance-criteria headers
- [ ] `X-Powered-By` absent from all responses

## Traceability

| Artefact | ID |
|----------|----|
| User Story | US-005 |
| Epic | EP-TECH |
| NFR | NFR-004 (TLS, security headers — OWASP A05, A02) |
| Scenario | 1 (all 5 required headers present on every response) |
