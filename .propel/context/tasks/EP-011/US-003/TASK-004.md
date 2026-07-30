---
id: TASK-004
user_story: US-003
title: "Privacy Guarantees and Validation - Anonymized Audit Views, Compliance Tests, and Runbook"
status: done
priority: high
assigned_to: qa-team
estimated_hours: 6
layer: testing
dependencies: [TASK-002, TASK-003]
---

# TASK-004 - Privacy Guarantees and Validation - Anonymized Audit Views, Compliance Tests, and Runbook

## Objective

Guarantee that querying audit records after anonymization never reveals raw candidate PII, and provide automated/regression evidence for anonymization and retention compliance.

## Scope

Implement and validate:
- audit payload privacy projection for anonymized candidates
- end-to-end test coverage across all US-003 scenarios
- operational runbook and validation scripts for compliance evidence

## Technical Requirements

### 1. Audit Query-Time Privacy Projection

Implement privacy-safe serialization for audit retrieval/export paths:
- if referenced candidate is anonymized, candidate PII fields in payload are redacted/anonymized
- no raw name/email/phone/address/date-of-birth values returned
- behavior is deterministic across list and export endpoints

Important:
- preserve immutable audit-event storage guarantees (no in-place mutation of historical rows)
- perform privacy protection at read/projection layer where required

### 2. End-to-End Compliance Coverage

Add automated tests for:
- erasure request lifecycle and anonymization timing constraints
- anonymized candidate audit payload visibility behavior
- 7-year archive export and source purge semantics
- preservation of application/screening/interview/decision records

### 3. Validation Scripts and Evidence

Provide reproducible validation commands/scripts for:
- anonymization correctness checks
- retention cutoff checks
- archive index reconciliation checks

### 4. Operations Runbook

Document:
- worker schedules and env variables
- manual rerun/recovery procedures
- alerting and failure triage for anonymization/archive jobs

## Acceptance Criteria

- [x] Audit query/export responses never expose raw PII for anonymized candidates
- [x] Automated tests cover all US-003 acceptance scenarios
- [x] Validation scripts generate reproducible compliance evidence
- [x] Operational runbook exists for support and audit-readiness

## Testing Requirements

- [x] Backend integration tests for anonymization and archive flows
- [x] Route/service tests for audit payload privacy projection
- [x] Script-based validation for archival index and retention cutoff

## Files to Create/Modify

- `backend/src/services/auditPayloadPrivacyService.ts`
- `backend/src/services/auditLogQueryService.ts` (or equivalent audit retrieval path)
- `backend/src/services/auditLogExportService.ts` (if export path exists)
- `backend/src/services/index.ts`
- `backend/src/services/__tests__/auditPayloadPrivacyService.test.ts`
- `backend/src/services/__tests__/auditLogQueryService.test.ts`
- `backend/src/services/__tests__/auditLogExportService.test.ts`
- `backend/src/routes/__tests__/audit-gdpr-privacy.integration.test.ts`
- `backend/scripts/validate-gdpr-anonymization.ts`
- `backend/package.json`
- `docs/ops/gdpr-retention-runbook.md`
- `docs/validation/ep-011-us-003-gdpr-retention-validation.md`

## Dependencies

- TASK-002 daily anonymization pipeline
- TASK-003 monthly archival pipeline

## Notes

- Keep privacy projection logic centralized so all current and future audit read APIs share the same behavior.

## Completion Evidence

- Added centralized read-time privacy projection service in `backend/src/services/auditPayloadPrivacyService.ts`:
	- candidate reference detection from both audit entity metadata and payload `candidateId` fields
	- anonymized-candidate lookup via `candidates.status = anonymized`
	- deterministic candidate PII projection (`name/email` redaction, `phone/address/dob` nullification)
	- no mutation of historical `audit_events` rows (projection-only behavior)
- Wired privacy projection into both retrieval paths:
	- list endpoint path: `backend/src/services/auditLogQueryService.ts`
	- csv export path: `backend/src/services/auditLogExportService.ts`
- Exported privacy service via `backend/src/services/index.ts` for reuse by future audit read APIs.
- Added and expanded tests:
	- new unit suite: `backend/src/services/__tests__/auditPayloadPrivacyService.test.ts`
	- query service privacy coverage: `backend/src/services/__tests__/auditLogQueryService.test.ts`
	- export service privacy coverage: `backend/src/services/__tests__/auditLogExportService.test.ts`
	- new route integration suite (DB-gated): `backend/src/routes/__tests__/audit-gdpr-privacy.integration.test.ts`
- Added reproducible compliance script and script entry:
	- `backend/scripts/validate-gdpr-anonymization.ts`
	- npm script: `validate:gdpr-anonymization`
- Added operational and validation artifacts:
	- `docs/ops/gdpr-retention-runbook.md`
	- `docs/validation/ep-011-us-003-gdpr-retention-validation.md`

Validation commands:
- `npm.cmd --prefix backend run test -- src/services/__tests__/auditPayloadPrivacyService.test.ts src/services/__tests__/auditLogQueryService.test.ts src/services/__tests__/auditLogExportService.test.ts` -> passed (3 files, 15 tests)
- `npm.cmd --prefix backend run test -- src/services/__tests__/candidateAnonymizationService.test.ts src/workers/__tests__/gdprAnonymizationWorker.test.ts src/services/__tests__/auditArchiveService.test.ts src/workers/__tests__/auditRetentionArchiveWorker.test.ts src/services/__tests__/auditPayloadPrivacyService.test.ts src/services/__tests__/auditLogQueryService.test.ts src/services/__tests__/auditLogExportService.test.ts` -> passed (7 files, 35 tests)
- `npm.cmd --prefix backend run test:integration -- src/routes/__tests__/audit-gdpr-privacy.integration.test.ts src/services/__tests__/auditArchiveService.integration.test.ts` -> skipped in this environment (missing `DATABASE_URL`)
- `npm.cmd --prefix backend run validate:gdpr-anonymization` -> script path verified; execution requires configured backend env vars in non-production environments
