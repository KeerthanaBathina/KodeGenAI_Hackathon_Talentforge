---
id: TASK-003
user_story: US-003
title: "Frontend - No-Show KPI Card and 30-Day Sparkline"
status: done
priority: medium
assigned_to: frontend-team
estimated_hours: 5
layer: frontend
dependencies: [TASK-002]
completion_date: 2026-07-30
completion_notes: "Implemented no-show analytics service, KPI card, 30-day sparkline with loading/error/empty states, dashboard integration with requisition filtering, and component/page tests."
---

# TASK-003 - Frontend - No-Show KPI Card and 30-Day Sparkline

## Objective

Add no-show KPI visualization to the analytics dashboard, including a readable percentage summary and 30-day sparkline trend.

## Scope

Implement dashboard UI component(s) for:
- no-show KPI card displaying `X% (A of B)`
- 30-day sparkline graph using backend trend series
- loading, empty, and error states

## Technical Requirements

### 1. No-Show KPI Card

Display:
- no-show rate as percentage
- count summary in format `20% (4 of 20)`
- context label for rolling 7-day window

### 2. Sparkline Trend

Render 30 daily points as SVG line chart:
- x-axis implicit daily sequence
- y-axis as rate percentage
- tooltip or hover value display for day-level inspection

### 3. Dashboard Integration

- integrate with existing analytics page layout
- align visual style with existing KPI and chart components
- use existing requisition/global filter conventions if applicable

### 4. Accessibility and Responsiveness

- semantic labels for KPI and chart
- keyboard-focusable interactive elements
- responsive behavior for tablet and desktop widths

## Acceptance Criteria

- [x] No-show card displays correct `rate (count of scheduled)` output
- [x] Sparkline shows exactly 30 daily points in chronological order
- [x] UI gracefully handles zero-data and loading states
- [x] Component meets accessibility baseline for labels and navigation

## Testing Requirements

- [x] Component tests for formatted KPI text
- [x] Rendering tests for trend data ordering and point count
- [x] UI tests for empty/error states

## Files to Create/Modify

- `frontend/src/components/analytics/NoShowKpiCard.tsx`
- `frontend/src/components/analytics/NoShowSparkline.tsx`
- `frontend/src/services/noShowAnalyticsService.ts`
- `frontend/src/**/*.test.tsx`

## Dependencies

- TASK-002 no-show analytics API

## Notes

- Keep sparkline minimal and fast to render.
