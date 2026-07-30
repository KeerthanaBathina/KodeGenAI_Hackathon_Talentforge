---
id: TASK-003
user_story: US-003
title: "Backend Retention - Monthly 7-Year Audit Archive Export and Purge"
status: done
priority: critical
assigned_to: backend-team
estimated_hours: 7
layer: backend
dependencies: [TASK-001]
---

# TASK-003 - Backend Retention - Monthly 7-Year Audit Archive Export and Purge

## Objective

Implement a monthly retention job that archives audit events older than 7 years to Supabase cold storage, deletes archived rows, and records archival metadata.

## Scope

Deliver:
- monthly archival worker
- export service to Supabase storage bucket
- purge-after-export safety workflow
- archival metadata tracking in `audit_archive_index`

## Technical Requirements

### 1. Monthly Archive Worker

Create cron worker:
- schedule: monthly (for example, first day at 00:00)
- computes archival cutoff (`created_at < now - 7 years`)
- archives records in bounded chunks

### 2. Cold Storage Export

Use Supabase storage integration pattern to write archive artifacts:
- JSONL/CSV/parquet archive file format (decide and document)
- deterministic storage path with date partitioning
- checksum/row-count metadata for integrity verification

### 3. Safe Purge Workflow

Enforce archive-before-delete semantics:
- export chunk
- verify upload success and integrity metadata
- delete corresponding `audit_events` rows
- write `audit_archive_index` record in same logical batch

### 4. Idempotency and Recovery

Handle retried monthly jobs safely:
- prevent duplicate archive writes for same batch window
- support resumable processing after partial failure
- provide operational logs with batch and row counts

### 5. Compliance Evidence Signals

Emit auditable operational signals:
- archived row count
- deleted row count
- batch duration
- storage path and checksum

## Acceptance Criteria

- [x] Monthly job exports `audit_events` older than 7 years to Supabase cold storage
- [x] Archived rows are deleted only after successful export verification
- [x] `audit_archive_index` records batch metadata (window, count, storage path)
- [x] Job is idempotent and safe for retries/restarts

## Testing Requirements

- [x] Service tests for export, purge, and index-write branches
- [x] Worker tests for monthly scheduling and failure recovery paths
- [x] Integration test proving archive record + source row deletion linkage

## Files to Create/Modify

- `backend/src/services/auditArchiveService.ts`
- `backend/src/workers/auditRetentionArchiveWorker.ts`
- `backend/src/startWorkers.ts`
- `backend/src/services/index.ts`
- `backend/prisma/migrations/20260730000007_allow_audit_archive_purge_delete/migration.sql`
- `backend/src/services/__tests__/auditArchiveService.test.ts`
- `backend/src/services/__tests__/auditArchiveService.integration.test.ts`
- `backend/src/workers/__tests__/auditRetentionArchiveWorker.test.ts`
- `backend/scripts/validate-audit-retention-archive.ts`
- `backend/package.json`

## Dependencies

- TASK-001 retention metadata and archive index schema

## Notes

- Keep chunk size configurable to avoid long-lived transactions and memory spikes.

## Completion Evidence

- Added archive service `backend/src/services/auditArchiveService.ts` implementing:
	- monthly cutoff computation (`createdAt < now - retentionYears`)
	- bounded chunk processing via `batchSize` and `chunkSize`
	- deterministic JSONL export payload format
	- deterministic date-partitioned storage path generation
	- SHA-256 checksum generation and post-upload checksum verification (download + compare)
	- archive-before-delete workflow: upload -> verify -> purge rows -> write `audit_archive_index`
	- retry-safe behavior with deterministic paths and `audit_archive_index.storage_path` idempotency handling
	- auditable operational signals via archive chunk/run audit events (row counts, checksum, path, duration)
- Added controlled purge migration `backend/prisma/migrations/20260730000007_allow_audit_archive_purge_delete/migration.sql`:
	- keeps audit events immutable by default
	- allows delete only when session sets `app.audit_archive_purge=true`
- Added worker `backend/src/workers/auditRetentionArchiveWorker.ts`:
	- monthly schedule: first day at 00:00 UTC (`0 0 1 * *`)
	- in-flight overlap guard and failure-safe recovery logging
- Registered monthly worker startup in `backend/src/startWorkers.ts`.
- Added validations and tests:
	- service unit tests: `backend/src/services/__tests__/auditArchiveService.test.ts`
	- worker unit tests: `backend/src/workers/__tests__/auditRetentionArchiveWorker.test.ts`
	- integration linkage test: `backend/src/services/__tests__/auditArchiveService.integration.test.ts`
	- runtime validation script: `backend/scripts/validate-audit-retention-archive.ts`
	- npm script entry: `validate:audit-retention-archive`

Validation commands:
- `npm.cmd --prefix backend run test -- src/services/__tests__/auditArchiveService.test.ts src/workers/__tests__/auditRetentionArchiveWorker.test.ts` -> passed (2 files, 11 tests)
- `npm.cmd --prefix backend run test:integration -- src/services/__tests__/auditArchiveService.integration.test.ts` -> skipped in this environment (missing `DATABASE_URL`), test is gated and will execute when integration DB env is provided
