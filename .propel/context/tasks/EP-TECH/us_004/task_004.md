---
id: task_004
us_id: us_004
epic: EP-TECH
title: "Configure Dependabot for Automated Weekly Dependency and Actions Version Updates"
status: not-started
layer: ci-cd
effort: 1h
priority: critical
created: 2026-07-22
---

# TASK-004 — Configure Dependabot for Automated Weekly Dependency and Actions Version Updates

## Context

**User Story**: US-004 — GitHub Actions CI/CD Pipeline with Quality Gates  
**Epic**: EP-TECH — Technical Bootstrap  
**Addresses Acceptance Criteria**: Scenario 5 (Dependabot / npm audit scan configured; HIGH CVE fails CI and PR comment identifies affected package)

This task commits `.github/dependabot.yml` to activate GitHub Dependabot for automated dependency scanning and PR creation. Dependabot PRs for HIGH/CRITICAL CVEs trigger the `security-audit.yml` workflow created in TASK-002, providing end-to-end automated vulnerability remediation.

---

## Objective

Create `.github/dependabot.yml` that schedules weekly scans for `npm` dependencies in both `frontend/` and `backend/`, and weekly scans of GitHub Actions version pins. Configure PR labels, assignees, and commit message prefixes for maintainability.

---

## Technical Specifications

| Attribute | Value |
|-----------|-------|
| Package ecosystems | `npm` (frontend), `npm` (backend), `github-actions` |
| Schedule | Weekly — every Monday at 06:00 UTC (before `security-audit.yml` Monday run at 08:00) |
| Target branch | `main` |
| PR limit per run | 5 per ecosystem (avoids PR flood) |
| Labels | `dependencies`, `security` (for security PRs) |
| Commit prefix | `chore(deps):` (npm), `chore(actions):` (Actions) |
| Auto-merge | Not enabled — all Dependabot PRs require CI to pass and human approval |

---

## Implementation Steps

### Step 1 — Create `.github/dependabot.yml`

Create `.github/dependabot.yml`:

```yaml
version: 2

updates:
  # Frontend npm dependencies
  - package-ecosystem: "npm"
    directory: "/frontend"
    schedule:
      interval: "weekly"
      day: "monday"
      time: "06:00"
      timezone: "UTC"
    open-pull-requests-limit: 5
    target-branch: "main"
    labels:
      - "dependencies"
      - "frontend"
    commit-message:
      prefix: "chore(deps):"
      include: "scope"
    # Group patch updates into a single PR to reduce noise
    groups:
      frontend-patch-updates:
        update-types:
          - "patch"
    # Allow all update types — security and non-security
    allow:
      - dependency-type: "all"
    # Ignore major version bumps for Next.js (managed manually)
    ignore:
      - dependency-name: "next"
        update-types: ["version-update:semver-major"]
      - dependency-name: "react"
        update-types: ["version-update:semver-major"]
      - dependency-name: "react-dom"
        update-types: ["version-update:semver-major"]

  # Backend npm dependencies
  - package-ecosystem: "npm"
    directory: "/backend"
    schedule:
      interval: "weekly"
      day: "monday"
      time: "06:00"
      timezone: "UTC"
    open-pull-requests-limit: 5
    target-branch: "main"
    labels:
      - "dependencies"
      - "backend"
    commit-message:
      prefix: "chore(deps):"
      include: "scope"
    groups:
      backend-patch-updates:
        update-types:
          - "patch"
    allow:
      - dependency-type: "all"
    ignore:
      - dependency-name: "prisma"
        update-types: ["version-update:semver-major"]
      - dependency-name: "@prisma/client"
        update-types: ["version-update:semver-major"]
      - dependency-name: "express"
        update-types: ["version-update:semver-major"]

  # GitHub Actions version pins
  - package-ecosystem: "github-actions"
    directory: "/"
    schedule:
      interval: "weekly"
      day: "monday"
      time: "06:00"
      timezone: "UTC"
    open-pull-requests-limit: 5
    target-branch: "main"
    labels:
      - "dependencies"
      - "github-actions"
    commit-message:
      prefix: "chore(actions):"
      include: "scope"
    groups:
      actions-updates:
        update-types:
          - "minor"
          - "patch"
```

### Step 2 — Create the `dependencies` and `security` labels in GitHub

In **GitHub → Repository → Labels**, create:

| Label | Color | Description |
|-------|-------|-------------|
| `dependencies` | `#0075ca` | Automated dependency update |
| `frontend` | `#e4e669` | Affects frontend package |
| `backend` | `#d93f0b` | Affects backend package |
| `github-actions` | `#bfd4f2` | Affects GitHub Actions version pins |
| `security` | `#ee0701` | Security vulnerability fix |

