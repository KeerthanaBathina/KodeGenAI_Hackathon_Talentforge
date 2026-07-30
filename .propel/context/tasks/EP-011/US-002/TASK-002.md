---
id: TASK-002
user_story: US-002
title: "Backend API - Audit Log Search, Filters, and Pagination"
status: done
priority: critical
assigned_to: backend-team
estimated_hours: 7
layer: backend
dependencies: [TASK-001]
---

# TASK-002 - Backend API - Audit Log Search, Filters, and Pagination

## Objective

Implement a secure, paginated audit-log query endpoint that supports actor/event/entity/date filtering and returns deterministic results for admin and compliance users.

## Scope

Build backend query path for:
- list API endpoint for audit log rows
- full filter support matching US-002 acceptance criteria
- pagination metadata and stable ordering
- role-restricted access for `admin` and `compliance`

## Technical Requirements

### 1. Route and Authorization

Create endpoint:
- `GET /api/admin/audit-log`

Enforce:
- authenticated session required
- role check: `admin` or `compliance`

### 2. Filtered Query Behavior

Support filters:
- actor email search
- event type multi-select
- entity type
- entity ID
- date range (`created_at`)

Rules:
- all filters are optional and composable
- invalid parameters return 400 with structured validation errors

### 3. Pagination and Response Contract

Implement:
- default `pageSize = 50`
- URL-compatible page-based pagination
- stable sort: newest first with deterministic tie-breaker
- response metadata (`page`, `pageSize`, `totalItems`, `totalPages`, `hasNextPage`, `hasPrevPage`)

### 4. Result Projection

Return viewer-safe fields including:
- audit event fields
- actor email (derived from actor relation where present)
- normalized payload shape for UI rendering

## Acceptance Criteria

- [x] `GET /api/admin/audit-log` returns filtered results with stable pagination
- [x] Actor email, event type, entity, and date-range filters work independently and in combination
- [x] Page 3 returns records 101-150 when page size is 50
- [x] Endpoint access is restricted to `admin` and `compliance` roles

## Testing Requirements

- [x] Route integration tests for auth, role guard, filter combinations, and pagination
- [x] Validation tests for malformed query params and edge date ranges

## Files to Create/Modify

- `backend/src/routes/admin/auditLog.ts`
- `backend/src/services/auditLogQueryService.ts`
- `backend/src/services/auditLogQuerySchema.ts`
- `backend/src/app.ts`
- `backend/src/routes/__tests__/admin-audit-log.integration.test.ts`

## Dependencies

- TASK-001 foundation and filter contract

## Notes

- Keep query and count logic aligned so pagination totals are accurate under all filter combinations.

## Completion Evidence

- Implemented route `GET /api/admin/audit-log` with auth + role enforcement for `admin` and `compliance` in `backend/src/routes/admin/auditLog.ts`.
- Added service-layer filtered query + pagination metadata contract in `backend/src/services/auditLogQueryService.ts`.
- Wired route registration in `backend/src/app.ts` at `/api/admin/audit-log`.
- Added route integration coverage in `backend/src/routes/__tests__/admin-audit-log.integration.test.ts` for auth, role restrictions, filter behavior, validation, and page-3 contract.
- Added service unit coverage in `backend/src/services/__tests__/auditLogQueryService.test.ts` for query/count alignment, payload normalization/redaction, and pagination calculations.

Validation commands:
- `npm.cmd --prefix backend run test -- src/services/__tests__/auditLogQuerySchema.test.ts src/services/__tests__/auditLogQueryService.test.ts` -> passed (2 files, 12 tests)
- `npm.cmd --prefix backend run test:integration -- src/routes/__tests__/admin-audit-log.integration.test.ts` -> passed (1 file, 12 tests)
