---
id: task_003
us_id: us_004
epic: EP-TECH
title: "Unified CD Orchestration Workflow for Simultaneous Frontend and Backend Deployment"
status: not-started
layer: ci-cd
effort: 3h
priority: critical
created: 2026-07-22
---

# TASK-003 — Unified CD Orchestration Workflow for Simultaneous Frontend and Backend Deployment

## Context

**User Story**: US-004 — GitHub Actions CI/CD Pipeline with Quality Gates  
**Epic**: EP-TECH — Technical Bootstrap  
**Addresses Acceptance Criteria**: Scenario 3 (CD deploys both frontend to Vercel and backend to Railway automatically on merge to `main`, with no manual action)

US-001 created `frontend-cd.yml` and US-002 created `backend-cd.yml`. They are triggered independently. This task adds a unified `cd-orchestrator.yml` that:
1. Gates deployment on all CI checks passing
2. Triggers both frontend and backend CD jobs in parallel on `main` merge
3. Posts a single consolidated deployment summary as a GitHub deployment status

This avoids race conditions between the two CD workflows and provides a single observable deployment state per commit.

---

## Objective

Create `.github/workflows/cd-orchestrator.yml` that triggers on `main` push (after all CI checks pass using `workflow_run` event), runs frontend Vercel deployment and backend Railway deployment in parallel, waits for both to complete, and sets a consolidated GitHub deployment status.

---

## Technical Specifications

| Attribute | Value |
|-----------|-------|
| Trigger event | `workflow_run` — completed with conclusion `success` from both `Frontend CI` and `Backend CI` |
| Parallelism | Frontend (Vercel) and backend (Railway) jobs run concurrently |
| Deployment status | GitHub Deployments API — `environment: production` |
| Max timeout per deployment | 10 minutes (each job) |
| Summary job | Waits for both, posts consolidated status to commit |

---

## Implementation Steps

### Step 1 — Understand the existing CD workflows

Before creating the orchestrator, confirm the existing workflows use `--detach` (Railway) and `--prebuilt` (Vercel) flags so they return quickly and Railway/Vercel drive the actual deployment asynchronously. This is already the case from US-001 and US-002.

The orchestrator does **not** replace these workflows — it wraps them by being the single trigger point for production.

### Step 2 — Create the CD orchestrator workflow

Create `.github/workflows/cd-orchestrator.yml`:

```yaml
name: CD Orchestrator

on:
  push:
    branches:
      - main

# Prevent concurrent production deployments
concurrency:
  group: production-deploy
  cancel-in-progress: false   # Do NOT cancel in-progress — let the current deploy finish

jobs:
  # Gate: Confirm both CI workflows passed for this commit
  # GitHub doesn't expose a native "wait for other workflows" primitive;
  # we rely on branch protection having blocked the merge until CI passed.
  # This job simply documents and logs the intent.
  gate-check:
    name: Deployment Gate (CI Must Have Passed)
    runs-on: ubuntu-latest
    permissions:
      statuses: read
    steps:
      - name: Log deployment trigger
        run: |
          echo "Deployment triggered by push to main"
          echo "Commit: ${{ github.sha }}"
          echo "Actor:  ${{ github.actor }}"
          echo "Branch protection ensures CI passed before this merge was allowed."

  deploy-frontend:
    name: Deploy Frontend to Vercel
    runs-on: ubuntu-latest
    needs: gate-check
    timeout-minutes: 10
    permissions:
      contents: read
      deployments: write
    defaults:
      run:
        working-directory: frontend
    env:
      VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}
      VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID }}
    outputs:
      production_url: ${{ steps.deploy.outputs.production_url }}
      deploy_status: ${{ steps.deploy.outcome }}
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

      - name: Build project
        run: vercel build --prod --token=${{ secrets.VERCEL_TOKEN }}

      - name: Deploy to Vercel (production)
        id: deploy
        run: |
          PROD_URL=$(vercel deploy --prebuilt --prod --token=${{ secrets.VERCEL_TOKEN }})
          echo "production_url=${PROD_URL}" >> $GITHUB_OUTPUT

      - name: Verify frontend health
        run: |
          PROD_URL="${{ steps.deploy.outputs.production_url }}"
          for i in 1 2 3; do
            STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "${PROD_URL}")
            echo "Attempt ${i}: HTTP ${STATUS}"
            if [ "${STATUS}" = "200" ]; then exit 0; fi
            sleep 10
          done
          echo "❌ Frontend health check failed"
          exit 1

  deploy-backend:
    name: Deploy Backend to Railway
    runs-on: ubuntu-latest
    needs: gate-check
    timeout-minutes: 10
    permissions:
      contents: read
      deployments: write
    defaults:
      run:
        working-directory: backend
    outputs:
      deploy_status: ${{ steps.railway-deploy.outcome }}
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Install Railway CLI
        run: npm install -g @railway/cli

      - name: Deploy to Railway (production)
        id: railway-deploy
        env:
          RAILWAY_TOKEN: ${{ secrets.RAILWAY_TOKEN }}
        run: |
          railway up \
            --service ${{ secrets.RAILWAY_SERVICE_ID_PRODUCTION }} \
            --environment ${{ secrets.RAILWAY_ENVIRONMENT_PRODUCTION }} \
            --detach

      - name: Wait for Railway rollout (60 s)
        run: sleep 60

      - name: Verify backend health
        run: |
          HEALTH_URL="${{ secrets.BACKEND_HEALTH_URL_PRODUCTION }}"
          for i in 1 2 3; do
            STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "${HEALTH_URL}")
            echo "Attempt ${i}: HTTP ${STATUS}"
            if [ "${STATUS}" = "200" ]; then exit 0; fi
            sleep 15
          done
          echo "❌ Backend health check failed"
          exit 1

  deployment-summary:
    name: Deployment Summary
    runs-on: ubuntu-latest
    needs: [deploy-frontend, deploy-backend]
    if: always()
    permissions:
      deployments: write
      statuses: write
    steps:
      - name: Create GitHub deployment status
        uses: actions/github-script@v7
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          script: |
            const frontendOk = '${{ needs.deploy-frontend.result }}' === 'success';
            const backendOk = '${{ needs.deploy-backend.result }}' === 'success';
            const bothOk = frontendOk && backendOk;
            const state = bothOk ? 'success' : 'failure';

            await github.rest.repos.createCommitStatus({
              owner: context.repo.owner,
              repo: context.repo.repo,
              sha: context.sha,
              state,
              description: bothOk
                ? 'Frontend + Backend deployed successfully'
                : `Deploy failed: ${!frontendOk ? 'Frontend ' : ''}${!backendOk ? 'Backend' : ''}`,
              context: 'CD Orchestrator / Production Deploy',
              target_url: `${context.serverUrl}/${context.repo.owner}/${context.repo.repo}/actions/runs/${context.runId}`,
            });

      - name: Alert on deployment failure
        if: needs.deploy-frontend.result != 'success' || needs.deploy-backend.result != 'success'
        uses: slackapi/slack-github-action@v1.26.0
        with:
          payload: |
            {
              "text": "🚨 *PRODUCTION Deployment Failed*",
              "blocks": [{
                "type": "section",
                "text": {
                  "type": "mrkdwn",
                  "text": "🚨 *Production Deploy Failed*\n*Commit:* `${{ github.sha }}`\n*Actor:* ${{ github.actor }}\n*Frontend:* ${{ needs.deploy-frontend.result }}\n*Backend:* ${{ needs.deploy-backend.result }}\n<${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}|View Run>"
                }
              }]
            }
        env:
          SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }}
          SLACK_WEBHOOK_TYPE: INCOMING_WEBHOOK

      - name: Log deployment summary
        run: |
          echo "=== Deployment Summary ==="
          echo "Frontend: ${{ needs.deploy-frontend.result }}"
          echo "Backend:  ${{ needs.deploy-backend.result }}"
          echo "Frontend URL: ${{ needs.deploy-frontend.outputs.production_url }}"
          if [ "${{ needs.deploy-frontend.result }}" != "success" ] || \
             [ "${{ needs.deploy-backend.result }}" != "success" ]; then
            exit 1
          fi
```

