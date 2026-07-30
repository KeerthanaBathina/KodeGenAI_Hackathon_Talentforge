---
id: task_002
us_id: us_002
epic: EP-002
title: "Create Application Draft Service with Auto-Save Logic"
status: done
layer: backend
effort: 4h
priority: critical
created: 2026-07-24
completed: 2026-07-24
---

# TASK-002 — Create Application Draft Service with Auto-Save Logic

## Context

**User Story**: US-002 — Multi-Step Application Form with Auto-Save and Draft Persistence  
**Epic**: EP-002 — Job Application Submission  
**Addresses**: Scenarios 1-2 (auto-save, resume draft)

Service layer for managing application drafts with CRUD operations, duplicate detection, and submission lock logic.

---

## Objective

Build `applicationDraftService.ts` with:
- Create or update draft (upsert pattern)
- Get active draft by candidate + requisition
- Check if draft exists for a requisition
- Submit draft (transitions status to `submitted`, locks auto-save)
- Audit logging for all operations

---

## Implementation

**File**: `backend/src/services/applicationDraftService.ts`

**Functions**:

```typescript
interface DraftData {
  step1_personal?: {
    fullName?: string;
    email?: string;
    phone?: string;
    linkedinUrl?: string;
  };
  step2_experience?: {
    yearsExperience?: number;
    currentRole?: string;
    currentCompany?: string;
  };
  step3_coverLetter?: {
    coverLetter?: string;
  };
  currentStep: 1 | 2 | 3 | 4;
}

async function saveDraft(params: {
  candidateId: string;
  requisitionId: string;
  draftData: DraftData;
}): Promise<Application>

async function getDraft(params: {
  candidateId: string;
  requisitionId: string;
}): Promise<Application | null>

async function hasDraft(params: {
  candidateId: string;
  requisitionId: string;
}): Promise<boolean>

async function submitDraft(params: {
  candidateId: string;
  requisitionId: string;
}): Promise<Application>
```

**Upsert Logic**:
- Use Prisma `upsert` with `where: { candidateId, requisitionId, status: 'draft' }`
- Create: sets status='draft', draftData, draftSavedAt=now()
- Update: updates draftData, draftSavedAt=now()

**Submit Logic**:
- Validate draft exists
- Update status='submitted', submittedAt=now()
- Clear draftData (set to null) after submission
- Prevent duplicate submissions (check status != 'submitted')

**Audit Trail**:
- Log `application.draft.saved` on upsert
- Log `application.draft.submitted` on submit

---

## Acceptance Criteria

- [ ] saveDraft creates new draft on first save
- [ ] saveDraft updates existing draft on subsequent saves
- [ ] draftSavedAt timestamp updates on every save
- [ ] getDraft returns null if no draft exists
- [ ] hasDraft returns true/false correctly
- [ ] submitDraft transitions status to 'submitted'
- [ ] submitDraft prevents re-submission (throws error)
- [ ] submitDraft clears draftData after submission
- [ ] All operations logged to audit trail

---

## Dependencies

- TASK-001 (schema changes)
- `auditService.ts` (for audit logging)

---

## Testing

Unit tests in `backend/src/services/__tests__/applicationDraftService.test.ts`:
- Test draft creation
- Test draft update (same candidate + requisition)
- Test getDraft (exists vs. not exists)
- Test submitDraft (status transition, draftData cleared)
- Test duplicate submission prevention
