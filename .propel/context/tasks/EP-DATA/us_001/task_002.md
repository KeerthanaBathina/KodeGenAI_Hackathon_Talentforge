---
id: task_002
us_id: us_001
epic: EP-DATA
title: "Define Application Pipeline Prisma Models — Applications through AuditEvents with FK onDelete Policies"
status: done
layer: backend
effort: 5h
priority: critical
created: 2026-07-22
---

# TASK-002 — Define Application Pipeline Prisma Models — Applications through AuditEvents with FK onDelete Policies

## Context

**User Story**: US-001 — Core Domain Schema — Candidates, Applications, Screenings, and Reviews  
**Epic**: EP-DATA — Data Foundation  
**Addresses Acceptance Criteria**: Scenario 1 (remaining 9 workflow tables), Scenario 2 (FK integrity — `requisitions` delete blocked by open applications)

This task adds the nine application-pipeline models that depend on the foundation layer created in TASK-001: `Application`, `Resume`, `Screening`, `Review`, `Assessment`, `InterviewStage`, `Scorecard`, `Decision`, `Approval`, `Communication`, and `AuditEvent`. Every foreign key includes an explicit `onDelete` policy that enforces the business rule defined in the spec.

---

## Objective

Append 11 Prisma models to `schema.prisma`, define all cross-entity FK relations with explicit `onDelete` actions, generate and apply a second migration, and verify the total table count reaches 19 (17 domain tables + `users` + `approval_policies`).

---

## Technical Specifications

| Entity | Table Name | FK onDelete Policy | Rationale |
|--------|-----------|-------------------|-----------|
| Application | `applications` | `candidate_id → Restrict`, `requisition_id → Restrict` | Open applications block parent deletion (Scenario 2) |
| Resume | `resumes` | `application_id → Cascade` | Resume is meaningless without its application |
| Screening | `screenings` | `application_id → Cascade` | AI output is ephemeral without the application |
| Review | `reviews` | `application_id → Cascade`, `reviewer_id → Restrict`, `reason_code_id → Restrict` | Review decisions must reference active users and codes |
| Assessment | `assessments` | `application_id → Cascade` | Test results are part of the application record |
| InterviewStage | `interview_stages` | `application_id → Cascade`, `reason_code_id → SetNull` | Stage cancelled when reason removed; app deletion cascades |
| Scorecard | `scorecards` | `interview_stage_id → Cascade`, `interviewer_id → Restrict` | Scorecard has no meaning without its stage |
| Decision | `decisions` | `application_id → Restrict`, `reason_code_id → Restrict`, `decided_by → Restrict` | Final decision must be preserved for audit |
| Approval | `approvals` | `decision_id → Cascade`, `approver_id → Restrict` | Approval is part of the decision record |
| Communication | `communications` | `application_id → Cascade`, `template_id → Restrict` | Email log is part of the application record |
| AuditEvent | `audit_events` | `actor_id → SetNull` | Audit log survives user deletion; actor becomes null |

---

## Implementation Steps

### Step 1 — Append pipeline models to `schema.prisma`

Open `backend/prisma/schema.prisma` and append the following after the `Requisition` model:

```prisma
// ─── Application Pipeline ─────────────────────────────────────────────────────

model Application {
  id                        String            @id @default(uuid()) @db.Uuid
  candidateId               String            @db.Uuid
  requisitionId             String            @db.Uuid
  status                    ApplicationStatus @default(submitted)
  path                      ApplicationPath?
  pathOverridden            Boolean           @default(false)
  pathOverrideJustification String?           @db.Text
  pathOverrideApproverId    String?           @db.Uuid
  submittedAt               DateTime          @default(now())
  createdAt                 DateTime          @default(now())
  updatedAt                 DateTime          @updatedAt

  // Relations
  candidate              Candidate       @relation(fields: [candidateId], references: [id], onDelete: Restrict)
  requisition            Requisition     @relation(fields: [requisitionId], references: [id], onDelete: Restrict)
  pathOverrideApprover   User?           @relation("PathOverrideApprover", fields: [pathOverrideApproverId], references: [id], onDelete: SetNull)

  // Back-relations
  resume         Resume?
  screenings     Screening[]
  reviews        Review[]
  assessments    Assessment[]
  interviewStages InterviewStage[]
  decision       Decision?
  communications Communication[]

  @@map("applications")
}

model Resume {
  id            String           @id @default(uuid()) @db.Uuid
  applicationId String           @unique @db.Uuid
  storageKey    String           @db.Uuid
  fileName      String           @db.VarChar(255)
  fileSize      Int
  mimeType      String           @db.VarChar(100)
  scanStatus    ResumeScanStatus @default(pending)
  scanResult    Json?            @db.JsonB
  uploadedAt    DateTime         @default(now())

  // Relations
  application Application @relation(fields: [applicationId], references: [id], onDelete: Cascade)

  @@map("resumes")
}

model Screening {
  id            String   @id @default(uuid()) @db.Uuid
  applicationId String   @db.Uuid
  modelVersion  String   @db.VarChar(50)
  score         Int
  confidence    Decimal  @db.Decimal(5, 4)
  factorsJson   Json     @db.JsonB
  evaluatedAt   DateTime @default(now())
  version       Int      @default(1)

  // Relations
  application Application @relation(fields: [applicationId], references: [id], onDelete: Cascade)

  @@map("screenings")
}

model Review {
  id            String         @id @default(uuid()) @db.Uuid
  applicationId String         @db.Uuid
  reviewerId    String         @db.Uuid
  decision      ReviewDecision
  reasonCodeId  String?        @db.Uuid
  notes         String?        @db.Text
  decidedAt     DateTime       @default(now())

  // Relations
  application Application @relation(fields: [applicationId], references: [id], onDelete: Cascade)
  reviewer    User        @relation("Reviewer", fields: [reviewerId], references: [id], onDelete: Restrict)
  reasonCode  ReasonCode? @relation(fields: [reasonCodeId], references: [id], onDelete: Restrict)

  @@map("reviews")
}

model Assessment {
  id            String         @id @default(uuid()) @db.Uuid
  applicationId String         @db.Uuid
  type          AssessmentType
  providerRef   String         @db.VarChar(255)
  score         Decimal?       @db.Decimal(6, 2)
  metadata      Json?          @db.JsonB
  startedAt     DateTime?
  completedAt   DateTime?

  // Relations
  application Application @relation(fields: [applicationId], references: [id], onDelete: Cascade)

  @@map("assessments")
}

model InterviewStage {
  id            String              @id @default(uuid()) @db.Uuid
  applicationId String              @db.Uuid
  type          InterviewStageType
  scheduledAt   DateTime?
  timezone      String              @db.VarChar(50)
  panelMembers  String[]            @db.Uuid
  state         InterviewStageState @default(scheduled)
  reasonCodeId  String?             @db.Uuid
  createdAt     DateTime            @default(now())
  updatedAt     DateTime            @updatedAt

  // Relations
  application Application @relation(fields: [applicationId], references: [id], onDelete: Cascade)
  reasonCode  ReasonCode? @relation(fields: [reasonCodeId], references: [id], onDelete: SetNull)

  // Back-relations
  scorecards Scorecard[]

  @@map("interview_stages")
}

model Scorecard {
  id               String                  @id @default(uuid()) @db.Uuid
  interviewStageId String                  @db.Uuid
  interviewerId    String                  @db.Uuid
  rubricJson       Json                    @db.JsonB
  recommendation   ScorecardRecommendation
  comments         String?                 @db.Text
  submittedAt      DateTime                @default(now())

  // Relations
  interviewStage InterviewStage @relation(fields: [interviewStageId], references: [id], onDelete: Cascade)
  interviewer    User           @relation("Interviewer", fields: [interviewerId], references: [id], onDelete: Restrict)

  @@map("scorecards")
}

model Decision {
  id               String          @id @default(uuid()) @db.Uuid
  applicationId    String          @unique @db.Uuid
  outcome          DecisionOutcome
  reasonCodeId     String?         @db.Uuid
  compensationBand String?         @db.VarChar(50)
  offerDetails     Json?           @db.JsonB
  decidedById      String          @db.Uuid
  decidedAt        DateTime        @default(now())

  // Relations
  application Application @relation(fields: [applicationId], references: [id], onDelete: Restrict)
  reasonCode  ReasonCode? @relation(fields: [reasonCodeId], references: [id], onDelete: Restrict)
  decidedBy   User        @relation("DecisionMaker", fields: [decidedById], references: [id], onDelete: Restrict)

  // Back-relations
  approvals Approval[]

  @@map("decisions")
}

model Approval {
  id          String         @id @default(uuid()) @db.Uuid
  decisionId  String         @db.Uuid
  approverId  String         @db.Uuid
  tier        String         @db.VarChar(50)
  status      ApprovalStatus @default(pending)
  comments    String?        @db.Text
  respondedAt DateTime?
  createdAt   DateTime       @default(now())

  // Relations
  decision Decision @relation(fields: [decisionId], references: [id], onDelete: Cascade)
  approver User     @relation("Approver", fields: [approverId], references: [id], onDelete: Restrict)

  @@map("approvals")
}

model Communication {
  id            String               @id @default(uuid()) @db.Uuid
  applicationId String               @db.Uuid
  templateId    String               @db.Uuid
  channel       CommunicationChannel
  providerName  String               @db.VarChar(50)
  messageId     String?              @db.VarChar(255)
  status        CommunicationStatus  @default(queued)
  retryCount    Int                  @default(0)
  sentAt        DateTime?
  deliveredAt   DateTime?
  createdAt     DateTime             @default(now())

  // Relations
  application Application @relation(fields: [applicationId], references: [id], onDelete: Cascade)
  template    Template    @relation(fields: [templateId], references: [id], onDelete: Restrict)

  @@map("communications")
}

model AuditEvent {
  id          String   @id @default(uuid()) @db.Uuid
  actorId     String?  @db.Uuid
  eventType   String   @db.VarChar(100)
  entityType  String   @db.VarChar(50)
  entityId    String   @db.Uuid
  payloadJson Json     @db.JsonB
  ipAddress   String?  @db.Inet
  createdAt   DateTime @default(now())

  // Relations
  actor User? @relation("AuditActor", fields: [actorId], references: [id], onDelete: SetNull)

  @@map("audit_events")
}
```

