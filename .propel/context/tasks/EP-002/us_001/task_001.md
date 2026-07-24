---
id: task_001
us_id: us_001
epic: EP-002
title: "Create Requisition Listing API with Filters and Pagination"
status: done
layer: backend
effort: 4h
priority: critical
created: 2026-07-24
completed: 2026-07-24
---

# TASK-001 — Create Requisition Listing API with Filters and Pagination

## Context

**User Story**: US-001 — Browse and Filter Open Job Requisitions with Pagination  
**Epic**: EP-002 — Job Application Submission  
**Addresses**: Scenarios 1-3 (filter, search, pagination)

Candidates need a performant API endpoint to browse open requisitions with dynamic filters (department, location, jobType, experience level) and keyword search. Must support pagination with configurable page size and return metadata for UI rendering.

---

## Objective

Build `/api/requisitions` endpoint that:
- Returns paginated list of open requisitions
- Filters by department, location, jobType, experienceLevel
- Keyword search (case-insensitive, searches title/department)
- Returns pagination metadata (totalItems, totalPages, hasNext/PrevPage)
- Achieves <200ms response time with proper indexing

---

## Implementation

**Route**: `GET /api/requisitions`

**Query Parameters**:
```typescript
page?: number          // Default: 1
pageSize?: number      // Default: 20, max: 100
department?: string
location?: string
jobType?: 'full_time' | 'part_time' | 'contract' | 'internship'
experienceLevel?: number  // Filters eligibilityCriteria.minYearsExperience <= value
keyword?: string       // Case-insensitive search in title/department
```

**Response**:
```typescript
{
  data: Requisition[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
  filters: {...};  // Echo active filters
}
```

**Files to Create**:
- `backend/src/routes/requisitions.ts` — Route handler with Zod validation
- `backend/src/services/requisitionService.ts` — Query builder and pagination logic

**Key Logic**:
- Use Prisma `where` clause builder for dynamic filters
- Combine filters with AND logic (except keyword uses OR for title/department)
- Execute count and findMany in parallel (Promise.all)
- Order by `openedAt DESC, createdAt DESC`

---

## Acceptance Criteria

- [ ] Returns paginated requisitions with default page=1, pageSize=20
- [ ] Department filter exact match
- [ ] Location filter exact match  
- [ ] JobType enum validation
- [ ] ExperienceLevel filters by eligibilityCriteria.minYearsExperience <= provided value
- [ ] Keyword searches title AND department (case-insensitive)
- [ ] Multiple filters combine with AND
- [ ] Pagination metadata accurate (totalPages, hasNextPage, hasPrevPage)
- [ ] Invalid params return 400 with Zod errors
- [ ] Only status='open' requisitions returned by default

---

## Dependencies

- Existing Requisition model in Prisma schema
- TASK-007 (database indexes for performance)

---

## Testing Notes

**Integration Tests**: Filter combinations, pagination edge cases, keyword search  
**Load Tests**: Measure P95 latency with 100+ requisitions
