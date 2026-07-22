---
id: task_004
us_id: us_001
epic: EP-TECH
title: "Create GitHub Actions CD Workflow for Vercel Production Deployment and PR Preview URLs"
status: not-started
layer: ci-cd
effort: 4h
priority: critical
created: 2026-07-22
---

# TASK-004 — Create GitHub Actions CD Workflow for Vercel Production Deployment and PR Preview URLs

## Context

**User Story**: US-001 — Deploy Frontend to Vercel with CDN and Preview Environments  
**Epic**: EP-TECH — Technical Bootstrap  
**Addresses Acceptance Criteria**: Scenario 1 (production deployment completes within 3 min on `main` merge), Scenario 2 (unique preview URL posted as PR comment within 5 min)

This task creates the GitHub Actions CD workflow that:
1. Deploys to Vercel production whenever code is merged to `main`.
2. Creates a Vercel preview deployment for every PR and posts the URL as a PR comment.

---

## Objective

Create `.github/workflows/frontend-cd.yml` using the official `amondnet/vercel-action` (or Vercel CLI) to drive production and preview deployments, then post the preview URL back to the PR thread for stakeholder review.

---

## Technical Specifications

| Attribute | Value |
|-----------|-------|
| Trigger (production) | `push` to `main` |
| Trigger (preview) | `pull_request` — types: `opened`, `synchronize`, `reopened` |
| Runner | `ubuntu-latest` |
| Deployment Tool | Vercel CLI (`vercel@latest`) |
| Max deployment time | 3 min (production), 5 min (preview) — enforced via `timeout-minutes` |
| Required Secrets | `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` |
| PR Comment | Posted by `github-script` action using `GITHUB_TOKEN` |

---

## Implementation Steps

### Step 1 — Obtain Vercel credentials

Run in a local terminal (after completing TASK-002):

```bash
cd frontend
vercel whoami          # confirm logged in
vercel env ls          # confirm env vars are configured
```

In **Vercel Dashboard → Account Settings → Tokens**, create a token named `github-actions-cd` with full access.

In **GitHub → Repository → Settings → Secrets and Variables → Actions**, add:

| Secret Name | Source | Purpose |
|-------------|--------|---------|
| `VERCEL_TOKEN` | Vercel Account Settings → Tokens | Authenticate CLI |
| `VERCEL_ORG_ID` | `frontend/.vercel/project.json` → `orgId` | Target team/org |
| `VERCEL_PROJECT_ID` | `frontend/.vercel/project.json` → `projectId` | Target project |

> **Security**: The `VERCEL_TOKEN` grants deployment access. Rotate every 90 days. Store only in GitHub Actions secrets — never in workflow YAML or committed files.

### Step 2 — Create the CD workflow file

Create `.github/workflows/frontend-cd.yml`:

```yaml
name: Frontend CD

on:
  push:
    branches:
      - main
    paths:
      - 'frontend/**'
      - '.github/workflows/frontend-cd.yml'
  pull_request:
    types: [opened, synchronize, reopened]
    paths:
      - 'frontend/**'

defaults:
  run:
    working-directory: frontend

env:
  VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}
  VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID }}

jobs:
  deploy-preview:
    name: Deploy Preview
    runs-on: ubuntu-latest
    timeout-minutes: 10
    if: github.event_name == 'pull_request'
    permissions:
      pull-requests: write
      contents: read
    outputs:
      preview_url: ${{ steps.deploy.outputs.preview_url }}
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: frontend/package-lock.json

      - name: Install Vercel CLI
        run: npm install -g vercel@latest

      - name: Pull Vercel environment (preview)
        run: vercel pull --yes --environment=preview --token=${{ secrets.VERCEL_TOKEN }}

      - name: Build project (Vercel managed)
        run: vercel build --token=${{ secrets.VERCEL_TOKEN }}

      - name: Deploy to Vercel (preview)
        id: deploy
        run: |
          PREVIEW_URL=$(vercel deploy --prebuilt --token=${{ secrets.VERCEL_TOKEN }})
          echo "preview_url=${PREVIEW_URL}" >> $GITHUB_OUTPUT

      - name: Post preview URL as PR comment
        uses: actions/github-script@v7
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          script: |
            const previewUrl = '${{ steps.deploy.outputs.preview_url }}';
            const sha = context.payload.pull_request.head.sha.substring(0, 7);
            const body = [
              '## Vercel Preview Deployment',
              '',
              `| | |`,
              `|---|---|`,
              `| **Preview URL** | ${previewUrl} |`,
              `| **Commit** | \`${sha}\` |`,
              `| **Status** | ✅ Ready |`,
              '',
              '_Deployed automatically by GitHub Actions — update this PR to trigger a new preview._',
            ].join('\n');

            // Update existing bot comment if present, else create new
            const { data: comments } = await github.rest.issues.listComments({
              owner: context.repo.owner,
              repo: context.repo.repo,
              issue_number: context.payload.pull_request.number,
            });

            const existing = comments.find(c =>
              c.user.login === 'github-actions[bot]' &&
              c.body.includes('Vercel Preview Deployment')
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

  deploy-production:
    name: Deploy Production
    runs-on: ubuntu-latest
    timeout-minutes: 10
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    permissions:
      contents: read
      deployments: write
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: frontend/package-lock.json

      - name: Install Vercel CLI
        run: npm install -g vercel@latest

      - name: Pull Vercel environment (production)
        run: vercel pull --yes --environment=production --token=${{ secrets.VERCEL_TOKEN }}

      - name: Build project (Vercel managed)
        run: vercel build --prod --token=${{ secrets.VERCEL_TOKEN }}

      - name: Deploy to Vercel (production)
        id: deploy-prod
        run: |
          PROD_URL=$(vercel deploy --prebuilt --prod --token=${{ secrets.VERCEL_TOKEN }})
          echo "production_url=${PROD_URL}" >> $GITHUB_OUTPUT

      - name: Verify production deployment health
        run: |
          PROD_URL="${{ steps.deploy-prod.outputs.production_url }}"
          echo "Checking ${PROD_URL}"
          for i in 1 2 3; do
            STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${PROD_URL}")
            echo "Attempt ${i}: HTTP ${STATUS}"
            if [ "${STATUS}" = "200" ]; then
              echo "Production deployment healthy."
              exit 0
            fi
            sleep 10
          done
          echo "Production URL did not return HTTP 200 within 3 attempts."
          exit 1
```

### Step 3 — Verify Vercel native GitHub integration is disabled (avoid double-deploys)

In **Vercel Dashboard → Project → Settings → Git → GitHub Integration**:

- Disable **"Automatically deploy on push"** so that only the GitHub Actions workflow controls deployments.

> **Why**: Leaving Vercel's native integration enabled alongside the Actions CD workflow causes duplicate deployments per push, inflating CDN costs and obscuring the authoritative deploy chain.

### Step 4 — Test the preview URL flow end to end

1. Create a branch: `git checkout -b feat/test-preview`
2. Make a trivial change (e.g., update heading text in `src/app/page.tsx`)
3. Open a PR targeting `main`
4. Confirm:
   - `Frontend CI` workflow triggers and passes (TASK-003)
   - `Frontend CD / Deploy Preview` workflow triggers
   - A Vercel preview URL appears as a PR comment within 5 minutes
   - The preview URL loads correctly in the browser

### Step 5 — Test the production deployment flow

1. Merge the PR to `main`
2. Confirm:
   - `Frontend CD / Deploy Production` workflow triggers
   - Production URL returns HTTP 200
   - Total deployment time is under 3 minutes (visible in Actions run timeline)

---

## Validation

| Check | Method | Expected Result |
|-------|--------|-----------------|
| Preview URL posted on PR open | Open test PR | Bot comment appears within 5 min |
| Preview URL updates on new commit | Push to open PR | Existing bot comment updated, not duplicated |
| Production deploys on `main` merge | Merge PR | `Deploy Production` job completes within 3 min |
| Health check passes | Observe `Verify production deployment health` step | `HTTP 200` logged, step exits 0 |
| Double-deploy prevention | Check Vercel dashboard after push to `main` | Only 1 deployment per push |
| `timeout-minutes: 10` enforced | Simulate slow build | Job fails at 10 min boundary, not silently hanging |

---

## Dependencies

- **TASK-001** must be complete (Next.js project exists with `npm run build` working)
- **TASK-002** must be complete (Vercel project linked; `.vercel/project.json` generated)
- **TASK-003** must be complete (CI workflow gating PR merge)
- `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` secrets configured in GitHub
- Branch protection from TASK-003 in place (ensures CI runs before CD on PRs)

## Security Constraints

- **OWASP A02 (Cryptographic Failures)**: `VERCEL_TOKEN` stored exclusively in GitHub Secrets; never logged in workflow output.
- **OWASP A01 (Broken Access Control)**: `permissions` blocks in each job grant only the minimum required: `pull-requests: write` for the preview comment job, `deployments: write` for the production job.
- **OWASP A05 (Security Misconfiguration)**: Vercel native auto-deploy is explicitly disabled to prevent unreviewed code reaching production outside the gated CI/CD chain.
- `timeout-minutes: 10` prevents runaway jobs from consuming Actions minutes indefinitely.

---

## Definition of Done

- [ ] `.github/workflows/frontend-cd.yml` committed to repository
- [ ] Preview deployment triggered automatically on PR open/update
- [ ] Preview URL posted as PR comment within 5 minutes
- [ ] Existing PR comment updated (not duplicated) on subsequent commits
- [ ] Production deployment triggered on `main` merge within 3 minutes
- [ ] Health check step confirms HTTP 200 from production URL
- [ ] Vercel native GitHub auto-deploy disabled in project settings
- [ ] `VERCEL_TOKEN` rotated and stored only in GitHub Secrets

## Traceability

| Artefact | ID |
|----------|----|
| User Story | US-001 |
| Epic | EP-TECH |
| NFR | NFR-001 (sub-100ms CDN serving), NFR-003 (99.5% availability) |
| Scenario | 1 (production deployment < 3 min), 2 (preview URL within 5 min) |