### Step 3 — Verify Dependabot is enabled for the repository

In **GitHub → Repository → Settings → Code security and analysis**:

- [x] **Dependabot alerts** — Enabled
- [x] **Dependabot security updates** — Enabled
- [x] **Dependency graph** — Enabled

Dependabot security updates automatically opens PRs for known CVEs in addition to the scheduled weekly scan.

### Step 4 — Configure auto-dismiss for patch updates (optional)

If Dependabot patch-update PRs are merged automatically after CI passes, add an auto-merge workflow. This is **opt-in** and requires team approval before enabling:

Create `.github/workflows/dependabot-auto-merge.yml` (disabled by default — enable explicitly):

```yaml
name: Dependabot Auto-merge

on:
  pull_request:

permissions:
  contents: write
  pull-requests: write

jobs:
  auto-merge:
    name: Auto-merge Dependabot patch PRs
    runs-on: ubuntu-latest
    # Only run for Dependabot PRs updating patch versions
    if: |
      github.actor == 'dependabot[bot]' &&
      contains(github.event.pull_request.labels.*.name, 'dependencies')
    steps:
      - name: Fetch Dependabot metadata
        id: metadata
        uses: dependabot/fetch-metadata@v2
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}

      - name: Auto-merge patch updates only
        if: steps.metadata.outputs.update-type == 'version-update:semver-patch'
        run: gh pr merge --auto --squash "$PR_URL"
        env:
          PR_URL: ${{ github.event.pull_request.html_url }}
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

> **Note**: Leave this workflow file present but do not add it to `.github/workflows/` until the team has reviewed and approved the auto-merge policy. Auto-merge of dependencies should be a deliberate team decision.

### Step 5 — Test Dependabot activation

After committing `dependabot.yml`:

1. Navigate to **GitHub → Repository → Insights → Dependency graph → Dependabot**
2. Confirm all three ecosystems are listed (`/frontend`, `/backend`, `/`)
3. Click "Check for updates" to trigger an immediate scan (optional)
4. Within the next Monday cycle, Dependabot PRs will begin appearing

---

## Validation

| Check | Method | Expected Result |
|-------|--------|-----------------|
| `dependabot.yml` parses correctly | GitHub → Insights → Dependency graph | No configuration errors shown |
| All 3 ecosystems registered | Dependabot tab | frontend npm, backend npm, github-actions listed |
| Labels created in repository | GitHub → Labels page | `dependencies`, `frontend`, `backend`, `github-actions` visible |
| Dependabot alerts enabled | GitHub → Settings → Code security | All 3 options enabled |
| PR limit respected | Wait for Monday scan | ≤ 5 PRs per ecosystem opened |
| Dependabot PR triggers security-audit | Open a Dependabot PR touching `package-lock.json` | `Security Audit` checks appear in PR |

---

## Dependencies

- **TASK-002** must be complete (`security-audit.yml` must exist so Dependabot PRs are automatically audited)
- GitHub repository admin access required (to create labels and enable Dependabot settings)

## Security Constraints

- **OWASP A06 (Vulnerable and Outdated Components)**: Dependabot scans the dependency graph against the GitHub Advisory Database (GHSA), which includes CVE disclosures. It creates PRs within hours of a new advisory being published.
- Major version bumps for `next`, `prisma`, `express`, and `react` are excluded from automated updates — these require manual testing and migration effort. They are surfaced as Dependabot alerts but not auto-PR'd.
- Auto-merge is explicitly disabled (the workflow file is withheld) until the team opts in — prevents untested major dependency changes from reaching `main` without review.

---

## Definition of Done

- [ ] `.github/dependabot.yml` committed with all 3 ecosystems configured
- [ ] `dependencies`, `frontend`, `backend`, `github-actions` labels created in repository
- [ ] Dependabot alerts, security updates, and dependency graph enabled in repository settings
- [ ] Dependabot tab shows all 3 ecosystems registered without configuration errors
- [ ] A Dependabot PR (or manual trigger) confirms `security-audit.yml` runs on lock file changes

## Traceability

| Artefact | ID |
|----------|----|
| User Story | US-004 |
| Epic | EP-TECH |
| NFR | NFR-004 (dependency scanning — Dependabot weekly scans + security updates) |
| Scenario | 5 (Dependabot configured; HIGH CVE fails CI with PR comment identifying package) |
