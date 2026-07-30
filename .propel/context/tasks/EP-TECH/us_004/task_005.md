---
id: task_005
us_id: us_004
epic: EP-TECH
title: "Validate CI Timing, Secrets Masking, Failing Test Gate, npm Audit, and DoD Sign-off"
status: in-progress
layer: ci-cd
effort: 3h
priority: critical
created: 2026-07-22
---

# TASK-005 — Validate CI Timing, Secrets Masking, Failing Test Gate, npm Audit, and DoD Sign-off

## Context

**User Story**: US-004 — GitHub Actions CI/CD Pipeline with Quality Gates  
**Epic**: EP-TECH — Technical Bootstrap  
**Addresses Acceptance Criteria**: All five scenarios (final end-to-end acceptance gate)

This task is the acceptance gate for US-004. It executes one structured test per scenario, captures evidence for each, removes temporary artefacts, and closes the story. The EP-TECH epic cannot be marked complete until US-004 passes — it is the last technical bootstrap story.

---

## Objective

Execute scenario-level tests for all five acceptance criteria against the live GitHub Actions environment, record evidence, clean up test artefacts, update `us_004.md`, and confirm the complete CI/CD pipeline is operational.

---

## Validation Matrix

| Scenario | Criterion | Test Method | Pass Condition |
|----------|-----------|-------------|----------------|
| Scenario 1 | CI completes in < 5 minutes | Open PR, measure Actions wall-clock time | All jobs green, total ≤ 5 min |
| Scenario 2 | Failing test blocks merge | Introduce a failing Vitest test in a PR branch | Merge button disabled |
| Scenario 3 | CD deploys both services on `main` merge | Merge a test PR | Vercel + Railway deployed; commit status green |
| Scenario 4 | Secrets masked in all logs | Inspect log lines containing secret values | All secret values show `***` |
| Scenario 5 | HIGH CVE fails CI with PR comment | Install `node-uuid@1.4.7` (known HIGH CVE) | `Security Audit` job fails, PR comment lists package |

---

## Implementation Steps

### Step 1 — Scenario 1: CI wall-clock time

1. Open a test PR from a branch that touches both `frontend/` and `backend/` (one trivial change in each)
2. In the GitHub **Actions** tab, wait for all CI workflows to complete
3. Measure the elapsed time of each workflow run:
   - `Frontend CI` start to `Production Build` completion
   - `Backend CI` start to `Production Build` completion
   - `Security Audit` completion

Record the wall-clock time from the earliest job start to the latest job completion across both CI workflows. This is the effective CI gate time a developer waits before they can merge.

**Pass condition**: All three CI workflows complete within 5 minutes of the first job starting.

**If > 5 minutes, apply these optimisations**:

| Cause | Fix |
|-------|-----|
| `npm ci` slow | Confirm `cache: 'npm'` is set on every `setup-node` step |
| Vitest slow | Ensure `vitest run` (not `vitest watch`) is used in CI; set `pool: 'forks'` in `vitest.config.ts` |
| Type-check slow | Add `incremental: true` to `tsconfig.json` and cache `.tsbuildinfo` file |
| Build slow | Pre-download Prisma binaries: `npx prisma generate` before build step |

### Step 2 — Scenario 2: Failing test blocks merge

Create a branch with a deliberately failing test:

```bash
git checkout -b test/failing-test-gate
```

Add to `backend/src/middleware/__tests__/rateLimit.test.ts`:

```typescript
// GATE-TEST — remove after validation
it('INTENTIONAL FAILURE — verifies merge blocking', () => {
  expect(false).toBe(true);
});
```

Push the branch and open a PR to `main`.

Confirm in the GitHub PR checks:
- `Backend CI / Backend Unit Tests` → ❌ (red)
- `Backend CI / Production Build` → ⏭ Skipped (because test is a required predecessor)
- PR **Merge pull request** button → greyed out
- UI message: _"Required status checks have not passed for this branch"_

The failing step must name the test in the Actions log:

```
FAIL src/middleware/__tests__/rateLimit.test.ts > rateLimit > INTENTIONAL FAILURE
AssertionError: expected false to be true
```

