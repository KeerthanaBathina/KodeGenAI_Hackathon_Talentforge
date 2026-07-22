---
id: task_003
us_id: us_002
epic: EP-TECH
title: "Configure Railway.app Project with Staging and Production Environment Isolation"
status: not-started
layer: infrastructure
effort: 3h
priority: critical
created: 2026-07-22
---

# TASK-003 — Configure Railway.app Project with Staging and Production Environment Isolation

## Context

**User Story**: US-002 — Deploy Node.js/Express Backend to Railway.app with Zero-Downtime Rolling Strategy  
**Epic**: EP-TECH — Technical Bootstrap  
**Addresses Acceptance Criteria**: Scenario 1 (health-check gate — Railway uses `/health` to gate deployment), Scenario 2 (unhealthy start triggers automatic rollback), Scenario 4 (staging and production environments are isolated)

This task configures the Railway.app project to use the Express `/health` endpoint as its deployment readiness gate, establishes strict environment isolation between staging and production, and commits the `railway.json` configuration file for reproducible infrastructure.

---

## Objective

Create `backend/railway.json`, configure two Railway environments (staging, production), map environment variables to each environment, and verify the health-check-gated rolling deployment policy is active. Staging must never receive production secrets and vice versa.

---

## Technical Specifications

| Attribute | Value |
|-----------|-------|
| Deployment Platform | Railway.app |
| Environments | `staging` (linked to non-main branches / PRs) and `production` (linked to `main`) |
| Health-check Path | `GET /health` → HTTP 200 |
| Health-check Start Period | 30 s (container warm-up grace) |
| Health-check Interval | 10 s |
| Health-check Timeout | 5 s |
| Failure Threshold | 3 consecutive failures → rollback |
| Restart Policy | On failure, max 3 retries |
| Build Command | `npm ci && npm run build` |
| Start Command | `node dist/server.js` |
| Node.js Version | 20.x (`.node-version` file) |

---

## Implementation Steps

### Step 1 — Pin Node.js version

Create `backend/.node-version`:

```
20
```

Railway reads `.node-version` to select the runtime. This prevents silent version drift.

### Step 2 — Create `railway.json` configuration

Create `backend/railway.json`:

```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS",
    "buildCommand": "npm ci && npm run build"
  },
  "deploy": {
    "startCommand": "node dist/server.js",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 3,
    "healthcheckPath": "/health",
    "healthcheckTimeout": 5,
    "numReplicas": 1
  }
}
```

> **Why Nixpacks over Dockerfile**: Railway's Nixpacks builder auto-detects Node.js and handles layer caching without a custom `Dockerfile`, reducing maintenance overhead. Add a `Dockerfile` only if custom system packages are needed.

### Step 3 — Create Railway project via CLI (one-time setup)

```bash
npm install -g @railway/cli
railway login
cd backend
railway init
```

Prompts:
- **Project name**: `ai-interview-backend`
- **Team**: Select your team

This creates the project in Railway and links the local directory.

### Step 4 — Create staging and production environments in Railway

```bash
# Create production environment (Railway creates 'production' by default)
railway environment create production

# Create staging environment
railway environment create staging
```

Verify in the Railway dashboard:
- Two environments visible: `staging` and `production`
- Each environment has its own service variables panel

### Step 5 — Configure environment variables per environment

#### Production environment variables

In **Railway Dashboard → Project → production → Service → Variables**, add:

| Variable | Value | Notes |
|----------|-------|-------|
| `NODE_ENV` | `production` | |
| `PORT` | `3001` | Railway auto-maps to public port |
| `DATABASE_URL` | Supabase production connection string | Service variable — isolated |
| `UPSTASH_REDIS_REST_URL` | Production Upstash URL | |
| `UPSTASH_REDIS_REST_TOKEN` | Production Upstash token | |
| `SUPABASE_URL` | Production Supabase project URL | |
| `SUPABASE_SERVICE_ROLE_KEY` | Production service role key | |
| `FRONTEND_URL` | `https://ai-interview-app-frontend.vercel.app` | |

#### Staging environment variables

In **Railway Dashboard → Project → staging → Service → Variables**, add:

| Variable | Value | Notes |
|----------|-------|-------|
| `NODE_ENV` | `staging` | |
| `PORT` | `3001` | |
| `DATABASE_URL` | Supabase **staging** connection string | Different project/schema |
| `UPSTASH_REDIS_REST_URL` | Staging Upstash URL | Separate Redis database |
| `UPSTASH_REDIS_REST_TOKEN` | Staging Upstash token | |
| `SUPABASE_URL` | Staging Supabase project URL | |
| `SUPABASE_SERVICE_ROLE_KEY` | Staging service role key | |
| `FRONTEND_URL` | `https://ai-interview-app-staging.vercel.app` | |

