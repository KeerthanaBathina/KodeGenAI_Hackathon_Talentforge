---
id: task_001
us_id: us_002
epic: EP-DATA
title: "Add Versioned scoring_thresholds Table with Effective-Date Isolation"
status: done
layer: backend
effort: 4h
priority: high
created: 2026-07-22
---

# TASK-001 — Add Versioned scoring_thresholds Table with Effective-Date Isolation

## Context

**User Story**: US-002 — Configuration and Policy Tables — Scoring Thresholds, Reason Codes, and Email Templates  
**Epic**: EP-DATA — Data Foundation  
**Addresses Acceptance Criteria**: Scenario 1 (new threshold active only for applications submitted on or after `effective_from`; in-flight evaluations retain the old threshold)

The existing `job_families` table stores a single scalar threshold per job family. FR-024 requires threshold changes to be **versioned** — the old value must remain frozen on evaluations already in progress, and the new value takes effect only for evaluations submitted on or after the admin-specified date. This cannot be satisfied with an in-place UPDATE; a separate append-only `scoring_thresholds` table is required.

The effective-date isolation rule (BR-14): *"Old threshold frozen on existing evaluations; new threshold applies to new submits only."*

---

## Objective

Add a `ScoringThreshold` Prisma model as an append-only, per-job-family versioned table. Provide a helper function `getActiveThreshold(jobFamilyId, asOf)` that returns the most recent threshold row with `effective_from ≤ asOf`. Generate and apply the migration.

---

## Technical Specifications

| Attribute | Value |
|-----------|-------|
| Table name | `scoring_thresholds` |
| PK | `id UUID` |
| Versioning column | `effective_from TIMESTAMPTZ` |
| Scope | Per job family (FK to `job_families`) |
| Immutability | Rows are INSERT-only — no UPDATE/DELETE (enforced via comment + RLS later) |
| Active threshold query | `WHERE job_family_id = ? AND effective_from <= ? ORDER BY effective_from DESC LIMIT 1` |
| Index | `(job_family_id, effective_from DESC)` |

---

## Implementation Steps

### Step 1 — Add `ScoringThreshold` model to `schema.prisma`

Open `backend/prisma/schema.prisma` and append after the `ApprovalPolicy` model (foundation layer, before the pipeline models):

```prisma
// ─── Scoring Threshold Versions ──────────────────────────────────────────────
//
// Append-only table. Never UPDATE or DELETE rows — add a new row with a future
// effective_from to change the threshold. BR-14: in-flight evaluations resolve
// the threshold that was active at the time of application submission.

model ScoringThreshold {
  id                       String   @id @default(uuid()) @db.Uuid
  jobFamilyId              String   @db.Uuid
  aiShortlistThreshold     Decimal  @db.Decimal(5, 4)   // e.g. 0.70
  confidenceThreshold      Decimal  @db.Decimal(5, 4)   // e.g. 0.80
  experienceThresholdYears Int
  effectiveFrom            DateTime @db.Timestamptz
  createdById              String   @db.Uuid
  createdAt                DateTime @default(now()) @db.Timestamptz

  // Relations
  jobFamily JobFamily @relation(fields: [jobFamilyId], references: [id], onDelete: Restrict)
  createdBy User      @relation("ThresholdAuthor", fields: [createdById], references: [id], onDelete: Restrict)

  @@index([jobFamilyId, effectiveFrom(sort: Desc)], name: "idx_scoring_thresholds_jf_effective")
  @@map("scoring_thresholds")
}
```

### Step 2 — Add back-relations to `JobFamily` and `User`

In the `JobFamily` model, add:

```prisma
  scoringThresholds ScoringThreshold[]
```

In the `User` model, add:

```prisma
  scoringThresholdsAuthored ScoringThreshold[] @relation("ThresholdAuthor")
```

### Step 3 — Generate and apply the migration

```bash
cd backend
npx prisma migrate dev --name "add_scoring_thresholds"
npx prisma generate
```

Verify the migration SQL contains:

```sql
CREATE TABLE "scoring_thresholds" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "job_family_id" UUID NOT NULL,
    "ai_shortlist_threshold" DECIMAL(5,4) NOT NULL,
    "confidence_threshold" DECIMAL(5,4) NOT NULL,
    "experience_threshold_years" INTEGER NOT NULL,
    "effective_from" TIMESTAMPTZ NOT NULL,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "scoring_thresholds_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "idx_scoring_thresholds_jf_effective" ON "scoring_thresholds"("job_family_id", "effective_from" DESC);
```

### Step 4 — Create the `getActiveThreshold` helper

Create `backend/src/db/scoringThresholds.ts`:

