---
id: task_005
us_id: us_002
epic: EP-TECH
title: "Validate Rollback, WebSocket Connectivity, Environment Isolation, and Definition of Done Sign-off"
status: not-started
layer: infrastructure
effort: 3h
priority: critical
created: 2026-07-22
---

# TASK-005 — Validate Rollback, WebSocket Connectivity, Environment Isolation, and Definition of Done Sign-off

## Context

**User Story**: US-002 — Deploy Node.js/Express Backend to Railway.app with Zero-Downtime Rolling Strategy  
**Epic**: EP-TECH — Technical Bootstrap  
**Addresses Acceptance Criteria**: All four scenarios (final end-to-end acceptance gate)

This task is the acceptance gate for US-002. It executes structured tests for all four acceptance criteria against the live Railway deployments, captures evidence, and closes the story. No upstream feature epic should begin until all four scenarios pass.

---

## Objective

Run a controlled validation sequence against the live staging and production Railway environments covering: health-check gated deployment, rollback on crash, WebSocket latency, and environment variable isolation. Record evidence and update `us_002.md`.

---

## Validation Matrix

| Scenario | Criterion | Test Method | Pass Condition |
|----------|-----------|-------------|----------------|
| Scenario 1 | Health-check gates cutover | Deploy clean build, observe Railway logs | Previous container serves during startup; swap occurs only after 3× `/health` 200 |
| Scenario 2 | Rollback on unhealthy start | Deploy broken build (missing required env var) | Railway keeps previous version; Slack alert fires within 2 min |
| Scenario 3 | WebSocket `connected` ack < 1 s | Run Node.js test client against deployed URL | `connected` event received in < 1000 ms |
| Scenario 4 | Staging and production env isolated | Compare env var values across environments | Different `DATABASE_URL` values confirmed |

---

## Implementation Steps

### Step 1 — Scenario 1: Health-check gated deployment (clean build)

Deploy a harmless change to production:

```bash
# Add a build timestamp comment to server.ts
echo "// Build: $(date -u +%Y%m%dT%H%M%SZ)" >> backend/src/server.ts
git add backend/src/server.ts
git commit -m "chore: build timestamp for deployment gate test"
git push origin main
```

In the Railway dashboard, go to **Project → production → Deployments** and observe the in-progress deployment:

1. New container starts
2. Railway shows "Health checking…" state
3. After `/health` returns 200 (observe in Railway deployment logs), traffic switches to the new container
4. Previous container is removed

**Pass condition**: Railway log shows the health check succeeding and traffic cutover — not an immediate swap.

Record the Railway deployment ID and timestamp as evidence.

### Step 2 — Scenario 2: Rollback on unhealthy start (broken build)

**Method**: Remove a required environment variable from the staging Railway environment to simulate a missing config crash.

In **Railway Dashboard → staging → Service → Variables**:
- Temporarily **delete** `DATABASE_URL` (or rename it to `DATABASE_URL_DISABLED`)

Push a trivial change to trigger a staging deploy:

```bash
git checkout -b test/rollback-gate
echo "// Rollback test $(date)" >> backend/src/server.ts
git add backend/src/server.ts
git commit -m "test: trigger rollback validation [DO NOT MERGE]"
git push origin test/rollback-gate
```

Open a PR from `test/rollback-gate` to `main` to trigger the staging CD workflow.

**Observe**:
1. Container starts
2. `src/config/env.ts` detects missing `DATABASE_URL` → `process.exit(1)`
3. Railway health check receives no 200 → marks deployment as FAILED
4. Previous staging container resumes serving
5. Slack alert fires (from TASK-004 CD workflow)

**Evidence to capture**:
- Railway deployment status: `FAILED`
- Railway logs showing `process.exit(1)` and the missing-variable error
- Slack alert message screenshot
- Previous staging container still returns HTTP 200 from `/health`

**Restore** `DATABASE_URL` in the Railway staging variables after test.

Close and delete the test branch:

```bash
git checkout main
git branch -d test/rollback-gate
git push origin --delete test/rollback-gate
```

### Step 3 — Scenario 3: WebSocket `connected` ack latency < 1 s

Install the test client dependency (development only):

```bash
cd backend
npm install -D socket.io-client
```

Create `backend/scripts/test-websocket-deployed.ts`:

```typescript
import { io as ioClient } from 'socket.io-client';

const DEPLOYED_URL = process.argv[2];
if (!DEPLOYED_URL) {
  console.error('Usage: npx tsx scripts/test-websocket-deployed.ts <service-url>');
  process.exit(1);
}

console.log(`[test] Connecting to ${DEPLOYED_URL}`);
const socket = ioClient(DEPLOYED_URL, {
  transports: ['websocket'],
  timeout: 5000,
});

const startTime = Date.now();

socket.on('connect', () => {
  console.log(`[test] TCP connected in ${Date.now() - startTime}ms — Socket ID: ${socket.id}`);
});

socket.on('connected', (payload: { socketId: string; timestamp: string }) => {
  const latency = Date.now() - startTime;
  console.log(`[test] 'connected' ack received in ${latency}ms`);
  console.log('[test] Payload:', payload);

  if (latency < 1000) {
    console.log('[test] ✅ PASS — latency < 1000ms');
    socket.disconnect();
    process.exit(0);
  } else {
    console.error(`[test] ❌ FAIL — latency ${latency}ms >= 1000ms`);
    socket.disconnect();
    process.exit(1);
  }
});

socket.on('connect_error', (err) => {
  console.error('[test] ❌ Connection error:', err.message);
  process.exit(1);
});

setTimeout(() => {
  console.error('[test] ❌ FAIL — no connection or ack within 5s');
  process.exit(1);
}, 5000);
```

