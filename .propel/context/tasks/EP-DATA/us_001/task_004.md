---
id: task_004
us_id: us_001
epic: EP-DATA
title: "Enable Row-Level Security on Core Tables with Candidate, HR, and Admin Policies"
status: done
layer: backend
effort: 4h
priority: critical
created: 2026-07-22
---

# TASK-004 — Enable Row-Level Security on Core Tables with Candidate, HR, and Admin Policies

## Context

**User Story**: US-001 — Core Domain Schema — Candidates, Applications, Screenings, and Reviews  
**Epic**: EP-DATA — Data Foundation  
**Addresses Acceptance Criteria**: Scenario 5 (RLS enabled on `applications`; JWT with `role = candidate` returns only rows where `candidate_id = auth.uid()`)

Supabase PostgreSQL uses Supabase Auth JWTs. When a client uses the Supabase client library (or the REST API directly), the JWT is forwarded as a PostgreSQL `SET request.jwt.claims` session variable. RLS policies can read `current_setting('request.jwt.claims')` to extract `sub` (the user ID) and `role` (the application role) and enforce row-scoped access without any application-layer filtering code.

Prisma does not apply RLS — it connects as the `postgres` superuser via `DATABASE_URL`. RLS must therefore be applied in a raw SQL migration and is enforced at the Supabase PostgREST / direct-client layer.

---

## Objective

Create a Prisma migration containing raw SQL statements to: (1) enable RLS on the five most sensitive tables (`candidates`, `applications`, `screenings`, `reviews`, `decisions`), (2) create role-based policies for three roles (`candidate`, `hr_reviewer`/`recruiter`, `admin`), and (3) verify that the `candidate` role policy returns only the authenticated candidate's own rows.

---

## Technical Specifications

| Table | Role | Policy Type | Rule |
|-------|------|-------------|------|
| `candidates` | candidate | SELECT | `id = auth.uid()` |
| `candidates` | candidate | UPDATE | `id = auth.uid()` |
| `candidates` | hr_reviewer, recruiter, hr_manager | SELECT | `true` (all rows) |
| `candidates` | admin | ALL | `true` |
| `applications` | candidate | SELECT | `candidate_id = auth.uid()` |
| `applications` | candidate | INSERT | `candidate_id = auth.uid()` |
| `applications` | hr_reviewer, recruiter, hr_manager | SELECT | `true` |
| `applications` | admin | ALL | `true` |
| `screenings` | candidate | SELECT | `application_id IN (SELECT id FROM applications WHERE candidate_id = auth.uid())` |
| `screenings` | hr_reviewer, recruiter, hr_manager | SELECT | `true` |
| `screenings` | admin | ALL | `true` |
| `reviews` | candidate | SELECT | `application_id IN (SELECT id FROM applications WHERE candidate_id = auth.uid())` |
| `reviews` | hr_reviewer, recruiter, hr_manager | ALL | `true` |
| `reviews` | admin | ALL | `true` |
| `decisions` | candidate | SELECT | `application_id IN (SELECT id FROM applications WHERE candidate_id = auth.uid())` |
| `decisions` | hr_reviewer, recruiter, hr_manager | ALL | `true` |
| `decisions` | admin | ALL | `true` |

---

## Implementation Steps

### Step 1 — Create an empty Prisma migration for raw SQL

```bash
cd backend
npx prisma migrate dev --create-only --name "enable_rls_policies"
```

This creates `backend/prisma/migrations/<timestamp>_enable_rls_policies/migration.sql` with an empty file. Open it and paste the SQL from the following steps.

### Step 2 — Write the RLS SQL migration

Paste the following into the generated `migration.sql`:

```sql
-- ─── Helper: extract claim from JWT ──────────────────────────────────────────
-- Supabase Auth sets `request.jwt.claims` as a session variable (JSON string).
-- This function safely extracts a text field from the JWT claims.
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid AS $$
  SELECT COALESCE(
    current_setting('request.jwt.claims', true)::jsonb ->> 'sub',
    '00000000-0000-0000-0000-000000000000'
  )::uuid;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION auth.role() RETURNS text AS $$
  SELECT COALESCE(
    current_setting('request.jwt.claims', true)::jsonb ->> 'role',
    'anonymous'
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ─── Enable RLS ───────────────────────────────────────────────────────────────
ALTER TABLE candidates    ENABLE ROW LEVEL SECURITY;
ALTER TABLE applications  ENABLE ROW LEVEL SECURITY;
ALTER TABLE screenings    ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews       ENABLE ROW LEVEL SECURITY;
ALTER TABLE decisions     ENABLE ROW LEVEL SECURITY;

-- ─── candidates policies ─────────────────────────────────────────────────────

-- Candidates can only see/edit their own record
CREATE POLICY candidates_candidate_select ON candidates
  FOR SELECT
  USING (
    auth.role() = 'candidate'
    AND id = auth.uid()
  );

CREATE POLICY candidates_candidate_update ON candidates
  FOR UPDATE
  USING (
    auth.role() = 'candidate'
    AND id = auth.uid()
  );

-- HR staff can see all candidates
CREATE POLICY candidates_hr_select ON candidates
  FOR SELECT
  USING (auth.role() IN ('hr_reviewer', 'recruiter', 'hr_manager', 'tech_interviewer'));

-- Admin has full access
CREATE POLICY candidates_admin_all ON candidates
  FOR ALL
  USING (auth.role() = 'admin');

-- ─── applications policies ────────────────────────────────────────────────────

-- Candidates can see and create their own applications
CREATE POLICY applications_candidate_select ON applications
  FOR SELECT
  USING (
    auth.role() = 'candidate'
    AND candidate_id = auth.uid()
  );

CREATE POLICY applications_candidate_insert ON applications
  FOR INSERT
  WITH CHECK (
    auth.role() = 'candidate'
    AND candidate_id = auth.uid()
  );

-- HR staff can see all applications
CREATE POLICY applications_hr_select ON applications
  FOR SELECT
  USING (auth.role() IN ('hr_reviewer', 'recruiter', 'hr_manager', 'tech_interviewer'));

-- HR staff (recruiter/manager) can update application status
CREATE POLICY applications_hr_update ON applications
  FOR UPDATE
  USING (auth.role() IN ('recruiter', 'hr_manager'));

-- Admin has full access
CREATE POLICY applications_admin_all ON applications
  FOR ALL
  USING (auth.role() = 'admin');

-- ─── screenings policies ──────────────────────────────────────────────────────

-- Candidates can see screening results for their own applications
CREATE POLICY screenings_candidate_select ON screenings
  FOR SELECT
  USING (
    auth.role() = 'candidate'
    AND application_id IN (
      SELECT id FROM applications WHERE candidate_id = auth.uid()
    )
  );

-- HR staff can see all screenings
CREATE POLICY screenings_hr_select ON screenings
  FOR SELECT
  USING (auth.role() IN ('hr_reviewer', 'recruiter', 'hr_manager', 'tech_interviewer'));

-- HR reviewer can insert/update screening results (AI worker runs as service role)
CREATE POLICY screenings_hr_write ON screenings
  FOR ALL
  USING (auth.role() IN ('hr_reviewer', 'recruiter', 'hr_manager'));

-- Admin has full access
CREATE POLICY screenings_admin_all ON screenings
  FOR ALL
  USING (auth.role() = 'admin');

-- ─── reviews policies ─────────────────────────────────────────────────────────

-- Candidates can see review decisions for their own applications
CREATE POLICY reviews_candidate_select ON reviews
  FOR SELECT
  USING (
    auth.role() = 'candidate'
    AND application_id IN (
      SELECT id FROM applications WHERE candidate_id = auth.uid()
    )
  );

-- HR staff can manage reviews
CREATE POLICY reviews_hr_all ON reviews
  FOR ALL
  USING (auth.role() IN ('hr_reviewer', 'recruiter', 'hr_manager'));

-- Admin has full access
CREATE POLICY reviews_admin_all ON reviews
  FOR ALL
  USING (auth.role() = 'admin');

-- ─── decisions policies ───────────────────────────────────────────────────────

-- Candidates can see final decisions for their own applications
CREATE POLICY decisions_candidate_select ON decisions
  FOR SELECT
  USING (
    auth.role() = 'candidate'
    AND application_id IN (
      SELECT id FROM applications WHERE candidate_id = auth.uid()
    )
  );

-- HR staff can manage decisions
CREATE POLICY decisions_hr_all ON decisions
  FOR ALL
  USING (auth.role() IN ('hr_reviewer', 'hr_manager', 'recruiter'));

-- Admin has full access
CREATE POLICY decisions_admin_all ON decisions
  FOR ALL
  USING (auth.role() = 'admin');
```

### Step 3 — Apply the migration

```bash
npx prisma migrate deploy
# Or in development:
npx prisma migrate dev
```

### Step 4 — Create a Supabase test script for RLS verification

Create `backend/scripts/test-rls.ts`:

```typescript
/**
 * RLS Verification Script
 *
 * Tests that a JWT with `role = candidate` can only query their own applications.
 *
 * Prerequisites:
 * - SUPABASE_URL and SUPABASE_ANON_KEY in .env
 * - Two candidate accounts created in Supabase Auth
 * - At least one application for each candidate in the database
 */
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env['SUPABASE_URL']!;
const supabaseAnonKey = process.env['SUPABASE_ANON_KEY']!;

async function signIn(email: string, password: string) {
  const supabase = createClient(supabaseUrl, supabaseAnonKey);
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw new Error(`Sign-in failed: ${error?.message}`);
  return data.session.access_token;
}

async function testCandidateRLS(
  candidateEmail: string,
  candidatePassword: string,
  expectedCandidateId: string,
): Promise<void> {
  console.log(`\nTesting RLS for candidate: ${candidateEmail}`);

  const token = await signIn(candidateEmail, candidatePassword);

  // Use authenticated Supabase client (sends JWT in Authorization header)
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: applications, error } = await supabase
    .from('applications')
    .select('id, candidate_id, status');

  if (error) throw new Error(`Query failed: ${error.message}`);
  if (!applications || applications.length === 0) {
    console.warn('  No applications found — seed data required');
    return;
  }

  // All returned rows must belong to the authenticated candidate
  const leaked = applications.filter(a => a.candidate_id !== expectedCandidateId);
  if (leaked.length > 0) {
    throw new Error(
      `RLS FAILURE: ${leaked.length} rows returned for other candidates!\n` +
      JSON.stringify(leaked, null, 2),
    );
  }

  console.log(`  PASS: ${applications.length} rows returned, all owned by ${expectedCandidateId}`);
}

async function main(): Promise<void> {
  // These credentials must be pre-seeded in Supabase Auth + applications table
  await testCandidateRLS(
    process.env['TEST_CANDIDATE_1_EMAIL']!,
    process.env['TEST_CANDIDATE_1_PASSWORD']!,
    process.env['TEST_CANDIDATE_1_ID']!,
  );

  await testCandidateRLS(
    process.env['TEST_CANDIDATE_2_EMAIL']!,
    process.env['TEST_CANDIDATE_2_PASSWORD']!,
    process.env['TEST_CANDIDATE_2_ID']!,
  );

  console.log('\nAll RLS checks passed.');
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
```

Add to `package.json`:

```json
"test:rls": "tsx scripts/test-rls.ts"
```

### Step 5 — Add required Supabase client environment variable

Update `backend/.env.example`:

```env
# Supabase public anon key — used by RLS test script and client-side calls
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_ANON_KEY=eyJ...
```

Install Supabase JS client (dev dependency — only used in test scripts):

```bash
npm install -D @supabase/supabase-js
```

---

## Validation

| Check | Method | Expected Result |
|-------|--------|-----------------|
| RLS enabled on 5 tables | `SELECT relname, relrowsecurity FROM pg_class WHERE relname IN ('candidates','applications','screenings','reviews','decisions')` | `relrowsecurity = true` for all 5 |
| Candidate only sees own applications | `npm run test:rls` | `PASS` for both candidate accounts |
| HR role sees all applications | Manual Supabase Studio query with HR JWT | All rows returned |
| `auth.uid()` function exists | `\df auth.uid` in psql | Function present |
| Prisma service role bypasses RLS | Direct `prisma.application.findMany()` in backend | Returns all rows (Prisma uses service role) |
| `prisma migrate status` | CLI | No pending migrations |

---

## Dependencies

- **TASK-002** must be complete (all 5 tables exist before RLS can be enabled)
- Supabase Auth must be configured in the Supabase project (to generate valid JWTs for test)
- Two test candidate accounts must be created in Supabase Auth with known passwords and linked `candidates` rows

## Security Constraints

- **OWASP A01 (Broken Access Control)**: RLS is the last line of defence against cross-tenant data leakage. Even if an application-layer bug constructs an incorrect query, RLS ensures rows from other candidates are never returned to the Supabase anon/authenticated role.
- **OWASP A07 (Identification and Authentication Failures)**: The `auth.uid()` function reads from `request.jwt.claims` which Supabase sets automatically from the verified JWT. It cannot be spoofed by setting HTTP headers — the JWT signature is validated by Supabase before the session variable is populated.
- The Prisma `DATABASE_URL` uses the service role connection string (bypasses RLS intentionally for application code). This is correct — RLS is enforced at the Supabase PostgREST/anon layer for direct client calls. The Express API enforces access control via middleware, not RLS.
- RLS on `screenings` and `decisions` uses a subquery on `applications`. This subquery runs with the SECURITY DEFINER of `auth.uid()` — not as the row's owner — which is safe because `applications` itself has a matching RLS policy.
- **Test credentials** (`TEST_CANDIDATE_1_*`) must not be committed to `.env` — they belong in `.env.test.local` or Railway staging Variables.

---

## Definition of Done

- [ ] `migration.sql` for `enable_rls_policies` contains `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` for 5 tables
- [ ] 16 `CREATE POLICY` statements committed in the migration
- [ ] `auth.uid()` and `auth.role()` helper functions created
- [ ] Migration applied to staging Supabase instance
- [ ] `backend/scripts/test-rls.ts` committed
- [ ] RLS test passes: candidate A cannot see candidate B's applications
- [ ] HR test confirmed: HR role returns all rows
- [ ] `prisma migrate status` shows no pending migrations

## Traceability

| Artefact | ID |
|----------|----|
| User Story | US-001 |
| Epic | EP-DATA |
| Scenario | 5 (RLS restricts candidate to own applications) |
| Spec ref | §7.3 (integrity constraints), GDPR Article 5(1)(b) (purpose limitation) |
