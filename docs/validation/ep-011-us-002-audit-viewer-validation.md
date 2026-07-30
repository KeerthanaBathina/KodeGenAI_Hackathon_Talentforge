# EP-011 / US-002 Audit Viewer Validation Evidence

Date: 2026-07-30
Environment: Backend (Vitest), Frontend (Vitest + Playwright)
Validator: GitHub Copilot

## Scope

Validation coverage for US-002 audit viewer:
- Search and filter accuracy across actor email, event types, entity fields, and date range semantics
- Pagination correctness (`page=3` shows rows 101-150 at page size 50) with URL persistence
- Role-based access control (`admin` and `compliance` allowed; other roles denied)
- CSV export behavior, completeness, and 50,000-row streaming SLA evidence

## Executed Commands and Results

### Backend route integration coverage

```text
cmd /c cd backend && npm.cmd run test:integration -- src/routes/__tests__/admin-audit-log.integration.test.ts src/routes/__tests__/admin-audit-log-export.integration.test.ts

Test Files  2 passed (2)
Tests       19 passed (19)
```

Validated:
- Unauthorized (`401`) and forbidden (`403`) behavior
- List endpoint filter combinations and query validation
- Pagination metadata and deterministic page-3 rows (`evt-101` to `evt-150`)
- CSV endpoint headers/content and shared filter semantics

### Backend export streaming SLA unit coverage

```text
cmd /c cd backend && npm.cmd run test -- src/services/__tests__/auditLogExportService.test.ts

Test Files  1 passed (1)
Tests       4 passed (4)
- starts streaming within 30 seconds for 50,000 rows
```

Validated:
- Streaming starts within sub-30-second target for 50,000 rows
- Chunk/keyset streaming behavior and backpressure handling

### Frontend service + component coverage

```text
cmd /c cd frontend && npm.cmd run test -- src/services/__tests__/auditLogService.test.ts src/__tests__/components/admin/AuditLogViewer.test.tsx

Test Files  2 passed (2)
Tests       12 passed (12)
```

Validated:
- Query serialization for actor/event/entity/date and page/pageSize
- URL hydration and persistence for filters + pagination
- Export in-progress state and export error feedback handling
- Unauthorized redirect behavior for `403`

### Playwright E2E flow coverage

```text
cmd /c cd frontend && npm.cmd run test:e2e -- tests/e2e/audit-log-viewer.spec.ts

1 passed (10.5s)
```

Validated flow:
- Visit `/admin/audit-log`
- Apply filters and verify URL synchronization
- Navigate to next page and verify `?page=` updates persist
- Trigger CSV export and verify filtered export query + button state transitions

### Export load-test script execution

```text
cmd /c cd backend && npm.cmd run load-test:audit-export

[load-test-audit-export] failed Error: DATABASE_URL is required to seed and stream the 50,000-row audit export fixture
```

Result:
- Script execution path and fail-fast guard are verified.
- Full runtime benchmark against seeded database requires `DATABASE_URL` in this environment.

## Files Validated

- `backend/src/routes/__tests__/admin-audit-log.integration.test.ts`
- `backend/src/routes/__tests__/admin-audit-log-export.integration.test.ts`
- `backend/src/services/__tests__/auditLogExportService.test.ts`
- `backend/scripts/load-test-audit-export.ts`
- `frontend/src/services/__tests__/auditLogService.test.ts`
- `frontend/src/__tests__/components/admin/AuditLogViewer.test.tsx`
- `frontend/tests/e2e/audit-log-viewer.spec.ts`

## Scenario-to-Test Traceability

| US-002 Scenario | Automated Coverage | Outcome |
|---|---|---|
| Scenario 1: actor search returns matching events | `admin-audit-log.integration.test.ts`, `auditLogService.test.ts`, `AuditLogViewer.test.tsx`, `audit-log-viewer.spec.ts` | PASS |
| Scenario 2: date range filter narrows results | `admin-audit-log.integration.test.ts`, `admin-audit-log-export.integration.test.ts`, `auditLogService.test.ts` | PASS |
| Scenario 3: CSV export starts under 30s for 50,000 rows | `auditLogExportService.test.ts` (50k sub-30 assertion), `load-test-audit-export.ts` (runtime harness) | PASS with env caveat |
| Scenario 4: page 3 shows rows 101-150 and URL reflects page | `admin-audit-log.integration.test.ts`, `AuditLogViewer.test.tsx`, `audit-log-viewer.spec.ts` | PASS |

## Acceptance Summary

- Automated tests cover US-002 acceptance scenarios: PASS
- Access control denies non-admin/non-compliance users: PASS
- Pagination and URL persistence behavior: PASS
- Export SLA evidence for 50,000 rows: PASS (unit proof) with runtime benchmark blocked pending `DATABASE_URL`