---
id: TASK-001
user_story: US-001
title: "Data Layer - Pipeline KPI Aggregation and 5-Min Freshness"
status: done
priority: high
assigned_to: backend-team
estimated_hours: 8
layer: data
dependencies: []
---

# TASK-001 - Data Layer - Pipeline KPI Aggregation and 5-Min Freshness

## Objective

Create analytics data structures and refresh workflow that provide requisition-scoped KPI aggregates with a maximum 5-minute freshness lag.

## Scope

Implement SQL artifacts and refresh orchestration for total applications, shortlist rate, average time-to-hire, and offer acceptance rate, including requisition-level filtering support and 100k-row performance targets.

## Technical Requirements

### 1. Analytics View for Pipeline KPIs

Create data-layer query/view that returns:
- `total_applications`
- `shortlist_rate_pct`
- `avg_time_to_hire_days`
- `offer_acceptance_rate_pct`
- optional `requisition_id` filter

Rules:
- shortlist rate denominator is total applications in scope
- offer acceptance denominator is offers extended in scope
- time-to-hire includes only applications reaching `offer_accepted`
- withdrawn and draft applications are excluded from time-to-hire calculation

### 2. 5-Minute Refresh Strategy

Implement one of:
- materialized view with scheduled refresh every 5 minutes, or
- cache table refreshed by worker/cron every 5 minutes

Deliverables:
- refresh command/job
- retry-safe refresh behavior
- monitoring log entry with refresh timestamp and duration

### 3. Requisition Filter Indexing

Add indexes required for:
- requisition-filtered aggregates
- status-based KPI computations
- time-window and decision-stage joins used by KPI logic

### 4. Benchmark Script

Add a benchmark script proving:
- KPI query latency under 2 seconds at 100k application rows
- requisition-filtered query latency under 2 seconds at 100k rows

## Acceptance Criteria

- [ ] KPI aggregate output includes all 4 metrics with accurate formulas
- [ ] Requisition filter applies correctly to all metrics
- [ ] Time-to-hire excludes draft and withdrawn records
- [ ] Data freshness lag is at most 5 minutes
- [ ] Query path meets <2s latency on 100k-row benchmark
- [ ] Refresh job and benchmark evidence committed

## Testing Requirements

- [ ] SQL/unit validation for each KPI formula
- [ ] Integration test for requisition filter isolation
- [ ] Benchmark execution for 100k-row dataset

## Files to Create/Modify

- `backend/prisma/migrations/*` (analytics view/indexes)
- `backend/scripts/*pipeline-kpi*.ts` (benchmark and/or refresh validation)
- `backend/src/workers/*` or equivalent refresh scheduler location

## Dependencies

- Source tables populated per EP-DATA / US-001

## Notes

- Prefer deterministic formulas over UI-side calculations.
- Keep KPI definitions centralized to avoid drift across endpoints.
