---
id: task_005
us_id: us_002
epic: EP-DATA
title: "Validate All Configuration Policy Scenarios — Effective-Date Isolation, Seeds, Token Rendering, Approver Chains — DoD Sign-off"
status: not-started
layer: backend
effort: 2h
priority: high
created: 2026-07-22
---

# TASK-005 — Validate All Configuration Policy Scenarios — DoD Sign-off

## Context

**User Story**: US-002 — Configuration and Policy Tables — Scoring Thresholds, Reason Codes, and Email Templates  
**Epic**: EP-DATA — Data Foundation  
**Addresses**: All 4 acceptance criteria scenarios + all Definition of Done items

This task runs structured validation for each of the four scenarios, collects evidence, and confirms the complete DoD.

---

## Objective

Execute scenario validations against staging, collect terminal outputs and SQL results as evidence, and update `us_002.md` to `status: done`.

---

## Pre-Validation Checklist

| Task | Description | Status |
|------|-------------|--------|
| TASK-001 | `scoring_thresholds` model + `getActiveThreshold` helper | ☐ Complete |
| TASK-002 | `reason_codes` seed (12 rows) + FK Restrict verification | ☐ Complete |
| TASK-003 | `approval_policies` versioning + seed (6 band rows) | ☐ Complete |
| TASK-004 | `renderTemplate` service + 11 email templates seeded | ☐ Complete |

---

## Validation Scenarios

### Scenario 1 — New Scoring Threshold Active Only After Effective Date

**Acceptance Criterion**: Old threshold (0.70) used for applications submitted today; new threshold (0.75) used for applications submitted tomorrow.

#### Step 1 — Insert two threshold versions and query by date

```bash
npx prisma db execute --stdin <<'SQL'
DO $$
DECLARE
  v_user_id uuid := gen_random_uuid();
  v_jf_id   uuid := gen_random_uuid();
  today     timestamptz := date_trunc('day', now());
  tomorrow  timestamptz := today + interval '1 day';
BEGIN
  -- Prerequisite rows
  INSERT INTO users (id, email, role, full_name)
    VALUES (v_user_id, 'threshold-test@test.internal', 'admin', 'Threshold Test');

  INSERT INTO job_families (id, name, match_score_threshold, confidence_threshold,
                            experience_threshold_years, effective_from, created_by_id)
    VALUES (v_jf_id, 'Threshold Test JF', 70, 0.8, 3, today, v_user_id);

  -- Version 1: threshold 0.70, effective from yesterday
  INSERT INTO scoring_thresholds (id, job_family_id, ai_shortlist_threshold, confidence_threshold,
                                  experience_threshold_years, effective_from, created_by_id)
    VALUES (gen_random_uuid(), v_jf_id, 0.70, 0.80, 3, today - interval '1 day', v_user_id);

  -- Version 2: threshold 0.75, effective from tomorrow
  INSERT INTO scoring_thresholds (id, job_family_id, ai_shortlist_threshold, confidence_threshold,
                                  experience_threshold_years, effective_from, created_by_id)
    VALUES (gen_random_uuid(), v_jf_id, 0.75, 0.80, 3, tomorrow, v_user_id);

  -- Query: threshold active TODAY (should be 0.70)
  RAISE NOTICE 'Threshold at today (should be 0.70): %',
    (SELECT ai_shortlist_threshold FROM scoring_thresholds
     WHERE job_family_id = v_jf_id AND effective_from <= today
     ORDER BY effective_from DESC LIMIT 1);

  -- Query: threshold active TOMORROW (should be 0.75)
  RAISE NOTICE 'Threshold at tomorrow (should be 0.75): %',
    (SELECT ai_shortlist_threshold FROM scoring_thresholds
     WHERE job_family_id = v_jf_id AND effective_from <= tomorrow
     ORDER BY effective_from DESC LIMIT 1);

  ROLLBACK;
END $$;
SQL
```

**Expected output**:

```
NOTICE:  Threshold at today (should be 0.70): 0.7000
NOTICE:  Threshold at tomorrow (should be 0.75): 0.7500
```

**Evidence**: Paste in `validation-evidence.md`.

---

### Scenario 2 — Reason Code Table Populated with Seed Values

**Acceptance Criterion**: At least 10 standard rejection reason codes exist; none can be deleted if referenced by a decision.

#### Step 2a — Count seeded rows

```bash
cd backend
npx prisma db execute --stdin <<'SQL'
SELECT
  category,
  COUNT(*) AS cnt,
  STRING_AGG(code, ', ' ORDER BY code) AS codes
FROM reason_codes
GROUP BY category
ORDER BY category;
SQL
```

**Expected**:

| category | cnt | codes |
|----------|-----|-------|
| interview_cancellation | 2 | candidate_no_show, scheduling_conflict |
| rejection | 8 | did_not_meet_requirements, duplicate_application, … |
| withdrawal | 2 | candidate_unresponsive, candidate_withdrew |

**Verification**: Total must be ≥ 10. ✓

#### Step 2b — FK Restrict test

Run the DO block from TASK-002 / Step 5.

**Expected**: `NOTICE: PASS: DELETE blocked by FK RESTRICT`

**Evidence**: Paste SQL output in `validation-evidence.md`.

---

### Scenario 3 — Email Template Renders All Tokens

**Acceptance Criterion**: `offer_extended` template renders `{{candidate_name}}` and `{{role_title}}`; no raw `{{...}}` strings remain.

#### Step 3a — Confirm template exists in database

```bash
npx prisma db execute --stdin <<'SQL'
SELECT type, locale, version, subject, LEFT(body_html, 80) AS body_preview
FROM templates
WHERE type = 'offer'
ORDER BY version;
SQL
```

