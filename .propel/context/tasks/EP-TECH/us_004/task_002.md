---
id: task_002
us_id: us_004
epic: EP-TECH
title: "Extend CI Workflows with Unit Test Jobs and npm Audit Security Scan"
status: not-started
layer: ci-cd
effort: 4h
priority: critical
created: 2026-07-22
---

# TASK-002 — Extend CI Workflows with Unit Test Jobs and npm Audit Security Scan

## Context

**User Story**: US-004 — GitHub Actions CI/CD Pipeline with Quality Gates  
**Epic**: EP-TECH — Technical Bootstrap  
**Addresses Acceptance Criteria**: Scenario 1 (CI < 5 min including unit tests), Scenario 2 (failing test blocks merge), Scenario 4 (secrets masked in logs), Scenario 5 (HIGH CVE fails CI with PR comment)

US-001 created `frontend-ci.yml` (type-check → lint → build) and US-002 created `backend-ci.yml` (type-check → lint → build). This task extends both with a parallel `test` job and a shared `security-audit` job, adds a unified orchestrating `ci.yml` status-check for branch protection, and verifies that GitHub Actions automatically masks secrets stored in repository secrets.

---

## Objective

1. Add a `test` job to both `frontend-ci.yml` and `backend-ci.yml` that runs `npm test` in parallel with `lint`.
2. Create `.github/workflows/security-audit.yml` that runs `npm audit --audit-level=high` on both packages and posts a PR comment listing affected packages on failure.
3. Update branch protection to require the `test` and `security-audit` checks.
4. Confirm that `DATABASE_URL` and `JWT_SECRET` values stored as GitHub Secrets appear as `***` in all log lines.

---

## Technical Specifications

| Attribute | Value |
|-----------|-------|
| Test command | `npm test` (Vitest run — non-watch) |
| Audit level | `HIGH` — `npm audit --audit-level=high` |
| PR comment on audit fail | Lists package name, severity, CVE ID, and fix version |
| Target CI wall-clock | < 5 minutes end-to-end (type-check + lint + test run in parallel; build sequential) |
| Secret masking | GitHub Actions native — values stored in repository secrets are auto-masked |

---

## Implementation Steps

### Step 1 — Add `test` job to `frontend-ci.yml`

Open `.github/workflows/frontend-ci.yml` and add a parallel `test` job alongside `lint`:

```yaml
  test:
    name: Frontend Unit Tests
    runs-on: ubuntu-latest
    needs: type-check          # Run after type-check, parallel with lint
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: frontend/package-lock.json

      - name: Install dependencies
        run: npm ci

      - name: Run unit tests
        run: npm test

  build:
    name: Production Build
    runs-on: ubuntu-latest
    needs: [type-check, lint, test]      # Build only after all gates pass
    # ... existing build steps unchanged ...
```

Updated job dependency graph for `frontend-ci.yml`:

```
type-check
    ├── lint      (parallel)
    ├── test      (parallel)
    └── build     (sequential — waits for lint AND test)
```

### Step 2 — Add `test` job to `backend-ci.yml`

Open `.github/workflows/backend-ci.yml` and apply the same pattern:

```yaml
  test:
    name: Backend Unit Tests
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
        run: npm ci

      - name: Run unit tests
        run: npm test

  build:
    name: Production Build
    runs-on: ubuntu-latest
    needs: [type-check, lint, test]
    # ... existing build steps unchanged ...
```

### Step 3 — Create the security audit workflow

Create `.github/workflows/security-audit.yml`:

