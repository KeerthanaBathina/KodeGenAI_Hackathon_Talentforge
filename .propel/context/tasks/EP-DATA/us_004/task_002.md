---
id: task_002
us_id: us_004
epic: EP-DATA
title: "Create Environment-Specific Seed Scripts — seed.dev.ts and seed.staging.ts"
status: done
layer: backend
effort: 4h
priority: high
created: 2026-07-22
---

# TASK-002 — Create Environment-Specific Seed Scripts — seed.dev.ts and seed.staging.ts

## Context

**User Story**: US-004 — Prisma Migration Framework with Seed Scripts and Rollback Procedures  
**Epic**: EP-DATA — Data Foundation  
**Addresses Acceptance Criteria**: Scenario 2 (fresh development database seeded with at least one candidate, recruiter, HR user, requisition, and application for manual testing)

The existing `prisma/seed.ts` (created in EP-DATA / US-002 / TASK-002 and TASK-003) seeds configuration data (reason codes, approval policies, templates) that is common to all environments. Development and staging require different datasets:

- **Development**: Full fixture set including test user accounts with predictable credentials, a sample requisition, and applications at various pipeline stages — enough for a developer to click through every screen without needing real data.
- **Staging**: Configuration data only (same as seed.ts). No test users — staging should mirror production config without fake accounts that could trigger false-positive alerts.

---

## Objective

Refactor `prisma/seed.ts` to route to environment-specific modules based on `NODE_ENV`, create `prisma/seed.dev.ts` with a complete development fixture set, and create `prisma/seed.staging.ts` as a thin wrapper that runs only configuration seeds.

---

## Technical Specifications

### Development fixture set (`seed.dev.ts`)

| Entity | Count | Notes |
|--------|-------|-------|
| Users (`users` table) | 5 | admin, recruiter, hr_reviewer, hr_manager, tech_interviewer |
| Candidates | 3 | active candidates at different pipeline stages |
| JobFamily | 1 | "Software Engineering" with L3 thresholds |
| ScoringThreshold | 1 | 0.70 threshold effective from 2026-01-01 |
| Requisition | 2 | 1 open, 1 closed |
| Applications | 3 | submitted, shortlisted, rejected (one per candidate) |
| Screenings | 2 | For shortlisted + rejected applications |
| Reviews | 1 | For shortlisted application |

---

## Implementation Steps

### Step 1 — Refactor `prisma/seed.ts` as a router

Replace the current `main()` function in `backend/prisma/seed.ts` with an environment-aware router:

```typescript
import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();

// ─── Shared seeds (run in ALL environments) ───────────────────────────────────
export { seedReasonCodes } from './seed.shared';
export { seedApprovalPolicies } from './seed.shared';
export { seedEmailTemplates } from './seed.shared';

async function main(): Promise<void> {
  const env = process.env['NODE_ENV'] ?? 'development';
  console.log(`\nSeeding for environment: ${env}`);

  if (env === 'production') {
    // Production: shared config data only — no fixture data
    const { runSharedSeeds } = await import('./seed.shared');
    await runSharedSeeds(prisma);
    console.log('Production seed complete.');
    return;
  }

  if (env === 'staging') {
    const { runStagingSeeds } = await import('./seed.staging');
    await runStagingSeeds(prisma);
    console.log('Staging seed complete.');
    return;
  }

  // Default: development
  const { runDevSeeds } = await import('./seed.dev');
  await runDevSeeds(prisma);
  console.log('Development seed complete.');
}

main()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
```

### Step 2 — Extract shared seeds into `seed.shared.ts`

Move the `seedReasonCodes`, `seedApprovalPolicies`, and `seedEmailTemplates` functions from the current `seed.ts` into `backend/prisma/seed.shared.ts`:

```typescript
import { PrismaClient } from '@prisma/client';

export async function runSharedSeeds(prisma: PrismaClient): Promise<void> {
  await seedReasonCodes(prisma);
  await seedApprovalPolicies(prisma);
  await seedEmailTemplates(prisma);
}

// ... (move the existing function bodies from seed.ts verbatim) ...
```

### Step 3 — Create `seed.staging.ts`

Create `backend/prisma/seed.staging.ts`:

