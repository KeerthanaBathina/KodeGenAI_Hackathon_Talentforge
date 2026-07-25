---
id: task_005
us_id: us_002
epic: EP-004
title: "Add Multi-Layer Test Coverage and Validation Evidence for US-002"
status: completed
layer: test
effort: 4h
priority: critical
created: 2026-07-25
---

# TASK-005 — Add Multi-Layer Test Coverage and Validation Evidence for US-002

## Context

**User Story**: US-002 — Shortlist and Reject Decisions with Mandatory Reason Codes  
**Epic**: EP-004 — HR Review and Decisioning  
**Addresses**: Scenario 1, Scenario 2, Scenario 3, Scenario 4

US-002 requires layered validation across API validation, async side effects, frontend gating, and audit persistence.

---

## Objective

Create automated tests and evidence proving:
1. reason code is mandatory and validated
2. shortlist/reject transitions and side effects execute correctly
3. queue UI blocks invalid submissions and enables valid ones
4. audit events are persisted with required fields

---

## Technical Specifications

| Layer | Coverage Target |
|-------|-----------------|
| Backend unit | reason-code validation and comment constraints |
| Backend integration | status transitions, audit writes, queue side effects |
| Frontend component | disabled confirm, inline validation, comment length behavior |
| E2E | shortlist and reject UX path with outcome verification |
| Validation evidence | command outputs + scenario-to-test trace matrix |

---

## Implementation Steps

### Step 1 — Backend validation and side-effect tests

1. Add tests for missing/invalid reason code and comment length bounds.
2. Add tests for shortlist/reject transitions and queue side effects.
3. Assert `audit_events` record shape and contents.

### Step 2 — Frontend validation tests

1. Test confirm button disabled until reason selected.
2. Test inline reject warning copy.
3. Test optional comment field and max-length guard.

### Step 3 — Playwright scenario tests

1. Run shortlist flow with valid reason; verify state transition.
2. Run reject flow with required reason; verify rejection side effects cues.
3. Verify no-decision submission path remains blocked.

### Step 4 — Validation evidence

1. Create US-002 validation evidence markdown file.
2. Record executed commands and pass summaries.
3. Add scenario-to-test traceability for all US-002 scenarios.

---

## Validation

| Check | Method | Expected Result |
|-------|--------|-----------------|
| Missing reject reason code | frontend + API test | confirm blocked and API rejects invalid payload |
| Shortlist routing | integration/E2E test | status `shortlisted`; scheduling handoff visible |
| Reject email objective | integration test | rejection email queued/processed within 60s target |
| Audit trail | integration test | `audit_events` entry contains actor, event, entity, reason, timestamp |
| Scenario mapping completeness | evidence review | all four scenarios linked to automated tests |

---

## Dependencies

- TASK-001 through TASK-004
- Existing Vitest and Playwright infrastructure

## Security Constraints

- Use synthetic test fixtures only
- Do not commit secrets in environment/test config logs

---

## Definition of Done

- [x] Backend validation and side-effect tests pass
- [x] Frontend reason-code gating tests pass
- [x] Playwright US-002 scenarios pass
- [x] Validation evidence doc includes command output and scenario mapping

## Traceability

| Artefact | ID |
|----------|----|
| User Story | US-002 |
| Epic | EP-004 |
| Scenario | 1, 2, 3, 4 |
| FR | FR-030, FR-031 |