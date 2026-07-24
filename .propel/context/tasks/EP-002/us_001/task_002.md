---
id: task_002
us_id: us_001
epic: EP-002
title: "Build Jobs Listing Page with Card Grid Layout"
status: done
layer: frontend
effort: 4h
priority: critical
created: 2026-07-24
completed: 2026-07-24
---

# TASK-002 — Build Jobs Listing Page with Card Grid Layout

## Context

**User Story**: US-001 — Browse and Filter Open Job Requisitions with Pagination  
**Epic**: EP-002 — Job Application Submission  
**Addresses**: All scenarios (display, filter integration, pagination UI, empty state)

Main page that displays open job requisitions in a responsive card-based grid. Integrates filter controls, pagination, and handles loading/empty states. Syncs URL query parameters with filter/page state.

---

## Objective

Create `/jobs` page that:
- Fetches requisitions from `/api/requisitions` with filters and pagination
- Displays in responsive grid (1 col mobile, 2 tablet, 3 desktop)
- Shows loading skeleton during fetch
- Handles empty states (no results, no jobs)
- Syncs URL params with state (`?page=2&department=Engineering`)

---

## Implementation

**File**: `frontend/src/app/jobs/page.tsx`

**State Management**:
- `requisitions[]` — Array of requisition objects
- `pagination` — Metadata from API
- `filters` — Department, location, jobType, experienceLevel, keyword
- `loading` — Fetch state
- `error` — Error message

**Card Component**: `RequisitionCard.tsx`
- Displays title, department, location, jobType badge
- Shows experience requirement if set
- Displays slots remaining (`X positions available`)
- Links to `/jobs/:id`
- Hover effect (lift + shadow)

**URL Sync**:
- Read initial filters from searchParams
- Update URL on filter/page change (router.push with scroll:false)
- Reset to page 1 when filters change

---

## Acceptance Criteria

- [ ] Page loads requisitions on mount
- [ ] Cards display all key info (title, dept, location, type, experience, slots)
- [ ] Grid responsive (1/2/3 columns based on viewport)
- [ ] Loading skeleton shows 6 placeholder cards
- [ ] Empty state renders when no results
- [ ] Filter changes reset to page 1
- [ ] URL params sync with state
- [ ] Click card navigates to detail page
- [ ] Error message displays on fetch failure

---

## Dependencies

- TASK-001 (API endpoint)
- TASK-003 (FilterControls component)
- TASK-004 (Pagination component)
- TASK-005 (EmptyState component)

---

## Testing Notes

**E2E Tests**: Load page, verify cards render, navigate, filter, pagination  
**Visual Tests**: Responsive breakpoints, hover states
