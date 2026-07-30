---
id: task_003
us_id: us_003
epic: EP-004
title: "Build Recruiter Override Flow with Mandatory Justification"
status: completed
layer: frontend
effort: 4h
priority: critical
created: 2026-07-25
---

# TASK-003 — Build Recruiter Override Flow with Mandatory Justification

## Context

**User Story**: US-003 — Automatic Path Classification (Fresher vs. Experienced) with Recruiter Override  
**Epic**: EP-004 — HR Review and Decisioning  
**Addresses**: Scenario 3

Recruiters must be able to override auto-classification only with a written justification of at least 20 characters.

---

## Objective

Implement override UX and request contract so that:
1. override is initiated from application detail/review context
2. modal enforces justification min length 20
3. confirm remains disabled until valid justification and target path are selected

---

## Technical Specifications

| Area | Requirement |
|------|-------------|
| UI entry point | override action/button in recruiter context |
| Modal fields | original path (read-only), new path selection, justification text |
| Validation | justification length >= 20 chars |
| Action state | confirm disabled until valid input |
| Accessibility | keyboard-accessible modal controls + labeled fields |

---

## Implementation Steps

### Step 1 — Add API client and payload contract

1. Create/extend frontend API call for path override endpoint.
2. Send `applicationId`, `newPath`, `justification` payload.
3. Handle success and error responses consistently.

### Step 2 — Implement override modal UX

1. Add modal with original/new path context.
2. Add justification textarea with live length indicator.
3. Disable confirm until justification reaches minimum length.

### Step 3 — Add client-side validation and feedback

1. Show inline validation for short justification.
2. Prevent duplicate submission while request is in flight.
3. Refresh displayed path badge after successful override.

---

## Validation

| Check | Method | Expected Result |
|-------|--------|-----------------|
| justification < 20 | component test | confirm disabled + inline validation |
| justification >= 20 | component test | confirm enabled |
| valid override submission | component test | API called with expected payload |
| accessibility checks | component test | modal and controls are screen-reader addressable |

---

## Dependencies

- Backend override endpoint contract (TASK-004)
- Existing recruiter application detail view components

## Security Constraints

- Override controls visible only to authorized recruiter roles
- Do not expose internal audit identifiers in UI

---

## Definition of Done

- [x] Override modal is reachable from recruiter flow
- [x] Justification min 20 chars is enforced client-side
- [x] Confirm action disabled until valid input
- [x] Frontend tests cover invalid and valid override flows

## Completion Notes

- Added `Override Path` action in manual review queue table with modal-based override flow.
- Confirm action remains disabled until target path is selected and justification reaches 20+ trimmed characters.
- Added frontend API contract and component tests for short-justification blocking and valid submission payload.

## Traceability

| Artefact | ID |
|----------|----|
| User Story | US-003 |
| Epic | EP-004 |
| Scenario | 3 |
| FR | FR-033 |
