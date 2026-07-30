---
id: task_007
us_id: us_001
epic: EP-002
title: "Write Integration and E2E Tests for Requisition Browsing"
status: done
layer: test
effort: 4h
priority: high
created: 2026-07-24
completed: 2026-07-24
---

# TASK-007 — Write Integration and E2E Tests for Requisition Browsing

## Context

**User Story**: US-001 — Browse and Filter Open Job Requisitions with Pagination  
**Epic**: EP-002 — Job Application Submission  
**Addresses**: All acceptance criteria verification

Comprehensive test coverage for requisition listing API and UI, including filter logic, pagination, keyword search, and empty states.

---

## Objective

Create test suites for:
- Backend API integration tests (filter combinations, pagination)
- Frontend E2E tests (Playwright — filter, search, pagination flow)
- Performance verification (<200ms API response)

---

## Implementation

### Backend Integration Tests

**File**: `backend/src/routes/__tests__/requisitions.integration.test.ts`

**Test Cases**:
- [ ] GET /api/requisitions returns paginated list
- [ ] Department filter returns matching requisitions only
- [ ] Location filter works correctly
- [ ] JobType filter validates enum
- [ ] ExperienceLevel filters by eligibilityCriteria
- [ ] Keyword search finds title matches (case-insensitive)
- [ ] Keyword search finds department matches
- [ ] Multiple filters combine with AND
- [ ] Pagination metadata accurate (totalPages, hasNext/Prev)
- [ ] Page 2 returns correct slice (21-40 for pageSize=20)
- [ ] Invalid params return 400 with Zod errors
- [ ] Only status='open' requisitions returned

### Frontend E2E Tests

**File**: `frontend/tests/requisitions-browse.spec.ts`

**Test Cases**:
- [ ] Load /jobs page, verify requisitions render
- [ ] Select department filter, verify results update and chip appears
- [ ] Type keyword, verify debounce (300ms), results update
- [ ] Navigate to page 2, verify URL includes ?page=2
- [ ] Apply filter with no matches, verify empty state appears
- [ ] Click "Clear Filters", verify all filters reset
- [ ] Click requisition card, navigate to detail page
- [ ] Remove filter chip, verify filter cleared
- [ ] Combined filters (dept + location), verify AND logic

### Performance Test

**File**: `backend/scripts/load-test-requisitions.ts`

**Test**: Seed 100+ requisitions, run filtered queries, measure P95 latency <200ms

---

## Acceptance Criteria

- [ ] All backend integration tests pass
- [ ] All E2E tests pass
- [ ] P95 API latency <200ms verified
- [ ] Filter debounce timing verified (300ms ±50ms)
- [ ] Pagination edge cases covered (first/last page, single page)

---

## Dependencies

- TASK-001 (API endpoint)
- TASK-002 (frontend page)
- TASK-003-005 (UI components)
- TASK-006 (database indexes)

---

## Testing Notes

**Mock Data**: Create seed script with diverse requisitions (multiple depts, locations, types)
