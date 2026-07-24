---
id: task_005
us_id: us_001
epic: EP-002
title: "Create Empty State Component"
status: done
layer: frontend
effort: 2h
priority: medium
created: 2026-07-24
completed: 2026-07-24
---

# TASK-005 — Create Empty State Component

## Context

**User Story**: US-001 — Browse and Filter Open Job Requisitions with Pagination  
**Epic**: EP-002 — Job Application Submission  
**Addresses**: Scenario 4 (no results state)

Empty state component displays when no requisitions match active filters. Shows illustration, contextual message, and "Clear Filters" button.

---

## Objective

Create `EmptyState` component that:
- Displays SVG illustration
- Shows contextual message (with/without filters)
- Provides "Clear Filters" button (only when filters active)
- Uses friendly, encouraging copy

---

## Implementation

**File**: `frontend/src/components/EmptyState.tsx`

**Props**:
```typescript
{
  hasActiveFilters: boolean;
  onClearFilters: () => void;
}
```

**Messages**:
- **With filters**: "No positions match your filters. Try adjusting your search criteria or removing some filters." + [Clear Filters button]
- **No filters**: "No open positions at the moment. Check back soon for new opportunities!"

---

## Acceptance Criteria

- [ ] Shows filter message when hasActiveFilters=true
- [ ] Shows "no jobs" message when hasActiveFilters=false
- [ ] "Clear Filters" button only visible with active filters
- [ ] Button click calls onClearFilters
- [ ] Illustration displays centered
- [ ] Responsive on mobile

---

## Dependencies

- TASK-002 (parent integration)

---

## Testing Notes

**E2E Tests**: Apply no-match filter, verify empty state, click clear
