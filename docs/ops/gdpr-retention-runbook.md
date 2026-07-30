# GDPR Anonymization and Audit Retention Runbook

Version: 1.0
Date: 2026-07-30
Owner: Platform Engineering and Compliance Engineering

## Scope

Operational procedures for US-003 GDPR controls:
- daily candidate PII anonymization workflow
- monthly audit retention archive workflow
- validation and recovery actions for compliance evidence

## Worker Schedules

| Worker | Function | Schedule (UTC) | Source |
| --- | --- | --- | --- |
| GDPR anonymization worker | Process pending and failed erasure requests | `0 0 * * *` (daily at 00:00) | `runGdprAnonymizationCycle` |
| Audit retention archive worker | Archive and purge audit events older than retention window | `0 0 1 * *` (day 1 at 00:00) | `runAuditRetentionArchiveCycle` |

## Required Environment Variables

| Variable | Purpose |
| --- | --- |
| `GDPR_ANONYMIZATION_SLA_DAYS` | Due-date offset used for GDPR erasure request deadline calculations |
| `AUDIT_RETENTION_YEARS` | Retention period for `audit_events` archival cutoff |
| `AUDIT_ARCHIVE_BUCKET` | Supabase storage bucket for archived audit chunks |
| `AUDIT_ARCHIVE_PATH_PREFIX` | Deterministic storage path prefix for archive files |
| `AUDIT_ARCHIVE_BATCH_SIZE` | Maximum rows processed in one monthly run |
| `AUDIT_ARCHIVE_CHUNK_SIZE` | Rows exported per archive chunk (`<= batch size`) |
| `SUPABASE_URL` | Supabase project URL for archive storage operations |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key for archive upload/download verification |
| `DATABASE_URL` and `DIRECT_URL` | Database connectivity for workers and validation scripts |

## Compliance Validation Commands

Run from repository root:

```powershell
npm.cmd --prefix backend run test -- src/services/__tests__/candidateAnonymizationService.test.ts src/workers/__tests__/gdprAnonymizationWorker.test.ts src/services/__tests__/auditArchiveService.test.ts src/workers/__tests__/auditRetentionArchiveWorker.test.ts src/services/__tests__/auditPayloadPrivacyService.test.ts src/services/__tests__/auditLogQueryService.test.ts src/services/__tests__/auditLogExportService.test.ts
npm.cmd --prefix backend run test:integration -- src/routes/__tests__/audit-gdpr-privacy.integration.test.ts src/services/__tests__/auditArchiveService.integration.test.ts
npm.cmd --prefix backend run validate:gdpr-anonymization
npm.cmd --prefix backend run validate:audit-retention-archive
```

## Manual Rerun Procedures

### Daily anonymization rerun

1. Confirm pending or failed requests:

```sql
SELECT id, candidate_id, status, requested_at, due_at, failure_reason
FROM gdpr_erasure_requests
WHERE status IN ('pending', 'failed')
ORDER BY requested_at ASC;
```

2. Trigger a one-off worker cycle:

```powershell
npm.cmd --prefix backend exec tsx -e "import { runGdprAnonymizationCycle } from './src/workers/gdprAnonymizationWorker'; await runGdprAnonymizationCycle();"
```

3. Verify completion and overdue counts:

```sql
SELECT status, COUNT(*)
FROM gdpr_erasure_requests
GROUP BY status;
```

### Monthly archive rerun

1. Inspect current retention cutoff and backlog:

```sql
SELECT COUNT(*) AS eligible_rows
FROM audit_events
WHERE created_at < (NOW() AT TIME ZONE 'UTC') - INTERVAL '7 years';
```

2. Trigger one-off archive cycle:

```powershell
npm.cmd --prefix backend exec tsx -e "import { runAuditRetentionArchiveCycle } from './src/workers/auditRetentionArchiveWorker'; await runAuditRetentionArchiveCycle();"
```

3. Reconcile archive index output:

```sql
SELECT storage_path, row_count, checksum, archived_at
FROM audit_archive_index
ORDER BY archived_at DESC
LIMIT 20;
```

## Failure Triage

### Anonymization failures

Indicators:
- worker log message: `[GdprAnonymizationWorker] scheduled run failed`
- audit events: `gdpr_erasure_processing_failed`

Actions:
1. Query failed requests and review `failure_reason`.
2. Confirm candidate row and profile row exist for each failed request.
3. Resolve root cause (missing candidate, transient DB failure, schema drift).
4. Re-run daily cycle after fix.

### Archive failures

Indicators:
- worker log message: `[AuditRetentionArchiveWorker] monthly archive run failed`
- audit events: `compliance.audit_archive_run_failed`

Actions:
1. Verify Supabase credentials and bucket access.
2. Validate checksum path by rerunning `validate:audit-retention-archive` in non-production.
3. Check purge bypass migration is present (`app.audit_archive_purge` support in trigger function).
4. Re-run monthly archive cycle and reconcile `audit_archive_index` vs deleted source rows.

## Recovery and Safety Notes

- Do not mutate `audit_events` directly except controlled purge path used by archive service.
- Keep `AUDIT_ARCHIVE_CHUNK_SIZE <= AUDIT_ARCHIVE_BATCH_SIZE`.
- Run validation scripts only in non-production environments.
- Preserve supporting hiring records (`applications`, `screenings`, `interview_stages`, `decisions`) during anonymization; only candidate PII is redacted.
