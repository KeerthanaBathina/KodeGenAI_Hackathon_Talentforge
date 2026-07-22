---
id: task_004
us_id: us_002
epic: EP-TECH
title: "Create GitHub Actions CI/CD Workflows for Backend with Deployment Failure Alerting"
status: not-started
layer: ci-cd
effort: 4h
priority: critical
created: 2026-07-22
---

# TASK-004 — Create GitHub Actions CI/CD Workflows for Backend with Deployment Failure Alerting

## Context

**User Story**: US-002 — Deploy Node.js/Express Backend to Railway.app with Zero-Downtime Rolling Strategy  
**Epic**: EP-TECH — Technical Bootstrap  
**Addresses Acceptance Criteria**: Scenario 1 (production deploys with health-check gate), Scenario 2 (deployment failure alert fires when rollback occurs), Scenario 4 (staging deploy is isolated from production)

This task creates two GitHub Actions workflows:
1. **Backend CI** — type-check, lint, and build gate on every PR
2. **Backend CD** — deploy to Railway staging (on PR) and production (on `main` merge), with a post-deploy health check that fires a Slack/email alert on failure

---

## Objective

Create `.github/workflows/backend-ci.yml` and `.github/workflows/backend-cd.yml`. The CD workflow must verify the `/health` endpoint returns HTTP 200 after each Railway deployment and trigger a configurable alert channel when it does not.

---

## Technical Specifications

| Attribute | Value |
|-----------|-------|
| CI trigger | `pull_request` targeting `main` (paths: `backend/**`) |
| CD trigger (staging) | `pull_request` targeting `main` (paths: `backend/**`) |
| CD trigger (production) | `push` to `main` (paths: `backend/**`) |
| Deployment tool | Railway CLI (`@railway/cli`) |
| Post-deploy health check | `GET <service-url>/health` — retry 3×, 15 s apart |
| Alert channel | Slack webhook (primary) + GitHub Actions job failure notification |
| Max deployment timeout | 8 min (`timeout-minutes: 10` on CD jobs) |

---

## Implementation Steps

### Step 1 — Configure GitHub Secrets

In **GitHub → Repository → Settings → Secrets and Variables → Actions**, add:

| Secret Name | Source | Purpose |
|-------------|--------|---------|
| `RAILWAY_TOKEN` | Railway Dashboard → Account Settings → Tokens | CLI authentication |
| `RAILWAY_SERVICE_ID_PRODUCTION` | Railway Dashboard → Service → Settings | Target production service |
| `RAILWAY_SERVICE_ID_STAGING` | Railway Dashboard → Service → Settings | Target staging service |
| `RAILWAY_ENVIRONMENT_PRODUCTION` | `production` | Environment name string |
| `RAILWAY_ENVIRONMENT_STAGING` | `staging` | Environment name string |
| `BACKEND_HEALTH_URL_PRODUCTION` | `https://api.ai-interview.railway.app/health` | Post-deploy health check |
| `BACKEND_HEALTH_URL_STAGING` | `https://api-staging.ai-interview.railway.app/health` | Post-deploy health check |
| `SLACK_WEBHOOK_URL` | Slack App → Incoming Webhooks | Deployment failure alert |

> **Security**: `RAILWAY_TOKEN` grants full project access. Rotate every 90 days. Scope it to the project only (use a Railway service token, not an account token, where supported).

### Step 2 — Create the Backend CI workflow

Create `.github/workflows/backend-ci.yml`:

```yaml
name: Backend CI

on:
  push:
    branches:
      - main
    paths:
      - 'backend/**'
      - '.github/workflows/backend-ci.yml'
  pull_request:
    branches:
      - main
    paths:
      - 'backend/**'
      - '.github/workflows/backend-ci.yml'

defaults:
  run:
    working-directory: backend

jobs:
  type-check:
    name: TypeScript Type Check
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: backend/package-lock.json
      - run: npm ci
      - run: npm run type-check

  lint:
    name: ESLint
    runs-on: ubuntu-latest
    needs: type-check
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: backend/package-lock.json
      - run: npm ci
      - run: npm run lint

  build:
    name: Production Build
    runs-on: ubuntu-latest
    needs: [type-check, lint]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: backend/package-lock.json
      - run: npm ci
      - run: npm run build
      - uses: actions/upload-artifact@v4
        with:
          name: backend-build-${{ github.sha }}
          path: backend/dist/
          retention-days: 1
```

### Step 3 — Create the Backend CD workflow

Create `.github/workflows/backend-cd.yml`:

```yaml
name: Backend CD

on:
  push:
    branches:
      - main
    paths:
      - 'backend/**'
      - '.github/workflows/backend-cd.yml'
  pull_request:
    types: [opened, synchronize, reopened]
    paths:
      - 'backend/**'

defaults:
  run:
    working-directory: backend

jobs:
  deploy-staging:
    name: Deploy to Staging
    runs-on: ubuntu-latest
    timeout-minutes: 10
    if: github.event_name == 'pull_request'
    permissions:
      pull-requests: write
      contents: read
    steps:
      - uses: actions/checkout@v4

      - name: Install Railway CLI
        run: npm install -g @railway/cli

      - name: Deploy to Railway (staging)
        id: railway-staging
        env:
          RAILWAY_TOKEN: ${{ secrets.RAILWAY_TOKEN }}
        run: |
          railway up \
            --service ${{ secrets.RAILWAY_SERVICE_ID_STAGING }} \
            --environment ${{ secrets.RAILWAY_ENVIRONMENT_STAGING }} \
            --detach

      - name: Wait for Railway to roll out (60 s warm-up)
        run: sleep 60

      - name: Health check — staging
        id: health-staging
        run: |
          HEALTH_URL="${{ secrets.BACKEND_HEALTH_URL_STAGING }}"
          for attempt in 1 2 3; do
            echo "Attempt ${attempt}: GET ${HEALTH_URL}"
            STATUS=$(curl -s -o /tmp/health_response.json -w "%{http_code}" --max-time 10 "${HEALTH_URL}")
            echo "HTTP ${STATUS}"
            cat /tmp/health_response.json
            if [ "${STATUS}" = "200" ]; then
              echo "health_check=passed" >> $GITHUB_OUTPUT
              echo "✅ Staging health check passed."
              exit 0
            fi
            sleep 15
          done
          echo "health_check=failed" >> $GITHUB_OUTPUT
          echo "❌ Staging health check failed after 3 attempts."
          exit 1

      - name: Alert on staging deploy failure
        if: failure() && steps.health-staging.outputs.health_check == 'failed'
        uses: slackapi/slack-github-action@v1.26.0
        with:
          payload: |
            {
              "text": "🚨 *Backend Staging Deploy FAILED*",
              "blocks": [
                {
                  "type": "section",
                  "text": {
                    "type": "mrkdwn",
                    "text": "🚨 *Backend Staging Deploy Failed*\n*PR:* #${{ github.event.pull_request.number }} — ${{ github.event.pull_request.title }}\n*Branch:* `${{ github.head_ref }}`\n*Commit:* `${{ github.sha }}`\n*Health URL:* ${{ secrets.BACKEND_HEALTH_URL_STAGING }}\n<${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}|View Run>"
                  }
                }
              ]
            }
        env:
          SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }}
          SLACK_WEBHOOK_TYPE: INCOMING_WEBHOOK

      - name: Post staging status to PR
        if: always()
        uses: actions/github-script@v7
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          script: |
            const healthStatus = '${{ steps.health-staging.outputs.health_check }}';
            const icon = healthStatus === 'passed' ? '✅' : '❌';
            const body = [
              '## Backend Staging Deployment',
              '',
              `| | |`,
              `|---|---|`,
              `| **Status** | ${icon} ${healthStatus === 'passed' ? 'Healthy' : 'FAILED'} |`,
              `| **Health URL** | ${{ secrets.BACKEND_HEALTH_URL_STAGING }} |`,
              `| **Commit** | \`${{ github.sha }}\` |`,
              '',
            ].join('\n');

            const { data: comments } = await github.rest.issues.listComments({
              owner: context.repo.owner,
              repo: context.repo.repo,
              issue_number: context.payload.pull_request.number,
            });
            const existing = comments.find(c =>
              c.user.login === 'github-actions[bot]' &&
              c.body.includes('Backend Staging Deployment')
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
    name: Deploy to Production
    runs-on: ubuntu-latest
    timeout-minutes: 10
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    permissions:
      contents: read
      deployments: write
    steps:
      - uses: actions/checkout@v4

      - name: Install Railway CLI
        run: npm install -g @railway/cli

      - name: Deploy to Railway (production)
        id: railway-production
        env:
          RAILWAY_TOKEN: ${{ secrets.RAILWAY_TOKEN }}
        run: |
          railway up \
            --service ${{ secrets.RAILWAY_SERVICE_ID_PRODUCTION }} \
            --environment ${{ secrets.RAILWAY_ENVIRONMENT_PRODUCTION }} \
            --detach

      - name: Wait for Railway to roll out (60 s warm-up)
        run: sleep 60

      - name: Health check — production
        id: health-production
        run: |
          HEALTH_URL="${{ secrets.BACKEND_HEALTH_URL_PRODUCTION }}"
          for attempt in 1 2 3; do
            echo "Attempt ${attempt}: GET ${HEALTH_URL}"
            STATUS=$(curl -s -o /tmp/health_response.json -w "%{http_code}" --max-time 10 "${HEALTH_URL}")
            echo "HTTP ${STATUS}"
            cat /tmp/health_response.json
            if [ "${STATUS}" = "200" ]; then
              echo "health_check=passed" >> $GITHUB_OUTPUT
              echo "✅ Production health check passed."
              exit 0
            fi
            sleep 15
          done
          echo "health_check=failed" >> $GITHUB_OUTPUT
          echo "❌ Production health check failed after 3 attempts."
          exit 1

      - name: Alert on production deploy failure
        if: failure()
        uses: slackapi/slack-github-action@v1.26.0
        with:
          payload: |
            {
              "text": "🚨 *Backend PRODUCTION Deploy FAILED — Rollback may be in progress*",
              "blocks": [
                {
                  "type": "section",
                  "text": {
                    "type": "mrkdwn",
                    "text": "🚨 *PRODUCTION Deploy Failed*\n*Branch:* `main`\n*Commit:* `${{ github.sha }}`\n*Health URL:* ${{ secrets.BACKEND_HEALTH_URL_PRODUCTION }}\n\nRailway should be rolling back to the previous healthy deployment.\n<${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}|View Run>"
                  }
                }
              ]
            }
        env:
          SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }}
          SLACK_WEBHOOK_TYPE: INCOMING_WEBHOOK