Close the PR without merging and delete the branch:

```bash
git checkout main
git branch -D test/failing-test-gate
git push origin --delete test/failing-test-gate
```

### Step 3 — Scenario 3: CD deploys both services on `main` merge

Merge a clean PR to `main` (the test PR from Scenario 1 if it passed CI, or a fresh trivial change).

In the **Actions** tab, observe `CD Orchestrator`:
1. `gate-check` completes immediately
2. `deploy-frontend` and `deploy-backend` run in parallel (start timestamps differ by < 5 s)
3. Both deployment health checks pass
4. `deployment-summary` posts `success` commit status

On the GitHub commit page (`/commits/main`), confirm:
- `CD Orchestrator / Production Deploy` → ✅ (green checkmark)

In **Vercel Dashboard** → Deployments: exactly 1 new production deployment for this commit.  
In **Railway Dashboard** → Deployments: exactly 1 new production deployment for this commit.

**No duplicate deployments** in either platform.

### Step 4 — Scenario 4: Secrets never appear in workflow logs

Inspect the logs of a completed CD Orchestrator run:

1. In **Actions** → `CD Orchestrator` → `deploy-frontend` → `Deploy to Vercel (production)` step
2. Scan the log output for any occurrence of the actual Vercel token value
3. GitHub masks all `${{ secrets.* }}` values automatically — confirm `***` appears wherever the token would be

Repeat for:
- `deploy-backend` → `Deploy to Railway (production)` → `RAILWAY_TOKEN` environment variable
- `Frontend CI` → `Production Build` → `NEXT_PUBLIC_API_URL_PREVIEW`

Expected in every case: the actual value is replaced with `***`.

To generate a positive test (log line containing a secret):

```yaml
# Temporary step — add to any workflow, run once, then remove
- name: Secret mask test (REMOVE BEFORE MERGE)
  run: |
    echo "DB URL is ${{ secrets.RAILWAY_TOKEN }}"
    echo "JWT is ${{ secrets.VERCEL_TOKEN }}"
```

Expected log output:

```
DB URL is ***
JWT is ***
```

Remove this step before closing the story.

### Step 5 — Scenario 5: HIGH CVE fails CI with PR comment

Install a package with a known HIGH-severity CVE on a test branch. As of 2024, `lodash@4.17.20` has known CVEs. Use a safely isolated approach:

```bash
git checkout -b test/vuln-audit-gate

# Add a vulnerable package to backend only for testing
cd backend
npm install --save-dev lodash@4.17.20

git add package.json package-lock.json
git commit -m "test: install vulnerable lodash to verify audit gate [DO NOT MERGE]"
git push origin test/vuln-audit-gate
```

Open a PR to `main`. Confirm the `Security Audit / Backend npm Audit` job:
- Exits non-zero
- The PR receives a bot comment with the format:

  ```
  ## ⚠️ Backend Security Audit Failed
  HIGH or CRITICAL severity vulnerabilities found in backend/ dependencies.
  | Package | Severity | Fix Available |
  |---------|----------|---------------|
  | lodash  | HIGH     | Yes           |
  ```

If `lodash@4.17.20` does not have a HIGH CVE in npm audit at the time of testing, use the `security-audit` workflow's `--dry-run` mode or pick another known-vulnerable package from the npm audit advisory database.

Close the PR without merging. Revert the vulnerable package:

```bash
git checkout main
git branch -D test/vuln-audit-gate
git push origin --delete test/vuln-audit-gate
```

### Step 6 — Update `us_004.md` Definition of Done

```markdown
## Definition of Done

- [x] `.github/workflows/ci.yml` runs type-check, lint, tests in < 5 min
- [x] `.github/workflows/cd.yml` deploys frontend + backend on `main` merge
- [x] Branch protection rule requires CI to pass before merge
- [x] All secrets masked in workflow logs (verified manually)
- [x] Dependabot configured for weekly dependency updates
- [x] npm audit step added and tested with a known-vulnerable package
```

Update status:

```yaml
status: done
```

