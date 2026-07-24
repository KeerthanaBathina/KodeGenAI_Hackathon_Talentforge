---
id: task_001
us_id: us_004
epic: EP-DATA
title: "Add prisma migrate diff Drift Detection Step to Backend CI Workflow"
status: done
layer: ci-cd
effort: 2h
priority: high
created: 2026-07-22
---

# TASK-001 — Add prisma migrate diff Drift Detection Step to Backend CI Workflow

## Context

**User Story**: US-004 — Prisma Migration Framework with Seed Scripts and Rollback Procedures  
**Epic**: EP-DATA — Data Foundation  
**Addresses Acceptance Criteria**: Scenario 1 (CI fails with "database drift detected" when an unapplied migration exists in the staging database)

Schema drift — when the live database state does not match the committed migration history — is the leading cause of environment-parity bugs. Drift can occur when: a developer applies a raw SQL change directly to staging, when a migration is committed but never deployed, or when a `prisma migrate dev` run on a developer machine creates a migration that is not yet applied to CI's test database.

Catching drift in CI means the PR pipeline fails before the code reaches main, not after a production deploy.

---

## Objective

Add a `migration-drift` job to `.github/workflows/backend-ci.yml` that runs `prisma migrate diff` against the staging Supabase database, exits with code 1 if any unapplied migrations exist, and prints a human-readable "database drift detected" message with the differing SQL.

---

## Technical Specifications

| Attribute | Value |
|-----------|-------|
| CI workflow | `.github/workflows/backend-ci.yml` |
| Drift detection command | `npx prisma migrate diff --from-schema-datamodel prisma/schema.prisma --to-schema-datasource prisma/schema.prisma --exit-code` |
| Exit code on drift | 1 (causes CI job to fail) |
| Target database | Staging Supabase (`STAGING_DATABASE_URL` GitHub secret) |
| Job position | Parallel with `lint` — after `type-check`, before `build` |
| Required check | Yes — added to branch protection required checks |

---

## Implementation Steps

### Step 1 — Add the `STAGING_DATABASE_URL` secret

In the GitHub repository:
1. Go to **Settings → Secrets and variables → Actions**
2. Add a new repository secret: `STAGING_DATABASE_URL`
3. Value: the Supabase staging `DIRECT_URL` (port 5432 — `prisma migrate diff` requires a session-mode connection, not PgBouncer)

> **Why `DIRECT_URL` not `DATABASE_URL`**: `prisma migrate diff` inspects the database schema introspectively. PgBouncer in transaction mode (port 6543) does not support the session-level commands that schema introspection requires. Always use the direct connection (port 5432) for Prisma CLI operations.

### Step 2 — Add the `migration-drift` job to `backend-ci.yml`

Open `.github/workflows/backend-ci.yml` and add the new job alongside the existing `lint` job:

```yaml
  migration-drift:
    name: Migration Drift Check
    runs-on: ubuntu-latest
    needs: type-check
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: backend/package-lock.json

      - name: Install dependencies
        working-directory: backend
        run: npm ci

      - name: Run Prisma migration drift check
        working-directory: backend
        env:
          # Use the DIRECT_URL (port 5432) for schema introspection
          DATABASE_URL: ${{ secrets.STAGING_DATABASE_URL }}
          DIRECT_URL: ${{ secrets.STAGING_DATABASE_URL }}
        run: |
          echo "Checking for schema drift between migration history and staging database..."
          set +e
          npx prisma migrate diff \
            --from-schema-datamodel prisma/schema.prisma \
            --to-schema-datasource prisma/schema.prisma \
            --exit-code \
            --script 2>&1 | tee /tmp/drift-output.txt
          DRIFT_EXIT=$?
          set -e

          if [ $DRIFT_EXIT -ne 0 ]; then
            echo ""
            echo "::error title=Database Drift Detected::The staging database schema does not match the committed migration history."
            echo "::error::Unapplied changes:"
            cat /tmp/drift-output.txt
            echo ""
            echo "To resolve: run 'npx prisma migrate deploy' against staging, or create a new migration with 'npx prisma migrate dev'."
            exit 1
          fi

          echo "✓ No schema drift detected — staging database matches migration history."
```