```typescript
import { PrismaClient } from '@prisma/client';
import { runSharedSeeds } from './seed.shared';

/**
 * Staging seed — configuration data only.
 * No test users, fake candidates, or dummy applications.
 * Staging should mirror production configuration.
 */
export async function runStagingSeeds(prisma: PrismaClient): Promise<void> {
  console.log('Running staging seeds (configuration data only) ...');
  await runSharedSeeds(prisma);
  console.log('Staging seed complete — no fixture data added.');
}
```

### Step 4 — Create `seed.dev.ts`

Create `backend/prisma/seed.dev.ts`:

```typescript
import { PrismaClient, ApplicationStatus } from '@prisma/client';
import { runSharedSeeds } from './seed.shared';
import crypto from 'node:crypto';

/**
 * Development seed — full fixture set for manual testing.
 *
 * All credentials are publicly documented here and in README.md.
 * These accounts must never exist in staging or production.
 */

// ─── Deterministic UUIDs for repeatability ────────────────────────────────────
// Using fixed UUIDs means re-running the seed does not create duplicate rows.
const IDS = {
  users: {
    admin:          '00000001-0000-0000-0000-000000000001',
    recruiter:      '00000001-0000-0000-0000-000000000002',
    hrReviewer:     '00000001-0000-0000-0000-000000000003',
    hrManager:      '00000001-0000-0000-0000-000000000004',
    techInterviewer:'00000001-0000-0000-0000-000000000005',
  },
  candidates: {
    alice:  '00000002-0000-0000-0000-000000000001',
    bob:    '00000002-0000-0000-0000-000000000002',
    carol:  '00000002-0000-0000-0000-000000000003',
  },
  jobFamily:   '00000003-0000-0000-0000-000000000001',
  requisitions: {
    open:   '00000004-0000-0000-0000-000000000001',
    closed: '00000004-0000-0000-0000-000000000002',
  },
  applications: {
    alice:  '00000005-0000-0000-0000-000000000001',
    bob:    '00000005-0000-0000-0000-000000000002',
    carol:  '00000005-0000-0000-0000-000000000003',
  },
  screenings: {
    alice: '00000006-0000-0000-0000-000000000001',
    bob:   '00000006-0000-0000-0000-000000000002',
  },
  reviews: {
    alice: '00000007-0000-0000-0000-000000000001',
  },
};

async function seedDevUsers(prisma: PrismaClient): Promise<void> {
  console.log('  Seeding dev users ...');
  const users = [
    { id: IDS.users.admin,           email: 'admin@dev.local',           role: 'admin'            as const, fullName: 'Dev Admin'           },
    { id: IDS.users.recruiter,       email: 'recruiter@dev.local',       role: 'recruiter'        as const, fullName: 'Dev Recruiter'       },
    { id: IDS.users.hrReviewer,      email: 'hr-reviewer@dev.local',     role: 'hr_reviewer'      as const, fullName: 'Dev HR Reviewer'     },
    { id: IDS.users.hrManager,       email: 'hr-manager@dev.local',      role: 'hr_manager'       as const, fullName: 'Dev HR Manager'      },
    { id: IDS.users.techInterviewer, email: 'tech@dev.local',            role: 'tech_interviewer' as const, fullName: 'Dev Tech Interviewer'},
  ];

  for (const user of users) {
    await prisma.user.upsert({
      where: { email: user.email },
      update: { fullName: user.fullName, active: true },
      create: { ...user, active: true },
    });
  }
  console.log(`    ${users.length} users upserted.`);
}

async function seedDevCandidates(prisma: PrismaClient): Promise<void> {
  console.log('  Seeding dev candidates ...');
  const candidates = [
    {
      id: IDS.candidates.alice,
      email: 'alice@dev.local',
      phone: '+10000000001',
      consentVersion: '1.0',
      consentTimestamp: new Date('2026-07-01'),
      status: 'active' as const,
    },
    {
      id: IDS.candidates.bob,
      email: 'bob@dev.local',
      phone: '+10000000002',
      consentVersion: '1.0',
      consentTimestamp: new Date('2026-07-05'),
      status: 'active' as const,
    },
    {
      id: IDS.candidates.carol,
      email: 'carol@dev.local',
      phone: '+10000000003',
      consentVersion: '1.0',
      consentTimestamp: new Date('2026-07-10'),
      status: 'active' as const,
    },
  ];

  for (const c of candidates) {
    await prisma.candidate.upsert({
      where: { email: c.email },
      update: {},
      create: c,
    });
  }
  console.log(`    ${candidates.length} candidates upserted.`);
}

async function seedDevJobFamily(prisma: PrismaClient): Promise<void> {
  console.log('  Seeding dev job family ...');
  await prisma.jobFamily.upsert({
    where: { id: IDS.jobFamily },
    update: {},
    create: {
      id: IDS.jobFamily,
      name: 'Software Engineering',
      matchScoreThreshold: 70,
      confidenceThreshold: 0.8,
      experienceThresholdYears: 3,
      effectiveFrom: new Date('2026-01-01'),
      createdById: IDS.users.admin,
    },
  });

  await prisma.scoringThreshold.upsert({
    where: { id: '00000008-0000-0000-0000-000000000001' },
    update: {},
    create: {
      id: '00000008-0000-0000-0000-000000000001',
      jobFamilyId: IDS.jobFamily,
      aiShortlistThreshold: 0.70,
      confidenceThreshold: 0.80,
      experienceThresholdYears: 3,
      effectiveFrom: new Date('2026-01-01'),
      createdById: IDS.users.admin,
    },
  });
  console.log('    1 job family + 1 scoring threshold upserted.');
}

async function seedDevRequisitions(prisma: PrismaClient): Promise<void> {
  console.log('  Seeding dev requisitions ...');
  const requisitions = [
    {
      id: IDS.requisitions.open,
      title: 'Senior Software Engineer',
      department: 'Engineering',
      jobFamilyId: IDS.jobFamily,
      location: 'Remote',
      jobType: 'full_time' as const,
      slots: 3,
      filledSlots: 0,
      status: 'open' as const,
      eligibilityCriteria: { minYearsExperience: 4 },
      openedAt: new Date('2026-07-01'),
    },
    {
      id: IDS.requisitions.closed,
      title: 'Junior Frontend Developer',
      department: 'Engineering',
      jobFamilyId: IDS.jobFamily,
      location: 'Hybrid',
      jobType: 'full_time' as const,
      slots: 1,
      filledSlots: 1,
      status: 'closed' as const,
      eligibilityCriteria: {},
      openedAt: new Date('2026-06-01'),
      closedAt: new Date('2026-07-15'),
    },
  ];

  for (const r of requisitions) {
    await prisma.requisition.upsert({
      where: { id: r.id },
      update: {},
      create: r,
    });
  }
  console.log(`    ${requisitions.length} requisitions upserted.`);
}

async function seedDevApplications(prisma: PrismaClient): Promise<void> {
  console.log('  Seeding dev applications ...');

  const applications: Array<{
    id: string;
    candidateId: string;
    requisitionId: string;
    status: ApplicationStatus;
    submittedAt: Date;
  }> = [
    {
      id: IDS.applications.alice,
      candidateId: IDS.candidates.alice,
      requisitionId: IDS.requisitions.open,
      status: 'shortlisted',
      submittedAt: new Date('2026-07-10'),
    },
    {
      id: IDS.applications.bob,
      candidateId: IDS.candidates.bob,
      requisitionId: IDS.requisitions.open,
      status: 'rejected',
      submittedAt: new Date('2026-07-11'),
    },
    {
      id: IDS.applications.carol,
      candidateId: IDS.candidates.carol,
      requisitionId: IDS.requisitions.open,
      status: 'submitted',
      submittedAt: new Date('2026-07-20'),
    },
  ];

  for (const a of applications) {
    await prisma.application.upsert({
      where: { id: a.id },
      update: { status: a.status },
      create: a,
    });
  }

  // Screening results for alice (shortlisted) and bob (rejected)
  const screenings = [
    {
      id: IDS.screenings.alice,
      applicationId: IDS.applications.alice,
      modelVersion: 'v2.1.0',
      score: 82,
      confidence: 0.91,
      factorsJson: { skills_match: 0.9, experience_match: 0.85, role_fit: 0.7 },
      evaluatedAt: new Date('2026-07-10T12:00:00Z'),
      version: 1,
    },
    {
      id: IDS.screenings.bob,
      applicationId: IDS.applications.bob,
      modelVersion: 'v2.1.0',
      score: 55,
      confidence: 0.88,
      factorsJson: { skills_match: 0.6, experience_match: 0.5, role_fit: 0.55 },
      evaluatedAt: new Date('2026-07-11T09:30:00Z'),
      version: 1,
    },
  ];

  for (const s of screenings) {
    await prisma.screening.upsert({
      where: { id: s.id },
      update: {},
      create: s,
    });
  }

  // HR review for alice (shortlisted)
  const rejectionCode = await prisma.reasonCode.findFirst({
    where: { code: 'skills_gap', category: 'rejection' },
  });

  await prisma.review.upsert({
    where: { id: IDS.reviews.alice },
    update: {},
    create: {
      id: IDS.reviews.alice,
      applicationId: IDS.applications.alice,
      reviewerId: IDS.users.hrReviewer,
      decision: 'shortlisted',
      reasonCodeId: null,
      notes: 'Strong technical background. Recommended for interview.',
      decidedAt: new Date('2026-07-12'),
    },
  });

  console.log(`    ${applications.length} applications, ${screenings.length} screenings, 1 review upserted.`);
}

export async function runDevSeeds(prisma: PrismaClient): Promise<void> {
  console.log('\nRunning development fixture seeds ...');
  await runSharedSeeds(prisma);
  await seedDevUsers(prisma);
  await seedDevCandidates(prisma);
  await seedDevJobFamily(prisma);
  await seedDevRequisitions(prisma);
  await seedDevApplications(prisma);
}
```

