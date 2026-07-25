---
id: task_002
us_id: us_004
epic: EP-004
title: "Implement Real-Time Queue New-Application Event Emission"
status: completed
layer: backend
effort: 4h
priority: high
created: 2026-07-25
---

# TASK-002 — Implement Real-Time Queue New-Application Event Emission

## Context

**User Story**: US-004 — Bulk Reject Action and Real-Time Queue Notifications via WebSocket  
**Epic**: EP-004 — HR Review and Decisioning  
**Addresses**: Scenario 3, Scenario 4

HR users need near-real-time visibility when new applications enter manual review queue and when queue counts change after bulk actions.

---

## Objective

Implement queue realtime backend events so that:
1. `queue:new_application` emits within one second of queue entry
2. payload contains candidate and requisition summary required for toast
3. queue count updates are emitted after bulk reject completion

---

## Technical Specifications

| Area | Requirement |
|------|-------------|
| Event name | `queue:new_application` |
| Primary audience | HR reviewer and HR manager socket rooms |
| Event payload | `applicationId`, `candidateName`, `requisitionTitle`, `queuedAt`, `queueCount` |
| Timeliness target | event delivery initiated within 1s of queue entry |
| Consistency | queue count event after bulk reject reflects post-transaction count |

---

## Implementation Steps

### Step 1 — Wire queue-entry event producer

1. Identify screening outcome branch where applications transition into manual review queue.
2. Publish `queue:new_application` event with normalized payload.
3. Ensure emission occurs only once per queue-entry transition.

### Step 2 — Emit queue count updates after bulk reject

1. Recompute queue count after successful bulk rejection commit.
2. Emit queue-count update event to HR subscribers.
3. Include correlation metadata for observability and troubleshooting.

### Step 3 — Add reliability and diagnostics

1. Add structured logs for event emission latency and payload key fields.
2. Guard against duplicate emissions on retries/idempotent operations.
3. Add fallback behavior when socket layer is unavailable (no request failure).

---

## Validation

| Check | Method | Expected Result |
|-------|--------|-----------------|
| queue entry emission | integration/realtime test | `queue:new_application` emitted once with expected payload |
| event latency | timed test assertion | emission trigger occurs within 1s budget |
| bulk reject count update | integration/realtime test | queue count delta equals rejected count |
| socket failure path | unit test | core business transaction succeeds despite emit failure |

---

## Dependencies

- Existing Socket.IO server and HR room subscription model
- TASK-001 bulk reject backend transaction completion hook

## Security Constraints

- Emit only non-sensitive candidate display fields in socket payloads
- Ensure events are scoped to authorized HR channels only

---

## Definition of Done

- [x] `queue:new_application` event emitted on queue entry
- [x] Queue badge/count update event emitted after bulk reject
- [x] Event payload supports UI toast and badge refresh requirements
- [x] Realtime tests validate timeliness and deduplication behavior

## Completion Notes

- Extended realtime service with reusable emit helpers in `backend/src/services/reviewQueueRealtimeService.ts`:
	- `emitQueueNewApplicationEvent(...)` emits `queue:new_application` with payload fields: `applicationId`, `candidateName`, `requisitionTitle`, `queuedAt`, `queueCount`, `timestamp`.
	- `emitReviewQueueBadgeCountSnapshot(...)` emits refreshed `review-queue:badge-count` based on current pending queue snapshot.
- Wired screening queue-entry emission in `backend/src/services/screeningService.ts` so manual-review transitions emit `queue:new_application` as soon as status becomes `pending_review`.
- Wired post-bulk queue count refresh in `backend/src/services/manualReviewQueueService.ts` so successful bulk rejection emits updated badge counts after commit.
- Added fallback-safe behavior: emitter helpers return `false` if socket emitter is unavailable and log failures without breaking business transactions.

## Validation Notes

- `npm --prefix backend run test -- src/services/__tests__/reviewQueueRealtimeService.test.ts` -> PASS (5 tests), including:
	- `queue:new_application` payload emission and queueCount assertion
	- badge refresh emission assertion
	- socket-unavailable fallback behavior
- `npm --prefix backend run test:integration -- src/routes/__tests__/manualReviewQueue.integration.test.ts` -> PASS (18 tests) regression-safe after realtime additions.
- Integration suites that import full backend env config remain blocked in this session due missing required environment variables (`DATABASE_URL`, `DIRECT_URL`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `FRONTEND_URL`).

## Traceability

| Artefact | ID |
|----------|----|
| User Story | US-004 |
| Epic | EP-004 |
| Scenario | 3, 4 |
| FR | FR-036 |