> **Isolation verification**: Production and staging must use entirely separate Supabase projects and Upstash Redis databases. Shared credentials between environments is a compliance and data-isolation violation.

### Step 6 — Configure deployment source per environment

In **Railway Dashboard → Project → production → Settings → Source**:
- **Source**: GitHub repository `ai-interview-app`
- **Branch**: `main`
- **Auto-deploy**: Enabled (triggers on push to `main`)
- **Root directory**: `backend/`

In **Railway Dashboard → Project → staging → Settings → Source**:
- **Source**: GitHub repository `ai-interview-app`
- **Branch**: `develop` (or leave as manual trigger; CD workflow handles preview deploys)
- **Auto-deploy**: Disabled (controlled by CD workflow in TASK-004)
- **Root directory**: `backend/`

### Step 7 — Confirm health-check gate behaviour

Railway's health-check settings are applied via `railway.json`. To verify they are active:

1. In Railway Dashboard → Production → Service → Settings → Deployment, confirm:
   - **Health Check Path**: `/health`
   - **Health Check Timeout**: 5 s
   - **Restart Policy**: On Failure (max 3 retries)

2. The rolling deploy sequence Railway follows:
   ```
   New container starts
         ↓
   Railway polls GET /health every 10 s
         ↓
   /health returns HTTP 200 within 5 s?
         ↓ YES                 ↓ NO (3 consecutive failures)
   Traffic cut over      Container stopped
   Old container removed  Previous version continues serving
                          Deployment marked as FAILED
                          Alert notification fires (TASK-004)
   ```

### Step 8 — Document Railway service URLs

Create `backend/docs/railway-setup.md`:

```markdown
## Railway.app Configuration

- **Project Name**: ai-interview-backend
- **Production Service URL**: https://api.ai-interview.railway.app
- **Staging Service URL**: https://api-staging.ai-interview.railway.app
- **Health Check Path**: GET /health
- **Root Directory**: backend/

### Environment Isolation

| Variable Category | Production | Staging |
|------------------|------------|---------|
| DATABASE_URL | Supabase project: `prod-xxx` | Supabase project: `staging-xxx` |
| Redis | Upstash DB: `prod-db` | Upstash DB: `staging-db` |
| FRONTEND_URL | vercel.app production URL | vercel.app staging preview URL |

Environment variables are managed exclusively in the Railway dashboard — never in source control.
```

---

## Validation

| Check | Method | Expected Result |
|-------|--------|-----------------|
| `railway.json` valid | `railway up --dry-run` | No config errors |
| Health-check gate active | Railway Dashboard → Deployments tab | `/health` shown as check path |
| Production env vars scoped | Railway Dashboard → production → Variables | Variables visible only in production |
| Staging env vars scoped | Railway Dashboard → staging → Variables | Different values from production |
| Deploy triggers on `main` push | Push to `main` | Railway production deployment starts automatically |
| `.node-version` respected | Railway build logs | `Node.js 20.x` shown in build output |

---

## Dependencies

- **TASK-001** must be complete (`GET /health` endpoint must exist and return correct JSON)
- Railway.app account provisioned (stated in US-002 dependencies)
- Separate Supabase projects for staging and production provisioned
- Separate Upstash Redis databases for staging and production provisioned
- GitHub repository must be connected to Railway

## Security Constraints

- **OWASP A01 (Broken Access Control)**: Each Railway environment is a separate deployment context with isolated secrets; cross-environment variable access is architecturally impossible.
- **OWASP A05 (Security Misconfiguration)**: Production `DATABASE_URL` uses Supabase connection pooler (port 6543) to prevent connection exhaustion. Staging uses a separate Supabase project to prevent data cross-contamination.
- **OWASP A09 (Security Logging and Monitoring Failures)**: Railway deployment failure triggers an alert (configured in TASK-004). Railway deployment logs are retained for 7 days by default.
- `SUPABASE_SERVICE_ROLE_KEY` is a server-only secret — stored only in Railway Variables, never committed.

---

## Definition of Done

- [ ] `backend/railway.json` committed with health-check configuration
- [ ] `backend/.node-version` committed with value `20`
- [ ] Two Railway environments created: `staging` and `production`
- [ ] Production environment variables configured (all 8 variables)
- [ ] Staging environment variables configured with **different** values from production
- [ ] Production auto-deploy linked to `main` branch
- [ ] Health-check path `/health`, timeout 5 s, confirmed in Railway dashboard
- [ ] `backend/docs/railway-setup.md` committed documenting service URLs and environment strategy

## Traceability

| Artefact | ID |
|----------|----|
| User Story | US-002 |
| Epic | EP-TECH |
| NFR | NFR-003 (99.5% uptime — rolling deploy with rollback), NFR-001 (P95 < 2s) |
| TR | TR-008 (connection pooling — Supabase pooler URL) |
| Scenario | 1 (health-check gate), 2 (rollback on failure), 4 (env isolation) |
