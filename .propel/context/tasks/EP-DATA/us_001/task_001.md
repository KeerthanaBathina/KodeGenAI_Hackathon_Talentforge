---
id: task_001
us_id: us_001
epic: EP-DATA
title: "Define Foundation Prisma Models — ENUM Types, Users, Candidates, Profiles, Requisitions, and Reference Tables"
status: not-started
layer: backend
effort: 5h
priority: critical
created: 2026-07-22
---

# TASK-001 — Define Foundation Prisma Models — ENUM Types, Users, Candidates, Profiles, Requisitions, and Reference Tables

## Context

**User Story**: US-001 — Core Domain Schema — Candidates, Applications, Screenings, and Reviews  
**Epic**: EP-DATA — Data Foundation  
**Addresses Acceptance Criteria**: Scenario 1 (partial — foundation-layer tables), Scenario 2 (FK relations on `requisitions`), Scenario 3 (unique constraint on `candidates.email`)

This task defines the Prisma models for the eight entities that form the foundation layer of the domain: the PostgreSQL ENUM types, the `users` internal-staff table, the `candidates` PII table, `profiles` (AI-parsed data), `job_families` (screening configuration), `reason_codes`, `templates`, `approval_policies`, and `requisitions`. These models have no dependencies on application-pipeline tables and must be committed before TASK-002.

---

## Objective

Replace the `_MigrationSentinel` placeholder in `prisma/schema.prisma` (created in EP-TECH / US-003 / TASK-001) with the full foundation-layer Prisma models and all PostgreSQL ENUM declarations. Generate and apply the initial migration. Verify `prisma migrate status` shows all foundation tables.

---

## Technical Specifications

| Entity | Table Name | Key Constraints |
|--------|-----------|----------------|
| User | `users` | `email` UNIQUE, `role` ENUM |
| Candidate | `candidates` | `email` UNIQUE, `phone` UNIQUE, `status` ENUM |
| Profile | `profiles` | One-to-one with `candidates`, `candidate_id` UNIQUE |
| JobFamily | `job_families` | None beyond PK |
| ReasonCode | `reason_codes` | `(category, code)` UNIQUE composite |
| Template | `templates` | `(type, locale, version)` UNIQUE composite |
| ApprovalPolicy | `approval_policies` | None beyond PK |
| Requisition | `requisitions` | `job_family_id` FK, `status` ENUM, `filled_slots <= slots` check |

---

## Implementation Steps

### Step 1 — Remove the migration sentinel placeholder

Open `backend/prisma/schema.prisma` and delete the `_MigrationSentinel` model added in EP-TECH / US-003 / TASK-001. The file should now contain only the `generator` and `datasource` blocks.

### Step 2 — Declare all PostgreSQL ENUM types

Add the following `enum` declarations to `backend/prisma/schema.prisma`:

```prisma
enum UserRole {
  candidate
  recruiter
  hr_reviewer
  hr_manager
  tech_interviewer
  admin
}

enum CandidateStatus {
  pending
  active
  anonymized
}

enum RequisitionStatus {
  draft
  open
  closed
  filled
  cancelled
}

enum JobType {
  full_time
  part_time
  contract
  internship
}

enum ApplicationStatus {
  submitted
  screening
  pending_review
  shortlisted
  rejected
  withdrawn
  interviewing
  offer_pending
  offered
  hired
  closed
}

enum ApplicationPath {
  fresher
  experienced
}

enum ResumeScanStatus {
  pending
  clean
  infected
}

enum ReviewDecision {
  shortlisted
  rejected
  hold
}

enum AssessmentType {
  aptitude
  coding
  technical
}

enum InterviewStageType {
  aptitude
  coding
  technical
  hr
}

enum InterviewStageState {
  scheduled
  completed
  cancelled
  no_show
}

enum ScorecardRecommendation {
  strong_yes
  yes
  no
  strong_no
}

enum DecisionOutcome {
  offer
  reject
  hold
  withdraw
}

enum ApprovalStatus {
  pending
  approved
  rejected
}

enum CommunicationChannel {
  email
  sms
}

enum CommunicationStatus {
  queued
  sent
  delivered
  bounced
  failed
}

enum TemplateType {
  offer
  rejection
  screening_invite
  interview_invite
  assessment_invite
  withdrawal_ack
  general
}

enum ReasonCodeCategory {
  rejection
  withdrawal
  interview_cancellation
  decision
}
```