```yaml
name: Security Audit

on:
  pull_request:
    branches:
      - main
    paths:
      - 'frontend/package-lock.json'
      - 'backend/package-lock.json'
      - '.github/workflows/security-audit.yml'
  schedule:
    # Run every Monday at 08:00 UTC (in addition to PRs that touch lock files)
    - cron: '0 8 * * 1'

jobs:
  audit-frontend:
    name: Frontend npm Audit
    runs-on: ubuntu-latest
    permissions:
      pull-requests: write
      contents: read
    defaults:
      run:
        working-directory: frontend
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: frontend/package-lock.json

      - name: Install dependencies
        run: npm ci

      - name: Run npm audit (HIGH+)
        id: audit
        run: |
          set +e
          npm audit --audit-level=high --json > /tmp/audit-frontend.json 2>&1
          AUDIT_EXIT=$?
          set -e
          echo "exit_code=${AUDIT_EXIT}" >> $GITHUB_OUTPUT

          if [ "${AUDIT_EXIT}" != "0" ]; then
            echo "audit_failed=true" >> $GITHUB_OUTPUT
            # Extract a human-readable summary
            SUMMARY=$(node -e "
              const data = require('/tmp/audit-frontend.json');
              const vulns = Object.values(data.vulnerabilities || {})
                .filter(v => ['high','critical'].includes(v.severity))
                .map(v => \`| \${v.name} | \${v.severity.toUpperCase()} | \${v.fixAvailable ? 'Yes' : 'No'} |\`)
                .join('\n');
              console.log(vulns || 'No details available');
            ")
            echo "summary<<EOF" >> $GITHUB_OUTPUT
            echo "${SUMMARY}" >> $GITHUB_OUTPUT
            echo "EOF" >> $GITHUB_OUTPUT
          else
            echo "audit_failed=false" >> $GITHUB_OUTPUT
          fi

      - name: Post audit failure as PR comment
        if: steps.audit.outputs.audit_failed == 'true' && github.event_name == 'pull_request'
        uses: actions/github-script@v7
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          script: |
            const summary = `${{ steps.audit.outputs.summary }}`;
            const body = [
              '## ⚠️ Frontend Security Audit Failed',
              '',
              'HIGH or CRITICAL severity vulnerabilities found in `frontend/` dependencies.',
              '',
              '| Package | Severity | Fix Available |',
              '|---------|----------|---------------|',
              summary,
              '',
              'Run `cd frontend && npm audit fix` to auto-remediate patchable vulnerabilities.',
              'For breaking changes, review the audit output and update manually.',
            ].join('\n');

            const { data: comments } = await github.rest.issues.listComments({
              owner: context.repo.owner,
              repo: context.repo.repo,
              issue_number: context.payload.pull_request.number,
            });
            const existing = comments.find(c =>
              c.user.login === 'github-actions[bot]' &&
              c.body.includes('Frontend Security Audit')
            );
            if (existing) {
              await github.rest.issues.updateComment({
                owner: context.repo.owner,
                repo: context.repo.repo,
                comment_id: existing.id,
                body,
              });
            } else {
              await github.rest.issues.createComment({
                owner: context.repo.owner,
                repo: context.repo.repo,
                issue_number: context.payload.pull_request.number,
                body,
              });
            }

      - name: Fail job if audit found HIGH+ vulnerabilities
        if: steps.audit.outputs.audit_failed == 'true'
        run: |
          echo "❌ npm audit found HIGH or CRITICAL vulnerabilities in frontend/."
          exit 1

  audit-backend:
    name: Backend npm Audit
    runs-on: ubuntu-latest
    permissions:
      pull-requests: write
      contents: read
    defaults:
      run:
        working-directory: backend
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
        run: npm ci

      - name: Run npm audit (HIGH+)
        id: audit
        run: |
          set +e
          npm audit --audit-level=high --json > /tmp/audit-backend.json 2>&1
          AUDIT_EXIT=$?
          set -e
          echo "exit_code=${AUDIT_EXIT}" >> $GITHUB_OUTPUT

          if [ "${AUDIT_EXIT}" != "0" ]; then
            echo "audit_failed=true" >> $GITHUB_OUTPUT
            SUMMARY=$(node -e "
              const data = require('/tmp/audit-backend.json');
              const vulns = Object.values(data.vulnerabilities || {})
                .filter(v => ['high','critical'].includes(v.severity))
                .map(v => \`| \${v.name} | \${v.severity.toUpperCase()} | \${v.fixAvailable ? 'Yes' : 'No'} |\`)
                .join('\n');
              console.log(vulns || 'No details available');
            ")
            echo "summary<<EOF" >> $GITHUB_OUTPUT
            echo "${SUMMARY}" >> $GITHUB_OUTPUT
            echo "EOF" >> $GITHUB_OUTPUT
          else
            echo "audit_failed=false" >> $GITHUB_OUTPUT
          fi

      - name: Post audit failure as PR comment
        if: steps.audit.outputs.audit_failed == 'true' && github.event_name == 'pull_request'
        uses: actions/github-script@v7
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          script: |
            const summary = `${{ steps.audit.outputs.summary }}`;
            const body = [
              '## ⚠️ Backend Security Audit Failed',
              '',
              'HIGH or CRITICAL severity vulnerabilities found in `backend/` dependencies.',
              '',
              '| Package | Severity | Fix Available |',
              '|---------|----------|---------------|',
              summary,
              '',
              'Run `cd backend && npm audit fix` to auto-remediate patchable vulnerabilities.',
            ].join('\n');

            const { data: comments } = await github.rest.issues.listComments({
              owner: context.repo.owner,
              repo: context.repo.repo,
              issue_number: context.payload.pull_request.number,
            });
            const existing = comments.find(c =>
              c.user.login === 'github-actions[bot]' &&
              c.body.includes('Backend Security Audit')
            );
            if (existing) {
              await github.rest.issues.updateComment({
                owner: context.repo.owner,
                repo: context.repo.repo,
                comment_id: existing.id,
                body,
              });
            } else {
              await github.rest.issues.createComment({
                owner: context.repo.owner,
                repo: context.repo.repo,
                issue_number: context.payload.pull_request.number,
                body,
              });
            }

      - name: Fail job if audit found HIGH+ vulnerabilities
        if: steps.audit.outputs.audit_failed == 'true'
        run: |
          echo "❌ npm audit found HIGH or CRITICAL vulnerabilities in backend/."
          exit 1
```

### Step 4 — Update branch protection rules

