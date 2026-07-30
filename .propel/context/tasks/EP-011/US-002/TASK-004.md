---
id: TASK-004
user_story: US-002
title: "Frontend - Audit Log Viewer UI with URL-Persisted Pagination and Filters"
status: done
priority: high
assigned_to: frontend-team
estimated_hours: 7
layer: frontend
dependencies: [TASK-001, TASK-002, TASK-003]
---

# TASK-004 - Frontend - Audit Log Viewer UI with URL-Persisted Pagination and Filters

## Objective

Build a dedicated admin audit-log viewer page with rich filtering, 50-row pagination, URL state persistence, and one-click CSV export.

## Scope

Implement:
- route page at `/admin/audit-log`
- filter controls for actor/event/entity/date range
- paginated audit events table (50 per page)
- URL query state sync (including `?page=`)
- export action wired to backend CSV endpoint

## Technical Requirements

### 1. Protected Route and Role Gate

Create page:
- `/admin/audit-log`

Enforce viewer access for:
- `admin`
- `compliance`

Redirect unauthorized users to existing unauthorized flow.

### 2. Filter Controls

Provide filter UI for:
- actor email search input
- event type multi-select
- entity type selector
- entity ID input
- date range picker (from/to)

### 3. Audit Results Table

Render paginated results with:
- newest-first ordering
- key audit columns and payload preview
- loading/empty/error states

### 4. URL-Persisted Page State

Persist and hydrate from URL query params:
- page index (`?page=`)
- active filters

Behavior:
- navigating to page 3 shows rows 101-150 (page size 50)
- browser refresh preserves current filter/page state

### 5. CSV Export UX

Implement export action using active filters:
- calls backend streaming endpoint
- shows export-in-progress feedback
- handles export errors gracefully

## Acceptance Criteria

- [x] `/admin/audit-log` is available and role-restricted to `admin` and `compliance`
- [x] All required filters are available and correctly applied
- [x] Pagination is 50 rows per page and URL state is preserved
- [x] CSV export uses active filters and starts download flow correctly

## Testing Requirements

- [x] Component/page tests for filter interactions, pagination behavior, and URL state sync
- [x] Service tests for request query serialization and export URL construction

## Files to Create/Modify

- `frontend/src/app/admin/audit-log/page.tsx`
- `frontend/src/components/admin/AuditLogFilters.tsx`
- `frontend/src/components/admin/AuditLogTable.tsx`
- `frontend/src/services/auditLogService.ts`
- `frontend/src/types/auditLog.ts`
- `frontend/src/types/user.ts`
- `frontend/src/__tests__/components/admin/AuditLogViewer.test.tsx`

## Dependencies

- TASK-001 role and query-contract foundation
- TASK-002 list API
- TASK-003 CSV export API

## Notes

- Keep table schema and filter labels aligned with compliance vocabulary.

## Completion Evidence

- Added `/admin/audit-log` route page in `frontend/src/app/admin/audit-log/page.tsx` with URL-hydrated filters/page state, 50-row pagination, and guarded unauthorized redirects for `401/403` responses.
- Added filter UI in `frontend/src/components/admin/AuditLogFilters.tsx` for actor email, event types (multi-select), entity type, entity ID, and date range with apply/clear workflows.
- Added results table UI in `frontend/src/components/admin/AuditLogTable.tsx` with loading, empty, and error states plus compliance-focused audit columns.
- Added frontend contracts in `frontend/src/types/auditLog.ts` and API service integration in `frontend/src/services/auditLogService.ts` (query serialization, list fetch, export URL generation, and CSV download trigger).
- Added service-level test coverage in `frontend/src/services/__tests__/auditLogService.test.ts` for query-param contract and export behavior.
- Added page/component behavior tests in `frontend/src/__tests__/components/admin/AuditLogViewer.test.tsx` for URL hydration, filter apply/reset semantics, pagination URL sync, export behavior, and unauthorized redirect flow.

Validation commands:
- `npm.cmd --prefix frontend run test -- src/services/__tests__/auditLogService.test.ts src/__tests__/components/admin/AuditLogViewer.test.tsx` -> passed (2 files, 11 tests)
- Diagnostics check (`get_errors`) on touched files returned no TypeScript errors for:
  - `frontend/src/types/auditLog.ts`
  - `frontend/src/services/auditLogService.ts`
  - `frontend/src/components/admin/AuditLogFilters.tsx`
  - `frontend/src/components/admin/AuditLogTable.tsx`
  - `frontend/src/app/admin/audit-log/page.tsx`
  - `frontend/src/services/__tests__/auditLogService.test.ts`
  - `frontend/src/__tests__/components/admin/AuditLogViewer.test.tsx`
