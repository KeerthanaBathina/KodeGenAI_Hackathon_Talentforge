---
id: task_001
us_id: us_005
epic: EP-001
title: "Extend Profile Schema with Work History, Privacy Consents, and Completion Tracking"
status: done
layer: backend
effort: 3h
priority: critical
created: 2026-07-24
completed: 2026-07-24
---

# TASK-001 — Extend Profile Schema with Work History, Privacy Consents, and Completion Tracking

## Context

**User Story**: US-005 — Candidate Profile CRUD with Onboarding Checklist and Consent Management  
**Epic**: EP-001 — Candidate Onboarding and Identity  
**Addresses Acceptance Criteria**: Scenario 1 (onboarding checklist), Scenario 3 (privacy consent), Scenario 5 (completion tracking)

The existing Profile model needs extensions to support work history as a structured field, explicit privacy consent tracking with IP/version/timestamp, and profile completion percentage calculation. A separate table for privacy consents ensures audit compliance and version tracking.

---

## Objective

Extend the database schema to support:
- Work history as a structured JSONB field in Profile
- Separate PrivacyConsent table with version, timestamp, IP address tracking
- Profile completion tracking (calculated or stored percentage)
- Relations between Candidate, Profile, and PrivacyConsent models

---

## Technical Specifications

### Profile Model Extensions

Add to existing `Profile` model:
- `workHistory` — JSONB array of work experience entries
- `profileCompletionPercentage` — Integer (0-100) for UI display
- `lastCompletedSection` — Enum tracking last completed onboarding step

**Work History Schema** (JSONB structure):
```typescript
{
  company: string;
  title: string;
  startDate: string; // ISO 8601
  endDate?: string; // null if current
  description?: string;
  isCurrent: boolean;
}[]
```

### New PrivacyConsent Model

```prisma
model PrivacyConsent {
  id              String    @id @default(uuid()) @db.Uuid
  candidateId     String    @db.Uuid
  policyVersion   String    @db.VarChar(20)
  acceptedAt      DateTime  @default(now())
  ipAddress       String    @db.VarChar(45)
  userAgent       String?   @db.Text
  revokedAt       DateTime?
  createdAt       DateTime  @default(now())
  
  candidate       Candidate @relation(fields: [candidateId], references: [id], onDelete: Cascade)
  
  @@index([candidateId, policyVersion], name: "idx_privacy_consent_candidate_version")
  @@index([acceptedAt], name: "idx_privacy_consent_accepted")
  @@map("privacy_consents")
}
```

### Onboarding Checklist Enum

```prisma
enum OnboardingSection {
  basic_info
  skills
  education
  work_history
  privacy_consent
}
```

---

## Implementation Steps

### Step 1 — Update Prisma Schema

Edit `backend/prisma/schema.prisma`:

**1. Add OnboardingSection enum:**
```prisma
enum OnboardingSection {
  basic_info
  skills
  education
  work_history
  privacy_consent
}
```

**2. Extend Profile model:**
```prisma
model Profile {
  id                           String              @id @default(uuid()) @db.Uuid
  candidateId                  String              @unique @db.Uuid
  fullName                     String              @db.VarChar(255)
  experienceYears              Int
  skills                       String[]            @db.Text
  education                    Json                @db.JsonB
  workHistory                  Json?               @db.JsonB  // NEW: Array of work experience
  profileCompletionPercentage  Int                 @default(0)  // NEW: 0-100
  lastCompletedSection         OnboardingSection?  // NEW: Track progress
  rawParseJson                 Json                @db.JsonB
  editedById                   String?             @db.Uuid
  editedAt                     DateTime?
  createdAt                    DateTime            @default(now())
  updatedAt                    DateTime            @updatedAt
  
  candidate                    Candidate           @relation(fields: [candidateId], references: [id], onDelete: Cascade)
  editedBy                     User?               @relation("ProfileEditor", fields: [editedById], references: [id], onDelete: SetNull)

  @@map("profiles")
}
```

**3. Create PrivacyConsent model:**
```prisma
model PrivacyConsent {
  id              String    @id @default(uuid()) @db.Uuid
  candidateId     String    @db.Uuid
  policyVersion   String    @db.VarChar(20)
  acceptedAt      DateTime  @default(now())
  ipAddress       String    @db.VarChar(45)
  userAgent       String?   @db.Text
  revokedAt       DateTime?
  createdAt       DateTime  @default(now())
  
  candidate       Candidate @relation(fields: [candidateId], references: [id], onDelete: Cascade)
  
  @@index([candidateId, policyVersion], name: "idx_privacy_consent_candidate_version")
  @@index([acceptedAt], name: "idx_privacy_consent_accepted")
  @@map("privacy_consents")
}
```

**4. Update Candidate model:**
```prisma
model Candidate {
  // ... existing fields ...
  
  profile               Profile?
  privacyConsents       PrivacyConsent[]  // NEW
  
  // ... other relations ...
}
```

### Step 2 — Generate and Apply Migration

```bash
cd backend
npx prisma migrate dev --name extend_profile_with_completion_and_consents
npx prisma generate
```

### Step 3 — Verify Migration SQL

Review generated SQL to ensure:
- `work_history` column added to `profiles` table as JSONB
- `profile_completion_percentage` column added with default 0
- `last_completed_section` column added as enum or varchar
- `privacy_consents` table created with all columns and indexes
- Foreign key constraint from `privacy_consents` to `candidates`
- Indexes created for candidate_id + policy_version, accepted_at

### Step 4 — Create TypeScript Types

Create `backend/src/types/profile.ts`:

```typescript
export interface WorkExperience {
  company: string;
  title: string;
  startDate: string; // ISO 8601
  endDate?: string | null;
  description?: string;
  isCurrent: boolean;
}

export interface EducationEntry {
  institution: string;
  degree: string;
  fieldOfStudy?: string;
  startDate: string;
  endDate?: string | null;
  isCurrent: boolean;
}

export interface ProfileData {
  fullName: string;
  experienceYears: number;
  skills: string[];
  education: EducationEntry[];
  workHistory: WorkExperience[];
}

export enum OnboardingSection {
  BASIC_INFO = 'basic_info',
  SKILLS = 'skills',
  EDUCATION = 'education',
  WORK_HISTORY = 'work_history',
  PRIVACY_CONSENT = 'privacy_consent',
}

export interface ProfileCompletionStatus {
  completedSections: OnboardingSection[];
  percentage: number;
  missingFields: string[];
}
```

---

## Acceptance Criteria

- [x] `Profile` model extended with `workHistory`, `profileCompletionPercentage`, `lastCompletedSection`
- [x] `PrivacyConsent` model created with version, timestamp, IP, user agent tracking
- [x] `OnboardingSection` enum created with 5 checklist items
- [x] Migration generates correct SQL with indexes and foreign keys
- [x] TypeScript types defined for work history, education, and completion tracking
- [x] `npx prisma generate` runs without errors
- [x] Prisma Client includes new models and fields

---

## Dependencies

- Existing Profile model in schema
- Candidate model with relations

## Testing Notes

After migration, verify in PostgreSQL:
```sql
-- Check profile table structure
\d profiles

-- Check privacy_consents table
\d privacy_consents

-- Verify indexes
\di privacy_consents*
```

Run type check:
```bash
cd backend
npm run typecheck
```
