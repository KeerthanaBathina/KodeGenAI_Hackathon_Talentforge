---
id: task_001
us_id: us_002
epic: EP-TECH
title: "Scaffold Express.js TypeScript Backend with Health and Ready Endpoints"
status: not-started
layer: backend
effort: 4h
priority: critical
created: 2026-07-22
---

# TASK-001 — Scaffold Express.js TypeScript Backend with Health and Ready Endpoints

## Context

**User Story**: US-002 — Deploy Node.js/Express Backend to Railway.app with Zero-Downtime Rolling Strategy  
**Epic**: EP-TECH — Technical Bootstrap  
**Addresses Acceptance Criteria**: Scenario 1 (health check gate — `GET /health` returns `{"status":"ok","db":"ok","redis":"ok"}`), Scenario 2 (unhealthy start triggers rollback via health check failure)

This task creates the Express.js server skeleton that Railway.app uses for health-check gating during rolling deploys. The `/health` endpoint is the single source of truth for deployment readiness — if it returns anything other than HTTP 200, Railway keeps the previous container live.

---

## Objective

Initialise a `backend/` Node.js 20 / TypeScript 5 project with Express.js, implement `/health` and `/ready` endpoints with live dependency checks, configure graceful shutdown, and set up the environment variable validation that triggers rollback on missing config.

---

## Technical Specifications

| Attribute | Value |
|-----------|-------|
| Runtime | Node.js 20.x LTS |
| Framework | Express.js 4.x |
| Language | TypeScript 5.x — strict mode |
| Package Manager | npm (lock file committed) |
| Port | `process.env.PORT \|\| 3001` |
| Health endpoint | `GET /health` → `{"status":"ok","db":"ok","redis":"ok"}` |
| Ready endpoint | `GET /ready` → `{"status":"ready"}` |
| Graceful shutdown | SIGTERM → drain existing requests → close server → exit 0 |

---

## Implementation Steps

### Step 1 — Bootstrap the project

```bash
mkdir backend && cd backend
npm init -y
npm install express cors helmet compression dotenv
npm install -D typescript @types/node @types/express @types/cors \
  @types/compression ts-node-dev tsx rimraf
```

### Step 2 — Configure TypeScript

Create `backend/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "forceConsistentCasingInFileNames": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "incremental": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

### Step 3 — Define `package.json` scripts

Update `backend/package.json`:

```json
{
  "scripts": {
    "build": "rimraf dist && tsc",
    "start": "node dist/server.js",
    "dev": "tsx watch src/server.ts",
    "type-check": "tsc --noEmit",
    "lint": "eslint src --ext .ts"
  }
}
```

### Step 4 — Environment variable validation on startup

Create `backend/src/config/env.ts`:

```typescript
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.string().default('3001'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  UPSTASH_REDIS_REST_URL: z.string().url('UPSTASH_REDIS_REST_URL must be a valid URL'),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1, 'UPSTASH_REDIS_REST_TOKEN is required'),
  SUPABASE_URL: z.string().url('SUPABASE_URL must be a valid URL'),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, 'SUPABASE_SERVICE_ROLE_KEY is required'),
  FRONTEND_URL: z.string().url('FRONTEND_URL must be a valid URL'),
});

const result = envSchema.safeParse(process.env);

if (!result.success) {
  console.error('❌ Missing or invalid environment variables:');
  console.error(result.error.flatten().fieldErrors);
  process.exit(1);  // Non-zero exit triggers Railway rollback
}

export const env = result.data;
```

> **Rollback trigger**: `process.exit(1)` on invalid env causes the container to crash immediately. Railway health check never receives a successful response, so the previous version keeps serving (Scenario 2).

### Step 5 — Implement `/health` endpoint with live dependency probes

Install Upstash Redis client:

```bash
npm install @upstash/redis
```

Create `backend/src/routes/health.ts`:

```typescript
import { Router, Request, Response } from 'express';
import { Redis } from '@upstash/redis';
import { env } from '../config/env';

const router = Router();

const redis = new Redis({
  url: env.UPSTASH_REDIS_REST_URL,
  token: env.UPSTASH_REDIS_REST_TOKEN,
});

router.get('/health', async (_req: Request, res: Response) => {
  const checks: Record<string, string> = { status: 'ok' };
  let statusCode = 200;

  // Database check — lightweight SELECT 1
  try {
    // Prisma is added in US-003; use raw pg until then
    const { Client } = await import('pg');
    const client = new Client({ connectionString: env.DATABASE_URL });
    await client.connect();
    await client.query('SELECT 1');
    await client.end();
    checks['db'] = 'ok';
  } catch {
    checks['db'] = 'error';
    checks['status'] = 'degraded';
    statusCode = 503;
  }

  // Redis check — PING
  try {
    const pong = await redis.ping();
    checks['redis'] = pong === 'PONG' ? 'ok' : 'error';
    if (checks['redis'] === 'error') {
      checks['status'] = 'degraded';
      statusCode = 503;
    }
  } catch {
    checks['redis'] = 'error';
    checks['status'] = 'degraded';
    statusCode = 503;
  }

  res.status(statusCode).json(checks);
});

router.get('/ready', (_req: Request, res: Response) => {
  // Liveness probe — no dependency checks; just confirms process is running
  res.status(200).json({ status: 'ready' });
});

