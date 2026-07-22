---
id: task_005
us_id: us_003
epic: EP-TECH
title: "Validate Prisma Startup, Redis PING, Rate Limiting, and P95 — Definition of Done Sign-off"
status: not-started
layer: infrastructure
effort: 2h
priority: critical
created: 2026-07-22
---

# TASK-005 — Validate Prisma Startup, Redis PING, Rate Limiting, and P95 — Definition of Done Sign-off

## Context

**User Story**: US-003 — Configure Supabase PostgreSQL with Prisma ORM and Upstash Redis  
**Epic**: EP-TECH — Technical Bootstrap  
**Addresses Acceptance Criteria**: All four scenarios (final end-to-end acceptance gate)

This task is the acceptance gate for US-003. It executes structured verification for all four scenarios, captures evidence, removes temporary test artefacts, and closes the story. No feature epic (EP-001 through EP-011) should depend on the data layer until this task is signed off.

---

## Objective

Run each scenario's validation method, record quantitative evidence, clean up test-only code introduced in TASK-003, and update `us_003.md` with completed Definition of Done checkboxes and status `done`.

---

## Validation Matrix

| Scenario | Criterion | Test Method | Pass Condition |
|----------|-----------|-------------|----------------|
| Scenario 1 | Prisma connects, SELECT 1 < 100 ms | `GET /health` — check `db_ms` field | `"db":"ok"` and `db_ms` value < 100 |
| Scenario 2 | Redis PING < 50 ms, `redis: "ok"` | `GET /health` — check `redis_ms` field | `"redis":"ok"` and `redis_ms` value < 50 |
| Scenario 3 | HTTP 429 at 101st request with `Retry-After` | Burst test script against `/ping` | 429 on ≥ 101st request, `Retry-After` header present |
| Scenario 4 | P95 < 500 ms under 50 concurrent queries | `npm run load-test:db` | `✅ PASS` printed, exit 0 |

---

## Implementation Steps

### Step 1 — Scenario 1: Prisma connection and SELECT 1 latency

Start the backend (or use the deployed Railway staging service):

```bash
cd backend
npm run dev
```

Run 10 consecutive `/health` calls and collect `db_ms`:

```bash
for i in $(seq 1 10); do
  curl -s http://localhost:3001/health | jq '{ db, db_ms }'
  sleep 0.5
done
```

Expected output (each iteration):

```json
{
  "db": "ok",
  "db_ms": "14"
}
```

**Pass condition**: All 10 responses show `"db":"ok"` and `db_ms` integer < 100.

Record min, max, and average `db_ms` across the 10 samples as evidence.

### Step 2 — Scenario 2: Redis PING latency

From the same 10 `/health` calls above, collect `redis_ms`:

```bash
for i in $(seq 1 10); do
  curl -s http://localhost:3001/health | jq '{ redis, redis_ms }'
  sleep 0.5
done
```

Expected output:

```json
{
  "redis": "ok",
  "redis_ms": "21"
}
```

**Pass condition**: All 10 responses show `"redis":"ok"` and `redis_ms` integer < 50.

### Step 3 — Scenario 3: Rate limiting 429 and Retry-After

The burst test target is `GET /ping`, which was added temporarily in TASK-003's Step 6. Run the test script:

```bash
cd backend
npx tsx scripts/test-rate-limit.ts http://localhost:3001
```

Expected output:

```
Sending 110 requests to http://localhost:3001/ping (concurrency: 10)

Results:
  HTTP 200: 100
  HTTP 429: 10
  First 429 at request #101
  Retry-After: 58

✅ PASS — Rate limiting active with Retry-After header
```

Confirm both:
1. Exactly 100 HTTP 200 responses (not more, not fewer)
2. `Retry-After` header present on all 429 responses

Also verify the `X-RateLimit-*` headers on a standard 200 response:

```bash
curl -v http://localhost:3001/ping 2>&1 | grep -i "x-ratelimit"
```

Expected:

```
< x-ratelimit-limit: 100
< x-ratelimit-remaining: 99
< x-ratelimit-reset: 1753216800000
```

### Step 4 — Scenario 4: P95 load test

```bash
cd backend
npm run load-test:db
```

Confirm the output ends with `✅ PASS — P95 < 500ms and zero errors`.

Record the full statistics block (Min, Avg, P50, P95, P99, Max, Error count) as evidence.

### Step 5 — Remove temporary test artefacts

**Remove the `/ping` test route** added in TASK-003:

```bash
# In backend/src/routes/health.ts, delete the /ping route block:
# router.get('/ping', ...) — entire block
```

