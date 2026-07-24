---
id: task_003
us_id: us_002
epic: EP-002
title: "Create Application Draft API Endpoints"
status: done
layer: backend
effort: 3h
priority: critical
created: 2026-07-24
completed: 2026-07-24
---

# TASK-003 — Create Application Draft API Endpoints

## Context

**User Story**: US-002 — Multi-Step Application Form with Auto-Save and Draft Persistence  
**Epic**: EP-002 — Job Application Submission  
**Addresses**: All scenarios (save, resume, submit)

REST API endpoints for draft management. Protected by authentication middleware, scoped to authenticated candidate.

---

## Objective

Create `/api/applications/drafts` route with:
- POST /drafts — Save or update draft (auto-save endpoint)
- GET /drafts/:requisitionId — Get draft for a requisition
- POST /drafts/:requisitionId/submit — Submit final application
- GET /requisitions/:requisitionId/has-draft — Check if draft exists

---

## Implementation

**File**: `backend/src/routes/applicationDrafts.ts`

**Endpoints**:

### POST /api/applications/drafts
**Purpose**: Save or update draft (called by auto-save)

**Request Body** (Zod validation):
```typescript
{
  requisitionId: string (UUID);
  draftData: {
    step1_personal?: {...};
    step2_experience?: {...};
    step3_coverLetter?: {...};
    currentStep: 1 | 2 | 3 | 4;
  };
}
```

**Response**: 200
```typescript
{
  id: string;
  status: "draft";
  draftSavedAt: string (ISO);
  message: "Draft saved successfully";
}
```

### GET /api/applications/drafts/:requisitionId
**Purpose**: Resume draft

**Response**: 200
```typescript
{
  id: string;
  requisitionId: string;
  draftData: {...};
  draftSavedAt: string;
}
```

**Response**: 404 if no draft exists

### POST /api/applications/drafts/:requisitionId/submit
**Purpose**: Final submission

**Request Body**: None (reads from existing draft)

**Response**: 200
```typescript
{
  id: string;
  status: "submitted";
  submittedAt: string;
  message: "Application submitted successfully";
}
```

**Response**: 400 if no draft exists or already submitted

### GET /api/requisitions/:requisitionId/has-draft
**Purpose**: Check if candidate has draft for this requisition

**Response**: 200
```typescript
{
  hasDraft: boolean;
  draftId?: string;
}
```

---

## Acceptance Criteria

- [ ] All endpoints protected by `authenticate` middleware
- [ ] POST /drafts creates or updates draft
- [ ] POST /drafts returns 400 on invalid draftData
- [ ] GET /drafts/:id returns 404 if no draft
- [ ] POST /submit transitions status to 'submitted'
- [ ] POST /submit returns 400 if already submitted
- [ ] GET /has-draft returns correct boolean
- [ ] All endpoints scoped to req.user.id (candidate)
- [ ] Zod validation for all request bodies

---

## Dependencies

- TASK-002 (applicationDraftService)
- `authenticate` middleware
- Requisition model (for validation)

---

## Testing

Integration tests in `backend/src/routes/__tests__/applicationDrafts.integration.test.ts`:
- Test save draft (create)
- Test save draft (update)
- Test get draft (exists, not exists)
- Test submit draft (success)
- Test submit draft (duplicate submission)
- Test has-draft endpoint
