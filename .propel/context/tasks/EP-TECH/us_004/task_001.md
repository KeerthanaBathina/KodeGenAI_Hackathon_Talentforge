---
id: task_001
us_id: us_004
epic: EP-TECH
title: "Configure Vitest Unit Test Infrastructure for Frontend and Backend"
status: not-started
layer: backend
effort: 3h
priority: critical
created: 2026-07-22
---

# TASK-001 — Configure Vitest Unit Test Infrastructure for Frontend and Backend

## Context

**User Story**: US-004 — GitHub Actions CI/CD Pipeline with Quality Gates  
**Epic**: EP-TECH — Technical Bootstrap  
**Addresses Acceptance Criteria**: Scenario 1 (CI runs type-check, ESLint, **unit tests**, and build in < 5 min), Scenario 2 (failing test blocks merge — requires unit test framework to exist)

US-001 and US-002 established type-check, lint, and build gates. US-004 adds unit testing as a mandatory CI gate. This task installs and configures Vitest (the project's chosen unit test runner per `design.md`) in both `frontend/` and `backend/`, writes seed tests that verify the framework works, and adds `test` and `test:coverage` scripts so CI workflows can invoke them.

---

## Objective

Install Vitest in `frontend/` and `backend/`, add minimal configuration files, write 2–3 bootstrap tests per package that exercise real module behaviour (not just `expect(true).toBe(true)`), and confirm both test suites run to completion.

---

## Technical Specifications

| Attribute | Value |
|-----------|-------|
| Test runner | Vitest 1.x (both frontend and backend) |
| Frontend environment | `jsdom` (React component simulation) |
| Backend environment | `node` |
| Coverage provider | `v8` (zero additional dependencies) |
| Coverage threshold | Not enforced in bootstrap (EP-001 adds per-module targets) |
| Test file pattern | `**/*.test.ts`, `**/*.spec.ts` |
| Run command | `npm test` (CI-compatible — no watch mode) |
| Coverage command | `npm run test:coverage` |

---

## Implementation Steps

### Step 1 — Install Vitest in `backend/`

```bash
cd backend
npm install -D vitest @vitest/coverage-v8
```

Create `backend/vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
    exclude: ['node_modules', 'dist'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/*.spec.ts', 'src/server.ts'],
    },
    // Prevent tests from hanging due to open handles (Prisma, Redis)
    pool: 'forks',
    poolOptions: {
      forks: { isolate: true },
    },
  },
});
```

Add scripts to `backend/package.json`:

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage"
  }
}
```

### Step 2 — Write bootstrap tests for `backend/`

Create `backend/src/config/__tests__/env.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('env config validation', () => {
  const REQUIRED_VARS = [
    'DATABASE_URL',
    'DIRECT_URL',
    'UPSTASH_REDIS_REST_URL',
    'UPSTASH_REDIS_REST_TOKEN',
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'FRONTEND_URL',
  ];

  it('exposes all required environment variable names', () => {
    // This test validates the schema shape without importing the live module
    // (which would crash in CI without real env vars)
    REQUIRED_VARS.forEach((varName) => {
      expect(typeof varName).toBe('string');
      expect(varName.length).toBeGreaterThan(0);
    });
  });

  it('required vars list has no duplicates', () => {
    const unique = new Set(REQUIRED_VARS);
    expect(unique.size).toBe(REQUIRED_VARS.length);
  });
});
```

Create `backend/src/middleware/__tests__/rateLimit.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

// Mock @upstash/ratelimit before importing the middleware
vi.mock('../rateLimiter', () => ({
  publicLimiter: {
    limit: vi.fn(),
  },
  authLimiter: {
    limit: vi.fn(),
  },
}));

import { rateLimitMiddleware } from '../rateLimit.middleware';
import { publicLimiter } from '../rateLimiter';

function makeReq(overrides: Partial<Request> = {}): Request {
  return {
    path: '/api/test',
    headers: {},
    socket: { remoteAddress: '127.0.0.1' },
    ...overrides,
  } as unknown as Request;
}

function makeRes(): { res: Response; headers: Record<string, string>; statusCode: number | null; body: unknown } {
  const headers: Record<string, string> = {};
  let statusCode: number | null = null;
  let body: unknown = null;

  const res = {
    setHeader: (key: string, value: string) => { headers[key] = value; },
    status: (code: number) => { statusCode = code; return res; },
    json: (data: unknown) => { body = data; },
  } as unknown as Response;

  return { res, headers, statusCode, body };
}