### Step 5 — Add dev seed credentials to `backend/README.md`

```markdown
## Development Test Accounts

Run `npx prisma db seed` (with `NODE_ENV=development`) to populate:

| Role | Email | Notes |
|------|-------|-------|
| admin | admin@dev.local | Full system access |
| recruiter | recruiter@dev.local | Manages requisitions |
| hr_reviewer | hr-reviewer@dev.local | Reviews screening queue |
| hr_manager | hr-manager@dev.local | Final approval chain |
| tech_interviewer | tech@dev.local | Conducts technical interviews |
| candidate | alice@dev.local | Shortlisted application |
| candidate | bob@dev.local | Rejected application |
| candidate | carol@dev.local | Submitted, awaiting screening |

Note: These are database fixture records only. Supabase Auth accounts must be created separately via `npx supabase start` or the Supabase dashboard.
```

---

## Validation

| Check | Method | Expected Result |
|-------|--------|-----------------|
| Dev seed creates 5 users | `SELECT COUNT(*) FROM users` | ≥ 5 |
| Dev seed creates 3 candidates | `SELECT COUNT(*) FROM candidates WHERE email LIKE '%@dev.local'` | 3 |
| Dev seed creates 2 requisitions | `SELECT COUNT(*) FROM requisitions` | 2 |
| Dev seed creates 3 applications | `SELECT COUNT(*) FROM applications` | 3 |
| Dev seed creates 2 screenings | `SELECT COUNT(*) FROM screenings` | 2 |
| Re-running seed is idempotent | Run `npx prisma db seed` twice | Row counts unchanged |
| Staging seed creates NO users | `NODE_ENV=staging npx prisma db seed` | No `@dev.local` users |
| `npm run type-check` | CLI | Exit 0 |

