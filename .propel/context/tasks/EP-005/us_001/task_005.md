---
id: task_005
us_id: us_001
epic: EP-005
title: "Add Multi-Layer Test Coverage and Validation Evidence for US-001"
status: completed
layer: test
effort: 4h
priority: high
created: 2026-07-25
---

# TASK-005 — Add Multi-Layer Test Coverage and Validation Evidence for US-001

## Context

**User Story**: US-001 — Timezone-Aware Interview Scheduling with Panelist Conflict Detection  
**Epic**: EP-005 — Interview Scheduling and Lifecycle Management  
**Addresses**: Scenario 1, Scenario 2, Scenario 3, Scenario 4

US-001 spans timezone math, conflict detection, frontend scheduling UX, and invite/reminder automation; acceptance needs layered, reproducible evidence.

---

## Objective

Create automated tests and evidence proving:
1. interview scheduling stores UTC and renders participant-local times correctly
2. conflict warnings block invalid scheduling before confirmation
3. calendar invites are queued for all participants after confirmation
4. reminder jobs are created for the 24-hour and 1-hour thresholds

---

## Technical Specifications

| Layer | Coverage Target |
|-------|-----------------|
| Backend integration | UTC persistence, conflict query behavior, invite/reminder side effects |
| Frontend component | timezone rendering, conflict modal blocking, slot availability UI |
| Backend jobs | invite and reminder queue scheduling |
| E2E | full recruiter flow from slot selection to confirmation and invite trigger |
| Validation evidence | command outputs + scenario-to-test traceability matrix |

---

## Implementation Steps

### Step 1 — Backend tests

1. Add UTC storage integration test for interview creation.
2. Add conflict detection test for overlapping panelist bookings.
3. Add invite/reminder enqueue assertions for confirmed interviews.

### Step 2 — Frontend tests

1. Verify times render in the browser timezone.
2. Verify conflict modal disables confirm until the schedule changes.
3. Verify booked slots are greyed out and unavailable for selection.

### Step 3 — Job and notification tests

1. Verify `.ics` invite generation for all participants.
2. Verify 24-hour and 1-hour reminder jobs are scheduled at creation.
3. Assert audit entries are written for scheduling actions.

### Step 4 — E2E tests

1. Schedule an interview in a timezone-aware slot and confirm it.
2. Validate conflict warning behavior when a panelist is already booked.
3. Verify invite/reminder side effects are reflected in the journey trace.

### Step 5 — Validation evidence artifact

1. Create/update US-001 validation evidence markdown file.
2. Record command outputs and pass/fail status.
3. Provide scenario-to-test mapping for all US-001 acceptance scenarios.

---

## Validation

| Check | Method | Expected Result |
|-------|--------|-----------------|
| UTC storage | backend integration + DB assertion | interview start/end saved as UTC |
| conflict blocking | backend + frontend component test | confirm blocked and warning shown |
| invite delivery | backend job test + integration test | `.ics` invites queued for all participants |
| reminder jobs | backend job test | 24h and 1h delayed jobs created |
| scenario mapping completeness | evidence review | all 4 scenarios mapped to tests |

---

## Dependencies

- TASK-001 through TASK-004
- Existing Vitest and Playwright infrastructure

---

## Security Constraints

- Use synthetic fixtures only
- Do not include secrets in evidence or logs

---

## Definition of Done

- [x] Backend tests cover UTC persistence and conflict detection
- [x] Frontend tests cover timezone rendering and conflict blocking
- [x] Job tests cover invite and reminder scheduling
- [x] E2E tests cover the scheduling and conflict journey
- [x] Validation evidence captures commands and scenario mapping

## Completion Notes

- Added US-001 validation evidence in `docs/validation/ep_005_us_001_validation_evidence.md` with scenario coverage and traceability.
- Added Playwright journey coverage in `frontend/tests/us005-interview-scheduling.spec.ts` for timezone-aware scheduling and conflict handling.
- Existing backend and frontend test suites now cover UTC persistence, conflict responses, availability rendering, invite generation, reminder queueing, and audit behavior.

## Validation Notes

- Validation commands are recorded in the evidence artifact and cover backend unit/integration, frontend component/API, and E2E scheduling checks.

---

## Traceability

| Artefact | ID |
|----------|----|
| User Story | US-001 |
| Epic | EP-005 |
| Scenario | 1, 2, 3, 4 |
| FR | FR-037, FR-047, FR-048 |
