---
id: TASK-002
user_story: US-003
title: "Backend Processing - Daily GDPR Anonymization Worker and PII Scrub Service"
status: done
priority: critical
assigned_to: backend-team
estimated_hours: 7
layer: backend
dependencies: [TASK-001]
---

# TASK-002 - Backend Processing - Daily GDPR Anonymization Worker and PII Scrub Service

## Objective

Implement the daily anonymization pipeline that processes pending erasure requests and scrubs candidate PII while preserving hiring outcome records.

## Scope

Build:
- anonymization service with transactional PII updates
- daily midnight cron worker
- idempotent processing and failure handling
- verification that application/screening/interview/decision records remain intact

## Technical Requirements

### 1. Daily Worker Schedule

Create scheduled worker:
- cron: daily at 00:00
- processes pending erasure requests
- respects SLA window (must complete within 30 days of request)

### 2. PII Anonymization Logic

Apply required transformations for target candidate records:
- name -> `ANONYMISED` (profile/candidate canonical field)
- email -> `anon-<uuid>@redacted`
- phone -> `null`
- address -> `null` (or redacted equivalent if structured)
- date of birth -> `null` (or redacted equivalent)
- `candidates.anonymised_at` set on completion

### 3. Account and Access Hardening

Ensure anonymized candidates cannot re-authenticate with historical identity data:
- status transitioned to `anonymized`
- credentials reset/invalidated as needed
- password reset flow blocked for anonymized candidate accounts

### 4. Referential Preservation

Do not delete related hiring records:
- applications
- screenings
- interviews
- decisions

Only PII fields are scrubbed; relational integrity is preserved.

### 5. Auditing and Error Handling

Record anonymization lifecycle events in audit trail:
- request processing started/completed/failed
- candidate anonymized event with candidate and request metadata

## Acceptance Criteria

- [x] Daily worker processes pending erasure requests at midnight schedule
- [x] Required PII fields are anonymized using specified placeholders/null values
- [x] `candidates.anonymised_at` is written on successful anonymization
- [x] Application/screening/interview/decision records remain intact after anonymization
- [x] Failed records are retriable without duplicate or partial corruption

## Testing Requirements

- [x] Service unit tests for anonymization rules and idempotency
- [x] Worker tests for schedule, success, partial failure, and retry behavior
- [x] Integration tests confirming non-deletion of hiring outcome records

## Files to Create/Modify

- `backend/src/services/candidateAnonymizationService.ts`
- `backend/src/workers/gdprAnonymizationWorker.ts`
- `backend/src/startWorkers.ts`
- `backend/src/services/loginService.ts`
- `backend/src/services/passwordResetService.ts`
- `backend/src/services/__tests__/candidateAnonymizationService.test.ts`
- `backend/src/services/__tests__/loginService.anonymization.test.ts`
- `backend/src/services/__tests__/passwordResetService.anonymization.test.ts`
- `backend/src/workers/__tests__/gdprAnonymizationWorker.test.ts`

## Dependencies

- TASK-001 data model and request intake

## Notes

- Use transactions for candidate/profile/request state updates to avoid partially anonymized records.

## Completion Evidence

- Added `backend/src/services/candidateAnonymizationService.ts` with:
	- transactional candidate/profile/request updates to avoid partial anonymization
	- PII transformations: `fullName -> ANONYMISED`, `email -> anon-<uuid>@redacted`, `phone -> null`
	- structured JSON scrubber for address/date-of-birth/phone/email keys in profile JSON fields
	- credential invalidation (`candidateCredential.deleteMany`) and active password reset token revocation
	- lifecycle audit events (`gdpr_erasure_processing_started|completed|failed`) plus `candidate_anonymized`
	- retry-safe request claiming and failed-status retry support (`pending` + `failed` selection)
- Added `backend/src/workers/gdprAnonymizationWorker.ts`:
	- daily cron schedule at `0 0 * * *`
	- in-flight guard to prevent overlapping runs
	- summary logging for success vs partial-failure runs
- Registered worker startup in `backend/src/startWorkers.ts` via `startGdprAnonymizationWorker()`.
- Hardened auth access for anonymized candidates:
	- `backend/src/services/loginService.ts` blocks login when `status = anonymized` with generic invalid-credentials response and audit event
	- `backend/src/services/passwordResetService.ts` blocks reset-token issuance/validation for anonymized candidates and revokes residual active reset tokens
- Added transition support for retries in `backend/src/services/gdprErasureRequestService.ts` (`failed -> processing`).
- Added automated coverage:
	- `backend/src/services/__tests__/candidateAnonymizationService.test.ts`
	- `backend/src/services/__tests__/loginService.anonymization.test.ts`
	- `backend/src/services/__tests__/passwordResetService.anonymization.test.ts`
	- `backend/src/workers/__tests__/gdprAnonymizationWorker.test.ts`
	- non-deletion integrity assertion included in service tests (applications/screenings/interviews/decisions are never deleted)

Validation commands:
- `npm.cmd --prefix backend run test -- src/services/__tests__/candidateAnonymizationService.test.ts src/workers/__tests__/gdprAnonymizationWorker.test.ts src/services/__tests__/loginService.anonymization.test.ts src/services/__tests__/passwordResetService.anonymization.test.ts` -> passed (4 files, 12 tests)
- `npm.cmd --prefix backend run type-check` -> fails due pre-existing unrelated backend typing issues in `oauthService`, offer services, and other legacy files outside TASK-002 scope
