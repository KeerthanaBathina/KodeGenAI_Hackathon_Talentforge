---
id: TASK-001
user_story: US-002
title: "Foundation - Compliance Role Enablement and Audit Read Model Contract"
status: done
priority: critical
assigned_to: backend-team
estimated_hours: 6
layer: data
dependencies: []
---

# TASK-001 - Foundation - Compliance Role Enablement and Audit Read Model Contract

## Objective

Establish the foundational access and query contract required by the audit viewer, including compliance-role authorization and a shared audit filter schema.

## Scope

Create the base for:
- `compliance` role support across backend and frontend role definitions
- reusable request/query schema for audit search and export filters
- database index/read-model readiness for large filtered scans

## Technical Requirements

### 1. Compliance Role Enablement

Add and propagate `compliance` role support in:
- Prisma `UserRole` enum
- backend role validation/authorization usage
- frontend role enum and role labels
- any relevant user management validation paths

### 2. Shared Audit Filter Contract

Define a reusable typed filter schema for both list and export APIs:
- `actorEmail` (search)
- `eventTypes` (multi-select)
- `entityType`
- `entityId`
- `from` / `to` date range
- `page` / `pageSize` with default page size = 50

### 3. Query and Index Readiness

Prepare query infrastructure for efficient filtered reads on `audit_events`:
- deterministic ordering (`createdAt DESC`, tie-breaker by `id`)
- indexes for date/event/entity access paths where needed
- actor-email lookup path via user relation

### 4. Data Exposure Guardrails

Define and document payload/redaction boundaries for viewer responses and CSV output:
- no secrets or sensitive fields from `payload_json`
- consistent serialization for nested payload values

## Acceptance Criteria

- [x] `compliance` role is fully supported in role definitions and authorization flows
- [x] Shared audit filter schema exists and is reusable by list and export endpoints
- [x] Query ordering and index strategy are defined for large result sets
- [x] Data exposure/redaction rules are documented for audit payload output

## Testing Requirements

- [x] Unit tests for query schema validation and role guard behavior
- [x] Migration/DB verification for new indexes and enum changes

## Files to Create/Modify

- `backend/prisma/schema.prisma`
- `backend/prisma/migrations/*`
- `backend/src/middleware/authorize.ts`
- `backend/src/services/auditLogQuerySchema.ts`
- `backend/src/services/userManagementService.ts`
- `frontend/src/types/user.ts`

## Dependencies

- EP-011 / US-001 (audit events populated)

## Notes

- Keep list and export query contracts identical to prevent drift.

## Completion Evidence

- Implemented compliance role propagation in Prisma enum, backend auth flow classification, authorization constants, user-role validation path, and frontend role types.
- Added shared audit read contract in `backend/src/services/auditLogQuerySchema.ts` for list/export filter parity, pagination defaults, and deterministic ordering.
- Added audit read index migration in `backend/prisma/migrations/20260730000005_add_compliance_role_audit_read_model/migration.sql`.
- Documented payload redaction and serialization guardrails in `backend/docs/audit-read-model-contract.md`.

Validation commands:
- `npm.cmd --prefix backend run test -- src/services/__tests__/auditLogQuerySchema.test.ts src/middleware/__tests__/authorize.test.ts` -> passed (2 files, 11 tests)
- `backend\\node_modules\\.bin\\prisma.cmd validate --schema backend/prisma/schema.prisma` -> schema valid
- `backend\\node_modules\\.bin\\prisma.cmd generate --schema backend/prisma/schema.prisma` -> Prisma Client generated successfully
- `npm.cmd --prefix backend run migrate:diff` -> blocked in this workspace due missing `DATABASE_URL`/`DIRECT_URL`; migration SQL reviewed and schema validation passed
