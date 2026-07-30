---
id: task_002
us_id: us_002
epic: EP-DATA
title: "Seed reason_codes Table with Standard Rejection, Withdrawal, and Cancellation Codes"
status: done
layer: backend
effort: 2h
priority: high
created: 2026-07-22
---

# TASK-002 — Seed reason_codes Table with Standard Rejection, Withdrawal, and Cancellation Codes

## Context

**User Story**: US-002 — Configuration and Policy Tables — Scoring Thresholds, Reason Codes, and Email Templates  
**Epic**: EP-DATA — Data Foundation  
**Addresses Acceptance Criteria**: Scenario 2 (at least 10 standard reason codes exist after seed; none can be deleted if referenced by a decision)

The `reason_codes` table was defined in EP-DATA / US-001 / TASK-001 with the correct schema (`category`, `code`, `displayText`, `active`) and the FK `decisions.reason_code_id → reason_codes.id ON DELETE RESTRICT`. This task provides the runtime seed data that populates the table on first deploy and adds a Prisma seed script to the repo.

---

## Objective

Write a `prisma/seed.ts` script that upserts the minimum viable set of reason codes (12 standard codes covering rejection, withdrawal, and interview cancellation categories), run it against staging, and verify the FK `Restrict` policy prevents deletion of any referenced code.

---

## Technical Specifications

| code | category | displayText |
|------|----------|-------------|
| `did_not_meet_requirements` | rejection | Did not meet minimum job requirements |
| `insufficient_experience` | rejection | Insufficient years of relevant experience |
| `skills_gap` | rejection | Significant gap in required technical skills |
| `failed_technical_assessment` | rejection | Did not pass technical assessment threshold |
| `salary_expectations_unmet` | rejection | Salary expectations exceed approved band |
| `overqualified` | rejection | Candidate is overqualified for the role |
| `position_filled` | rejection | Position filled by another candidate |
| `duplicate_application` | rejection | Duplicate application within cooling-off period |
| `candidate_withdrew` | withdrawal | Candidate voluntarily withdrew application |
| `candidate_unresponsive` | withdrawal | Candidate did not respond within the SLA window |
| `candidate_no_show` | interview_cancellation | Candidate did not attend scheduled interview |
| `scheduling_conflict` | interview_cancellation | Interview cancelled due to scheduling conflict |

---

## Implementation Steps

### Step 1 — Create the Prisma seed script

Create `backend/prisma/seed.ts`:

```typescript
import { PrismaClient, ReasonCodeCategory } from '@prisma/client';

const prisma = new PrismaClient();

const REASON_CODES: Array<{
  code: string;
  category: ReasonCodeCategory;
  displayText: string;
}> = [
  // Rejection codes
  {
    code: 'did_not_meet_requirements',
    category: 'rejection',
    displayText: 'Did not meet minimum job requirements',
  },
  {
    code: 'insufficient_experience',
    category: 'rejection',
    displayText: 'Insufficient years of relevant experience',
  },
  {
    code: 'skills_gap',
    category: 'rejection',
    displayText: 'Significant gap in required technical skills',
  },
  {
    code: 'failed_technical_assessment',
    category: 'rejection',
    displayText: 'Did not pass technical assessment threshold',
  },
  {
    code: 'salary_expectations_unmet',
    category: 'rejection',
    displayText: 'Salary expectations exceed approved compensation band',
  },
  {
    code: 'overqualified',
    category: 'rejection',
    displayText: 'Candidate is overqualified for the role',
  },
  {
    code: 'position_filled',
    category: 'rejection',
    displayText: 'Position has been filled by another candidate',
  },
  {
    code: 'duplicate_application',
    category: 'rejection',
    displayText: 'Duplicate application submitted within the cooling-off period',
  },
  // Withdrawal codes
  {
    code: 'candidate_withdrew',
    category: 'withdrawal',
    displayText: 'Candidate voluntarily withdrew the application',
  },
  {
    code: 'candidate_unresponsive',
    category: 'withdrawal',
    displayText: 'Candidate did not respond within the required SLA window',
  },
  // Interview cancellation codes
  {
    code: 'candidate_no_show',
    category: 'interview_cancellation',
    displayText: 'Candidate did not attend the scheduled interview',
  },
  {
    code: 'scheduling_conflict',
    category: 'interview_cancellation',
    displayText: 'Interview was cancelled due to an unresolvable scheduling conflict',
  },
];

async function seedReasonCodes(): Promise<void> {
  console.log('Seeding reason_codes ...');
  let upserted = 0;

  for (const rc of REASON_CODES) {
    await prisma.reasonCode.upsert({
      where: {
        // Uses the composite unique index (category, code)
        category_code: { category: rc.category, code: rc.code },
      },
      update: { displayText: rc.displayText, active: true },
      create: { ...rc, active: true },
    });
    upserted++;
  }

  console.log(`  ${upserted} reason codes upserted.`);
}

async function main(): Promise<void> {
  await seedReasonCodes();
}

main()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
```

