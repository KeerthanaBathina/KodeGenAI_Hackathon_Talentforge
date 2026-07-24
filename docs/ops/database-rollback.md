# Database Migration Rollback Runbook

Version: 1.0
Date: 2026-07-24
Owner: Platform Engineering

## Overview

Prisma migrations are forward-only. There is no built-in rollback command.

Rollback must be executed as one of:
1. Forward rollback migration (preferred)
2. Database restore from backup snapshot (last resort)

Use a forward rollback migration whenever possible to avoid data loss.

## Rollback Safety Matrix

| Change Type | Rollback Safety | Notes |
| --- | --- | --- |
| Add nullable column | Safe | Drop column removes schema artifact, row integrity preserved |
| Add NOT NULL column with default | Usually safe | Verify no app dependency first |
| Add index | Safe | Prefer non-blocking index DDL |
| Drop column | Destructive | Requires backup restore if data is needed |
| Rename column | Risky | Requires two-phase app/schema transition |
| Type conversion | Risky | Requires pre-validation and backup |

## Pre-Rollback Checklist

- Confirm rollback validated on staging
- Capture database snapshot
- Confirm app rollback version is available
- Confirm migration impact classification
- Coordinate with on-call for production actions

## Procedure: Nullable Column Rollback

Example: rollback of candidates.candidate_source (nullable VARCHAR)

1. Create rollback migration shell.

```bash
cd backend
npx prisma migrate dev --create-only --name rollback_add_candidate_source
```

2. Add rollback SQL.

```sql
ALTER TABLE candidates DROP COLUMN IF EXISTS candidate_source;
```

3. Remove field from Prisma schema.

4. Verify no drift.

```bash
npm run migrate:diff
```

5. Apply in staging.

```bash
npx prisma migrate deploy
```

6. Verify row integrity.

```bash
npm run rollback:pre
# apply rollback migration
npm run rollback:post
```

7. Promote through normal deployment flow.

## Emergency Restore Path

Use only when forward rollback cannot preserve critical data.

1. Restore from Supabase backup snapshot.
2. Run prisma migrate status after restore.
3. Re-deploy matching app version.

## Related Assets

- Drift detection CI: [.github/workflows/backend-ci.yml](.github/workflows/backend-ci.yml)
- Zero downtime guidance: [docs/ops/two-phase-deploy.md](docs/ops/two-phase-deploy.md)
- Rollback verifier: [backend/scripts/verify-rollback.ts](backend/scripts/verify-rollback.ts)
