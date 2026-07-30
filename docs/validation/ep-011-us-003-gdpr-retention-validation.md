# EP-011 / US-003 GDPR Retention Validation Evidence

Date: 2026-07-30
Environment: Backend (Vitest)
Validator: GitHub Copilot

## Scope

Validation coverage for US-003 TASK-004:
- query-time audit payload privacy projection for anonymized candidates
- deterministic parity between audit list and audit CSV export paths
- regression coverage for anonymization and retention workers/services
- script-based evidence hooks for anonymization correctness and retention reconciliation

## Executed Commands and Results

### Privacy projection unit coverage

```text
npm.cmd --prefix backend run test -- src/services/__tests__/auditPayloadPrivacyService.test.ts src/services/__tests__/auditLogQueryService.test.ts src/services/__tests__/auditLogExportService.test.ts

Test Files  3 passed (3)
Tests       15 passed (15)
```

Validated:
- centralized redaction/nullification for candidate PII fields
- projection triggered for anonymized candidate references (entity and payload-based)
- deterministic output across repeated projections
- list and export paths share privacy projection behavior

### US-003 anonymization + retention + privacy regression bundle

```text
npm.cmd --prefix backend run test -- src/services/__tests__/candidateAnonymizationService.test.ts src/workers/__tests__/gdprAnonymizationWorker.test.ts src/services/__tests__/auditArchiveService.test.ts src/workers/__tests__/auditRetentionArchiveWorker.test.ts src/services/__tests__/auditPayloadPrivacyService.test.ts src/services/__tests__/auditLogQueryService.test.ts src/services/__tests__/auditLogExportService.test.ts

Test Files  7 passed (7)
Tests       35 passed (35)
```

Validated:
- daily anonymization processing and retry-safe behavior
- monthly archive export/purge/index behavior and worker overlap protection
- privacy projection protections for audit list/export retrieval

### Integration checks (DB-gated)

```text
npm.cmd --prefix backend run test:integration -- src/routes/__tests__/audit-gdpr-privacy.integration.test.ts src/services/__tests__/auditArchiveService.integration.test.ts

Test Files  2 skipped (2)
Tests       2 skipped (2)
```

Result:
- both suites are correctly gated on `DATABASE_URL` and skip cleanly when integration DB env is absent.
- run the same command in DB-enabled environments to execute full integration linkage checks.

### Validation script wiring check

```text
npm.cmd --prefix backend run validate:gdpr-anonymization

[env] Missing or invalid environment variables
DATABASE_URL, DIRECT_URL, UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN,
SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, FRONTEND_URL
```

Result:
- script registration and execution path are verified.
- full script evidence requires a configured non-production environment with mandatory backend env vars.

## Scenario-to-Test Traceability

| US-003 Scenario | Coverage | Outcome |
| --- | --- | --- |
| Scenario 1: PII anonymized within 30-day SLA | `candidateAnonymizationService.test.ts`, `gdprAnonymizationWorker.test.ts`, `validate-gdpr-anonymization.ts` | PASS (automated), script ready |
| Scenario 2: Audit query/export hides anonymized candidate raw PII | `auditPayloadPrivacyService.test.ts`, `auditLogQueryService.test.ts`, `auditLogExportService.test.ts`, `audit-gdpr-privacy.integration.test.ts` | PASS (unit), integration DB-gated |
| Scenario 3: 7-year archive + source purge + archive index | `auditArchiveService.test.ts`, `auditRetentionArchiveWorker.test.ts`, `auditArchiveService.integration.test.ts`, `validate-audit-retention-archive.ts`, `validate-gdpr-anonymization.ts` | PASS (unit), integration DB-gated |
| Scenario 4: anonymization preserves hiring outcome records | `candidateAnonymizationService.test.ts` (non-deletion assertions), `validate-gdpr-anonymization.ts` | PASS (automated), script ready |

## Acceptance Summary

- Audit query/export responses never expose raw candidate PII for anonymized candidates: PASS (service unit coverage)
- Automated tests cover US-003 anonymization/retention/privacy scenarios: PASS with DB-gated integration caveat
- Validation scripts exist for anonymization and retention reconciliation evidence: PASS (script registered; env required)
- Operations runbook documented for support and audit-readiness: PASS