### Step 2 — Register the seed script in `package.json`

Update `backend/package.json`:

```json
{
  "prisma": {
    "seed": "tsx prisma/seed.ts"
  }
}
```

Ensure `tsx` is installed as a dev dependency:

```bash
cd backend
npm install -D tsx
```

### Step 3 — Run the seed

```bash
cd backend
npx prisma db seed
```

Expected output:

```
Running seed command `tsx prisma/seed.ts` ...
Seeding reason_codes ...
  12 reason codes upserted.

🌱  The seed command has been executed.
```

### Step 4 — Verify seed count

```bash
npx prisma db execute --stdin <<'SQL'
SELECT category, COUNT(*) AS cnt
FROM reason_codes
GROUP BY category
ORDER BY category;
SQL
```

Expected:

| category | cnt |
|----------|-----|
| interview_cancellation | 2 |
| rejection | 8 |
| withdrawal | 2 |

Total: 12 rows (≥ 10 as required by Scenario 2).

### Step 5 — Verify FK Restrict blocks deletion of referenced codes

```bash
npx prisma db execute --stdin <<'SQL'
DO $$
DECLARE
  v_user_id  uuid := gen_random_uuid();
  v_jf_id    uuid := gen_random_uuid();
  v_req_id   uuid := gen_random_uuid();
  v_cand_id  uuid := gen_random_uuid();
  v_app_id   uuid := gen_random_uuid();
  v_rc_id    uuid;
  v_result   text;
BEGIN
  -- Get an existing reason code
  SELECT id INTO v_rc_id FROM reason_codes WHERE code = 'position_filled' LIMIT 1;

  -- Insert prerequisite rows
  INSERT INTO users (id, email, role, full_name)
    VALUES (v_user_id, 'fk-rc-test@test.internal', 'hr_manager', 'RC Test');

  INSERT INTO job_families (id, name, match_score_threshold, confidence_threshold,
                            experience_threshold_years, effective_from, created_by_id)
    VALUES (v_jf_id, 'RC Test JF', 70, 0.8, 3, now(), v_user_id);

  INSERT INTO requisitions (id, title, department, job_family_id, location, job_type,
                            slots, status, eligibility_criteria)
    VALUES (v_req_id, 'RC Test Req', 'Eng', v_jf_id, 'Remote', 'full_time', 5, 'open', '{}');

  INSERT INTO candidates (id, email, phone, consent_version, consent_timestamp, status)
    VALUES (v_cand_id, 'rc-test-cand@example.com', '+10000000055', '1.0', now(), 'active');

  INSERT INTO applications (id, candidate_id, requisition_id, status)
    VALUES (v_app_id, v_cand_id, v_req_id, 'shortlisted');

  INSERT INTO decisions (id, application_id, outcome, reason_code_id, decided_by_id, decided_at)
    VALUES (gen_random_uuid(), v_app_id, 'reject', v_rc_id, v_user_id, now());

  -- Attempt to delete the referenced reason code
  BEGIN
    DELETE FROM reason_codes WHERE id = v_rc_id;
    v_result := 'FAIL: DELETE succeeded — FK RESTRICT is MISSING on decisions.reason_code_id';
  EXCEPTION WHEN foreign_key_violation THEN
    v_result := 'PASS: DELETE blocked by FK RESTRICT (foreign_key_violation raised)';
  END;

  RAISE NOTICE '%', v_result;
  ROLLBACK;
END $$;
SQL
```