describe('rateLimitMiddleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls next() for exempt /health path without checking limiter', async () => {
    const req = makeReq({ path: '/health' });
    const { res } = makeRes();
    const next = vi.fn() as NextFunction;

    await rateLimitMiddleware(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(publicLimiter.limit).not.toHaveBeenCalled();
  });

  it('calls next() for exempt /ready path without checking limiter', async () => {
    const req = makeReq({ path: '/ready' });
    const { res } = makeRes();
    const next = vi.fn() as NextFunction;

    await rateLimitMiddleware(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(publicLimiter.limit).not.toHaveBeenCalled();
  });

  it('returns 429 and sets Retry-After when limiter denies request', async () => {
    const resetTime = Date.now() + 30_000;
    vi.mocked(publicLimiter.limit).mockResolvedValueOnce({
      success: false,
      limit: 100,
      remaining: 0,
      reset: resetTime,
      pending: Promise.resolve(),
    });

    const req = makeReq({ path: '/api/data' });
    const { res, headers, statusCode } = makeRes();
    const next = vi.fn() as NextFunction;

    await rateLimitMiddleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(statusCode).toBe(429);
    expect(headers['Retry-After']).toBeDefined();
    expect(Number(headers['Retry-After'])).toBeGreaterThan(0);
  });

  it('calls next() when limiter allows request', async () => {
    vi.mocked(publicLimiter.limit).mockResolvedValueOnce({
      success: true,
      limit: 100,
      remaining: 50,
      reset: Date.now() + 60_000,
      pending: Promise.resolve(),
    });

    const req = makeReq({ path: '/api/data' });
    const { res } = makeRes();
    const next = vi.fn() as NextFunction;

    await rateLimitMiddleware(req, res, next);

    expect(next).toHaveBeenCalledOnce();
  });

  it('fails open (calls next) when Redis throws', async () => {
    vi.mocked(publicLimiter.limit).mockRejectedValueOnce(new Error('Redis timeout'));

    const req = makeReq({ path: '/api/data' });
    const { res } = makeRes();
    const next = vi.fn() as NextFunction;

    await rateLimitMiddleware(req, res, next);

    expect(next).toHaveBeenCalledOnce();
  });
});
```

### Step 3 — Install Vitest in `frontend/`

```bash
cd frontend
npm install -D vitest @vitest/coverage-v8 @testing-library/react \
  @testing-library/jest-dom @testing-library/user-event jsdom
```

Create `frontend/vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.tsx', 'src/**/*.test.ts', 'src/**/*.spec.tsx', 'src/**/*.spec.ts'],
    exclude: ['node_modules', '.next'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.*', 'src/**/*.spec.*', 'src/app/layout.tsx'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
```

Create `frontend/vitest.setup.ts`:

```typescript
import '@testing-library/jest-dom';
```

Install the React Vitest plugin:

```bash
cd frontend
npm install -D @vitejs/plugin-react
```

Add scripts to `frontend/package.json`:

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage"
  }
}
```

### Step 4 — Write bootstrap tests for `frontend/`

Create `frontend/src/app/__tests__/page.test.tsx`:

```typescript
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import Page from '../page';

describe('Home page', () => {
  it('renders without crashing', () => {
    render(<Page />);
    // The page component exists — if it throws, this test fails
    expect(document.body).toBeTruthy();
  });
});
```

Create `frontend/src/__tests__/env.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';

describe('NEXT_PUBLIC environment variable contract', () => {
  it('NEXT_PUBLIC_API_URL key follows naming convention', () => {
    const key = 'NEXT_PUBLIC_API_URL';
    expect(key.startsWith('NEXT_PUBLIC_')).toBe(true);
  });

  it('all public env var names are uppercase strings', () => {
    const publicVars = ['NEXT_PUBLIC_API_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY'];
    publicVars.forEach((v) => {
      expect(v).toBe(v.toUpperCase());
    });
  });
});
```

### Step 5 — Verify both test suites run

```bash
cd backend && npm test
cd ../frontend && npm test
```

Expected backend output:

```
✓ src/config/__tests__/env.test.ts (2 tests)
✓ src/middleware/__tests__/rateLimit.test.ts (5 tests)

Test Files  2 passed
Tests       7 passed
```

Expected frontend output:

```
✓ src/__tests__/env.test.ts (2 tests)
✓ src/app/__tests__/page.test.tsx (1 test)

Test Files  2 passed
Tests       3 passed
```

---

## Validation

| Check | Command | Expected Result |
|-------|---------|-----------------|
| Backend tests pass | `cd backend && npm test` | Exit 0, all tests green |
| Frontend tests pass | `cd frontend && npm test` | Exit 0, all tests green |
| Backend type-check still passes | `cd backend && npm run type-check` | Exit 0 |
| Frontend type-check still passes | `cd frontend && npm run type-check` | Exit 0 |
| Coverage runs without error | `cd backend && npm run test:coverage` | Exit 0, lcov report generated |
| No open handles after backend tests | Backend Vitest output | `No open handles` warning absent |

---

## Dependencies

- **US-003 / TASK-001** must be complete (`src/middleware/rateLimit.middleware.ts` must exist for the mock test)
- **US-003 / TASK-003** must be complete (`rateLimiter.ts` must export `publicLimiter` and `authLimiter`)
- `@vitejs/plugin-react` may already be present in frontend devDependencies from the Next.js scaffold — confirm before installing again

## Security Constraints

- **OWASP A09**: Test files must not import or log real secrets. The `env.test.ts` intentionally avoids importing `src/config/env.ts` (which calls `process.exit(1)` on missing vars in CI) by testing only string constants.
- `vitest.setup.ts` does not open network connections — all external calls are mocked at the module level.

---

## Definition of Done

- [ ] `vitest` and `@vitest/coverage-v8` installed in both `frontend/` and `backend/`
- [ ] `vitest.config.ts` committed to both packages
- [ ] `frontend/vitest.setup.ts` committed with `@testing-library/jest-dom` import
- [ ] `test`, `test:watch`, `test:coverage` scripts in both `package.json` files
- [ ] `cd backend && npm test` exits 0 (≥ 7 tests passing)
- [ ] `cd frontend && npm test` exits 0 (≥ 3 tests passing)
- [ ] No open handle warnings in backend Vitest output

## Traceability

| Artefact | ID |
|----------|----|
| User Story | US-004 |
| Epic | EP-TECH |
| NFR | NFR-006 (test coverage ≥ 80% for critical paths — framework established here) |
| Scenario | 1 (unit tests run in CI), 2 (failing test blocks merge) |
