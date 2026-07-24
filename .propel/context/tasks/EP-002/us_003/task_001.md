---
id: task_001
us_id: us_003
epic: EP-002
title: "Add Database Constraint for Duplicate Prevention"
status: done
layer: backend
effort: 1h
priority: high
created: 2026-07-24
completed: 2026-07-24
---

# TASK-001 — Add Database Constraint for Duplicate Prevention

## Context

**User Story**: US-003 — Duplicate Application Prevention with Cooling Period Enforcement  
**Epic**: EP-002 — Job Application Submission  
**Addresses**: Scenario 1 (duplicate prevention), data integrity

Prevent multiple active/submitted applications for the same candidate + requisition combination at the database level.

---

## Objective

Add partial unique constraint to Application table that:
- Prevents duplicate active/submitted applications
- Allows re-application after rejection (when status changes)
- Only applies to non-terminal statuses

---

## Implementation

**Database Constraint**:

PostgreSQL partial unique index that excludes terminal statuses:

```sql
CREATE UNIQUE INDEX idx_unique_active_application 
ON applications (candidate_id, requisition_id) 
WHERE status IN ('draft', 'submitted', 'screening', 'pending_review', 'shortlisted', 'interviewing', 'offer_pending', 'offered');
```

**Rationale**:
- Allows multiple applications only when previous ones are in terminal states ('rejected', 'withdrawn', 'hired', 'closed')
- Enforces business rule at database level (fail-safe)
- Returns unique violation error if duplicate attempted

**Prisma Schema**:

Add to Application model:
```prisma
@@index([candidateId, requisitionId], 
  where: { status: { in: ['draft', 'submitted', 'screening', 'pending_review', 'shortlisted', 'interviewing', 'offer_pending', 'offered'] } },
  name: "idx_unique_active_application"
)
```

**Note**: Prisma doesn't support partial unique constraints via `@@unique`, so this must be a raw SQL migration.

---

## Acceptance Criteria

- [ ] Partial unique index created on (candidateId, requisitionId) for active statuses
- [ ] Terminal statuses (rejected, withdrawn, hired, closed) excluded from constraint
- [ ] Migration runs without errors
- [ ] Attempting to create duplicate active application fails with unique violation
- [ ] Can create new application after previous one is rejected

---

## Dependencies

- Existing Application model in schema
- ApplicationStatus enum values

---

## Migration

```bash
cd backend
npx prisma migrate dev --name add_unique_active_application_constraint
```

**Manual SQL** (if Prisma doesn't support partial unique):
Add to migration file:
```sql
CREATE UNIQUE INDEX idx_unique_active_application 
ON applications (candidate_id, requisition_id) 
WHERE status NOT IN ('rejected', 'withdrawn', 'hired', 'closed');
```