In **GitHub → Repository → Settings → Branches → `main`**, add the new required checks:

**Frontend CI additions:**
- `Frontend CI / Frontend Unit Tests`

**Backend CI additions:**
- `Backend CI / Backend Unit Tests`

**New audit checks:**
- `Security Audit / Frontend npm Audit`
- `Security Audit / Backend npm Audit`

### Step 5 — Verify CI wall-clock time

After pushing the updated workflows, open a test PR and observe the Actions timeline.

Target parallel execution:

```
t=0s   type-check starts (frontend + backend, 2 separate runners)
t=30s  type-check completes
t=30s  lint starts (parallel)
t=30s  test starts (parallel, same tier as lint)
t=90s  lint completes
t=120s test completes
t=120s build starts
t=210s build completes (total: ~3m 30s well within 5 min)
```

If the total exceeds 5 minutes, apply the following optimisations:
- Enable `cache: 'npm'` on all `setup-node` steps (already present in templates)
- Cache the Prisma client generation: `npx prisma generate` output is deterministic
- Run frontend and backend CI jobs on independent runners (already the case — separate workflows)

### Step 6 — Verify secret masking (Scenario 4)

GitHub Actions automatically masks any value stored as a repository secret in all log output. To verify:

1. Open any completed CI workflow run in the Actions tab
2. Click on a step that uses `${{ secrets.NEXT_PUBLIC_API_URL_PREVIEW }}` or `${{ secrets.VERCEL_TOKEN }}`
3. Confirm the value appears as `***` in the log output

To trigger a log line containing a secret value (safe for verification):

```yaml
# Add to a test workflow step — DELETE after verification
- name: Secret mask verification (remove after test)
  run: echo "Token is ${{ secrets.VERCEL_TOKEN }}"
```

Expected log output: `Token is ***`

Delete the verification step before merging.

---

## Validation

| Check | Method | Expected Result |
|-------|--------|-----------------|
| Frontend `test` job added to CI | PR with frontend change | `Frontend Unit Tests` job appears |
| Backend `test` job added to CI | PR with backend change | `Backend Unit Tests` job appears |
| Failing test blocks merge | Introduce a failing test, open PR | Merge button disabled |
| `test` job runs in parallel with `lint` | CI timeline in Actions | Both jobs start within 5 s of each other |
| Total CI time | Actions run wall-clock | < 5 minutes |
| `security-audit.yml` triggers on lock file PR | PR with `package-lock.json` change | Both audit jobs appear in checks |
| Audit fails on HIGH CVE | Install vulnerable package, PR | Job fails, PR comment lists package |
| Audit PR comment identifies package | Inspect PR comment | Package name, severity, CVE listed |
| Secrets masked in logs | Inspect workflow logs | `***` for all secret values |
| Branch protection updated | GitHub Settings → Branches | New checks listed as required |

---

## Dependencies

- **TASK-001** must be complete (`npm test` command must exist and pass in both packages)
- **US-001 / TASK-003** must be complete (`frontend-ci.yml` must exist to extend)
- **US-002 / TASK-004** must be complete (`backend-ci.yml` must exist to extend)

## Security Constraints

- **OWASP A09 (Security Logging and Monitoring Failures)**: GitHub Actions secrets are auto-masked — no additional configuration needed, but the masking must be verified manually (Step 6).
- **OWASP A06 (Vulnerable and Outdated Components)**: `npm audit --audit-level=high` fails the build on HIGH and CRITICAL CVEs; MEDIUM and LOW are informational only to avoid excessive noise.
- The audit workflow triggers on `schedule` (weekly Monday) in addition to PRs touching lock files, ensuring transient vulnerability discoveries are caught even between dependency updates.
- `set +e` before `npm audit` is necessary because `npm audit` exits non-zero on finding vulnerabilities — without it, the step would fail before `$GITHUB_OUTPUT` could be written.

---

## Definition of Done

- [ ] `test` job added to `frontend-ci.yml` — runs parallel to `lint`
- [ ] `test` job added to `backend-ci.yml` — runs parallel to `lint`
- [ ] `build` job in both workflows updated to `needs: [type-check, lint, test]`
- [ ] `.github/workflows/security-audit.yml` committed with both `audit-frontend` and `audit-backend` jobs
- [ ] Branch protection updated with `Frontend Unit Tests`, `Backend Unit Tests`, and both audit checks
- [ ] CI wall-clock time < 5 minutes confirmed in Actions timeline (screenshot)
- [ ] Failing unit test confirmed to disable PR merge button
- [ ] PR comment with vulnerable package details confirmed (tested with a known-CVE package)
- [ ] Secrets appear as `***` in all workflow logs (manually verified)

## Traceability

| Artefact | ID |
|----------|----|
| User Story | US-004 |
| Epic | EP-TECH |
| NFR | NFR-004 (dependency scanning), NFR-006 (test coverage gate in CI) |
| Scenario | 1 (CI < 5 min), 2 (failing test blocks merge), 4 (secrets masked), 5 (HIGH CVE fails audit) |
