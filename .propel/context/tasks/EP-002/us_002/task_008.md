---
id: task_008
us_id: us_002
epic: EP-002
title: "Write Integration and E2E Tests for Application Draft Flow"
status: done
layer: test
effort: 5h
priority: high
created: 2026-07-24
completed: 2026-07-24
---

# TASK-008 — Write Integration and E2E Tests for Application Draft Flow

## Context

**User Story**: US-002 — Multi-Step Application Form with Auto-Save and Draft Persistence  
**Epic**: EP-002 — Job Application Submission  
**Addresses**: All acceptance criteria verification

Comprehensive test coverage for draft save, resume, auto-save, step validation, and submission flow.

---

## Objective

Create test suites for:
- Backend API integration tests (draft CRUD, submission)
- Frontend E2E tests (Playwright — multi-step flow, auto-save, resume)
- Service layer unit tests (applicationDraftService)

---

## Implementation

### Backend Service Tests

**File**: `backend/src/services/__tests__/applicationDraftService.test.ts`

**Test Cases** (15+ tests):
- [ ] saveDraft creates new draft on first save
- [ ] saveDraft updates existing draft on subsequent saves
- [ ] draftSavedAt timestamp updates on every save
- [ ] getDraft returns draft with correct data
- [ ] getDraft returns null when no draft exists
- [ ] hasDraft returns true when draft exists
- [ ] hasDraft returns false when no draft
- [ ] submitDraft transitions status to 'submitted'
- [ ] submitDraft sets submittedAt timestamp
- [ ] submitDraft clears draftData
- [ ] submitDraft throws error on duplicate submission
- [ ] submitDraft throws error when no draft exists
- [ ] Audit events logged for save operations
- [ ] Audit events logged for submit operation

### Backend Integration Tests

**File**: `backend/src/routes/__tests__/applicationDrafts.integration.test.ts`

**Test Cases** (20+ tests):
- [ ] POST /drafts creates draft (status 200)
- [ ] POST /drafts updates existing draft
- [ ] POST /drafts requires authentication
- [ ] POST /drafts validates draftData (400 on invalid)
- [ ] POST /drafts validates requisitionId (UUID)
- [ ] POST /drafts returns draftSavedAt timestamp
- [ ] GET /drafts/:id returns draft data
- [ ] GET /drafts/:id returns 404 when no draft
- [ ] GET /drafts/:id requires authentication
- [ ] GET /drafts/:id scoped to candidate (can't access others' drafts)
- [ ] POST /drafts/:id/submit transitions to submitted
- [ ] POST /drafts/:id/submit returns 400 on duplicate
- [ ] POST /drafts/:id/submit returns 400 when no draft
- [ ] POST /drafts/:id/submit requires authentication
- [ ] GET /has-draft returns true when draft exists
- [ ] GET /has-draft returns false when no draft
- [ ] GET /has-draft requires authentication

### Frontend E2E Tests

**File**: `frontend/tests/application-draft-flow.spec.ts`

**Test Scenarios** (12+ tests):

**Auto-Save Flow**:
- [ ] Fill Step 1, wait 60s, verify "Draft saved" toast
- [ ] Change field twice within 60s, verify only 1 save after final change
- [ ] Auto-save includes currentStep in draftData

**Resume Flow**:
- [ ] Create draft, close browser (clear state), reload page
- [ ] Verify "Continue Application" button appears on requisition card
- [ ] Click "Continue", verify form loads at saved step with data
- [ ] Verify "Resuming from Step X" message displays

**Step Navigation**:
- [ ] Step 1: Leave required field empty, click Next, verify error shown
- [ ] Step 1: Fill all fields, click Next, verify advances to Step 2
- [ ] Step 2: Validate yearsExperience >= 0
- [ ] Step 3: Validate coverLetter min 100 chars
- [ ] Step 4: Verify all data displayed in review
- [ ] Step 4: Click "Edit" on Step 2, verify navigates back

**Submission Flow**:
- [ ] Complete all steps, click "Submit Application"
- [ ] Verify redirect to success page
- [ ] Return to requisition, verify "Apply" button (no "Continue")
- [ ] Attempt to submit again, verify error/prevention

**Edge Cases**:
- [ ] Start application for Req A, verify can't resume Req B's draft
- [ ] Submit application, verify form becomes read-only
- [ ] After submission, verify auto-save stops

---

## Acceptance Criteria

- [ ] All backend service tests pass (15+ tests)
- [ ] All backend integration tests pass (20+ tests)
- [ ] All E2E tests pass (12+ scenarios)
- [ ] Test coverage >80% for applicationDraftService
- [ ] Auto-save timer tested (use vi.useFakeTimers)
- [ ] Playwright tests use proper wait strategies (not arbitrary timeouts)

---

## Dependencies

- TASK-001 through TASK-007 (all implementation complete)
- Vitest (backend testing)
- Playwright (E2E testing)

---

## Test Data Setup

**Seed Data** (for E2E):
- Test candidate account
- Test requisition (open status)
- Clean slate (no existing drafts) before each test

**Cleanup**:
- Delete test drafts after each test
- Clear localStorage/cookies between E2E tests
