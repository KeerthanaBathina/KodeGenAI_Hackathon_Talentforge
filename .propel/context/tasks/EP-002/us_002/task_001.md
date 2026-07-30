---
id: task_001
us_id: us_002
epic: EP-002
title: "Extend Application Schema for Draft Support"
status: done
layer: backend
effort: 1h
priority: critical
created: 2026-07-24
completed: 2026-07-24
---

# TASK-001 — Extend Application Schema for Draft Support

## Context

**User Story**: US-002 — Multi-Step Application Form with Auto-Save and Draft Persistence  
**Epic**: EP-002 — Job Application Submission  
**Addresses**: Scenario 4 (draft status), Scenario 2 (resume from draft)

The Application model needs to support draft state for partial applications. Add `draft` to ApplicationStatus enum and `draftData` JSONB column to store incomplete form data.

---

## Objective

Extend Application model to support:
- Draft status in ApplicationStatus enum
- draftData JSONB field for storing partial form data
- draftSavedAt timestamp for auto-save tracking
- Index on (candidateId, requisitionId, status) for draft lookup

---

## Implementation

**Schema Changes**:

```prisma
enum ApplicationStatus {
  draft           // NEW: for incomplete applications
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

model Application {
  // ... existing fields
  draftData      Json?     @db.JsonB  // NEW: stores partial form data
  draftSavedAt   DateTime?             // NEW: last auto-save timestamp
  
  // ... existing relations
  
  @@index([candidateId, requisitionId, status], name: "idx_applications_candidate_req_status")
}
```

**Draft Data Structure**:
```typescript
{
  step1_personal: {
    fullName?: string;
    email?: string;
    phone?: string;
    linkedinUrl?: string;
  };
  step2_experience: {
    yearsExperience?: number;
    currentRole?: string;
    currentCompany?: string;
  };
  step3_coverLetter: {
    coverLetter?: string;
  };
  currentStep: 1 | 2 | 3 | 4;  // Resume point
}
```

---

## Acceptance Criteria

- [ ] `draft` added to ApplicationStatus enum
- [ ] `draftData` JSONB column added to Application model
- [ ] `draftSavedAt` DateTime? column added
- [ ] Index on (candidateId, requisitionId, status) created
- [ ] Migration runs without errors
- [ ] Prisma client regenerated (`npx prisma generate`)

---

## Dependencies

- None (foundational schema change)

---

## Migration

```bash
cd backend
npx prisma migrate dev --name add_application_draft_support
npx prisma generate
```
