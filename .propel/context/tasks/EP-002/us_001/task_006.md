---
id: task_006
us_id: us_001
epic: EP-002
title: "Add Database Indexes for Filter Performance"
status: done
layer: backend
effort: 1h
priority: high
created: 2026-07-24
completed: 2026-07-24
---

# TASK-006 — Add Database Indexes for Filter Performance

## Context

**User Story**: US-001 — Browse and Filter Open Job Requisitions with Pagination  
**Epic**: EP-002 — Job Application Submission  
**Addresses**: Performance requirement (<200ms API response)

Add database indexes on frequently queried columns to ensure filter queries execute within performance targets. Target P95 latency <200ms for filtered queries.

---

## Objective

Add indexes to `requisitions` table for:
- `status` (for filtering open requisitions)
- `department` (common filter)
- `location` (common filter)
- `jobType` (common filter)
- Composite index on `(status, openedAt, createdAt)` for default sort

---

## Implementation

**Migration**: Create new Prisma migration

**Indexes to Add**:
```prisma
@@index([status], name: "idx_requisitions_status")
@@index([department], name: "idx_requisitions_department")
@@index([location], name: "idx_requisitions_location")
@@index([jobType], name: "idx_requisitions_job_type")
@@index([status, openedAt(sort: Desc), createdAt(sort: Desc)], name: "idx_requisitions_status_opened_created")
```

**Note**: Title/department keyword search may benefit from full-text index in future (>10k requisitions).

---

## Acceptance Criteria

- [ ] Migration creates all 5 indexes
- [ ] `EXPLAIN ANALYZE` shows index usage for filtered queries
- [ ] P95 latency <200ms with 100+ requisitions
- [ ] No duplicate indexes created

---

## Dependencies

- TASK-001 (API endpoint using these queries)

---

## Testing Notes

**Load Tests**: Run with 100+ requisitions, measure P95 latency for various filter combinations