### Step 3 — Define foundation models

Append the following models to `backend/prisma/schema.prisma`:

```prisma
// ─── Internal Staff ───────────────────────────────────────────────────────────

model User {
  id        String   @id @default(uuid()) @db.Uuid
  email     String   @unique @db.VarChar(255)
  role      UserRole
  fullName  String   @db.VarChar(255)
  active    Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  // Back-relations (populated by TASK-002 models)
  profileEdits    Profile[]         @relation("ProfileEditor")
  reviews         Review[]          @relation("Reviewer")
  scorecards      Scorecard[]       @relation("Interviewer")
  decisions       Decision[]        @relation("DecisionMaker")
  approvals       Approval[]        @relation("Approver")
  jobFamiliesCreated JobFamily[]    @relation("JobFamilyCreator")
  auditEvents     AuditEvent[]      @relation("AuditActor")

  @@map("users")
}

// ─── Candidate PII ────────────────────────────────────────────────────────────

model Candidate {
  id               String          @id @default(uuid()) @db.Uuid
  email            String          @unique @db.VarChar(255)
  phone            String          @unique @db.VarChar(50)
  consentVersion   String          @db.VarChar(20)
  consentTimestamp DateTime
  status           CandidateStatus @default(pending)
  createdAt        DateTime        @default(now())
  updatedAt        DateTime        @updatedAt

  // Relations
  profile      Profile?
  applications Application[]

  @@map("candidates")
}

// ─── AI-Parsed Profile ────────────────────────────────────────────────────────

model Profile {
  id              String    @id @default(uuid()) @db.Uuid
  candidateId     String    @unique @db.Uuid
  fullName        String    @db.VarChar(255)
  experienceYears Int
  skills          String[]  @db.Text
  education       Json      @db.JsonB
  rawParseJson    Json      @db.JsonB
  editedById      String?   @db.Uuid
  editedAt        DateTime?
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  // Relations
  candidate Candidate @relation(fields: [candidateId], references: [id], onDelete: Cascade)
  editedBy  User?     @relation("ProfileEditor", fields: [editedById], references: [id], onDelete: SetNull)

  @@map("profiles")
}

// ─── Screening Configuration ──────────────────────────────────────────────────

model JobFamily {
  id                       String   @id @default(uuid()) @db.Uuid
  name                     String   @db.VarChar(255)
  thresholdVersion         Int      @default(1)
  matchScoreThreshold      Int
  confidenceThreshold      Decimal  @db.Decimal(5, 4)
  experienceThresholdYears Int
  effectiveFrom            DateTime
  createdById              String   @db.Uuid
  createdAt                DateTime @default(now())

  // Relations
  createdBy    User          @relation("JobFamilyCreator", fields: [createdById], references: [id], onDelete: Restrict)
  requisitions Requisition[]

  @@map("job_families")
}

// ─── Reference Tables ─────────────────────────────────────────────────────────

model ReasonCode {
  id          String             @id @default(uuid()) @db.Uuid
  category    ReasonCodeCategory
  code        String             @db.VarChar(50)
  displayText String             @db.VarChar(255)
  active      Boolean            @default(true)

  // Back-relations
  reviews        Review[]
  decisions      Decision[]
  interviewStages InterviewStage[]

  @@unique([category, code])
  @@map("reason_codes")
}

model Template {
  id        String       @id @default(uuid()) @db.Uuid
  name      String       @db.VarChar(255)
  type      TemplateType
  locale    String       @db.VarChar(10)
  version   Int          @default(1)
  subject   String       @db.VarChar(500)
  bodyHtml  String       @db.Text
  bodyText  String       @db.Text
  active    Boolean      @default(true)
  createdAt DateTime     @default(now())

  // Back-relations
  communications Communication[]

  @@unique([type, locale, version])
  @@map("templates")
}

model ApprovalPolicy {
  id                   String   @id @default(uuid()) @db.Uuid
  compensationBandMin  Decimal  @db.Decimal(12, 2)
  compensationBandMax  Decimal  @db.Decimal(12, 2)
  requiredApprovers    Json     @db.JsonB
  active               Boolean  @default(true)
  createdAt            DateTime @default(now())

  @@map("approval_policies")
}

// ─── Requisitions ─────────────────────────────────────────────────────────────

model Requisition {
  id                  String            @id @default(uuid()) @db.Uuid
  title               String            @db.VarChar(255)
  department          String            @db.VarChar(100)
  jobFamilyId         String            @db.Uuid
  location            String            @db.VarChar(255)
  jobType             JobType
  slots               Int
  filledSlots         Int               @default(0)
  status              RequisitionStatus @default(draft)
  eligibilityCriteria Json              @db.JsonB
  openedAt            DateTime?
  closedAt            DateTime?
  createdAt           DateTime          @default(now())
  updatedAt           DateTime          @updatedAt

  // Relations
  jobFamily    JobFamily     @relation(fields: [jobFamilyId], references: [id], onDelete: Restrict)
  applications Application[]

  @@map("requisitions")
}
```

