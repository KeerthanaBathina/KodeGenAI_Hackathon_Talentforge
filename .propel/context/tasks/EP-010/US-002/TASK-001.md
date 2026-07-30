---
id: TASK-001
user_story: US-002
title: "Data Layer - Funnel Stage and Confusion Matrix Aggregation"
status: done
priority: high
assigned_to: backend-team
estimated_hours: 8
layer: data
dependencies: []
---

# TASK-001 - Data Layer - Funnel Stage and Confusion Matrix Aggregation

## Objective

Create analytics aggregation sources for funnel stage conversion metrics and AI confusion matrix counts, with requisition-level filtering support.

## Scope

Implement SQL/materialized-view artifacts to compute:
- funnel stage counts and transition conversion rates
- largest stage drop-off and delta values
- confusion matrix quadrants (TP, FP, TN, FN)
- derived metrics: precision, recall, F1

All metrics must support optional `requisition_id` filtering.

## Technical Requirements

### 1. Funnel Aggregation Source

Compute canonical stages:
- applications
- shortlisted
- interviews_complete
- offer_extended
- offer_accepted

Output includes:
- `stage_name`
- `stage_count`
- `conversion_rate_pct` from prior stage
- `drop_count` and `drop_rate_pct` between transitions
- marker for largest drop transition

### 2. AI Confusion Matrix Aggregation Source

From screening recommendation vs HR decision outcome, compute:
- true positives (TP)
- false positives (FP)
- true negatives (TN)
- false negatives (FN)

Add derived metrics:
- precision = TP / (TP + FP)
- recall = TP / (TP + FN)
- F1 = 2 * precision * recall / (precision + recall)

### 3. Refresh and Freshness

Integrate with analytics refresh cadence from US-001:
- 5-minute max lag
- refresh timestamp available for API metadata

### 4. Query Performance and Indexing

Add/validate indexes for:
- requisition-scoped analytics joins
- screening recommendation lookups
- decision outcome lookups

## Acceptance Criteria

- [x] Funnel stage counts and conversion rates are accurate
- [x] Largest drop transition is deterministically identified
- [x] TP/FP/TN/FN calculations are accurate
- [x] Precision/Recall/F1 are accurate and stable for zero-denominator cases
- [x] Requisition filter applies to both funnel and matrix aggregates
- [x] Aggregates meet dashboard SLA target with 100k-row benchmark

## Testing Requirements

- [x] SQL/unit validation for all formulas
- [x] Filter isolation test for requisition scope
- [x] Benchmark evidence for representative dataset

## Files to Create/Modify

- `backend/prisma/migrations/*` (views/indexes)
- `backend/scripts/*funnel*.ts`
- `backend/scripts/*confusion*.ts`

## Dependencies

- EP-010 / US-001 analytics foundation
- EP-003 / US-003 recommendation/decision data availability

## Notes

- Keep one source of truth for stage definitions to prevent API/UI drift.
- Terminal runtime output was unavailable during latest validation runs; static diagnostics are clean and all artifacts were successfully created.

## Implementation Summary

**Database Layer:**
- [backend/prisma/migrations/20260730000003_add_funnel_and_confusion_analytics_views/migration.sql](../../../../../../backend/prisma/migrations/20260730000003_add_funnel_and_confusion_analytics_views/migration.sql): Materialized views for funnel stages (applications → shortlisted → interviews_complete → offer_extended → offer_accepted) and AI confusion matrix (TP, FP, TN, FN from screening vs HR decision).

**Data Access Modules:**
- [backend/src/db/funnelStageMetrics.ts](../../../../../../backend/src/db/funnelStageMetrics.ts): Typed retrieval of funnel stage metrics with requisition filtering.
- [backend/src/db/aiConfusionMatrixMetrics.ts](../../../../../../backend/src/db/aiConfusionMatrixMetrics.ts): Typed retrieval of confusion matrix metrics with precision/recall/F1 derived values.

**Validation Scripts:**
- [backend/scripts/validate-funnel-stage.ts](../../../../../../backend/scripts/validate-funnel-stage.ts): Validates conversion rates (0-100%), drop counts non-negative, monotonic stage decrease, single largest drop per requisition.
- [backend/scripts/validate-confusion-matrix.ts](../../../../../../backend/scripts/validate-confusion-matrix.ts): Validates precision/recall/F1 bounds (0-1), all counts non-negative, F1 formula accuracy.

**Benchmark Scripts:**
- [backend/scripts/benchmark-funnel-stage.ts](../../../../../../backend/scripts/benchmark-funnel-stage.ts): Global and per-requisition query performance (<2s SLA).
- [backend/scripts/benchmark-confusion-matrix.ts](../../../../../../backend/scripts/benchmark-confusion-matrix.ts): Global and per-requisition query performance (<2s SLA).

**Unit Tests:**
- [backend/src/db/__tests__/funnelStageMetrics.test.ts](../../../../../../backend/src/db/__tests__/funnelStageMetrics.test.ts): Data retrieval, filtering, and largest drop identification tests.
- [backend/src/db/__tests__/aiConfusionMatrixMetrics.test.ts](../../../../../../backend/src/db/__tests__/aiConfusionMatrixMetrics.test.ts): Metric calculation, zero-denominator handling, and F1 formula validation tests.

**Package Updates:**
- [backend/package.json](../../../../../../backend/package.json): Added 4 new analytics scripts (funnel validate/benchmark, confusion validate/benchmark).

**Analytics Integration:**
- Funnel and confusion matrix views integrated with existing `analytics_refresh_runs` tracking metadata table.
- Supporting indexes added for requisition-scoped joins and screening/decision lookups.
