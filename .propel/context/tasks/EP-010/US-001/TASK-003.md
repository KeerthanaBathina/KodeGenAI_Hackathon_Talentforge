---
id: TASK-003
user_story: US-001
title: "Frontend - Pipeline Dashboard UI and Requisition Filter"
status: done
priority: high
assigned_to: frontend-team
estimated_hours: 8
layer: frontend
dependencies: [TASK-002]
---

# TASK-003 - Frontend - Pipeline Dashboard UI and Requisition Filter

## Objective

Build the pipeline dashboard page that renders KPI cards and supports per-requisition filtering with responsive, accessible UX.

## Scope

Create `/analytics/pipeline` page, KPI card components, requisition search/select filter, loading/error/empty states, and automatic refresh indicator using backend metadata.

## Technical Requirements

### 1. Dashboard Page

Create page:
- `/frontend/src/app/analytics/pipeline/page.tsx`

Include:
- four KPI cards
- requisition filter with searchable dropdown
- last updated timestamp
- clear-filter action

### 2. KPI Display Rules

Render metrics:
- Total applications (integer)
- Shortlist rate (%)
- Average time-to-hire (days)
- Offer acceptance rate (%)

Formatting:
- percentage values with fixed precision
- day values with clear unit
- skeleton/loading states during fetch

### 3. Filter Behavior

- Selecting requisition updates all KPI cards
- Filter state reflected in request query
- Filter changes are debounced to reduce API thrash

### 4. Performance and Accessibility

- First meaningful KPI render <2s in expected environment
- Keyboard navigable filter control
- Screen-reader labels for KPI cards and filter

## Acceptance Criteria

- [ ] Dashboard page available at `/analytics/pipeline`
- [ ] All four KPIs render and update from API
- [ ] Requisition filter recalculates all KPI values
- [ ] Loading and error states are user-friendly
- [ ] Last refresh metadata is visible
- [ ] Interaction is keyboard and screen-reader accessible

## Testing Requirements

- [ ] Component tests for KPI cards and filter interactions
- [ ] Page-level tests for loading/error/success states
- [ ] Accessibility checks for filter and KPI announcements

## Files to Create/Modify

- `frontend/src/app/analytics/pipeline/page.tsx`
- `frontend/src/components/analytics/PipelineKpiCards.tsx`
- `frontend/src/components/analytics/RequisitionFilter.tsx`
- `frontend/src/services/pipelineAnalyticsService.ts`
- `frontend/src/**/*.test.tsx` for component/page tests

## Dependencies

- TASK-002 API endpoint and response schema

## Notes

- Reuse existing design tokens and dashboard patterns where available.