### Step 4 — Generate the migration

```bash
cd backend
npx prisma migrate dev --name "add_foundation_schema"
```

This creates `backend/prisma/migrations/<timestamp>_add_foundation_schema/migration.sql`.

Verify the migration file contains:
- All `CREATE TYPE ... AS ENUM (...)` statements (18 ENUM types)
- `CREATE TABLE users (...)` with `UNIQUE (email)`
- `CREATE TABLE candidates (...)` with `UNIQUE (email)`, `UNIQUE (phone)`
- `CREATE TABLE profiles (...)` with `UNIQUE (candidate_id)`
- `CREATE TABLE reason_codes (...)` with `UNIQUE (category, code)`
- `CREATE TABLE templates (...)` with `UNIQUE (type, locale, version)`
- `CREATE TABLE requisitions (...)` with FK to `job_families`

### Step 5 — Generate the Prisma client

```bash
npx prisma generate
```

### Step 6 — Verify migration status

```bash
npx prisma migrate status
```

Expected output:
```
Database schema is up to date!
```

---

## Validation

| Check | Method | Expected Result |
|-------|--------|-----------------|
| Foundation tables exist | `npx prisma migrate status` | No pending migrations |
| `candidates.email` unique constraint | Inspect migration SQL | `UNIQUE` present on `email` |
| `candidates.phone` unique constraint | Inspect migration SQL | `UNIQUE` present on `phone` |
| `profiles.candidate_id` unique (1:1) | Inspect migration SQL | `UNIQUE` on `candidate_id` |
| `reason_codes(category, code)` composite unique | Inspect migration SQL | Composite `UNIQUE` present |
| `templates(type, locale, version)` composite unique | Inspect migration SQL | Composite `UNIQUE` present |
| All 18 ENUM types present | Inspect migration SQL | 18 `CREATE TYPE` statements |
| TypeScript compiles | `npm run type-check` | Exit 0; Prisma types resolve |

---

## Dependencies

- **EP-TECH / US-003 / TASK-001** — Prisma initialised with `schema.prisma` and dual-URL datasource
- **EP-TECH / US-003 / TASK-001** — `DIRECT_URL` (port 5432) set in Railway staging and `.env` for migrations

## Security Constraints

- **OWASP A03 (Injection)**: All data access goes through Prisma parameterised queries — raw SQL is only used in health checks (`SELECT 1`) and load tests. No string interpolation in queries.
- **OWASP A01 (Broken Access Control)**: `candidates.email` and `candidates.phone` fields are PII. Access to the `Candidate` model must be restricted via RLS (defined in TASK-004). Prisma does not enforce RLS — that is Supabase's responsibility.
- The `_MigrationSentinel` model introduced in EP-TECH is a placeholder only. Removing it in this migration drops the `_migration_sentinel` table. Confirm the table is empty (it was never populated) before running the migration.

---

## Definition of Done

- [ ] `_MigrationSentinel` model removed from `schema.prisma`
- [ ] All 18 PostgreSQL ENUM types declared
- [ ] 8 foundation models defined: `User`, `Candidate`, `Profile`, `JobFamily`, `ReasonCode`, `Template`, `ApprovalPolicy`, `Requisition`
- [ ] Migration generated and applied to local Supabase / staging
- [ ] `prisma migrate status` shows no pending migrations
- [ ] `npx prisma generate` exits 0
- [ ] `npm run type-check` exits 0

## Traceability

| Artefact | ID |
|----------|----|
| User Story | US-001 |
| Epic | EP-DATA |
| Scenario | 1 (foundation tables with correct columns), 3 (unique constraints) |
| Spec ref | §7.1 (core entities), §7.2 (relationships) |