Run against staging:

```bash
npx tsx backend/scripts/test-websocket-deployed.ts https://api-staging.ai-interview.railway.app
```

Run against production:

```bash
npx tsx backend/scripts/test-websocket-deployed.ts https://api.ai-interview.railway.app
```

**Pass condition**: Both runs print `✅ PASS — latency < 1000ms` and exit 0.

Record the latency values as evidence.

### Step 4 — Scenario 4: Environment isolation verification

```bash
# Confirm staging and production have DIFFERENT DATABASE_URL values
# (Outputs should differ — different Supabase projects)

echo "=== Staging DATABASE_URL host ==="
railway variables --environment staging --service $RAILWAY_SERVICE_ID_STAGING \
  | grep DATABASE_URL | awk -F'@' '{print $2}'

echo "=== Production DATABASE_URL host ==="
railway variables --environment production --service $RAILWAY_SERVICE_ID_PRODUCTION \
  | grep DATABASE_URL | awk -F'@' '{print $2}'
```

**Pass condition**: The two host values are different (different Supabase project hosts).

Alternatively, verify via Railway dashboard:
1. Open **staging → Variables → DATABASE_URL** — copy the host portion
2. Open **production → Variables → DATABASE_URL** — copy the host portion
3. Confirm they differ

Record a screenshot of each variable panel (redact the password portion) as evidence.

### Step 5 — Update `us_002.md` Definition of Done

Once all four scenarios pass, update `.propel/context/tasks/EP-TECH/us_002.md`:

```markdown
## Definition of Done

- [x] Railway service deployed with staging and production environments
- [x] Rolling deployment with health-check gate configured
- [x] `/health` and `/ready` endpoints return correct status payloads
- [x] Socket.IO connection verified from test client
- [x] Rollback tested by deploying a deliberately broken build
- [x] Deployment failure Slack/email alert confirmed
```

Update `status` front matter:

```yaml
status: done
```

### Step 6 — Create validation evidence document

Create `.propel/context/tasks/EP-TECH/us_002/validation-evidence.md`:

```markdown
# US-002 Validation Evidence

## Date: YYYY-MM-DD
## Validator: <name>

| Scenario | Status | Evidence |
|----------|--------|----------|
| Scenario 1 — Health-check gated cutover | PASS | Railway deployment ID: XXXXXX; log shows "Health check passed" before swap |
| Scenario 2 — Rollback on missing env var | PASS | Railway deployment status: FAILED; Slack alert received at HH:MM; previous container served throughout |
| Scenario 3 — WebSocket ack < 1 s | PASS | Staging: 187ms; Production: 94ms |
| Scenario 4 — Env var isolation | PASS | Staging DB host: staging-xxx.supabase.co; Production DB host: prod-xxx.supabase.co |
```

---

## Validation

| Check | Evidence Required | Owner |
|-------|------------------|-------|
| Health-check cutover observed | Railway deployment log excerpt | Developer |
| Rollback on missing env | Railway FAILED status + Slack screenshot | Developer |
| Slack alert text correct | Screenshot of Slack `#deployments` | Developer |
| WebSocket < 1 s (staging) | CLI output with latency value | Developer |
| WebSocket < 1 s (production) | CLI output with latency value | Developer |
| DB host differs per env | Screenshot or CLI output of both env vars | Developer |

---

## Dependencies

- **TASK-001** through **TASK-004** must all be complete before this validation begins
- Slack `#deployments` channel and webhook URL must be configured
- Both Railway environments must have clean baseline deployments

## Security Constraints

- **OWASP A05**: Redact password portions of `DATABASE_URL` in all evidence documents before committing.
- The broken-build test branch (`test/rollback-gate`) must be deleted from remote after the test — leaving it could mislead future developers.
- `socket.io-client` installed as dev dependency only — must not appear in `dependencies`.

---

## Definition of Done

- [ ] Scenario 1 validated — health-check gate observed in Railway logs (evidence logged)
- [ ] Scenario 2 validated — rollback confirmed; Railway status FAILED; Slack alert captured
- [ ] Scenario 3 validated — WebSocket `connected` ack < 1000 ms on both staging and production (evidence logged)
- [ ] Scenario 4 validated — different DATABASE_URL hosts confirmed across environments (evidence logged)
- [ ] Test branch `test/rollback-gate` deleted from remote
- [ ] `DATABASE_URL` restored in Railway staging variables after rollback test
- [ ] `us_002.md` all Definition of Done checkboxes ticked
- [ ] `us_002.md` `status` updated to `done`
- [ ] `validation-evidence.md` created and committed

## Traceability

| Artefact | ID |
|----------|----|
| User Story | US-002 |
| Epic | EP-TECH |
| NFR | NFR-001 (P95 < 2s), NFR-003 (99.5% uptime — rollback works), NFR-007 (alert fires) |
| TR | TR-003 (BullMQ scaffold — Socket.IO infrastructure ready), TR-008 (connection pooling — env isolation) |
| Scenario | 1, 2, 3, 4 (all acceptance criteria) |
