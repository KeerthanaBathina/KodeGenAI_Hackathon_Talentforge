---
id: task_003
us_id: us_002
epic: EP-DATA
title: "Add Versioning Columns to approval_policies and Seed Compensation-Band Approver Chains"
status: done
layer: backend
effort: 3h
priority: high
created: 2026-07-22
---

# TASK-003 — Add Versioning Columns to approval_policies and Seed Compensation-Band Approver Chains

## Context

**User Story**: US-002 — Configuration and Policy Tables — Scoring Thresholds, Reason Codes, and Email Templates  
**Epic**: EP-DATA — Data Foundation  
**Addresses Acceptance Criteria**: Scenario 4 (given `compensation_band = "L5"`, querying the approval policy returns the correct multi-tier approver list)

The `approval_policies` table was defined in EP-DATA / US-001 / TASK-001 with `compensationBandMin`, `compensationBandMax`, `requiredApprovers`, `active`, and `createdAt` columns. FR-064 requires policy changes to be versioned with an effective date so in-flight applications continue under the previous version. This task adds `effectiveFrom` and `createdById` to the existing table and seeds it with L1–L6 compensation-band approver chains.

---

## Objective

Migrate the `approval_policies` table to add `effective_from TIMESTAMPTZ` and `created_by_id UUID` columns, update the Prisma model, write a seed function for standard L1–L6 approver chains, provide a `getActiveApprovalPolicy(compensationBand, asOf)` helper, and verify the L5 band returns the correct two-tier approver chain.

---

## Technical Specifications

### Compensation band definitions

| Band | Min (USD) | Max (USD) | Approver Chain |
|------|-----------|-----------|----------------|
| L1 | 0 | 50 000 | `["hiring_manager"]` |
| L2 | 50 001 | 80 000 | `["hiring_manager"]` |
| L3 | 80 001 | 110 000 | `["hiring_manager", "hr_manager"]` |
| L4 | 110 001 | 140 000 | `["hiring_manager", "hr_manager"]` |
| L5 | 140 001 | 180 000 | `["hiring_manager", "hr_manager", "finance_director"]` |
| L6 | 180 001 | 999 999 | `["hiring_manager", "hr_manager", "finance_director", "ceo"]` |

### New columns added in this migration

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `effective_from` | `TIMESTAMPTZ` | NOT NULL | `'1970-01-01'` (backfill existing rows) |
| `created_by_id` | `UUID` | NULL (existing rows have no known author) | `NULL` |

---

## Implementation Steps

### Step 1 — Update the `ApprovalPolicy` model in `schema.prisma`

Open `backend/prisma/schema.prisma` and replace the existing `ApprovalPolicy` model with:

```prisma
model ApprovalPolicy {
  id                   String    @id @default(uuid()) @db.Uuid
  compensationBandMin  Decimal   @db.Decimal(12, 2)
  compensationBandMax  Decimal   @db.Decimal(12, 2)
  requiredApprovers    Json      @db.JsonB
  active               Boolean   @default(true)
  effectiveFrom        DateTime  @default(dbgenerated("'1970-01-01'::timestamptz")) @db.Timestamptz
  createdById          String?   @db.Uuid
  createdAt            DateTime  @default(now()) @db.Timestamptz

  // Relations
  createdBy User? @relation("ApprovalPolicyAuthor", fields: [createdById], references: [id], onDelete: SetNull)

  @@index([compensationBandMin, compensationBandMax, effectiveFrom(sort: Desc)], name: "idx_approval_policies_band_effective")
  @@map("approval_policies")
}
```

Add the back-relation to the `User` model:

```prisma
  approvalPoliciesAuthored ApprovalPolicy[] @relation("ApprovalPolicyAuthor")
```

### Step 2 — Generate and apply the migration

```bash
cd backend
npx prisma migrate dev --name "add_approval_policies_versioning"
npx prisma generate
```

Verify the migration SQL contains:

```sql
ALTER TABLE "approval_policies"
  ADD COLUMN "effective_from" TIMESTAMPTZ NOT NULL DEFAULT '1970-01-01'::timestamptz,
  ADD COLUMN "created_by_id" UUID;
```

