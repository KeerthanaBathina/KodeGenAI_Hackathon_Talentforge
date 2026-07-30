# US-003 Validation Evidence

## Date: 2026-07-23
## Validator: <name>
## Status: Runtime validation executed (partial pass)

## Runtime Context

- Backend started via `npx tsx src/server.ts` using `backend/.env`.
- Validation script executed: `backend/scripts/validate-us003.ps1`.

## Scenario Results

| Scenario | Status | Evidence |
|---|---|---|
| Scenario 1 - Prisma SELECT 1 < 100 ms | FAIL | `db_ms` min 521, max 1396, avg 613.6 |
| Scenario 2 - Redis PING < 50 ms | FAIL | `redis_ms` min 35, max 371, avg 69.6 |
| Scenario 3 - HTTP 429 at threshold + Retry-After | PASS | 100x HTTP 200, 10x HTTP 429, first 429 at request #101, `Retry-After: 6` |
| Scenario 4 - P95 < 500 ms at 50 concurrent | FAIL | 150/150 success, 0 errors, min 519, avg 2141, p50 2100, p95 4218, p99 4393, max 4634 |

## Implemented Configuration Snapshot

- Prisma schema: `backend/prisma/schema.prisma`
- Prisma client singleton: `backend/src/db/prisma.ts`
- Redis singleton: `backend/src/db/redis.ts`
- Rate limiting middleware: `backend/src/middleware/rateLimit.middleware.ts`
- Load test script: `backend/scripts/load-test-db.ts`

## Closeout Checklist

- [x] Scenario 1 evidence captured
- [x] Scenario 2 evidence captured
- [x] Scenario 3 evidence captured
- [x] Scenario 4 evidence captured
- [ ] Temporary `/ping` route removed from `backend/src/routes/health.ts`
- [ ] `npm run type-check` passes after cleanup
- [ ] Update `.propel/context/tasks/EP-TECH/us_003.md` to `status: done`
- [ ] Tick all US-003 Definition of Done checkboxes
