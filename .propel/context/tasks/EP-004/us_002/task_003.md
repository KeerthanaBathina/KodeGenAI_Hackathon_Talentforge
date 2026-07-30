---
id: task_003
us_id: us_002
epic: EP-004
title: "Implement Frontend Decision Form with Mandatory Reason Selection"
status: completed
layer: frontend
effort: 4h
priority: high
created: 2026-07-25
---

# TASK-003 — Implement Frontend Decision Form with Mandatory Reason Selection

## Context

**User Story**: US-002 — Shortlist and Reject Decisions with Mandatory Reason Codes  
**Epic**: EP-004 — HR Review and Decisioning  
**Addresses**: Scenario 1, Scenario 2

HR reviewers need a clear decision form that enforces reason capture before confirmation.

---

## Objective

Implement decision UX in review queue actions:
1. reason code dropdown populated from backend `reason_codes`
2. optional comment input (max 500 chars)
3. confirm action disabled until valid reason is selected
4. inline validation message for reject without reason code

---

## Technical Specifications

| Feature | Requirement |
|---------|-------------|
| Reason options | fetched from authenticated API endpoint |
| Decision form | supports shortlist and reject flows |
| Confirm enablement | enabled only when reason code selected |
| Inline copy | "A reason code is required before rejecting." |
| Comment | optional, max 500 chars, live character count |
| Accessibility | keyboard accessible controls + ARIA labels |

---

## Implementation Steps

### Step 1 — Add reason-code data retrieval

1. Implement frontend API client call for reason-code options.
2. Cache options in page/component state for reuse across row actions.
3. Handle loading and empty-state behavior.

### Step 2 — Add decision capture UI

1. Add decision confirmation UI (drawer/modal/inline panel) per row.
2. Render reason dropdown and optional comment textarea.
3. Enforce max 500 chars with user feedback.

### Step 3 — Implement client-side validation and action state

1. Keep confirm disabled until a reason is selected.
2. Show inline reject validation message exactly as required.
3. Submit payload to backend with `decision`, `reasonCode`, `comment`.

---

## Validation

| Check | Method | Expected Result |
|-------|--------|-----------------|
| Reject without reason | component test | confirm disabled + inline validation message shown |
| Reason selected | component test | confirm enabled |
| Comment max length | component test | input capped/validated at 500 |
| Reason options loaded | component test | dropdown contains backend options |

---

## Dependencies

- TASK-001 decision API contract
- Existing manual review queue table action controls

## Security Constraints

- Request reason codes and submit decisions with authenticated credentials
- Do not render hidden/internal reason metadata in UI

---

## Definition of Done

- [x] Reason dropdown populated from backend source
- [x] Confirm disabled until reason code selected
- [x] Inline reject validation message matches required text
- [x] Optional comment field enforced at max 500 chars
- [x] Frontend tests cover validation and payload behavior

## Traceability

| Artefact | ID |
|----------|----|
| User Story | US-002 |
| Epic | EP-004 |
| Scenario | 1, 2 |
| FR | FR-030, FR-031 |