**Expected output**:

```
NOTICE:  PASS: DELETE blocked by FK RESTRICT (foreign_key_violation raised)
```

### Step 6 — Add seed idempotency test

Write a Vitest integration-style test to confirm `upsert` semantics (re-running the seed does not create duplicates):

Create `backend/prisma/__tests__/seed.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@prisma/client', () => {
  const upsert = vi.fn().mockResolvedValue({});
  const disconnect = vi.fn();
  return {
    PrismaClient: vi.fn().mockImplementation(() => ({
      reasonCode: { upsert },
      $disconnect: disconnect,
    })),
    ReasonCodeCategory: {
      rejection: 'rejection',
      withdrawal: 'withdrawal',
      interview_cancellation: 'interview_cancellation',
    },
  };
});

describe('reason_codes seed', () => {
  it('upserts exactly 12 reason codes', async () => {
    // Dynamically import to pick up the mock
    const { PrismaClient } = await import('@prisma/client');
    const client = new PrismaClient() as unknown as {
      reasonCode: { upsert: ReturnType<typeof vi.fn> };
      $disconnect: ReturnType<typeof vi.fn>;
    };

    // Re-import the seed REASON_CODES array indirectly via a count expectation
    // The 12 codes are tested by verifying upsert was called 12 times
    const { default: main } = await import('../seed');
    await main();

    expect(client.reasonCode.upsert).toHaveBeenCalledTimes(12);
  });

  it('uses category_code composite key for upsert where clause', async () => {
    const { PrismaClient } = await import('@prisma/client');
    const client = new PrismaClient() as unknown as {
      reasonCode: { upsert: ReturnType<typeof vi.fn> };
    };

    const calls = client.reasonCode.upsert.mock.calls as Array<[{ where: { category_code: unknown } }]>;
    for (const [args] of calls) {
      expect(args.where.category_code).toBeDefined();
    }
  });
});
```

> **Note**: The seed test mocks Prisma to avoid requiring a live database in CI. The integration-level verification (Step 4) is the primary evidence for Scenario 2.

---

## Validation

| Check | Method | Expected Result |
|-------|--------|-----------------|
| Seed runs without error | `npx prisma db seed` | 12 codes upserted |
| Count ≥ 10 | `COUNT(*)` query | 12 rows |
| All 3 categories present | `GROUP BY category` | rejection: 8, withdrawal: 2, interview_cancellation: 2 |
| FK Restrict blocks deletion | DO block test | `PASS: DELETE blocked` |
| Re-running seed is idempotent | Run `npx prisma db seed` twice | Row count unchanged at 12 |
| `npm test` | CLI | All unit tests green |
| `npm run type-check` | CLI | Exit 0 |

---

## Dependencies

- **EP-DATA / US-001 / TASK-001** — `reason_codes` table must exist with `@@unique([category, code])`
- **EP-DATA / US-001 / TASK-002** — `decisions.reason_code_id` FK must exist (for FK Restrict test)

## Security Constraints

- **OWASP A03 (Injection)**: The seed uses Prisma `upsert` with typed inputs — no raw SQL string interpolation.
- Seed data contains no PII. The `displayText` strings are business-rule descriptions suitable for external display.
- The DO block verification script uses `ROLLBACK` — no test data persists in staging.

---

## Definition of Done

- [ ] `backend/prisma/seed.ts` committed with 12 `reasonCode.upsert` calls
- [ ] `"prisma": { "seed": "tsx prisma/seed.ts" }` added to `package.json`
- [ ] `npx prisma db seed` runs successfully on staging
- [ ] 12 reason codes confirmed via `SELECT COUNT(*) FROM reason_codes`
- [ ] FK Restrict verification confirms deletion is blocked when code is referenced
- [ ] Re-running seed is idempotent (row count does not increase)
- [ ] `npm run type-check` exits 0

## Traceability

| Artefact | ID |
|----------|----|
| User Story | US-002 |
| Epic | EP-DATA |
| Scenario | 2 (≥ 10 standard reason codes seeded; deletion blocked if referenced) |
| Spec ref | FR-064, BR-09 (reason code required for rejection decisions) |
