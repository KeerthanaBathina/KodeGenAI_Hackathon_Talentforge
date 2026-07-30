---
id: TASK-003
user_story: US-002
title: "Frontend - Funnel Chart and Confusion Matrix UI"
status: done
priority: high
assigned_to: frontend-team
estimated_hours: 8
layer: frontend
dependencies: [TASK-002]
completion_date: 2026-07-30
completion_notes: "All components created with full test coverage; page.tsx integrated with funnel and confusion matrix data fetching using Promise.all for parallel requests; E2E test spec added for analytics dashboard workflow validation"
---

# TASK-003 - Frontend - Funnel Chart and Confusion Matrix UI

## Objective

Build analytics UI components for funnel conversion visualization and AI confusion matrix, integrated with shared requisition filter behavior.

## Scope

Implement chart section(s) on analytics page with:
- funnel stage rendering and conversion rates
- highlighted largest drop transition in amber with tooltip
- confusion matrix 2x2 grid and derived precision/recall/F1
- requisition filter integration shared with US-001 state model

## Technical Requirements

### 1. Funnel Visualization Component

Render stage bands for:
- Applications
- Shortlisted
- Interviews Complete
- Offer Extended
- Offer Accepted

Display:
- absolute count per stage
- conversion rate at each transition
- largest drop transition highlight + tooltip with drop count/percentage

### 2. Confusion Matrix Component

Render 2x2 grid with:
- TP, FP, TN, FN
- color semantics for easy interpretation
- summary line for Precision, Recall, F1

### 3. Shared Filter Integration

- consume the same requisition filter state pattern as US-001
- re-fetch and re-render both visualizations on filter change

### 4. UX and Accessibility

- loading/skeleton states for both modules
- graceful empty/error states
- keyboard navigable controls and screen-reader labels

## Acceptance Criteria

- [ ] Funnel chart displays correct stage counts and conversion rates
- [ ] Largest drop transition appears in amber with correct tooltip data
- [ ] Confusion matrix shows correct TP/FP/TN/FN values
- [ ] Precision/Recall/F1 display correctly
- [ ] Requisition filter updates both chart modules
- [ ] Components are responsive and accessible

## Testing Requirements

- [ ] Component tests for funnel and matrix rendering logic
- [ ] State tests for filter-driven updates
- [ ] Accessibility checks for chart labels and tooltip content

## Files to Create/Modify

- `frontend/src/components/analytics/FunnelChart.tsx`
- `frontend/src/components/analytics/ConfusionMatrix.tsx`
- `frontend/src/services/analyticsFunnelService.ts`
- `frontend/src/services/confusionMatrixService.ts`
- `frontend/src/**/*.test.tsx`

## Dependencies

- TASK-002 analytics APIs
- EP-010 / US-001 filter-state integration pattern

## Notes

- Prefer deterministic color coding and consistent metric formatting.
