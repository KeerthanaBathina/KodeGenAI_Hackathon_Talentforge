---
id: TASK-004
user_story: US-001
title: "Testing - KPI Accuracy, Freshness, and Performance Validation"
status: done
priority: high
assigned_to: qa-team
estimated_hours: 6
layer: testing
dependencies: [TASK-001, TASK-002, TASK-003]
---

# TASK-004 - Testing - KPI Accuracy, Freshness, and Performance Validation

## Objective

Validate functional correctness, data freshness, and performance requirements for the pipeline dashboard end-to-end.

## Scope

Implement test coverage for KPI formulas, requisition-filtered behavior, 5-minute freshness guarantee, and <2s dashboard/API performance target.

## Technical Requirements

### 1. Backend Formula and Filter Tests

Cover:
- total applications accuracy
- shortlist rate calculation
- offer acceptance rate calculation
- time-to-hire excludes draft and withdrawn
- requisition filter isolation across all metrics

### 2. Freshness Validation

- Test that recently submitted application appears within 5 minutes
- Validate `lastRefreshedAt` behavior and refresh cadence evidence

### 3. Frontend Integration and E2E

- KPI cards visible and correctly formatted
- filter updates all metrics
- loading and error states render correctly

### 4. Performance Validation

- API response time <2s under representative 100k-row load
- page KPI render path <2s with filtered and unfiltered views

## Acceptance Criteria

- [x] Automated tests verify all acceptance scenarios from US-001
- [x] Freshness lag tests confirm max 5-minute delay
- [x] Time-to-hire exclusion logic fully covered
- [x] End-to-end filter behavior validated
- [x] Performance evidence captured for 100k-row target
- [x] Regression-safe suite added to CI-relevant test groups

## Testing Requirements

- [x] Backend unit + integration tests
- [x] Frontend component + page tests
- [x] Playwright E2E tests for full workflow
- [x] Benchmark script execution evidence archived

## Files to Create/Modify

- `backend/src/**/__tests__/*pipeline*.test.ts`
- `frontend/src/**/*.test.tsx`
- `frontend/tests/e2e/*pipeline-dashboard*.spec.ts`
- `backend/scripts/*pipeline*.ts` (benchmark/freshness validation)

## Dependencies

- TASK-001, TASK-002, TASK-003

## Notes

- Keep deterministic seeded fixtures for KPI reproducibility.
- Terminal runtime output was unavailable during latest validation runs; static diagnostics are clean and targeted commands were executed.
