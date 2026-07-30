---
id: task_001
us_id: us_001
epic: EP-004
title: "Extend Backend Review Queue API with SLA Computation, Sorting, and Filters"
status: completed
layer: backend
effort: 5h
priority: critical
created: 2026-07-25
---

# TASK-001 — Extend Backend Review Queue API with SLA Computation, Sorting, and Filters

## Context

**User Story**: US-001 — HR Review Queue with Column Filters and SLA Countdown Timers  
**Epic**: EP-004 — HR Review and Decisioning  
**Addresses**: Scenario 1, Scenario 2, Scenario 4

The manual review queue API must return SLA metadata per row and support HR reviewer filters and sort controls.

---

## Objective

Enhance queue endpoints so every row contains:
- candidate name
- role/requisition
- AI score
- SLA timer source fields
- decision controls metadata

Default queue ordering must be SLA ascending.

---

## Technical Specifications

| Area | Requirement |
|------|-------------|
| SLA window | 48 hours default, configurable via env |
| SLA response fields | `slaDeadlineAt`, `slaRemainingSeconds`, `slaElapsedPercent`, `slaSeverity`, `isUrgent` |
| Severity rules | `<50% = normal`, `>=50% and <80% = amber`, `>=80% = red` |
| Sort fields | `candidate`, `role`, `score`, `sla`, `status` |
| Default sort | `sla ASC` |
| Filter fields | `department`, `scoreBand`, `status`, `requisitionId` |

---

## Implementation Steps

### Step 1 — Update route query schema

Update `backend/src/routes/manualReviewQueue.ts`:
1. Add filter params for department, score band, status, requisition.
2. Add sort params for sortBy and sortDir.
3. Validate values with Zod and return structured 400 on invalid input.

### Step 2 — Update queue service contract and payload

Update `backend/src/services/manualReviewQueueService.ts`:
1. Add strongly typed filter and sort interfaces.
2. Include requisition department and latest screening score in row shaping.
3. Add decision flags (`canShortlist`, `canReject`, `decisionLocked`).

### Step 3 — Add server-side SLA computation

1. Implement deterministic SLA helper with elapsed and remaining calculations.
2. Apply threshold severity mapping.
3. Return SLA fields in queue response for every row.

### Step 4 — Apply default SLA ordering and tie-breakers

1. If no sort requested, use SLA ascending.
2. Add stable tie-breakers for deterministic order.

### Step 5 — Apply filter behavior

1. Department maps to requisition department.
2. High score maps to score `> 75`.
3. Status and requisition filters compose with existing queue constraints.

---

## Validation

| Check | Method | Expected Result |
|-------|--------|-----------------|
| Default queue ordering | API integration test | SLA ascending by default |
| SLA severity boundaries | Unit test at 50% and 80% | Amber and red thresholds correct |
| Engineering + high score | API test query | Only Engineering rows with score > 75 |
| Payload completeness | Contract test | All SLA and decision metadata fields present |

---

## Dependencies

- EP-003 / US-003 (screening score availability)
- Existing manual review queue service/routes

## Security Constraints

- Restrict queue visibility to HR reviewer roles only
- Do not return unnecessary candidate PII

---

## Definition of Done

- [x] API supports required filters and sortable columns
- [x] SLA computed server-side and returned per row
- [x] Default sort is SLA ascending
- [x] High score filter correctly uses score > 75
- [x] Backend tests cover SLA boundaries and filter behavior

## Traceability

| Artefact | ID |
|----------|----|
| User Story | US-001 |
| Epic | EP-004 |
| Scenario | 1, 2, 4 |
| FR | FR-029, FR-034 |
