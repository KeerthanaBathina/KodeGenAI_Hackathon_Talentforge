---
id: task_002
us_id: us_003
epic: EP-004
title: "Read Classification Threshold from Config and Enforce Domain Rules"
status: completed
layer: backend
effort: 3h
priority: high
created: 2026-07-25
---

# TASK-002 — Read Classification Threshold from Config and Enforce Domain Rules

## Context

**User Story**: US-003 — Automatic Path Classification (Fresher vs. Experienced) with Recruiter Override  
**Epic**: EP-004 — HR Review and Decisioning  
**Addresses**: Scenario 1, Scenario 2

The threshold must be configurable via data, not hard-coded, to support policy changes without redeploy.

---

## Objective

Implement threshold configuration support so that:
1. classification threshold is read from `scoring_thresholds`
2. a safe default is applied when config is unavailable/invalid
3. threshold usage is transparent via structured diagnostics

---

## Technical Specifications

| Area | Requirement |
|------|-------------|
| Config source | `scoring_thresholds` table |
| Key | dedicated key for path classification years threshold |
| Type safety | numeric parse + min/max sanity checks |
| Fallback | deterministic default threshold (2 years) |
| Performance | cache/read strategy prevents excessive DB lookups |

---

## Implementation Steps

### Step 1 — Implement threshold retrieval

1. Add repository/service method to read threshold config value.
2. Parse and validate numeric value.
3. Return typed threshold to classification logic.

### Step 2 — Add fallback and guardrails

1. Define fallback threshold for missing records.
2. Handle malformed values with warning logs and fallback.
3. Keep classification flow non-blocking when config read fails.

### Step 3 — Integrate with auto-classification

1. Replace hard-coded threshold usage.
2. Pass threshold into path rule evaluation.
3. Ensure boundary behavior remains stable across all tests.

---

## Validation

| Check | Method | Expected Result |
|-------|--------|-----------------|
| configured threshold present | backend test | configured value used |
| missing threshold record | backend test | default 2 used |
| invalid threshold value | backend test | warning + default 2 |
| boundary at threshold | backend test | `<` => fresher, `>=` => experienced |

---

## Dependencies

- TASK-001 classification pipeline hook
- Existing config/data-access patterns for `scoring_thresholds`

## Security Constraints

- Do not permit arbitrary runtime override from client requests
- Avoid leaking internal config internals to API responses

---

## Definition of Done

- [x] Threshold is sourced from `scoring_thresholds`
- [x] Missing/invalid values safely fallback to default
- [x] Classification rule behavior remains deterministic at boundaries
- [x] Tests cover configured, missing, and malformed config scenarios

## Completion Notes

- Threshold retrieval now uses `scoring_thresholds.experienceThresholdYears` by `jobFamilyId` and most recent `effectiveFrom`.
- Deterministic fallback threshold is `2` years when threshold is missing or invalid.
- Boundary rule remains stable: `< threshold` => `fresher`, `>= threshold` => `experienced`.
- Backend unit coverage now explicitly validates configured threshold, missing threshold fallback, and malformed threshold fallback with warning log.

## Traceability

| Artefact | ID |
|----------|----|
| User Story | US-003 |
| Epic | EP-004 |
| Scenario | 1, 2 |
| FR | FR-032 |
