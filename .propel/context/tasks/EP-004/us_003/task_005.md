---
id: task_005
us_id: us_003
epic: EP-004
title: "Add Multi-Layer Test Coverage and Validation Evidence for US-003"
status: completed
layer: test
effort: 4h
priority: high
created: 2026-07-25
---

# TASK-005 — Add Multi-Layer Test Coverage and Validation Evidence for US-003

## Context

**User Story**: US-003 — Automatic Path Classification (Fresher vs. Experienced) with Recruiter Override  
**Epic**: EP-004 — HR Review and Decisioning  
**Addresses**: Scenario 1, Scenario 2, Scenario 3, Scenario 4

US-003 requires confidence across classification logic, configuration handling, override UX, and audit persistence.

---

## Objective

Create automated tests and evidence proving:
1. auto-classification behaves correctly at threshold boundaries
2. override requires justification and updates path safely
3. override writes complete audit events
4. scenario-to-test mapping is complete and reproducible

---

## Technical Specifications

| Layer | Coverage Target |
|-------|-----------------|
| Backend unit | threshold parsing, classification boundary rules, fallback behavior |
| Backend integration | shortlist path assignment, override mutation, audit writes |
| Frontend component | override modal validation and disabled state behavior |
| E2E | recruiter override flow and visible path updates |
| Validation evidence | command outputs + scenario-to-test traceability matrix |

---

## Implementation Steps

### Step 1 — Backend classification and override tests

1. Add threshold boundary tests (`1`, `2`, `3` years).
2. Add config fallback tests for missing/malformed threshold values.
3. Add override tests for validation, persistence, and audit payload shape.

### Step 2 — Frontend override validation tests

1. Verify confirm disabled when justification < 20 chars.
2. Verify confirm enabled when justification is valid.
3. Verify payload and UI refresh behavior after successful override.

### Step 3 — End-to-end scenario tests

1. Shortlist with low experience -> fresher path visible.
2. Shortlist with higher experience -> experienced path visible.
3. Override flow requires justification and updates path.
4. Validate audit cue/observable trace where feasible in test harness.

### Step 4 — Validation evidence artifact

1. Create US-003 validation evidence markdown file.
2. Record command outputs and pass/fail status.
3. Provide scenario-to-test mapping for all US-003 acceptance scenarios.

---

## Validation

| Check | Method | Expected Result |
|-------|--------|-----------------|
| `<2` years classification | backend test | path `fresher` |
| `>=2` years classification | backend test | path `experienced` |
| override short justification | frontend + API test | blocked/400 |
| override audit trail | integration test | audit event includes required override fields |
| scenario mapping completeness | evidence review | all four scenarios mapped to tests |

---

## Dependencies

- TASK-001 through TASK-004
- Existing Vitest + Playwright infrastructure

## Security Constraints

- Use synthetic fixtures only
- Do not include secrets in evidence or logs

---

## Definition of Done

- [x] Backend tests cover classification thresholds and override persistence
- [x] Frontend tests cover min justification gating
- [x] E2E tests cover classification + override user journeys
- [x] Validation evidence doc captures commands and scenario mapping

## Progress Notes

- Backend route integration tests updated and passing for override success + validation + conflict + not-found mappings.
- Frontend component tests updated and passing for path badge rendering and min-20 justification gating.
- Added Playwright E2E spec for recruiter path override flow with deterministic mocked API contract and min-20 justification gating.
- E2E run is passing and evidence output has been appended.

## Traceability

| Artefact | ID |
|----------|----|
| User Story | US-003 |
| Epic | EP-004 |
| Scenario | 1, 2, 3, 4 |
| FR | FR-032, FR-033 |
