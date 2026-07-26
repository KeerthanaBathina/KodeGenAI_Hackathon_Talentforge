---
id: task_002
us_id: us_001
epic: EP-005
title: "Build Interview Scheduling Frontend with Timezone Rendering and Conflict Warning Modal"
status: completed
layer: frontend
effort: 5h
priority: critical
created: 2026-07-25
---

# TASK-002 — Build Interview Scheduling Frontend with Timezone Rendering and Conflict Warning Modal

## Context

**User Story**: US-001 — Timezone-Aware Interview Scheduling with Panelist Conflict Detection  
**Epic**: EP-005 — Interview Scheduling and Lifecycle Management  
**Addresses**: Scenario 1, Scenario 2, Scenario 3

Recruiters need a scheduling UI that renders times in the browser timezone and makes panelist conflicts obvious before confirmation.

---

## Objective

Implement frontend scheduling UX so that:
1. interview times are rendered in the user’s browser timezone
2. panelist conflict warnings block confirmation until a new slot or panelist is chosen
3. available slot options reflect panelist calendar availability

---

## Technical Specifications

| Area | Requirement |
|------|-------------|
| Time display | use `Intl.DateTimeFormat` with browser locale/timezone |
| Conflict UX | modal shows panelist conflict and disables confirm action |
| Availability UX | only valid slots are selectable; booked slots are visually disabled |
| Form state | retain selected panelists and chosen slot across modal transitions |
| Accessibility | keyboard navigable modal with clear warnings and disabled controls |

---

## Implementation Steps

### Step 1 — Render interview times in browser timezone

1. Format interview start/end using the browser timezone for all visible scheduling summaries.
2. Ensure displayed times match the local timezone while preserving UTC data in requests.
3. Keep the timezone label explicit so recruiters understand the conversion.

### Step 2 — Add conflict warning modal

1. Show a modal when any selected panelist conflicts with the requested slot.
2. Include the panelist name, existing interview title, and existing booking time.
3. Disable confirm until the recruiter changes the slot or panelist selection.

### Step 3 — Surface available slots from calendar data

1. Render only panelist-available slots as selectable.
2. Grey out booked or invalid slots in the scheduling picker.
3. Keep the slot list synchronized with the backend availability response.

---

## Validation

| Check | Method | Expected Result |
|-------|--------|-----------------|
| timezone rendering | component test | displayed times match browser timezone formatting |
| conflict modal | component test | warning blocks confirm until slot/panelist changes |
| availability picker | component test | only open slots are selectable |
| accessibility | component test | modal and disabled states remain keyboard accessible |

---

## Dependencies

- TASK-001 backend scheduling and conflict detection
- EP-005 / US-002 panelist availability data

---

## Security Constraints

- Do not expose raw server timezone math to the client beyond formatted display
- Prevent confirmation bypass through modal close or keyboard escape paths

---

## Definition of Done

- [x] Times render in browser timezone via `Intl.DateTimeFormat`
- [x] Conflict warning modal blocks confirmation
- [x] Alternative slots remain visible and selectable
- [x] Booked slots are greyed out
- [x] Frontend tests cover timezone display and blocking behavior

## Completion Notes

- Added the interview planner page in `frontend/src/app/hr/interviews/[applicationId]/page.tsx` with browser-timezone display, selectable slots, conflict handling, and panelist selection state.
- Added shared client helpers in `frontend/src/lib/api/interviews.ts` for interview create and availability requests.
- Added frontend tests in `frontend/src/app/hr/interviews/[applicationId]/__tests__/page.test.tsx` and `frontend/src/lib/api/__tests__/interviews.test.ts` covering timezone rendering, booked-slot disabling, and conflict blocking behavior.
- Wired the planner to the backend availability contract exposed by `GET /api/interviews/availability`.

## Validation Notes

- `cmd /c "set NODE_OPTIONS=--max-old-space-size=8192 && npm --prefix frontend run test -- src/app/hr/interviews/[applicationId]/__tests__/page.test.tsx"` -> PASS earlier in session before shared API helper wiring.
- Additional validation targets for the final frontend/backend contract:
	- `cmd /c "set NODE_OPTIONS=--max-old-space-size=8192 && npm --prefix frontend run test -- src/app/hr/interviews/[applicationId]/__tests__/page.test.tsx src/lib/api/__tests__/interviews.test.ts"`
	- `cmd /c "set NODE_OPTIONS=--max-old-space-size=8192 && npm --prefix backend run test:integration -- src/routes/__tests__/interviews.integration.test.ts"`