> The `DEFAULT '1970-01-01'` backfills any pre-existing rows with epoch so they are always returned as "historic" and not confused with current policy.

### Step 3 — Add approval policy seed to `prisma/seed.ts`

Append to `backend/prisma/seed.ts`:

```typescript
const APPROVAL_POLICIES: Array<{
  compensationBandMin: number;
  compensationBandMax: number;
  requiredApprovers: string[];
}> = [
  { compensationBandMin: 0,       compensationBandMax: 50_000,  requiredApprovers: ['hiring_manager'] },
  { compensationBandMin: 50_001,  compensationBandMax: 80_000,  requiredApprovers: ['hiring_manager'] },
  { compensationBandMin: 80_001,  compensationBandMax: 110_000, requiredApprovers: ['hiring_manager', 'hr_manager'] },
  { compensationBandMin: 110_001, compensationBandMax: 140_000, requiredApprovers: ['hiring_manager', 'hr_manager'] },
  { compensationBandMin: 140_001, compensationBandMax: 180_000, requiredApprovers: ['hiring_manager', 'hr_manager', 'finance_director'] },
  { compensationBandMin: 180_001, compensationBandMax: 999_999, requiredApprovers: ['hiring_manager', 'hr_manager', 'finance_director', 'ceo'] },
];

async function seedApprovalPolicies(): Promise<void> {
  console.log('Seeding approval_policies ...');

  // Deactivate all existing rows before inserting new canonical set
  await prisma.approvalPolicy.updateMany({ data: { active: false } });

  await prisma.approvalPolicy.createMany({
    data: APPROVAL_POLICIES.map(p => ({
      compensationBandMin: p.compensationBandMin,
      compensationBandMax: p.compensationBandMax,
      requiredApprovers: p.requiredApprovers,
      active: true,
      effectiveFrom: new Date('2026-01-01T00:00:00Z'),
    })),
    skipDuplicates: false,
  });

  console.log(`  ${APPROVAL_POLICIES.length} approval policies seeded.`);
}
```

Update the `main()` function in `seed.ts` to call `seedApprovalPolicies()`:

```typescript
async function main(): Promise<void> {
  await seedReasonCodes();
  await seedApprovalPolicies();
}
```

### Step 4 — Create `getActiveApprovalPolicy` helper

Create `backend/src/db/approvalPolicies.ts`:

```typescript
import prisma from './prisma';

export interface ApprovalPolicyResult {
  requiredApprovers: string[];
  effectiveFrom: Date;
}

/**
 * Returns the approval policy active for a given offer salary at the specified point in time.
 *
 * Looks up the policy row where:
 *   compensationBandMin <= offerSalary <= compensationBandMax
 *   AND effectiveFrom <= asOf
 *   AND active = true
 *
 * Orders by effectiveFrom DESC to return the most recently activated policy first.
 *
 * @param offerSalary - The numeric offer salary to match against band ranges
 * @param asOf        - Point in time to resolve the policy (defaults to NOW())
 */
export async function getActiveApprovalPolicy(
  offerSalary: number,
  asOf: Date = new Date(),
): Promise<ApprovalPolicyResult | null> {
  const row = await prisma.approvalPolicy.findFirst({
    where: {
      compensationBandMin: { lte: offerSalary },
      compensationBandMax: { gte: offerSalary },
      effectiveFrom: { lte: asOf },
      active: true,
    },
    orderBy: { effectiveFrom: 'desc' },
    select: {
      requiredApprovers: true,
      effectiveFrom: true,
    },
  });

  if (!row) return null;

  return {
    requiredApprovers: row.requiredApprovers as string[],
    effectiveFrom: row.effectiveFrom,
  };
}
```

### Step 5 — Unit-test the helper

