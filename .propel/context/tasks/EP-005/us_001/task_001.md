---
id: task_001
us_id: us_001
epic: EP-005
title: "Implement Timezone-Aware Interview Scheduling Backend and Conflict Detection"
status: completed
layer: backend
effort: 5h
priority: critical
created: 2026-07-25
---

# TASK-001 — Implement Timezone-Aware Interview Scheduling Backend and Conflict Detection

## Context

**User Story**: US-001 — Timezone-Aware Interview Scheduling with Panelist Conflict Detection  
**Epic**: EP-005 — Interview Scheduling and Lifecycle Management  
**Addresses**: Scenario 1, Scenario 2, Scenario 3, Scenario 4

Interview creation must persist UTC, compute participant-local invite times, and reject conflicting panelist bookings before confirmation.

---

## Objective

Implement backend scheduling logic so that:
1. interview times are stored in UTC regardless of recruiter locale
2. conflict queries detect panelist booking collisions before slot confirmation
3. saved interviews can drive calendar invite generation and reminder jobs downstream

---

## Technical Specifications

| Area | Requirement |
|------|-------------|
| Time normalization | convert recruiter-entered local time + timezone to UTC before persistence |
| Conflict detection | check all selected panelists for overlapping interviews before create/update |
| API guard | reject scheduling when any panelist is already booked in the slot |
| Persistence | store UTC interview start/end plus timezone metadata for rendering |
| Downstream contract | emit invite-ready scheduling payload for email/calendar services |

---

## Implementation Steps

### Step 1 — Normalize interview times

1. Add server-side conversion from local interview time and source timezone into UTC.
2. Persist UTC timestamps plus original timezone metadata needed for display.
3. Ensure stored times are authoritative even if client submits locale-specific strings.

### Step 2 — Add conflict detection query

1. Query existing interviews for the selected panelists within the candidate slot window.
2. Apply overlap detection using the interview start/end boundaries.
3. Return structured conflict data for the UI warning modal.

### Step 3 — Wire scheduling create/update contract

1. Enforce conflict blocking in the interview create endpoint.
2. Provide invite-ready participant context for candidate, recruiter, and panelists.
3. Keep scheduling response explicit about UTC storage and conflicting panelists.

---

## Validation

| Check | Method | Expected Result |
|-------|--------|-----------------|
| UTC persistence | backend integration test | database stores UTC timestamp values |
| conflict blocking | backend integration test | overlapping panelist booking returns 422-style conflict response |
| conflict payload | API test | warning modal data includes existing interview title and time |
| invite-ready contract | service test | scheduling response includes participant-local rendering inputs |

---

## Dependencies

- EP-005 / US-002 (panelist assignment and availability)
- EP-DATA / US-001 (`interviews`, `panelists` tables)

---

## Security Constraints

- Do not trust client-local times for persistence
- Avoid exposing unrelated candidate records when reporting panelist conflicts

---

## Definition of Done

- [x] Interview time is converted to UTC before persistence
- [x] Conflict query checks panelist bookings before confirm
- [x] Conflicting slots return a structured warning payload
- [x] Stored interview records include timezone metadata for rendering
- [x] Backend integration tests cover UTC storage and conflict detection

## Completion Notes

- Added `POST /api/interviews` in `backend/src/routes/interviews.ts` with role-based authorization, request validation, and conflict response handling.
- Implemented UTC normalization and panelist overlap detection in `backend/src/services/interviewSchedulingService.ts` using the existing `InterviewStage` model.
- Registered the new interviews router in `backend/src/app.ts`.
- Added backend integration coverage for UTC persistence, panelist conflict detection, request validation, and authorization.

## Validation Notes

- `cmd /c "set NODE_OPTIONS=--max-old-space-size=8192 && npm --prefix backend run test:integration -- src/services/__tests__/interviewSchedulingService.integration.test.ts"` -> PASS
- `cmd /c "set NODE_OPTIONS=--max-old-space-size=8192 && npm --prefix backend run test:integration -- src/routes/__tests__/interviews.integration.test.ts"` -> PASS
