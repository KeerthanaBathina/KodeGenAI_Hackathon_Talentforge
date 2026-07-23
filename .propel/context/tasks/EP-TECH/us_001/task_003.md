---
id: task_003
us_id: us_001
epic: EP-TECH
title: "Create GitHub Actions CI Workflow for TypeScript Build Gating"
status: done
layer: ci-cd
effort: 3h
priority: critical
created: 2026-07-22
---

# TASK-003 — Create GitHub Actions CI Workflow for TypeScript Build Gating

## Context

**User Story**: US-001 — Deploy Frontend to Vercel with CDN and Preview Environments  
**Epic**: EP-TECH — Technical Bootstrap  
**Addresses Acceptance Criteria**: Scenario 3 (build failure blocks deployment — TypeScript compile error prevents merge)

This task creates the GitHub Actions CI workflow that enforces code quality gates on every pull request. A TypeScript compile error or lint failure must cause the workflow to exit non-zero, which GitHub then uses to disable the PR merge button via branch protection rules.

---

## Objective

Create `.github/workflows/frontend-ci.yml` that runs type-checking, ESLint, and a production build on every PR targeting `main`. Configure branch protection rules so the CI check is required before merge.

---

## Technical Specifications

| Attribute | Value |
|-----------|-------|
| Trigger | `pull_request` (target: `main`), `push` (branch: `main`) |
| Runner | `ubuntu-latest` |
| Node.js Version | 20.x |
| Cache Strategy | npm cache keyed on `package-lock.json` hash |
| Jobs | `type-check`, `lint`, `build` (sequential) |
| Required Status Check | `Frontend CI / build` |

---

## Implementation Steps

### Step 1 — Create the CI workflow file

Create `.github/workflows/frontend-ci.yml`:

```yaml
name: Frontend CI

on:
  push:
    branches:
      - main
    paths:
      - 'frontend/**'
      - '.github/workflows/frontend-ci.yml'
  pull_request:
    branches:
      - main
    paths:
      - 'frontend/**'
      - '.github/workflows/frontend-ci.yml'

defaults:
  run:
    working-directory: frontend

jobs:
  type-check:
    name: TypeScript Type Check
    runs-on: ubuntu-latest
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

      - name: Run TypeScript type check
        run: npm run type-check

  lint:
    name: ESLint
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
          cache-dependency-path: frontend/package-lock.json

      - name: Install dependencies
        run: npm ci

      - name: Run ESLint
        run: npm run lint

  build:
    name: Production Build
    runs-on: ubuntu-latest
    needs: [type-check, lint]
    env:
      NEXT_PUBLIC_API_URL: ${{ secrets.NEXT_PUBLIC_API_URL_PREVIEW }}
      NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.NEXT_PUBLIC_SUPABASE_URL }}
      NEXT_PUBLIC_SUPABASE_ANON_KEY: ${{ secrets.NEXT_PUBLIC_SUPABASE_ANON_KEY }}
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

      - name: Build Next.js application
        run: npm run build

      - name: Upload build artefact (for cache reuse in CD)
        uses: actions/upload-artifact@v4
        with:
          name: nextjs-build-${{ github.sha }}
          path: frontend/.next/
          retention-days: 1
```

### Step 2 — Add required GitHub Secrets for CI build

In **GitHub → Repository → Settings → Secrets and Variables → Actions**, create:

| Secret Name | Value | Purpose |
|-------------|-------|---------|
| `NEXT_PUBLIC_API_URL_PREVIEW` | staging API URL | Satisfies `NEXT_PUBLIC_API_URL` during CI build |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | Required for build compilation |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key | Required for build compilation |

> **Security note**: These are `NEXT_PUBLIC_*` variables (browser-safe). They do not grant server-side access and are safe to store as GitHub Actions secrets. Never store private Supabase `service_role` key as a `NEXT_PUBLIC_*` secret.

### Step 3 — Configure branch protection rules

In **GitHub → Repository → Settings → Branches → Add branch protection rule** for `main`:

- [x] **Require a pull request before merging**
- [x] **Require status checks to pass before merging**
  - Add required check: `Frontend CI / TypeScript Type Check`
  - Add required check: `Frontend CI / ESLint`
  - Add required check: `Frontend CI / Production Build`
- [x] **Require branches to be up to date before merging**
- [x] **Do not allow bypassing the above settings**
- [x] **Restrict who can push to matching branches** → Only repository administrators

### Step 4 — Verify failure behaviour

Create a test branch with a deliberate TypeScript error:

```typescript
// frontend/src/app/page.tsx — temporary test only, revert after verification
const x: number = "this is a string";  // TS2322 intentional error
```

Push branch and open a PR. Verify:
1. `Frontend CI / TypeScript Type Check` job fails
2. `Frontend CI / Production Build` is skipped (dependency chain)
3. PR merge button is greyed out with "Required status checks have not passed"

Revert the change and confirm the CI passes on the PR update.

---

## Validation

| Check | Method | Expected Result |
|-------|--------|-----------------|
| CI triggers on PR to `main` | Open a test PR | Workflow appears in PR checks |
| Type error blocks merge | Introduce TS error, open PR | Merge button disabled |
| Clean build passes | Revert error, PR updates | All 3 check marks green |
| Build artefact uploaded | Check Actions → Artefacts | `nextjs-build-<sha>` present |
| Paths filter works | PR with only backend changes | Workflow does not trigger |

---

## Dependencies

- **TASK-001** must be complete (`type-check` and `lint` scripts must exist in `package.json`)
- **TASK-002** must be complete (`NEXT_PUBLIC_API_URL` contract must be defined)
- GitHub repository must have Actions enabled
- GitHub Secrets must be configured (Step 2 above)

## Security Constraints

- **OWASP A09 (Security Logging and Monitoring Failures)**: The `paths` filter ensures the workflow only runs when frontend code changes, reducing unnecessary secret exposure in unrelated workflow runs.
- **OWASP A05 (Security Misconfiguration)**: Branch protection rules prevent direct pushes to `main`, ensuring all code is reviewed and CI-gated.
- Secrets are scoped to Actions only; no `NEXT_PUBLIC_*` value in workflow YAML source.

---

## Definition of Done

- [ ] `.github/workflows/frontend-ci.yml` committed to repository
- [ ] CI triggers automatically on PR opened targeting `main`
- [ ] `type-check` job fails when TypeScript error is introduced
- [ ] `build` job skipped when `type-check` fails (chain dependency enforced)
- [ ] Branch protection requires all 3 CI checks to pass
- [ ] PR merge button disabled when CI fails (verified manually)
- [ ] Build artefact uploaded for SHA-tagged reuse in CD pipeline

## Traceability

| Artefact | ID |
|----------|----|
| User Story | US-001 |
| Epic | EP-TECH |
| NFR | NFR-002 (CI/CD reliability) |
| Scenario | 3 (build failure blocks deployment) |