---

## Dependencies

- **EP-DATA / US-001 / TASK-001–002** — All tables must exist
- **EP-DATA / US-002 / TASK-002–004** — `seed.ts` functions and `tsx` must be configured

## Security Constraints

- **OWASP A05 (Security Misconfiguration)**: Dev-only email addresses use the `.local` TLD which is reserved and cannot be confused with real domains. The `@dev.local` pattern must be checked in an environment guard at the top of `seed.dev.ts`:

```typescript
if (process.env['NODE_ENV'] === 'production') {
  throw new Error('seed.dev.ts must never run in production');
}
```

- Deterministic UUIDs (`00000001-...`) are used for all fixture records so that foreign key references are stable across seed runs. These UUIDs are clearly synthetic and will not collide with auto-generated `gen_random_uuid()` values.

---

## Definition of Done

- [ ] `backend/prisma/seed.shared.ts` extracted with shared seed functions
- [ ] `backend/prisma/seed.ts` refactored as environment router
- [ ] `backend/prisma/seed.dev.ts` committed with 5 users, 3 candidates, 2 requisitions, 3 applications
- [ ] `backend/prisma/seed.staging.ts` committed (config data only, no test users)
- [ ] Production guard in `seed.dev.ts`
- [ ] Dev accounts documented in `backend/README.md`
- [ ] Seed is idempotent (safe to re-run)
- [ ] `npm run type-check` exits 0

## Traceability

| Artefact | ID |
|----------|----|
| User Story | US-004 |
| Epic | EP-DATA |
| Scenario | 2 (dev seed creates candidate, recruiter, HR user, requisition, application) |
| Spec ref | TR-008 |