### Step 7 — Create validation evidence document

Create `.propel/context/tasks/EP-TECH/us_004/validation-evidence.md`:

```markdown
# US-004 Validation Evidence

## Date: YYYY-MM-DD
## Validator: <name>

| Scenario | Status | Evidence |
|----------|--------|----------|
| Scenario 1 — CI < 5 min | PASS | Frontend CI: 3m 12s; Backend CI: 3m 44s; Audit: 1m 58s |
| Scenario 2 — Failing test blocks merge | PASS | PR #XX: merge button greyed out; `INTENTIONAL FAILURE` in Actions log |
| Scenario 3 — CD deploys both on main merge | PASS | Vercel + Railway each show 1 deployment for commit abc1234 |
| Scenario 4 — Secrets masked | PASS | All 4 secrets inspected: `***` in all log lines |
| Scenario 5 — HIGH CVE fails audit | PASS | PR #YY: `lodash@4.17.20` listed in bot comment; `Security Audit` red |

## Workflow Files Committed
- `.github/workflows/frontend-ci.yml` (extended from US-001)
- `.github/workflows/backend-ci.yml` (extended from US-002)
- `.github/workflows/security-audit.yml` (new)
- `.github/workflows/cd-orchestrator.yml` (new)
- `.github/dependabot.yml` (new)
```

---

## Cleanup Checklist

| Artefact | Action |
|----------|--------|
| `test/failing-test-gate` branch | Deleted from remote (Step 2) |
| `test/vuln-audit-gate` branch | Deleted from remote (Step 5) |
| Secret mask verification step in any workflow | Removed (Step 4) |
| `lodash@4.17.20` in backend `package.json` | Removed with branch (Step 5) |

---

## Validation

| Check | Evidence Required | Owner |
|-------|------------------|-------|
| CI wall-clock ≤ 5 min | Actions run timestamps screenshot | Developer |
| Failing test disables merge button | PR screenshot showing greyed button | Developer |
| Both services deployed after `main` merge | Vercel + Railway deployment IDs | Developer |
| No duplicate deployments | Vercel + Railway dashboard screenshots | Developer |
| `***` masking in logs | 4 separate log line screenshots | Developer |
| HIGH CVE PR comment | PR comment screenshot with package table | Developer |

---

## Dependencies

- **TASK-001** through **TASK-004** must all be complete before this validation begins
- All GitHub Secrets configured (from US-001, US-002, US-003, and US-004)
- Both Vercel and Railway deployments must be live from previous stories
- Dependabot must be enabled in repository settings

## Security Constraints

- **OWASP A06**: `lodash@4.17.20` must be removed from `backend/package.json` immediately after the test — do not leave a vulnerable package in any branch that could be accidentally merged.
- Secret verification steps added to workflows for Scenario 4 testing must be removed before closing the story. Leaving them creates unnecessary secret exposure in future run logs.

---

## Definition of Done

- [ ] Scenario 1 validated — CI wall-clock ≤ 5 min (evidence logged)
- [ ] Scenario 2 validated — failing test disables merge button (screenshot captured)
- [ ] Scenario 3 validated — both services deployed on `main` merge, no duplicates (evidence logged)
- [ ] Scenario 4 validated — all secrets appear as `***` in 4 inspected log lines (evidence logged)
- [ ] Scenario 5 validated — HIGH CVE fails `security-audit` job; PR comment lists package (evidence logged)
- [ ] All test branches deleted from remote
- [ ] Secret verification workflow steps removed
- [ ] `us_004.md` all Definition of Done checkboxes ticked
- [ ] `us_004.md` `status` updated to `done`
- [ ] `validation-evidence.md` created and committed
- [ ] EP-TECH epic acceptance criteria reviewed — all 5 stories marked `done`

## Traceability

| Artefact | ID |
|----------|----|
| User Story | US-004 |
| Epic | EP-TECH |
| NFR | NFR-004 (dependency scanning), NFR-006 (test gate in CI), NFR-007 (CI/CD observability) |
| Scenario | 1, 2, 3, 4, 5 (all acceptance criteria) |