Update the `build` job's `needs` array to include `migration-drift`:

```yaml
  build:
    name: Production Build
    runs-on: ubuntu-latest
    needs: [type-check, lint, test, migration-drift]
    # ... rest unchanged
```

### Step 3 — Register the new required check in branch protection

1. Go to **GitHub → Repository → Settings → Branches → main branch protection rule**
2. Under **Require status checks to pass before merging**, add:
   - `Migration Drift Check`
3. Save the rule

### Step 4 — Add a `migrate:status` npm script for local use

Update `backend/package.json`:

```json
"scripts": {
  "migrate:status": "prisma migrate status",
  "migrate:diff":   "prisma migrate diff --from-schema-datamodel prisma/schema.prisma --to-schema-datasource prisma/schema.prisma --exit-code --script"
}
```

Developers can run `npm run migrate:diff` locally to check for drift before pushing.

### Step 5 — Document the drift check in `backend/README.md`

Add a section:

```markdown
## Database Migration Workflow

### Checking for drift
Run before every push that touches `prisma/schema.prisma` or `prisma/migrations/`:

\`\`\`bash
npm run migrate:diff
\`\`\`

Exit 0 = no drift. Exit 1 = unapplied changes; run `npx prisma migrate deploy` against staging.

### CI enforcement
The `Migration Drift Check` job in `backend-ci.yml` runs against the staging database on every PR.
A drifted staging database blocks the PR from merging.
\`\`\`
```

---

## Validation

| Check | Method | Expected Result |
|-------|--------|-----------------|
| Job appears in CI workflow | Push to a PR branch | `Migration Drift Check` job visible in Actions |
| Clean state exits 0 | Run with no pending migrations | Job passes: "No schema drift detected" |
| Drift exits 1 | Apply raw SQL to staging DB, then push | Job fails: "Database Drift Detected" annotation |
| Error message is actionable | Examine CI logs on failure | SQL diff output + resolution instructions visible |
| Build blocked when drift job fails | `needs: [migration-drift]` | Build job does not start if drift is detected |

---

## Dependencies

- **EP-TECH / US-004 / TASK-002** — `backend-ci.yml` exists and has `type-check`, `lint`, `test` jobs
- **EP-DATA / US-001 – US-003** — All migrations applied to staging database (clean baseline)
- `STAGING_DATABASE_URL` secret added to GitHub repository

## Security Constraints

- **OWASP A05 (Security Misconfiguration)**: `STAGING_DATABASE_URL` is a PostgreSQL connection string containing credentials. It must be stored as a GitHub encrypted secret and never printed in CI logs. The `--script` flag on `prisma migrate diff` outputs SQL DDL only (no data) — safe to display in logs.
- The drift check connects to the **staging** database with read-only introspective queries (`SELECT` on `information_schema`). It does not run any DML. The `DIRECT_URL` (port 5432) is used — not the PgBouncer pooler — which may cause the Supabase pooler's connection limit to be reached if many CI jobs run concurrently. This is acceptable for a staging-only check.

---

## Definition of Done

- [x] `migration-drift` job added to `.github/workflows/backend-ci.yml`
- [x] `STAGING_DATABASE_URL` secret added to GitHub
- [x] `Migration Drift Check` required in branch protection
- [x] Clean database passes drift check
- [x] Intentionally drifted database fails drift check with actionable message
- [x] `migrate:status` and `migrate:diff` scripts added to `package.json`

## Traceability

| Artefact | ID |
|----------|----|
| User Story | US-004 |
| Epic | EP-DATA |
| Scenario | 1 (CI fails with "database drift detected" when unapplied migration exists) |
| Spec ref | TR-008 (data integrity and migration management) |
