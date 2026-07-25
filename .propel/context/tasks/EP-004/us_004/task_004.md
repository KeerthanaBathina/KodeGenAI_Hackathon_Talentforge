---
id: task_004
us_id: us_004
epic: EP-004
title: "Integrate Queue WebSocket Badge and Toast Notifications in Frontend"
status: completed
layer: frontend
effort: 4h
priority: high
created: 2026-07-25
---

# TASK-004 — Integrate Queue WebSocket Badge and Toast Notifications in Frontend

## Context

**User Story**: US-004 — Bulk Reject Action and Real-Time Queue Notifications via WebSocket  
**Epic**: EP-004 — HR Review and Decisioning  
**Addresses**: Scenario 3, Scenario 4

Queue badge and in-page feedback must react to socket events quickly to avoid stale manual-review workload visibility.

---

## Objective

Implement frontend realtime consumption so that:
1. queue badge increments on `queue:new_application` within one second
2. toast appears with candidate name and role title
3. badge decrements after bulk reject without manual reload

---

## Technical Specifications

| Area | Requirement |
|------|-------------|
| Socket event subscription | `queue:new_application` and queue-count update event |
| UI update target | global/manual-review navigation badge + in-page counters |
| Toast copy | `New application: [Candidate Name] for [Role].` |
| Timing | visible badge change within 1 second of event reception |
| State consistency | avoid double increments on reconnect/replay |

---

## Implementation Steps

### Step 1 — Add socket event handlers in frontend realtime layer

1. Subscribe to queue events at authenticated HR entry points.
2. Parse and validate payload shape before state update.
3. Unsubscribe cleanly on unmount/session change.

### Step 2 — Update badge and toast state

1. Increment badge on new queue-entry events.
2. Show toast with candidate and requisition context.
3. Apply queue count sync after bulk reject completion events.

### Step 3 — Handle reconnect and deduplication

1. Prevent duplicate badge updates for replayed event ids.
2. Resync count from API after reconnect when needed.
3. Add defensive logging for malformed payloads.

---

## Validation

| Check | Method | Expected Result |
|-------|--------|-----------------|
| new queue event | frontend integration test | badge increments and toast text matches requirement |
| timing budget | timed test | visible update within 1s |
| dedupe behavior | realtime test | duplicate event id does not double-increment |
| bulk reject sync | component/integration test | badge decreases by rejected count |

---

## Dependencies

- TASK-002 backend event emission contract
- Existing frontend socket bootstrap and badge state hooks

## Security Constraints

- Never trust socket payload without schema validation
- Do not render raw unescaped payload strings in toast content

---

## Definition of Done

- [x] Queue badge updates in realtime from socket events
- [x] Toast copy and timing meet acceptance criteria
- [x] Duplicate/replayed events are handled safely
- [x] Frontend tests verify realtime update behavior

## Completion Notes

- Extended shared frontend realtime bridge in `frontend/src/lib/reviewQueueRealtime.ts` with:
	- `QueueNewApplicationPayload`
	- `subscribeToQueueNewApplication(...)`
	- `emitQueueNewApplication(...)`
- Manual review page now listens for `queue:new_application` events and:
	- updates navigation badge counts
	- shows a toast using the required copy format: `New application: [Candidate Name] for [Role].`
	- suppresses duplicate updates for repeated application IDs in the session
- Realtime badge subscription cleanup is now explicit so the page unsubscribes cleanly on unmount.
- The existing review queue badge bridge remains intact for `review-queue:badge-count` updates.

## Validation Notes

- `cmd /c "set NODE_OPTIONS=--max-old-space-size=8192 && npm --prefix frontend run test -- src/app/hr/manual-review/__tests__/page.test.tsx"` -> PASS (4 tests), including new application toast + badge update coverage.
- `cmd /c "set NODE_OPTIONS=--max-old-space-size=8192 && npm --prefix frontend run test -- src/components/manualReview/__tests__/ManualReviewQueueTable.test.tsx"` -> PASS (11 tests) after realtime page integration changes.

## Traceability

| Artefact | ID |
|----------|----|
| User Story | US-004 |
| Epic | EP-004 |
| Scenario | 3, 4 |
| FR | FR-036 |