**Expected**: One row with `type = offer`, subject containing `{{candidate_name}}` and `{{role_title}}`.

#### Step 3b — Run unit tests for the renderer

```bash
cd backend
npm test -- src/services/__tests__/templateRenderer.test.ts
```

**Expected**: All 11 tests pass.

#### Step 3c — Smoke-test the renderer against the database row

Create a one-off smoke test script (do not commit):

```bash
cd backend
npx tsx --eval "
import prisma from './src/db/prisma';
import { renderTemplate, findMissingTokens } from './src/services/templateRenderer';

const tmpl = await prisma.template.findFirstOrThrow({ where: { type: 'offer', active: true } });
const tokens = { candidate_name: 'Jane Smith', role_title: 'Senior Engineer', offer_expiry_date: '2026-08-30' };

const missing = findMissingTokens(tmpl, tokens);
if (missing.length > 0) { console.error('Missing tokens:', missing); process.exit(1); }

const rendered = renderTemplate(tmpl, tokens);
if (/\{\{.*?\}\}/.test(rendered.bodyHtml)) { console.error('Unresolved tokens in bodyHtml'); process.exit(1); }
console.log('PASS: offer template rendered with no unresolved tokens');
console.log('Subject:', rendered.subject);
prisma.\$disconnect();
"
```

**Expected**:

```
PASS: offer template rendered with no unresolved tokens
Subject: Congratulations Jane Smith — Offer for Senior Engineer
```

**Evidence**: Paste output in `validation-evidence.md`.

---

### Scenario 4 — Approval Policy Returns Correct Approver Chain for L5

**Acceptance Criterion**: `compensation_band = "L5"` (salary in 140 001–180 000 range) returns a 3-tier approver list.

#### Step 4a — Query approval policies

```bash
npx prisma db execute --stdin <<'SQL'
SELECT
  compensation_band_min,
  compensation_band_max,
  required_approvers,
  effective_from
FROM approval_policies
WHERE active = true
ORDER BY compensation_band_min;
SQL
```

**Expected**: 6 rows with correct band ranges and approver arrays.

#### Step 4b — Query for L5 salary (160 000)

```bash
npx prisma db execute --stdin <<'SQL'
SELECT required_approvers
FROM approval_policies
WHERE compensation_band_min <= 160000
  AND compensation_band_max >= 160000
  AND active = true
ORDER BY effective_from DESC
LIMIT 1;
SQL
```

**Expected**:

```
required_approvers
-------------------------------------------------
["hiring_manager","hr_manager","finance_director"]
```

Verify:
- [ ] Returns exactly 3 approvers
- [ ] Includes `finance_director` (L5 threshold trigger)
- [ ] Does NOT include `ceo` (L6+ only)

**Evidence**: Paste query output in `validation-evidence.md`.

#### Step 4c — Confirm helper function

```bash
cd backend
npx tsx --eval "
import { getActiveApprovalPolicy } from './src/db/approvalPolicies';
const result = await getActiveApprovalPolicy(160_000);
if (!result) { console.error('FAIL: No policy returned'); process.exit(1); }
if (result.requiredApprovers.length !== 3) { console.error('FAIL: Expected 3 approvers, got', result.requiredApprovers.length); process.exit(1); }
console.log('PASS: L5 approver chain:', JSON.stringify(result.requiredApprovers));
"
```

**Expected**:

```
PASS: L5 approver chain: ["hiring_manager","hr_manager","finance_director"]
```

---

## Run All Unit Tests

```bash
cd backend
npm test
```

**Verification checklist**:
- [ ] `scoringThresholds.test.ts` — 4 tests ✓
- [ ] `approvalPolicies.test.ts` — 4 tests ✓
- [ ] `templateRenderer.test.ts` — 11 tests ✓
- [ ] All prior tests from EP-TECH and EP-DATA US-001 remain green

---

## Final Validation Summary

| Scenario | Criterion | Status |
|----------|-----------|--------|
| 1 | Old threshold (0.70) active today; new (0.75) active from tomorrow | ☐ |
| 2 | ≥ 10 reason codes seeded; FK Restrict blocks deletion | ☐ |
| 3 | Offer template renders both tokens; no raw `{{...}}` remains | ☐ |
| 4 | L5 salary returns 3-tier approver chain including `finance_director` | ☐ |
| DoD | All unit tests pass; `type-check` passes; seed idempotent | ☐ |

---

## Update User Story Status

Update `us_002.md`:

```yaml
# Change: status: draft
# To:     status: done
```

Tick all Definition of Done checkboxes.

---

## Dependencies

- **TASK-001** through **TASK-004** complete and deployed to staging
- `npx prisma db seed` run at least once on staging
- Live Supabase staging database accessible

## Security Constraints

- Validation SQL scripts use `ROLLBACK` within DO blocks — no test data persists
- The smoke-test script in Step 3c is not committed — it is a one-time verification step
- Token values used in smoke tests (`Jane Smith`, `Senior Engineer`) are synthetic and contain no real PII

---

## Definition of Done

- [ ] All 4 scenario validations confirmed with terminal evidence
- [ ] `docs/validation/ep_data_us_002_validation_evidence.md` committed (optional but recommended)
- [ ] `us_002.md` status updated to `done`
- [ ] `npm test` exits 0 (19 new tests: 4 + 4 + 11)
- [ ] `npm run type-check` exits 0
- [ ] `npx prisma db seed` is idempotent (safe to re-run)

## Traceability

| Artefact | ID |
|----------|----|
| User Story | US-002 |
| Epic | EP-DATA |
| Scenarios | 1, 2, 3, 4 |
| Spec ref | FR-024 (thresholds), FR-057 (templates), FR-064 (policy versioning), BR-14 (threshold isolation) |
