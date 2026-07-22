---
id: task_005
us_id: us_001
epic: EP-TECH
title: "Validate CDN Performance, Environment Variable Isolation, and Definition of Done Sign-off"
status: not-started
layer: infrastructure
effort: 2h
priority: critical
created: 2026-07-22
---

# TASK-005 — Validate CDN Performance, Environment Variable Isolation, and Definition of Done Sign-off

## Context

**User Story**: US-001 — Deploy Frontend to Vercel with CDN and Preview Environments  
**Epic**: EP-TECH — Technical Bootstrap  
**Addresses Acceptance Criteria**: All four scenarios (final end-to-end validation gate)

This task is the acceptance gate for US-001. It verifies each acceptance criterion with a concrete, repeatable test and produces the evidence required to close the user story. No feature epic (EP-001 through EP-011) should start until this task passes.

---

## Objective

Execute a structured validation run against the live production and preview environments, confirm environment variable security, and record pass/fail evidence for all four acceptance criteria. Update `us_001.md` Definition of Done checkboxes upon success.

---

## Validation Matrix

| Scenario | Criterion | Test Method | Pass Condition |
|----------|-----------|-------------|----------------|
| Scenario 1 | Production HTTP 200 within 3 min | Timed curl + Actions run timeline | `curl` returns 200; CD run ≤ 3 min wall-clock |
| Scenario 2 | Preview URL in PR comment within 5 min | Open test PR, measure comment post time | Comment appears ≤ 5 min from PR open |
| Scenario 3 | Build failure blocks PR merge | Introduce TS error branch | Merge button disabled; CI `build` job red |
| Scenario 4 | `NEXT_PUBLIC_API_URL` in runtime; not in source map | Runtime check + source map scan | Value returned at runtime; absent from `.map` |

---

## Implementation Steps

### Step 1 — Scenario 1: CDN response time validation

```bash
# Time the first response from the Vercel production URL
PROD_URL="https://ai-interview-app-frontend.vercel.app"

curl -s -o /dev/null -w "HTTP %{http_code} | Total: %{time_total}s | TTFB: %{time_starttransfer}s\n" \
  "${PROD_URL}"
```

Expected output example:
```
HTTP 200 | Total: 0.312s | TTFB: 0.098s
```

Record TTFB. It must be below 100 ms when served from the nearest Vercel edge node (NFR-001). Run from at least two geographic locations (use `curl.se/` or a GitHub Actions matrix with multiple regions if available).

Cross-check the GitHub Actions `Deploy Production` run duration in the Actions tab. Wall-clock time from job start to `Verify production deployment health` step success must be ≤ 3 minutes.

### Step 2 — Scenario 2: Preview URL timing validation

1. Open a new PR from a feature branch (e.g., `feat/validate-preview`)
2. Record the timestamp of the PR creation event (shown in GitHub PR timeline)
3. Record the timestamp of the bot comment posting the preview URL
4. Confirm delta ≤ 5 minutes

Screenshot the PR comment and attach it to the story review artefact.

### Step 3 — Scenario 3: Build failure gate verification

```bash
# Create a branch with an intentional TypeScript error
git checkout -b test/ts-error-gate
cat >> frontend/src/app/page.tsx << 'EOF'

// TS-ERROR-TEST — delete before merging
const _testError: number = "deliberate type error";
EOF

git add frontend/src/app/page.tsx
git commit -m "test: verify TS error blocks merge [DO NOT MERGE]"
git push origin test/ts-error-gate
```

Open a PR from `test/ts-error-gate` to `main`.

Verify:
- `Frontend CI / TypeScript Type Check` shows ❌
- `Frontend CI / Production Build` shows ⏭ Skipped
- The **Merge pull request** button is greyed out with the message:  
  _"Required status checks have not passed for this branch"_

Close the PR without merging. Delete the branch.

```bash
git checkout main
git branch -d test/ts-error-gate
git push origin --delete test/ts-error-gate
```

### Step 4 — Scenario 4: Environment variable runtime presence and source map absence

**Runtime presence check** — add a temporary diagnostic page (remove after validation):

Create `frontend/src/app/env-check/page.tsx`:

```typescript
// VALIDATION ONLY — remove this file before shipping to production
export default function EnvCheck() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  return (
    <pre>
      {JSON.stringify(
        {
          NEXT_PUBLIC_API_URL: apiUrl ?? "NOT_SET",
          hasValue: Boolean(apiUrl),
        },
        null,
        2
      )}
    </pre>
  );
}
```