### Step 2 — Add missing back-relation to `User` for path override approvals

The `Application` model references `User` via a `PathOverrideApprover` named relation. Add the corresponding back-relation to the `User` model defined in TASK-001:

Open `backend/prisma/schema.prisma`, find the `User` model and add:

```prisma
  pathOverrideApprovals Application[] @relation("PathOverrideApprover")
```

### Step 3 — Generate the migration

```bash
cd backend
npx prisma migrate dev --name "add_pipeline_schema"
```

Expected output includes `CREATE TABLE` statements for all 11 new tables and the correct `REFERENCES ... ON DELETE ...` clauses.

### Step 4 — Verify all 19 tables exist

```bash
npx prisma db execute --stdin <<'SQL'
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_type = 'BASE TABLE'
ORDER BY table_name;
SQL
```

Expected output (19 rows):

```
applications
approval_policies
approvals
assessments
audit_events
candidates
communications
decisions
interview_stages
job_families
profiles
reason_codes
requisitions
resumes
reviews
scorecards
screenings
templates
users
```

### Step 5 — Verify FK `onDelete: Restrict` on `applications.requisition_id`

Inspect the generated migration SQL:

```bash
grep -A 5 "requisition_id" backend/prisma/migrations/*_add_pipeline_schema/migration.sql
```

Expected: `ON DELETE RESTRICT` for both `candidate_id` and `requisition_id` foreign keys.

---

## Validation

| Check | Method | Expected Result |
|-------|--------|-----------------|
| All 19 tables created | `information_schema.tables` query | 19 rows returned |
| `applications.requisition_id` FK Restrict | Migration SQL grep | `ON DELETE RESTRICT` |
| `applications.candidate_id` FK Restrict | Migration SQL grep | `ON DELETE RESTRICT` |
| `resumes.application_id` FK Cascade | Migration SQL grep | `ON DELETE CASCADE` |
| `decisions.application_id` FK Restrict | Migration SQL grep | `ON DELETE RESTRICT` |
| `audit_events.actor_id` FK SetNull | Migration SQL grep | `ON DELETE SET NULL` |
| `prisma migrate status` | CLI | No pending migrations |
| `npm run type-check` | CLI | Exit 0 |

---

## Dependencies

- **TASK-001** must be complete and migrated (ENUM types and foundation tables must exist before this migration runs)

## Security Constraints

- **OWASP A01 (Broken Access Control)**: `applications.candidate_id` FK uses `Restrict` — a candidate record cannot be deleted while active applications exist. This prevents accidental orphaning of financial and legal records.
- **OWASP A09 (Security Logging and Monitoring Failures)**: `audit_events.actor_id` uses `SetNull` rather than `Cascade` — audit log entries survive user deletion. This is required by GDPR Article 5(1)(e) (storage limitation) and Article 17 (right to erasure): user PII can be removed while audit evidence is preserved with a null actor reference.
- `audit_events.ip_address` uses `@db.Inet` (PostgreSQL `inet` type) — CIDR prefix and IPv6 are both supported without varchar truncation.

---

## Definition of Done

- [ ] 11 pipeline models appended to `schema.prisma`
- [ ] All FK `onDelete` policies match the table in Technical Specifications
- [ ] `User` back-relation for `PathOverrideApprover` added
- [ ] Migration `add_pipeline_schema` generated and applied
- [ ] 19 tables confirmed in `information_schema.tables`
- [ ] `npx prisma generate` exits 0
- [ ] `npm run type-check` exits 0

## Traceability

| Artefact | ID |
|----------|----|
| User Story | US-001 |
| Epic | EP-DATA |
| Scenario | 1 (all 17+ tables with correct columns), 2 (FK integrity on requisitions) |
| Spec ref | §7.2 (relationships), §7.3 (integrity constraints) |
