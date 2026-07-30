---
id: task_003
us_id: us_001
epic: EP-002
title: "Implement Filter Controls with Debounced Search"
status: done
layer: frontend
effort: 4h
priority: high
created: 2026-07-24
completed: 2026-07-24
---

# TASK-003 — Implement Filter Controls with Debounced Search

## Context

**User Story**: US-001 — Browse and Filter Open Job Requisitions with Pagination  
**Epic**: EP-002 — Job Application Submission  
**Addresses**: Scenarios 1-2 (filter UI, keyword search with 300ms debounce)

Reusable filter component with keyword search input (300ms debounce) and dropdown selects for department, location, job type, experience level. Active filters display as removable chips.

---

## Objective

Create `FilterControls` component that:
- Keyword search input with 300ms debounce
- Dropdowns for department, location, jobType, experienceLevel
- Fetches options from `/api/requisitions/filters` endpoint
- Displays active filters as removable chips
- "Clear All Filters" button

---

## Implementation

**File**: `frontend/src/components/FilterControls.tsx`

**Props**:
```typescript
{
  filters: { department, location, jobType, experienceLevel, keyword };
  onFilterChange: (updates: Partial<Filters>) => void;
  onClearFilters: () => void;
}
```

**Debounce Logic**:
- Local state for keyword input
- useEffect with setTimeout (300ms)
- Clear timer on unmount
- Emit change only after debounce

**Filter Options API** (add to TASK-001):
```
GET /api/requisitions/filters
Returns: { departments[], locations[], jobTypes[], experienceLevels[] }
```

**Active Filter Chips**:
- Display current filters as badges with X button
- Click X removes that filter
- "Clear All" resets everything

---

## Acceptance Criteria

- [ ] Keyword input debounces by 300ms
- [ ] Department dropdown populated from API
- [ ] Location dropdown populated from API
- [ ] JobType dropdown shows 4 types with labels
- [ ] Experience dropdown shows 0 (Entry), 1, 3, 5, 10+ years
- [ ] Active filters shown as removable chips
- [ ] Click chip X removes filter
- [ ] "Clear All" button resets filters
- [ ] Changes trigger onFilterChange callback

---

## Dependencies

- TASK-001 (API /filters endpoint)

---

## Testing Notes

**E2E Tests**: Type search (verify debounce), select filters, remove chips  
**Unit Tests**: Debounce timing