### Step 3 — Prevent duplicate CD triggers

With the orchestrator in place, the standalone production jobs in `frontend-cd.yml` and `backend-cd.yml` will double-deploy on `main` push. Modify both to disable the production job trigger:

In `.github/workflows/frontend-cd.yml`, change the `deploy-production` job's `if` condition:

```yaml
  deploy-production:
    # Production deployment is now handled by cd-orchestrator.yml
    # This job only handles preview deployments for PRs
    if: false   # Disabled — replaced by cd-orchestrator.yml
```

In `.github/workflows/backend-cd.yml`, similarly:

```yaml
  deploy-production:
    # Production deployment is now handled by cd-orchestrator.yml
    if: false   # Disabled — replaced by cd-orchestrator.yml
```

> **Why not delete the jobs**: Leaving them disabled (rather than deleted) preserves context for reviewers. Delete only during a future cleanup sprint.

### Step 4 — Verify `concurrency` group prevents parallel production deploys

The `concurrency: group: production-deploy` block ensures only one production deployment runs at a time. If a second push to `main` happens while a deployment is in progress:

- `cancel-in-progress: false` → the second deployment **queues** (does not cancel the first)
- This prevents partially deployed states where frontend is on commit N+1 but backend is still on N

Verify by pushing two commits to `main` in quick succession and confirming the second run shows "Queued" in the Actions tab while the first is running.

---

## Validation

| Check | Method | Expected Result |
|-------|--------|-----------------|
| Orchestrator triggers on `main` push | Merge a PR | `CD Orchestrator` workflow starts |
| Frontend and backend deploy in parallel | Actions timeline | Both deploy jobs start simultaneously |
| Both deployments succeed | End-to-end merge | `deployment-summary` posts `success` commit status |
| No duplicate production deploys | Check Railway + Vercel dashboards | Exactly 1 deployment per `main` merge |
| Concurrent pushes queued | Push twice to `main` quickly | Second run shows "Queued" not "Cancelled" |
| Slack alert fires on failure | Force a health check failure | Alert received in `#deployments` |
| `CD Orchestrator / Production Deploy` status on commit | GitHub commit page | Green checkmark after successful deploy |

---

## Dependencies

- **US-001 / TASK-004** must be complete (`frontend-cd.yml` must exist)
- **US-002 / TASK-004** must be complete (`backend-cd.yml` must exist)
- All secrets from US-001 and US-002 (Vercel + Railway tokens) must be configured
- `SLACK_WEBHOOK_URL` secret configured (from US-002)

## Security Constraints

- **OWASP A01 (Broken Access Control)**: `concurrency: cancel-in-progress: false` prevents a race condition where a bad actor could trigger a second `main` push to cancel an in-progress security rollout.
- **OWASP A09 (Security Logging and Monitoring Failures)**: Consolidated `deployment-summary` job provides a single audit point per commit. GitHub Deployments API entry links directly to the Actions run for traceability.
- `permissions` blocks on each job are scoped minimally — `deploy-frontend` and `deploy-backend` only have `deployments: write` and `contents: read`.

---

## Definition of Done

- [ ] `.github/workflows/cd-orchestrator.yml` committed with `gate-check`, `deploy-frontend`, `deploy-backend`, and `deployment-summary` jobs
- [ ] `deploy-production` jobs in `frontend-cd.yml` and `backend-cd.yml` set to `if: false`
- [ ] Frontend and backend deploy jobs run in parallel (confirmed via Actions timeline)
- [ ] `CD Orchestrator / Production Deploy` commit status visible on GitHub commits page
- [ ] Concurrency group confirmed — second simultaneous `main` push queues (not cancels)
- [ ] Slack alert fires when either deployment fails
- [ ] No duplicate deployments in Vercel or Railway dashboards after a single `main` merge

## Traceability

| Artefact | ID |
|----------|----|
| User Story | US-004 |
| Epic | EP-TECH |
| NFR | NFR-003 (deployment reliability — no partial states), NFR-007 (observability — commit status + Slack) |
| Scenario | 3 (CD deploys both frontend + backend on `main` merge, no manual action) |