Deploy to preview. Navigate to `<preview-url>/env-check` and confirm:
- `NEXT_PUBLIC_API_URL` shows the correct staging API URL (not `"NOT_SET"`)
- The value is the staging URL, not a production URL (scope isolation check)

**Source map absence check**:

```bash
# After production build, confirm no .map files in public output
ls frontend/.next/static/chunks/*.js.map 2>/dev/null && echo "FAIL: source maps present" || echo "PASS: no source maps"
```

Expected: `PASS: no source maps`

Additionally, in browser DevTools on the production URL:
1. Open **Network** tab
2. Filter by `.map`
3. Reload the page
4. Confirm zero `.map` requests are made

**Remove the diagnostic page before closing the story**:

```bash
rm frontend/src/app/env-check/page.tsx
git add -A
git commit -m "chore: remove env-check validation page"
git push
```

### Step 5 — Update `us_001.md` Definition of Done

Once all four scenarios pass, update the Definition of Done checkboxes in `.propel/context/tasks/EP-TECH/us_001.md`:

```markdown
## Definition of Done

- [x] Vercel project linked to GitHub repository
- [x] Production deployment succeeds on `main` merge (< 3 min)
- [x] Preview URLs auto-generated for all open PRs
- [x] Environment variables configured in Vercel dashboard (not in repo)
- [x] Build failure verified to block deployment
```

Also update the user story `status` front matter from `draft` to `done`:

```yaml
status: done
```

### Step 6 — Create validation evidence document

Create `.propel/context/tasks/EP-TECH/us_001/validation-evidence.md`:

```markdown
# US-001 Validation Evidence

## Date: YYYY-MM-DD
## Validator: <name>

| Scenario | Status | Evidence |
|----------|--------|----------|
| Scenario 1 — Production HTTP 200 < 3 min | PASS | curl output: HTTP 200, TTFB 0.09s; CD run: 2m 41s |
| Scenario 2 — Preview URL < 5 min | PASS | PR #XX: comment at T+3m 12s |
| Scenario 3 — TS error blocks merge | PASS | PR #YY: merge button disabled (screenshot attached) |
| Scenario 4 — Env var in runtime, not source map | PASS | /env-check shows correct URL; 0 .map files in output |
```

---

## Validation

| Check | Evidence Required | Owner |
|-------|------------------|-------|
| TTFB < 100 ms from edge | `curl` timing log | Developer |
| CD wall-clock ≤ 3 min | GitHub Actions run URL | Developer |
| Preview URL ≤ 5 min | PR comment timestamp | Developer |
| Merge blocked on TS error | Screenshot of greyed-out merge button | Developer |
| `NEXT_PUBLIC_API_URL` in browser runtime | `/env-check` page screenshot | Developer |
| Zero `.map` files in production | `ls` output or DevTools network screenshot | Developer |

---

## Dependencies

- **TASK-001** through **TASK-004** must all be complete before this validation task begins
- Production Vercel deployment must be live (Scenario 1)
- Branch protection rules must be active (Scenario 3)

## Security Constraints

- **OWASP A05**: The `env-check` diagnostic page must be removed before this task closes. It is a temporary validation-only artefact.
- **OWASP A02**: Source map absence confirmed in both build output and browser DevTools.

---

## Definition of Done

- [ ] Scenario 1 validated — production URL HTTP 200, CD run ≤ 3 min (evidence logged)
- [ ] Scenario 2 validated — preview URL posted ≤ 5 min from PR open (evidence logged)
- [ ] Scenario 3 validated — TS error blocks PR merge (screenshot captured)
- [ ] Scenario 4 validated — `NEXT_PUBLIC_API_URL` in runtime; zero source maps in output (evidence logged)
- [ ] `env-check` diagnostic page removed from codebase
- [ ] `us_001.md` Definition of Done checkboxes all ticked
- [ ] `us_001.md` `status` updated to `done`
- [ ] `validation-evidence.md` created and committed

## Traceability

| Artefact | ID |
|----------|----|
| User Story | US-001 |
| Epic | EP-TECH |
| NFR | NFR-001 (TTFB < 100 ms), NFR-003 (99.5% availability) |
| Scenario | 1, 2, 3, 4 (all acceptance criteria) |
