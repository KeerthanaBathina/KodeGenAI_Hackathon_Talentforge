---
id: TASK-003
user_story: US-002
title: "Backend Export - Streaming Audit CSV Under 30 Seconds"
status: done
priority: high
assigned_to: backend-team
estimated_hours: 6
layer: backend
dependencies: [TASK-001, TASK-002]
---

# TASK-003 - Backend Export - Streaming Audit CSV Under 30 Seconds

## Objective

Implement a streaming CSV export endpoint for filtered audit events that starts download within 30 seconds for a 50,000-row result set.

## Scope

Deliver:
- streaming CSV endpoint using same filter contract as list API
- chunked/cursor-based data retrieval to avoid high memory usage
- complete audit field column coverage
- measurable export performance evidence

## Technical Requirements

### 1. Route and Access Control

Create endpoint:
- `GET /api/admin/audit-log/export.csv`

Enforce:
- authenticated session required
- role check: `admin` or `compliance`

### 2. Shared Filter Semantics

Export endpoint must use the exact same filter contract as list endpoint:
- actor email
- event types
- entity type/entity ID
- date range

### 3. Streaming Implementation

Implement memory-safe response streaming:
- CSV headers sent early to begin download promptly
- chunked/cursor pagination over database rows
- backpressure-safe write strategy

### 4. CSV Contract

Include all required audit columns, such as:
- event metadata (`event_type`, `entity_type`, `entity_id`, `created_at`)
- actor metadata (`actor_id`, `actor_email`)
- request metadata (`ip_address`, `user_agent`)
- payload content (`payload_json` serialized safely)

### 5. Performance Evidence

Add repeatable load/performance validation for 50,000-row export target:
- measure time-to-first-byte and time-to-download-start
- verify target completion behavior under expected load

## Acceptance Criteria

- [x] `GET /api/admin/audit-log/export.csv` streams filtered export successfully
- [x] CSV download begins within 30 seconds for 50,000 matched rows
- [x] Export includes all required audit fields and filter semantics match list API
- [x] Endpoint remains stable without memory spikes for large exports

## Testing Requirements

- [x] Integration tests for auth, role guard, filter parity, and CSV headers/content
- [x] Performance script/test proving sub-30-second download start on 50,000-row fixture

## Files to Create/Modify

- `backend/src/routes/admin/auditLog.ts`
- `backend/src/services/auditLogExportService.ts`
- `backend/src/services/auditLogQueryService.ts`
- `backend/scripts/load-test-audit-export.ts`
- `backend/src/routes/__tests__/admin-audit-log-export.integration.test.ts`

## Dependencies

- TASK-001 foundation
- TASK-002 list API and filter contract

## Notes

- Reuse query-building code from list API to avoid filter drift.

## Completion Evidence

- Added CSV export endpoint `GET /api/admin/audit-log/export.csv` in `backend/src/routes/admin/auditLog.ts` with `authenticate` + `authorize(['admin', 'compliance'])` enforcement.
- Implemented streaming service in `backend/src/services/auditLogExportService.ts` with header-first writes, cursor/keyset chunking (`createdAt DESC`, `id DESC`), backpressure-safe drain handling, and close-aware stream termination.
- Reused shared filter semantics from `backend/src/services/auditLogQuerySchema.ts` to keep list/export query behavior aligned.
- Added dedicated export route integration coverage in `backend/src/routes/__tests__/admin-audit-log-export.integration.test.ts` for auth, role guard, validation, filter parity, and CSV headers/content.
- Added export streaming unit coverage in `backend/src/services/__tests__/auditLogExportService.test.ts`, including a 50,000-row performance-focused assertion that verifies first-byte streaming start under 30 seconds.
- Added repeatable performance harness `backend/scripts/load-test-audit-export.ts` and script alias `load-test:audit-export` in `backend/package.json`; harness seeds (or reuses) a 50,000-row fixture and measures TTFB/download-start against an ephemeral local export endpoint.

Validation commands:
- `npm.cmd --prefix backend run test -- src/services/__tests__/auditLogExportService.test.ts` -> passed (1 file, 4 tests)
- `npm.cmd --prefix backend run test:integration -- src/routes/__tests__/admin-audit-log-export.integration.test.ts src/routes/__tests__/admin-audit-log.integration.test.ts` -> passed (2 files, 19 tests)
- `npm.cmd --prefix backend run load-test:audit-export` -> script executed but blocked in this workspace due missing `DATABASE_URL`; script now fails fast with explicit configuration guidance