Create `backend/src/db/__tests__/approvalPolicies.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../prisma', () => ({
  default: {
    approvalPolicy: {
      findFirst: vi.fn(),
    },
  },
}));

import prisma from '../prisma';
import { getActiveApprovalPolicy } from '../approvalPolicies';

const mockFindFirst = vi.mocked(
  (prisma as unknown as { approvalPolicy: { findFirst: ReturnType<typeof vi.fn> } })
    .approvalPolicy.findFirst,
);

const makeRow = (approvers: string[]) => ({
  requiredApprovers: approvers,
  effectiveFrom: new Date('2026-01-01'),
});

beforeEach(() => vi.clearAllMocks());

describe('getActiveApprovalPolicy', () => {
  it('returns null when no policy covers the salary', async () => {
    mockFindFirst.mockResolvedValue(null);
    expect(await getActiveApprovalPolicy(50_000)).toBeNull();
  });

  it('returns 3-tier approver chain for L5 band salary (160 000)', async () => {
    const approvers = ['hiring_manager', 'hr_manager', 'finance_director'];
    mockFindFirst.mockResolvedValue(makeRow(approvers));

    const result = await getActiveApprovalPolicy(160_000);
    expect(result?.requiredApprovers).toEqual(approvers);
    expect(result?.requiredApprovers).toHaveLength(3);
  });

  it('returns 1-tier approver chain for L1 band salary (40 000)', async () => {
    mockFindFirst.mockResolvedValue(makeRow(['hiring_manager']));
    const result = await getActiveApprovalPolicy(40_000);
    expect(result?.requiredApprovers).toEqual(['hiring_manager']);
  });

  it('queries with lte/gte band range and lte: asOf', async () => {
    mockFindFirst.mockResolvedValue(makeRow(['hiring_manager']));
    const asOf = new Date('2026-08-01');

    await getActiveApprovalPolicy(160_000, asOf);

    expect(mockFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          compensationBandMin: { lte: 160_000 },
          compensationBandMax: { gte: 160_000 },
          effectiveFrom: { lte: asOf },
          active: true,
        }),
      }),
    );
  });
});
```

---

## Validation

| Check | Method | Expected Result |
|-------|--------|-----------------|
| New columns exist | `\d approval_policies` in psql | `effective_from` and `created_by_id` columns present |
| Seed populates 6 band rows | `SELECT COUNT(*) FROM approval_policies WHERE active = true` | 6 |
| L5 band returns 3-tier chain | `getActiveApprovalPolicy(160_000)` | `["hiring_manager","hr_manager","finance_director"]` |
| L6 band returns 4-tier chain | `getActiveApprovalPolicy(200_000)` | 4 approvers including `"ceo"` |
| Salary outside all bands | `getActiveApprovalPolicy(-1)` | `null` |
| `npx prisma db seed` | CLI | `6 approval policies seeded.` |
| `npm test` | CLI | All 4 unit tests green |
| `npm run type-check` | CLI | Exit 0 |

---

## Dependencies

- **EP-DATA / US-001 / TASK-001** — `approval_policies` table must already exist
- **EP-DATA / US-002 / TASK-002** — `seed.ts` base file must exist (this task appends to it)

## Security Constraints

- **OWASP A01 (Broken Access Control)**: Approval policy data determines the required approval chain for compensation offers. Write access to `approval_policies` must be restricted to `admin` role. The `active` flag and `effectiveFrom` columns must not be manipulable by recruiter or HR roles.
- The `requiredApprovers` field is stored as `JsonB` (an array of role strings). It is deserialized in `getActiveApprovalPolicy` and cast as `string[]`. If future code renders these strings to UI, they must be validated against a known allowlist before display to prevent stored XSS.

---

## Definition of Done

- [ ] `ApprovalPolicy` model updated with `effectiveFrom` and `createdById`
- [ ] Migration `add_approval_policies_versioning` applied
- [ ] `backend/prisma/seed.ts` extended with `seedApprovalPolicies()`
- [ ] `npx prisma db seed` seeds 6 band rows
- [ ] `backend/src/db/approvalPolicies.ts` committed with `getActiveApprovalPolicy`
- [ ] Unit tests committed (4 tests, all passing)
- [ ] L5 band returns 3-tier approver chain confirmed
- [ ] `npm run type-check` exits 0

## Traceability

| Artefact | ID |
|----------|----|
| User Story | US-002 |
| Epic | EP-DATA |
| Scenario | 4 (compensation_band L5 query returns correct multi-tier approver list) |
| Spec ref | FR-064, BR-07 (compensation band exceeds tier → additional approver required) |
