# US-001 Manual Setup Checklist

## Goal

Complete all external setup and evidence capture required to close US-001.

## 1. Vercel Project Setup

- [ ] Import the GitHub repository into Vercel.
- [ ] Set Root Directory to `frontend`.
- [ ] Confirm Framework Preset is Next.js.
- [ ] Confirm Production Branch is `main`.

## 2. Vercel Environment Variables

Add in Vercel: Project -> Settings -> Environment Variables.

- [ ] `NEXT_PUBLIC_API_URL` (Production) = prod API URL
- [ ] `NEXT_PUBLIC_API_URL` (Preview) = staging API URL
- [ ] `NEXT_PUBLIC_API_URL` (Development) = `http://localhost:3001`
- [ ] `NEXT_PUBLIC_SUPABASE_URL` (Production + Preview)
- [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY` (Production + Preview)

Reference values: `frontend/docs/vercel-setup.md`.

## 3. Vercel Token + IDs

- [ ] Create `VERCEL_TOKEN` in Vercel Account Settings -> Tokens.
- [ ] Capture `VERCEL_ORG_ID` from Vercel project metadata.
- [ ] Capture `VERCEL_PROJECT_ID` from Vercel project metadata.

## 4. GitHub Secrets

Add in GitHub: Repository -> Settings -> Secrets and variables -> Actions.

- [ ] `VERCEL_TOKEN`
- [ ] `VERCEL_ORG_ID`
- [ ] `VERCEL_PROJECT_ID`
- [ ] `NEXT_PUBLIC_API_URL_PREVIEW`
- [ ] `NEXT_PUBLIC_SUPABASE_URL`
- [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY`

## 5. Branch Protection on `main`

GitHub: Repository -> Settings -> Branches -> Branch protection rule.

- [ ] Require pull request before merging.
- [ ] Require status checks to pass before merging.
- [ ] Require branch to be up to date before merging.
- [ ] Add required checks:
  - [ ] Frontend CI / TypeScript Type Check
  - [ ] Frontend CI / ESLint
  - [ ] Frontend CI / Production Build

## 6. Prevent Double Deployments

- [ ] In Vercel Project -> Settings -> Git, disable auto deploy on push if GitHub Actions CD is source of truth.

## 7. Task-005 Validation Evidence

### Scenario 1: Production deploy under 3 minutes

- [ ] Merge a PR to `main`.
- [ ] Confirm `Frontend CD / Deploy Production` runs.
- [ ] Confirm deployment completes within 3 minutes.
- [ ] Confirm deployed production URL returns HTTP 200.

### Scenario 2: Preview URL under 5 minutes

- [ ] Open PR.
- [ ] Confirm `Frontend CD / Deploy Preview` runs.
- [ ] Confirm preview URL comment appears within 5 minutes.

### Scenario 3: Build failure blocks merge

- [ ] Create test branch with intentional TypeScript error.
- [ ] Open PR.
- [ ] Confirm TypeScript check fails.
- [ ] Confirm merge button is blocked.
- [ ] Close PR and remove test branch.

### Scenario 4: Env/runtime + source map check

- [ ] Confirm runtime has expected `NEXT_PUBLIC_API_URL` for environment.
- [ ] Confirm production browser source maps are not exposed.

## 8. Story Closure Updates

- [ ] Mark all US-001 DoD checkboxes complete in `.propel/context/tasks/EP-TECH/us_001.md`.
- [ ] Update `status` in `.propel/context/tasks/EP-TECH/us_001.md` to `done`.
- [ ] Set `task_005.md` status to `done` after evidence is collected.
- [ ] Create and commit `.propel/context/tasks/EP-TECH/us_001/validation-evidence.md` with timestamps and proof links/screenshots.

## Optional Fast Commands

```bash
# Trigger PR checks after small change
# (edit frontend/src/app/page.tsx, commit, push)

git checkout -b feat/us001-validation
# make small non-breaking change
git add .
git commit -m "chore: trigger US-001 validation"
git push -u origin feat/us001-validation
```
