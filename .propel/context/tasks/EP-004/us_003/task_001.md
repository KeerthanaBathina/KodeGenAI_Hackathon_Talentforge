---
id: task_001
us_id: us_003
epic: EP-004
title: "Implement Automatic Path Classification on Shortlist"
status: completed
layer: backend
effort: 4h
priority: critical
created: 2026-07-25
---

# TASK-001 — Implement Automatic Path Classification on Shortlist

## Context

**User Story**: US-003 — Automatic Path Classification (Fresher vs. Experienced) with Recruiter Override  
**Epic**: EP-004 — HR Review and Decisioning  
**Addresses**: Scenario 1, Scenario 2

Shortlisted applications must be automatically assigned to the correct interview path based on candidate experience.

---

## Objective

Implement deterministic auto-classification so that:
1. candidates with `< 2` years are assigned `fresher`
2. candidates with `>= 2` years are assigned `experienced`
3. classification is applied automatically as part of shortlist flow

---

## Technical Specifications

| Area | Requirement |
|------|-------------|
| Trigger | Shortlist decision completion |
| Input source | `screenings.parsed_data.experience_years` (latest screening snapshot) |
| Rule | `< threshold` => `fresher`, `>= threshold` => `experienced` |
| Persistence | update `applications.path` in same transactional scope as shortlist side effects |
| Default handling | missing/invalid `experience_years` should follow explicit fallback rule and be logged |

---

## Implementation Steps

### Step 1 — Add classification rule in backend service

1. Read latest parsed experience years during shortlist processing.
2. Apply threshold comparison and compute target path.
3. Persist `applications.path` alongside shortlist status update.

### Step 2 — Connect classification to shortlist transaction

1. Ensure path assignment executes only for shortlist decisions.
2. Keep update within transaction boundary used for decision state changes.
3. Keep behavior idempotent when reprocessing safeguards trigger.

### Step 3 — Add resilience and observability

1. Define fallback behavior for missing/non-numeric experience values.
2. Add structured logs for computed path, threshold, and source value.
3. Avoid exposing sensitive candidate data in logs.

---

## Validation

| Check | Method | Expected Result |
|-------|--------|-----------------|
| `experience_years = 1` | backend test | path set to `fresher` |
| `experience_years = 3` | backend test | path set to `experienced` |
| shortlist flow integration | service/integration test | status shortlisted and path set in same transaction |
| missing experience value | backend test | fallback path applied and logged |

---

## Dependencies

- EP-004 / US-002 shortlist decision pipeline
- EP-003 parsed screening payload availability

## Security Constraints

- Do not log raw full screening payloads
- Restrict path mutation to server-side decision flow only

---

## Definition of Done

- [x] Auto-classification runs on shortlist action
- [x] Path is persisted to `applications.path` correctly for threshold boundaries
- [x] Missing/invalid experience handling is deterministic and tested
- [x] Backend tests cover fresher and experienced outcomes

## Completion Notes

- Implemented in `markAsReviewed` shortlist branch with transaction-scoped path persistence and reset of override metadata.
- Experience years are parsed from screening factors payload (`parsedData.experience_years`) with deterministic fallback and warning log on missing/invalid values.
- Classification result is included in decision response payload as read-only output for downstream consumers.

## Traceability

| Artefact | ID |
|----------|----|
| User Story | US-003 |
| Epic | EP-004 |
| Scenario | 1, 2 |
| FR | FR-032 |
| BR | BR-04, BR-05 |