```

### Step 4 — Configure branch protection for backend CI

In **GitHub → Repository → Settings → Branches → `main`**, add required checks (alongside frontend CI checks from US-001):

- `Backend CI / TypeScript Type Check`
- `Backend CI / ESLint`
- `Backend CI / Production Build`

### Step 5 — Verify Slack webhook integration

1. Create a Slack App with Incoming Webhooks enabled at `https://api.slack.com/apps`
2. Add webhook to a `#deployments` or `#alerts` channel
3. Store the URL in the `SLACK_WEBHOOK_URL` GitHub secret
4. Trigger a deliberate failure (see TASK-005) and confirm the Slack message appears within 30 s

---

## Validation

| Check | Method | Expected Result |
|-------|--------|-----------------|
| CI triggers on backend PR | Open PR with `backend/` change | 3 CI jobs appear in PR checks |
| Build failure blocks merge | Introduce TS error in `backend/src/` | Merge button disabled |
| Staging deploy triggered on PR | Open PR with backend change | `Deploy to Staging` job runs |
| Staging health check passes | PR with clean code | `✅ Staging health check passed` in logs |
| Production deploy on `main` merge | Merge PR | `Deploy to Production` job completes |
| Slack alert fires on failure | Deploy broken build (TASK-005) | Slack message in `#deployments` within 30 s |
| PR comment posted with staging status | Open PR with backend change | Bot comment appears with health status |

---

## Dependencies

- **TASK-001** must be complete (`/health` endpoint implemented)
- **TASK-002** must be complete (Socket.IO server must not crash on startup)
- **TASK-003** must be complete (Railway project, environments, and env vars configured)
- All 8 GitHub Secrets from Step 1 configured
- Slack App with Incoming Webhook provisioned

## Security Constraints

- **OWASP A09 (Security Logging and Monitoring Failures)**: Slack alert fires on both staging and production deployment failures. GitHub Actions job failure email also fires by default.
- **OWASP A02 (Cryptographic Failures)**: `RAILWAY_TOKEN` stored only in GitHub Secrets; never logged in workflow YAML (`env:` block scoped to the step that needs it).
- **OWASP A01 (Broken Access Control)**: `permissions` blocks in each job enforce least-privilege — production job has only `contents: read` and `deployments: write`.
- `timeout-minutes: 10` prevents runaway jobs consuming Actions minutes.
- The 60 s warm-up sleep before health check allows Railway's rolling strategy to complete the container swap before the GitHub workflow polls.

---

## Definition of Done

- [ ] `.github/workflows/backend-ci.yml` committed — type-check, lint, build jobs
- [ ] `.github/workflows/backend-cd.yml` committed — staging and production deploy jobs
- [ ] Branch protection updated with 3 Backend CI required status checks
- [ ] Staging deploy triggered automatically on backend PR open/update
- [ ] PR comment posted with staging deployment health status
- [ ] Production deploy triggered on `main` merge
- [ ] Post-deploy health check (`/health` HTTP 200) verified in CD logs
- [ ] Slack alert fires on deployment failure (tested in TASK-005)
- [ ] `RAILWAY_TOKEN` and all 8 secrets configured in GitHub Actions

## Traceability

| Artefact | ID |
|----------|----|
| User Story | US-002 |
| Epic | EP-TECH |
| NFR | NFR-003 (99.5% uptime — rollback on failure), NFR-007 (observability — deployment alerts) |
| Scenario | 1 (health-check gate), 2 (alert on rollback), 4 (staging isolation) |