Then:

```bash
git add backend/src/routes/health.ts
npm run type-check   # Confirm still compiles
```

Confirm `/health` and `/ready` still respond correctly after the removal:

```bash
curl http://localhost:3001/health
curl http://localhost:3001/ready
```

### Step 6 — Update `us_003.md` Definition of Done

Once all four scenarios pass, update `.propel/context/tasks/EP-TECH/us_003.md`:

```markdown
## Definition of Done

- [x] Prisma client initialised with Supabase `DATABASE_URL`
- [x] Connection pool min 2 / max 10 configured
- [x] Upstash Redis connected; PING passing in `/health`
- [x] Rate limiting middleware active (100 req/min public, 1 000 req/min auth)
- [x] P95 latency < 500 ms confirmed under 50-concurrent load test
```

Update status front matter:

```yaml
status: done
```

### Step 7 — Create validation evidence document

Create `.propel/context/tasks/EP-TECH/us_003/validation-evidence.md`:

```markdown
# US-003 Validation Evidence

## Date: YYYY-MM-DD
## Validator: <name>

| Scenario | Status | Evidence |
|----------|--------|----------|
| Scenario 1 — Prisma SELECT 1 < 100 ms | PASS | 10-sample avg: 16ms; max: 31ms |
| Scenario 2 — Redis PING < 50 ms | PASS | 10-sample avg: 22ms; max: 41ms |
| Scenario 3 — HTTP 429 at 101st, Retry-After present | PASS | 100× HTTP 200, 10× HTTP 429; Retry-After: 58s |
| Scenario 4 — P95 < 500 ms at 50 concurrent | PASS | P95: 312ms; Errors: 0/150 |

## Pool Configuration Used

- `connection_limit=10`
- `pool_timeout=30`
- `pgbouncer=true`
- Supabase region: `us-east-1`
- Railway region: `us-east`
```

---

## Cleanup Checklist

| Item | Action | Status |
|------|--------|--------|
| `/ping` test route in `health.ts` | Delete entire `router.get('/ping', ...)` block | [ ] |
| `scripts/test-rate-limit.ts` | Keep (useful regression tool) or move to `test/` | [ ] |
| `scripts/load-test-db.ts` | Keep (used for future perf regressions) | [ ] |

---

## Validation

| Check | Evidence Required | Owner |
|-------|------------------|-------|
| `db_ms` < 100 (10 samples) | JSON output from `/health` curl loop | Developer |
| `redis_ms` < 50 (10 samples) | JSON output from `/health` curl loop | Developer |
| 429 on request #101 | `test-rate-limit.ts` output | Developer |
| `Retry-After` header value | `test-rate-limit.ts` output + `curl -v` headers | Developer |
| P95 < 500 ms, 0 errors | `load-test:db` output block | Developer |
| `/ping` route removed | `curl http://localhost:3001/ping` → 404 | Developer |

---

## Dependencies

- **TASK-001** through **TASK-004** must all be complete before this task begins
- Both Supabase (dev) and Upstash credentials in `backend/.env`
- Backend running locally or on Railway staging

## Security Constraints

- **OWASP A05**: The temporary `/ping` route exposes an unauthenticated endpoint — it **must** be removed before this story closes. Leaving it creates an unintended attack surface and wastes rate limit quota on health probes.
- `validation-evidence.md` must not contain Supabase passwords or Upstash tokens. Record only pool configuration parameters and latency metrics.

---

## Definition of Done

- [ ] Scenario 1 validated — `db_ms` < 100 across 10 samples (evidence logged)
- [ ] Scenario 2 validated — `redis_ms` < 50 across 10 samples (evidence logged)
- [ ] Scenario 3 validated — HTTP 429 on 101st request, `Retry-After` header present (evidence logged)
- [ ] Scenario 4 validated — P95 < 500 ms, 0 errors (load test output logged)
- [ ] `/ping` test route removed from `health.ts`
- [ ] `npm run type-check` exits 0 after route removal
- [ ] `us_003.md` all Definition of Done checkboxes ticked
- [ ] `us_003.md` `status` updated to `done`
- [ ] `validation-evidence.md` created and committed

## Traceability

| Artefact | ID |
|----------|----|
| User Story | US-003 |
| Epic | EP-TECH |
| NFR | NFR-001 (P95 query < 500 ms; Redis < 50 ms), NFR-004 (rate limiting thresholds) |
| TR | TR-008.6 (connection pooling — empirical sign-off) |
| Scenario | 1, 2, 3, 4 (all acceptance criteria) |
