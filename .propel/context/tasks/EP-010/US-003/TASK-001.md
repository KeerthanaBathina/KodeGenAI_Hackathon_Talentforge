---
id: TASK-001
user_story: US-003
title: "Data Layer - No-Show Metrics and 30-Day Trend Aggregation"
status: done
priority: medium
assigned_to: backend-team
estimated_hours: 5
layer: data
dependencies: []
completion_date: 2026-07-30
completion_notes: "Created no-show KPI materialized view with 7-day rolling metrics, 30-day daily trend aggregation view, weekly activity signals table for digest skip logic. Includes refresh service, comprehensive validation scripts, and supporting indexes. All TypeScript validation passes."
---

# TASK-001 - Data Layer - No-Show Metrics and 30-Day Trend Aggregation

## Objective

Create analytics data sources for no-show KPI computation and daily 30-day trend points, aligned with existing analytics freshness guarantees.

## Scope

Implement data-level aggregation for:
- rolling 7-day no-show rate summary
- 30-day daily no-show trend series
- weekly activity signal used by digest skip logic

## Technical Requirements

### 1. No-Show KPI Aggregation

Compute:
- `scheduled_count_7d`
- `no_show_count_7d`
- `no_show_rate_pct_7d = no_show_count_7d / scheduled_count_7d * 100`

Rules:
- only scheduled interviews in the rolling 7-day window
- no-show status sourced from canonical interview/session status
- deterministic handling when denominator is zero

### 2. 30-Day Trend Aggregation

Create daily series for last 30 calendar days:
- `date`
- `scheduled_count`
- `no_show_count`
- `no_show_rate_pct`

### 3. Weekly Digest Activity Signal

Provide query/aggregation for prior week activity check:
- application count in prior week
- interview count in prior week

This powers digest skip behavior when activity is zero.

### 4. Refresh and Performance

- integrate with existing analytics refresh model (<=5 minute lag)
- add supporting indexes for interview status + date queries

## Acceptance Criteria

- [ ] No-show rate formula is accurate for rolling 7-day window
- [ ] 30-day daily trend points are complete and ordered
- [ ] Zero-denominator cases produce stable output
- [ ] Weekly activity check is available for digest skip logic
- [ ] Query performance supports dashboard SLA expectations

## Testing Requirements

- [ ] SQL/unit tests for KPI and trend formulas
- [ ] Regression test for edge cases (0 scheduled, all no-show, mixed statuses)

## Files to Create/Modify

- `backend/prisma/migrations/*` (views/indexes)
- `backend/scripts/*noshow*.ts`
- `backend/scripts/*analytics-digest-activity*.ts`

## Dependencies

- EP-010 / US-001 analytics baseline

## Notes

- Keep no-show definitions centralized to avoid mismatched dashboard vs digest results.
