---
id: task_004
us_id: us_001
epic: EP-002
title: "Build Pagination Component with URL State"
status: done
layer: frontend
effort: 2h
priority: high
created: 2026-07-24
completed: 2026-07-24
---

# TASK-004 — Build Pagination Component with URL State

## Context

**User Story**: US-001 — Browse and Filter Open Job Requisitions with Pagination  
**Epic**: EP-002 — Job Application Submission  
**Addresses**: Scenario 3 (pagination with URL persistence)

Reusable pagination component that displays page numbers, prev/next buttons, and integrates with URL query parameters. Handles edge cases (first/last page, single page).

---

## Objective

Create `Pagination` component that:
- Displays current page, total pages
- Shows prev/next buttons (disabled appropriately)
- Renders page numbers with ellipsis for large counts
- Emits page change events
- URL managed by parent (`?page=2`)

---

## Implementation

**File**: `frontend/src/components/Pagination.tsx`

**Props**:
```typescript
{
  currentPage: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
  onPageChange: (page: number) => void;
}
```

**Page Number Display**:
- Show first, last, current, ±1 around current
- Ellipsis for gaps
- Examples:
  - `1 2 3 ... 10` (on page 1)
  - `1 ... 4 5 6 ... 10` (on page 5)
  - `1 ... 8 9 10` (on page 10)

---

## Acceptance Criteria

- [ ] Prev button disabled on first page
- [ ] Next button disabled on last page
- [ ] Current page highlighted
- [ ] Ellipsis shown for large page counts (>7 pages)
- [ ] Click page number calls onPageChange
- [ ] Responsive on mobile

---

## Dependencies

- TASK-002 (parent integration)

---

## Testing Notes

**E2E Tests**: Navigate pages, verify URL updates  
**Unit Tests**: Page number generation logic
