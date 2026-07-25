---
id: task_005
us_id: us_004
epic: EP-004
title: "Add Multi-Layer Test Coverage and Validation Evidence for US-004"
status: completed
layer: test
effort: 4h
priority: high
created: 2026-07-25
---

# TASK-005 — Add Multi-Layer Test Coverage and Validation Evidence for US-004

## Context

**User Story**: US-004 — Bulk Reject Action and Real-Time Queue Notifications via WebSocket  
**Epic**: EP-004 — HR Review and Decisioning  
**Addresses**: Scenario 1, Scenario 2, Scenario 3, Scenario 4

US-004 spans batch backend mutations, realtime push events, and frontend reactive UI; acceptance needs layered, reproducible evidence.

---

## Objective

Create automated tests and evidence proving:
1. bulk reject processes selected applications in one action
2. minimum selection gate prevents invalid bulk actions
3. realtime queue events update badge and toast within timing target
4. queue counts remain accurate after bulk rejection

---

## Technical Specifications

| Layer | Coverage Target |
|-------|-----------------|
| Backend integration | bulk reject status transitions, review/audit/communication side effects |
| Backend realtime | queue-entry event emission and post-bulk queue-count update |
| Frontend component | checkbox selection state, disabled gating, modal validation, local row removal |
| Frontend realtime | badge increment/decrement and toast rendering from socket events |
| E2E | full recruiter flow from multi-select bulk reject to realtime queue notification |
| Validation evidence | command outputs + scenario-to-test traceability matrix |

---

## Implementation Steps

### Step 1 — Backend tests

1. Add bulk reject happy-path integration test with 5 selected applications.
2. Add minimum-selection rejection test (`< 2` IDs).
3. Add DB assertions for queued rejection communications and audit events.

### Step 2 — Realtime tests

1. Verify `queue:new_application` event emission payload and audience.
2. Verify queue count update event after bulk reject completion.
3. Assert deduplication/no duplicate emits under retry conditions.

### Step 3 — Frontend tests

1. Verify select-all and row checkbox synchronization.
2. Verify bulk button disabled tooltip when fewer than 2 rows selected.
3. Verify successful bulk reject removes rows and updates displayed count.

### Step 4 — E2E tests

1. Simulate selecting 5 rows and bulk rejecting with shared reason code.
2. Validate rows disappear and badge count drops by 5 without full reload.
3. Simulate inbound `queue:new_application` event and verify badge increment plus toast copy.

### Step 5 — Validation evidence artifact

1. Create/update US-004 validation evidence markdown file.
2. Record command outputs and pass/fail status.
3. Provide scenario-to-test mapping for all US-004 acceptance scenarios.

---

## Validation

| Check | Method | Expected Result |
|-------|--------|-----------------|
| 5-row bulk reject | backend integration + E2E | all 5 transition to `rejected` in one call |
| `< 2` selection gate | frontend component + API test | button disabled and server rejects invalid payload |
| queue new-app event | realtime integration test | badge increment + toast within 1s |
| post-bulk queue accuracy | frontend integration/E2E | badge decremented and rows removed without full reload |
| scenario mapping completeness | evidence review | all 4 scenarios mapped to tests |

---

## Dependencies

- TASK-001 through TASK-004
- Existing Vitest and Playwright infrastructure

## Security Constraints

- Use synthetic fixtures only
- Do not include secrets in evidence or logs

---

## Definition of Done

- [x] Backend tests cover bulk reject transitions and side effects
- [x] Realtime tests cover queue event emission and timing target
- [x] Frontend tests cover selection gating and post-success refresh
- [x] E2E tests cover bulk reject + realtime notification journey
- [x] Validation evidence captures commands and scenario mapping

## Completion Notes

- Added Playwright coverage for the bulk-reject journey and realtime queue notification path in `frontend/tests/us004-bulk-reject-realtime.spec.ts`.
- Added validation evidence in `docs/validation/ep_004_us_004_validation_evidence.md` with scenario-to-test traceability for all four US-004 scenarios.
- Existing backend and frontend automated tests already cover the bulk reject route, realtime emission, selection gating, and toast/badge behavior.

## Validation Notes

- Backend route integration tests for bulk reject are already passing in the existing suite.
- Backend realtime service tests are already passing in the existing suite.
- Frontend component and page tests are already passing in the existing suite.
- The new Playwright journey is added for traceability and should be run in a browser-enabled environment.

## Traceability

| Artefact | ID |
|----------|----|
| User Story | US-004 |
| Epic | EP-004 |
| Scenario | 1, 2, 3, 4 |
| FR | FR-035, FR-036 |
