---
id: task_005
us_id: us_001
epic: EP-004
title: "Add Multi-Layer Automated Test Coverage and Validation Evidence for US-001"
status: completed
layer: test
effort: 5h
priority: critical
created: 2026-07-25
---

# TASK-005 — Add Multi-Layer Automated Test Coverage and Validation Evidence for US-001

## Context

**User Story**: US-001 — HR Review Queue with Column Filters and SLA Countdown Timers  
**Epic**: EP-004 — HR Review and Decisioning  
**Addresses**: Scenario 1, Scenario 2, Scenario 3, Scenario 4

US-001 spans backend business logic, realtime websocket behavior, and frontend state/visual rendering; acceptance requires layered test coverage.

---

## Objective

Create tests that verify:
1. SLA threshold transitions at 50% and 80%
2. default SLA sorting and filter narrowing
3. urgent websocket notification behavior
4. active filter count and queue badge updates
5. Playwright E2E coverage for filter and SLA color transitions

---

## Implementation Steps

### Step 1 — Backend SLA logic unit tests

1. assert amber at 50% elapsed
2. assert red and urgent at 80% elapsed
3. verify edge cases near threshold boundaries

### Step 2 — Backend realtime unit/integration tests

1. assert 60-second tick event cadence
2. assert urgent event emits once on transition
3. assert non-HR audience does not receive events

### Step 3 — Frontend unit/component tests

1. validate SLA formatter output
2. validate severity color mapping
3. validate urgent badge rendering rules

### Step 4 — Playwright E2E tests

Add US-001 scenario test spec to validate:
1. filtering by Engineering + High Score
2. active filter count badge updates
3. SLA color transition rendering and urgent badge behavior

### Step 5 — Validation evidence update

Record execution evidence in validation docs with:
- command outputs
- test pass summary
- scenario-to-test trace mapping

---

## Validation

| Check | Method | Expected Result |
|-------|--------|-----------------|
| Amber threshold | unit test | 50% elapsed maps to amber |
| Red threshold + urgent | unit/realtime test | 80% elapsed maps to red and urgent |
| Filter narrowing | E2E test | Engineering + >75 rows only |
| Badge updates | E2E/component test | active filter and queue count badges update correctly |
| Scenario coverage | test mapping | all 4 scenarios traced to automated tests |

---

## Dependencies

- TASK-001 through TASK-004 completed
- Existing Vitest and Playwright infrastructure

## Security Constraints

- Use synthetic test data only
- Avoid exposing production secrets in test fixtures

---

## Definition of Done

- [x] Backend SLA threshold tests pass
- [x] Realtime queue event tests pass
- [x] Frontend SLA/urgent rendering tests pass
- [x] Playwright US-001 scenario tests pass
- [x] Validation evidence updated with scenario traceability

## Traceability

| Artefact | ID |
|----------|----|
| User Story | US-001 |
| Epic | EP-004 |
| Scenario | 1, 2, 3, 4 |
| FR | FR-029, FR-034, FR-036 |
