---
id: TASK-001
user_story: US-003
title: "Data Foundation - GDPR Erasure Request Model and Retention Metadata"
status: done
priority: critical
assigned_to: backend-team
estimated_hours: 5
layer: data
dependencies: []
---

# TASK-001 - Data Foundation - GDPR Erasure Request Model and Retention Metadata

## Objective

Create the data model and API intake foundations required to execute GDPR erasure requests within SLA and track legal audit archival batches.

## Scope

Implement foundational persistence for:
- candidate erasure request intake and lifecycle
- candidate anonymization completion timestamp
- audit archival batch tracking index
- configurable retention windows and archive bucket settings

## Technical Requirements

### 1. GDPR Erasure Request Entity

Create a dedicated erasure request model/table with fields such as:
- request ID
- candidate ID
- requestedAt
- dueAt (request + 30 days)
- status (`pending`, `processing`, `completed`, `failed`)
- processedAt
- failure reason (nullable)

Rules:
- idempotent request creation for already-pending requests
- audit trail for request create/update actions

### 2. Candidate Anonymization Metadata

Add/confirm candidate anonymization metadata:
- `candidates.anonymised_at` timestamp (nullable)
- optional `anonymisation_version` or equivalent for forward compatibility

### 3. Audit Archive Index Entity

Create `audit_archive_index` table to track monthly archival batches:
- batch ID
- source window start/end
- row count
- storage path
- checksum/hash metadata
- archivedAt timestamp

### 4. Configuration Surface

Introduce retention configuration values in environment validation:
- anonymization SLA days (default 30)
- audit retention years (default 7)
- audit cold storage bucket/path prefix
- archive chunk size/batch size controls

### 5. Erasure Request Intake Endpoint

Add endpoint for candidate erasure request submission using existing privacy route area.
Suggested path:
- `POST /api/consent/erasure-request` (or equivalent privacy endpoint)

## Acceptance Criteria

- [x] Erasure request records can be created and tracked through lifecycle statuses
- [x] Candidate anonymization completion timestamp is persisted
- [x] `audit_archive_index` exists and can persist archival metadata
- [x] Retention and archive settings are configurable through validated env vars
- [x] Candidate erasure request endpoint supports idempotent submissions

## Testing Requirements

- [x] Migration tests/verification for new tables and columns
- [x] Route/service tests for erasure request intake idempotency and validation

## Files to Create/Modify

- `backend/prisma/schema.prisma`
- `backend/prisma/migrations/*`
- `backend/src/config/env.ts`
- `backend/src/routes/consent.ts` (or new privacy route)
- `backend/src/services/gdprErasureRequestService.ts`
- `backend/src/routes/__tests__/consent-erasure-request.integration.test.ts`

## Dependencies

- EP-011 / US-001 (`audit_events` available)
- EP-DATA / US-001 candidate core schema baseline

## Notes

- Keep field naming aligned with story terminology (`anonymised_at`) and existing schema conventions.

## Completion Evidence

- Extended data model in `backend/prisma/schema.prisma` with:
	- `GdprErasureRequestStatus` enum (`pending`, `processing`, `completed`, `failed`)
	- `GdprErasureRequest` model (request lifecycle + due date + failure metadata)
	- `Candidate.anonymised_at` and `Candidate.anonymisation_version` mapped columns
	- `AuditArchiveIndex` model for monthly audit archival metadata tracking
- Added migration `backend/prisma/migrations/20260730000006_add_gdpr_erasure_foundation/migration.sql`:
	- creates GDPR erasure request table + indexes + unique pending-request guard
	- adds candidate anonymization metadata columns
	- creates `audit_archive_index` table + integrity constraints/indexes
- Added retention/env validation surface in `backend/src/config/env.ts` and documented defaults in `backend/.env.example`:
	- `GDPR_ANONYMIZATION_SLA_DAYS`
	- `AUDIT_RETENTION_YEARS`
	- `AUDIT_ARCHIVE_BUCKET`
	- `AUDIT_ARCHIVE_PATH_PREFIX`
	- `AUDIT_ARCHIVE_BATCH_SIZE`
	- `AUDIT_ARCHIVE_CHUNK_SIZE`
- Added service foundation in `backend/src/services/gdprErasureRequestService.ts`:
	- idempotent pending-request submission (`submitGdprErasureRequest`)
	- due-date computation from SLA config (`calculateErasureDueAt`)
	- lifecycle update helper with transition validation (`updateGdprErasureRequestStatus`)
	- audit trail emission for create/idempotent/status-update actions
- Added candidate intake endpoint `POST /api/consent/erasure-request` in `backend/src/routes/consent.ts`:
	- candidate-role enforcement
	- payload validation (`requestReason` optional, trimmed, bounded)
	- idempotent HTTP semantics (`201` on new request, `200` on existing pending request)
- Added automated coverage:
	- route integration: `backend/src/routes/__tests__/consent-erasure-request.integration.test.ts`
	- service unit: `backend/src/services/__tests__/gdprErasureRequestService.test.ts`

Validation commands:
- `npm.cmd --prefix backend run test -- src/services/__tests__/gdprErasureRequestService.test.ts` -> passed (1 file, 8 tests)
- `npm.cmd --prefix backend run test:integration -- src/routes/__tests__/consent-erasure-request.integration.test.ts` -> passed (1 file, 6 tests)
- `npx.cmd prisma validate --schema backend/prisma/schema.prisma` (run from `backend` with temporary `DATABASE_URL` and `DIRECT_URL`) -> schema valid