```typescript
import prisma from './prisma';

export interface ActiveThreshold {
  aiShortlistThreshold: number;
  confidenceThreshold: number;
  experienceThresholdYears: number;
  effectiveFrom: Date;
}

/**
 * Returns the scoring threshold that was active for a given job family
 * at the specified point in time (defaults to now).
 *
 * Uses effective-date isolation: the most recent threshold row with
 * effective_from <= asOf is returned. This implements BR-14.
 *
 * @param jobFamilyId - UUID of the job family
 * @param asOf        - Point in time to resolve the threshold (defaults to NOW())
 * @returns The active threshold, or null if no threshold has been configured yet
 */
export async function getActiveThreshold(
  jobFamilyId: string,
  asOf: Date = new Date(),
): Promise<ActiveThreshold | null> {
  const row = await prisma.scoringThreshold.findFirst({
    where: {
      jobFamilyId,
      effectiveFrom: { lte: asOf },
    },
    orderBy: { effectiveFrom: 'desc' },
    select: {
      aiShortlistThreshold: true,
      confidenceThreshold: true,
      experienceThresholdYears: true,
      effectiveFrom: true,
    },
  });

  if (!row) return null;

  return {
    aiShortlistThreshold: row.aiShortlistThreshold.toNumber(),
    confidenceThreshold: row.confidenceThreshold.toNumber(),
    experienceThresholdYears: row.experienceThresholdYears,
    effectiveFrom: row.effectiveFrom,
  };
}
```

### Step 5 — Unit-test the effective-date isolation logic

Create `backend/src/db/__tests__/scoringThresholds.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the Prisma client so no database connection is required
vi.mock('../prisma', () => ({
  default: {
    scoringThreshold: {
      findFirst: vi.fn(),
    },
  },
}));

import prisma from '../prisma';
import { getActiveThreshold } from '../scoringThresholds';

const mockFindFirst = vi.mocked(
  (prisma as unknown as { scoringThreshold: { findFirst: ReturnType<typeof vi.fn> } })
    .scoringThreshold.findFirst,
);

const makeRow = (threshold: number, effectiveDaysAgo: number) => ({
  aiShortlistThreshold: { toNumber: () => threshold },
  confidenceThreshold: { toNumber: () => 0.8 },
  experienceThresholdYears: 3,
  effectiveFrom: new Date(Date.now() - effectiveDaysAgo * 86_400_000),
});

beforeEach(() => vi.clearAllMocks());

describe('getActiveThreshold', () => {
  it('returns null when no threshold is configured', async () => {
    mockFindFirst.mockResolvedValue(null);
    const result = await getActiveThreshold('jf-uuid-1');
    expect(result).toBeNull();
  });

  it('returns the most recent threshold with effective_from <= asOf', async () => {
    mockFindFirst.mockResolvedValue(makeRow(0.75, 1));
    const result = await getActiveThreshold('jf-uuid-1');
    expect(result?.aiShortlistThreshold).toBe(0.75);
  });

  it('queries with lte: asOf to enforce effective-date isolation', async () => {
    const asOf = new Date('2026-08-01T00:00:00Z');
    mockFindFirst.mockResolvedValue(makeRow(0.70, 5));

    await getActiveThreshold('jf-uuid-1', asOf);

    expect(mockFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          effectiveFrom: { lte: asOf },
        }),
        orderBy: { effectiveFrom: 'desc' },
      }),
    );
  });

  it('orders by effectiveFrom desc so the newest active threshold is returned', async () => {
    mockFindFirst.mockResolvedValue(makeRow(0.75, 0));
    await getActiveThreshold('jf-uuid-1');

    expect(mockFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { effectiveFrom: 'desc' },
      }),
    );
  });
});
```

---

## Validation

| Check | Method | Expected Result |
|-------|--------|-----------------|
| Table created | `\d scoring_thresholds` in psql | All columns present with correct types |
| Index created | `\di scoring_thresholds*` | `idx_scoring_thresholds_jf_effective` present |
| FK to `job_families` | Migration SQL | `ON DELETE RESTRICT` |
| `getActiveThreshold` returns null for no config | Unit test | PASS |
| `getActiveThreshold` uses `lte: asOf` | Unit test | PASS |
| Old threshold isolated from future change | Unit test with past `asOf` | Returns old value |
| `prisma migrate status` | CLI | No pending migrations |
| `npm test` | CLI | All 4 unit tests green |
| `npm run type-check` | CLI | Exit 0 |

---

## Dependencies

- **EP-DATA / US-001 / TASK-001** — `job_families` and `users` tables must exist before FK can be created
- **EP-DATA / US-001 / TASK-002** — complete migration chain applied

## Security Constraints

- **OWASP A01 (Broken Access Control)**: The `scoring_thresholds` table stores business-critical threshold values. Write access must be restricted to `admin` role via RLS (to be defined in a follow-on epic). The Prisma service role can read/write (used by the AI worker); the anon role must have no write access.
- **OWASP A04 (Insecure Design)**: Rows are append-only by design — updating in place would silently change the threshold used by in-flight evaluations. The `@@index` on `(job_family_id, effective_from DESC)` ensures the active-threshold query uses an index scan rather than a sequential scan even as the table grows.

---

## Definition of Done

- [ ] `ScoringThreshold` model added to `schema.prisma`
- [ ] Back-relations added to `JobFamily` and `User`
- [ ] Migration `add_scoring_thresholds` generated and applied
- [ ] `backend/src/db/scoringThresholds.ts` committed with `getActiveThreshold`
- [ ] `backend/src/db/__tests__/scoringThresholds.test.ts` committed (4 tests, all passing)
- [ ] `npm run type-check` exits 0

## Traceability

| Artefact | ID |
|----------|----|
| User Story | US-002 |
| Epic | EP-DATA |
| Scenario | 1 (new threshold active only on/after effective_from; old threshold frozen) |
| Spec ref | FR-024, FR-065, BR-14 |
