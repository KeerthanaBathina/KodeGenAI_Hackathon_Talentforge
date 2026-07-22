---
id: task_002
us_id: us_001
epic: EP-TECH
title: "Configure Vercel Project Link and Environment Variable Scoping"
status: not-started
layer: infrastructure
effort: 2h
priority: critical
created: 2026-07-22
---

# TASK-002 — Configure Vercel Project Link and Environment Variable Scoping

## Context

**User Story**: US-001 — Deploy Frontend to Vercel with CDN and Preview Environments  
**Epic**: EP-TECH — Technical Bootstrap  
**Addresses Acceptance Criteria**: Scenario 1 (production deployment on main merge), Scenario 4 (environment variables injected at build time, not exposed in source maps)

This task links the GitHub repository to a Vercel project, configures `vercel.json` for deterministic build behaviour, and establishes the environment variable scoping strategy so that secrets are never committed to source control.

---

## Objective

Link the repository to Vercel, commit a `vercel.json` configuration file, and document the exact Vercel dashboard steps required to inject `NEXT_PUBLIC_API_URL` and Supabase keys without exposing them in source maps or build artefacts.

---

## Technical Specifications

| Attribute | Value |
|-----------|-------|
| Hosting Platform | Vercel (Hobby or Pro team account) |
| Root Directory | `frontend/` (monorepo layout) |
| Framework Preset | Next.js |
| Build Command | `npm run build` |
| Output Directory | `.next` (Vercel auto-detects) |
| Node.js Version | 20.x (set via Vercel project settings) |
| Install Command | `npm ci` |

---

## Implementation Steps

### Step 1 — Link repository via Vercel CLI (one-time setup)

```bash
npm install -g vercel
cd frontend
vercel link
```

Prompts:
- **Set up and deploy?** → `Y`
- **Which scope?** → Select your team
- **Link to existing project?** → `N` (create new)
- **Project name?** → `ai-interview-app-frontend`
- **In which directory?** → `./` (already inside `frontend/`)

This creates `frontend/.vercel/project.json` — **do not commit** this file.

Add to `frontend/.gitignore`:

```
.vercel
```

### Step 2 — Commit `vercel.json` to repository root of `frontend/`

Create `frontend/vercel.json`:

```json
{
  "framework": "nextjs",
  "buildCommand": "npm run build",
  "installCommand": "npm ci",
  "outputDirectory": ".next",
  "regions": ["iad1"],
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "X-Robots-Tag", "value": "noindex" }
      ]
    }
  ],
  "github": {
    "silent": false,
    "autoJobCancelation": true
  }
}
```

> **Rationale for `regions: ["iad1"]`**: Single-region lock prevents cold-start variance during initial benchmarking. Update to `["iad1","sfo1","lhr1"]` before production launch per NFR-001.

### Step 3 — Configure environment variables in Vercel dashboard

Navigate to: **Vercel Dashboard → Project → Settings → Environment Variables**

Add the following variables with the specified scope:

| Variable | Value | Scope |
|----------|-------|-------|
| `NEXT_PUBLIC_API_URL` | `https://api.ai-interview.railway.app` | **Production** only |
| `NEXT_PUBLIC_API_URL` | `https://api-staging.ai-interview.railway.app` | **Preview** only |
| `NEXT_PUBLIC_API_URL` | `http://localhost:3001` | **Development** only |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<project>.supabase.co` | Production + Preview |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `<anon-key>` | Production + Preview |

> **Security**: `NEXT_PUBLIC_*` variables are embedded in the browser bundle. Confirm that only public/anonymous credentials are assigned this prefix. Private API keys must use server-only env vars (no `NEXT_PUBLIC_` prefix) and accessed exclusively in Server Components or Route Handlers.

### Step 4 — Verify source map security

In `frontend/next.config.js`, add:

```js
const nextConfig = {
  // ... existing config
  productionBrowserSourceMaps: false,  // default; explicit for auditability
};
```

This ensures `.js.map` files are **not** uploaded to Vercel's CDN, preventing reverse-engineering of `NEXT_PUBLIC_API_URL` path patterns from minified bundles.

### Step 5 — Set Node.js runtime version in Vercel

In **Vercel Dashboard → Project → Settings → General → Node.js Version**, select **20.x**.

Alternatively, commit `.nvmrc` to `frontend/`:

```
20
```

Vercel respects `.nvmrc` to pin the runtime.

### Step 6 — Record Vercel project ID in documentation

Create `frontend/docs/vercel-setup.md` (or add to `README.md`):

```markdown
## Vercel Project Configuration

- **Project Name**: ai-interview-app-frontend
- **Vercel Project ID**: `<project-id-from-vercel-dashboard>`
- **Production Branch**: main
- **Preview Branches**: all PRs automatically
- **Root Directory**: frontend/

Environment variables are managed in the Vercel dashboard only — never in source control.
```

---

## Validation

| Check | Method | Expected Result |
|-------|--------|-----------------|
| `vercel.json` parses correctly | `npx vercel build --local` | No config errors |
| `.vercel/` excluded from git | `git status` | Directory untracked |
| Env vars scoped correctly | Vercel dashboard review | `NEXT_PUBLIC_API_URL` has 3 separate scope entries |
| Source maps disabled | `ls frontend/.next/static/chunks/*.map 2>/dev/null` | No `.map` files in build output |
| Node.js version pinned | `cat frontend/.nvmrc` | `20` |

---

## Dependencies

- **TASK-001** must be complete (Next.js project must exist)
- Vercel team account provisioned (stated in US-001 dependencies)
- GitHub repository must have the `main` branch configured as default

## Security Constraints

- **OWASP A02 (Cryptographic Failures)**: `productionBrowserSourceMaps: false` prevents API endpoint exposure in map files.
- **OWASP A05 (Security Misconfiguration)**: Environment variables are scope-isolated; production secrets never bleed into preview environments.
- **OWASP A01 (Broken Access Control)**: The Vercel project is linked to the team account, not a personal account, ensuring access control is team-governed.

---

## Definition of Done

- [ ] `vercel.json` committed to `frontend/`
- [ ] `.vercel/` added to `frontend/.gitignore`
- [ ] `.nvmrc` committed with value `20`
- [ ] `productionBrowserSourceMaps: false` in `next.config.js`
- [ ] Vercel dashboard shows 3 scoped entries for `NEXT_PUBLIC_API_URL`
- [ ] Vercel project linked to GitHub repository (visible in Vercel dashboard)
- [ ] `vercel-setup.md` or equivalent documentation committed

## Traceability

| Artefact | ID |
|----------|----|
| User Story | US-001 |
| Epic | EP-TECH |
| NFR | NFR-001 (performance — single CDN region pinned), NFR-003 (availability) |
| Scenario | 1 (production deployment), 4 (env var injection + source map security) |