export default router;
```

Install `pg` for the raw database check (Prisma replaces this in TASK-003 of US-003):

```bash
npm install pg
npm install -D @types/pg
```

### Step 6 — Assemble the Express server

Create `backend/src/app.ts`:

```typescript
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import healthRouter from './routes/health';
import { env } from './config/env';

export function createApp() {
  const app = express();

  // Security middleware
  app.use(helmet());
  app.use(cors({
    origin: env.FRONTEND_URL,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  }));

  // Performance middleware
  app.use(compression());
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Suppress Express fingerprint
  app.disable('x-powered-by');

  // Health / readiness routes (no auth required)
  app.use('/', healthRouter);

  return app;
}
```

Create `backend/src/server.ts`:

```typescript
import http from 'http';
import { createApp } from './app';
import { env } from './config/env';

const app = createApp();
const server = http.createServer(app);
const PORT = parseInt(env.PORT, 10);

server.listen(PORT, () => {
  console.log(`[server] Listening on port ${PORT} (${env.NODE_ENV})`);
});

// Graceful shutdown — Railway sends SIGTERM before container replacement
const shutdown = (signal: string) => {
  console.log(`[server] ${signal} received — initiating graceful shutdown`);
  server.close((err) => {
    if (err) {
      console.error('[server] Error during shutdown:', err);
      process.exit(1);
    }
    console.log('[server] HTTP server closed. Exiting.');
    process.exit(0);
  });

  // Force exit after 10 s if connections don't drain
  setTimeout(() => {
    console.error('[server] Graceful shutdown timed out. Force exiting.');
    process.exit(1);
  }, 10_000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
```

### Step 7 — Create `.env.example`

Create `backend/.env.example`:

```env
# Server
NODE_ENV=development
PORT=3001

# Database — Supabase connection string
DATABASE_URL=postgresql://postgres:[password]@db.[project].supabase.co:5432/postgres

# Upstash Redis
UPSTASH_REDIS_REST_URL=https://[endpoint].upstash.io
UPSTASH_REDIS_REST_TOKEN=your-token-here

# Supabase
SUPABASE_URL=https://[project].supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Frontend CORS origin
FRONTEND_URL=http://localhost:3000
```

Add to `backend/.gitignore`:

```
dist/
node_modules/
.env
.env.local
*.env
```

### Step 8 — Verify locally

```bash
cd backend
cp .env.example .env   # Fill in dev values
npm run build
npm start
curl http://localhost:3001/health
curl http://localhost:3001/ready
```

Expected `/health` response (with valid DB + Redis):

```json
{"status":"ok","db":"ok","redis":"ok"}
```

Expected `/ready` response:

```json
{"status":"ready"}
```

---

## Validation

| Check | Command / Method | Expected Result |
|-------|-----------------|-----------------|
| TypeScript compiles | `npm run type-check` | Exit 0, zero errors |
| Build succeeds | `npm run build` | `dist/` created |
| `/health` returns 200 | `curl -v http://localhost:3001/health` | HTTP 200, correct JSON |
| `/ready` returns 200 | `curl -v http://localhost:3001/ready` | HTTP 200, `{"status":"ready"}` |
| Missing env exits 1 | Remove `DATABASE_URL`, run `npm start` | `process.exit(1)`, error printed |
| SIGTERM drains cleanly | `kill -SIGTERM <pid>` | `[server] HTTP server closed. Exiting.` |
| CORS header present | `curl -H "Origin: http://localhost:3000" http://localhost:3001/health` | `Access-Control-Allow-Origin: http://localhost:3000` |

---

## Dependencies

- None — first backend task, no prerequisite tasks within US-002
- US-003 (Supabase + Prisma) will replace the raw `pg` DB check in this task

## Security Constraints

- **OWASP A05 (Security Misconfiguration)**: `helmet()` sets 12 security headers by default (HSTS, CSP, X-Frame-Options). `x-powered-by` header suppressed.
- **OWASP A07 (Identification and Authentication Failures)**: `CORS` restricted to `FRONTEND_URL`; wildcard origin forbidden.
- **OWASP A09 (Security Logging and Monitoring Failures)**: Startup failures log the field-level errors before `process.exit(1)`, enabling Railway deployment logs to pinpoint the missing variable.
- `DATABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are server-only secrets — never prefixed `NEXT_PUBLIC_`.

---

## Definition of Done

- [ ] `backend/` directory committed with `src/`, `tsconfig.json`, `package.json`
- [ ] `npm run type-check` exits 0
- [ ] `npm run build` produces `dist/server.js`
- [ ] `GET /health` returns HTTP 200 `{"status":"ok","db":"ok","redis":"ok"}` with valid deps
- [ ] `GET /health` returns HTTP 503 when DB or Redis unreachable
- [ ] `GET /ready` returns HTTP 200 `{"status":"ready"}`
- [ ] Missing required env var causes `process.exit(1)` on startup
- [ ] SIGTERM triggers graceful shutdown within 10 s
- [ ] `.env.example` committed; `.env` git-ignored

## Traceability

| Artefact | ID |
|----------|----|
| User Story | US-002 |
| Epic | EP-TECH |
| NFR | NFR-001 (P95 < 2s), NFR-003 (health-check gate), NFR-004 (security headers) |
| Scenario | 1 (health check gate), 2 (env-missing rollback trigger) |
