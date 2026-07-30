# EP-DATA / US-004 Validation Evidence

Date: 2026-07-24
Environment: Supabase staging + local backend validation scripts
Validator: GitHub Copilot

## Migration command baseline

### npm run migrate:status

```text
> ai-interview-backend@0.1.0 migrate:status
> prisma migrate status

Environment variables loaded from .env
Prisma schema loaded from prisma\schema.prisma
Datasource "db": PostgreSQL database "postgres", schema "public" at "aws-1-ap-northeast-2.pooler.supabase.com:5432"

4 migrations found in prisma/migrations

Database schema is up to date!
```

### npm run migrate:diff (clean state)

```text
> ai-interview-backend@0.1.0 migrate:diff
> prisma migrate diff --from-schema-datamodel prisma/schema.prisma --to-schema-datasource prisma/schema.prisma --exit-code --script

-- This is an empty migration.
```

Result: PASS (no drift in clean state).

## Scenario 1 - Drift detection fails on induced drift

Validation method: add temporary `drift_test_col` to `applications`, run `npm run migrate:diff`, then cleanup.

```text
driftDetected=true
> ai-interview-backend@0.1.0 migrate:diff
> prisma migrate diff --from-schema-datamodel prisma/schema.prisma --to-schema-datasource prisma/schema.prisma --exit-code --script

-- AlterTable
ALTER TABLE "applications" ADD COLUMN     "drift_test_col" TEXT;
```

Result: PASS (drift detected via non-zero exit and explicit diff SQL).

## Scenario 2 - Development seed populates fixtures and is idempotent

```text
afterFirstRun= [{"entity":"users_fixture","count":5},{"entity":"candidates_fixture","count":3},{"entity":"requisitions_fixture","count":2},{"entity":"applications_fixture","count":3},{"entity":"screenings_fixture","count":2}]
afterSecondRun= [{"entity":"users_fixture","count":5},{"entity":"candidates_fixture","count":3},{"entity":"requisitions_fixture","count":2},{"entity":"applications_fixture","count":3},{"entity":"screenings_fixture","count":2}]
```

Result: PASS (fixture presence confirmed and counts unchanged on reseed).

## Scenario 3 - Nullable column rollback without data loss

```text
before= {"candidates":139166,"applications":139006,"auditEvents":1163}
after= {"candidates":139166,"applications":139006,"auditEvents":1163}
rowCountIntegrityPass=true
```

Result: PASS (row counts unchanged across rollback simulation).

## Scenario 4 - Zero-downtime migration probe

```text
Manual runtime validation required against deployed Railway URL.
Prepared command: BACKEND_URL=<railway-backend-url> npm run zero-downtime:test
```

Result: Probe tooling PASS (script ready). Runtime execution against a live Railway deployment remains an external operational step.

## Type safety and tests

```text
npm run type-check -> exit 0
npm test -> 9 test files, 50 tests passed
```

## Final status

US-004 implementation is complete with validated evidence for drift detection, seed idempotency, and rollback integrity. Zero-downtime validation script is implemented and ready for live deployment verification.
