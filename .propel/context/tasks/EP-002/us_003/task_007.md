---
id: task_007
us_id: us_003
epic: EP-002
title: "Write Integration and E2E Tests for Duplicate Prevention"
status: done
layer: test
effort: 3h
priority: medium
created: 2026-07-24
completed: 2026-07-24
---

# TASK-007 — Write Integration and E2E Tests for Duplicate Prevention

## Context

**User Story**: US-003 — Duplicate Application Prevention with Cooling Period Enforcement  
**Epic**: EP-002 — Job Application Submission  
**Addresses**: All acceptance criteria verification

Comprehensive test coverage for duplicate prevention, cooling period enforcement, and UI state rendering.

---

## Objective

Create test suites for:
- Backend service logic (eligibility checks)
- Backend API integration (409 responses)
- Frontend E2E flows (button states, error handling)

---

## Implementation

### Backend Service Tests

**File**: `backend/src/services/__tests__/applicationStatusService.test.ts`

**Test Cases** (15+ tests):
- [ ] Returns canApply=false when active application exists
- [ ] Returns canApply=false when in cooling period (45 days since rejection)
- [ ] Returns canApply=true when cooling period expired (91 days)
- [ ] Returns canApply=true when no previous application
- [ ] Returns canApply=true when previous application hired
- [ ] Returns canApply=true when previous application withdrawn
- [ ] Calculates daysRemaining correctly (90 - daysSince)
- [ ] Uses most recent rejection when multiple exist
- [ ] Returns active_application reason for draft status
- [ ] Returns active_application reason for submitted status
- [ ] Returns cooling_period reason within 90 days
- [ ] Returns eligible reason after 90 days
- [ ] Scoped to candidateId only

### Backend Integration Tests

**File**: `backend/src/routes/__tests__/requisitions.integration.test.ts`

**Test Cases** (10+ tests):
- [ ] GET /eligibility returns active application status
- [ ] GET /eligibility returns cooling period with days remaining
- [ ] GET /eligibility returns eligible when no previous app
- [ ] GET /eligibility requires authentication (401)
- [ ] GET /eligibility scoped to requesting candidate
- [ ] POST /submit returns 409 for duplicate application
- [ ] POST /submit returns 409 for cooling period
- [ ] POST /submit error includes daysRemaining
- [ ] POST /submit succeeds when eligible
- [ ] Database constraint prevents duplicate (fail-safe test)

### Frontend E2E Tests

**File**: `frontend/tests/duplicate-prevention.spec.ts`

**Test Scenarios** (12+ tests):

**Active Application Flow**:
- [ ] Job card shows "Application In Progress" for active application
- [ ] "Application In Progress" is not clickable
- [ ] Draft check skipped when active application exists

**Cooling Period Flow**:
- [ ] Job card shows disabled button with countdown
- [ ] Tooltip displays "Re-application available in X days"
- [ ] Button remains disabled (cannot click)
- [ ] Countdown displays correct number of days

**Eligible Flow**:
- [ ] Job card shows "Apply Now" when eligible (no draft)
- [ ] Job card shows "Continue Application" when draft exists
- [ ] Click "Apply Now" navigates to application form

**Re-application After Cooling Period**:
- [ ] Banner shows "You previously applied — re-application allowed"
- [ ] "Apply Now" button enabled after 90+ days

**Submission Error Handling**:
- [ ] Submit during cooling period shows error toast
- [ ] Error toast includes days remaining
- [ ] User remains on form after 409
- [ ] Submit with active application shows duplicate error

**Edge Cases**:
- [ ] Multiple rejections use most recent date
- [ ] Cooling period at boundary (day 90 vs 91)

---

## Acceptance Criteria

- [ ] All backend service tests pass (15+ tests)
- [ ] All backend integration tests pass (10+ tests)
- [ ] All E2E tests pass (12+ scenarios)
- [ ] Test coverage >80% for applicationStatusService
- [ ] Database constraint tested (unique violation)
- [ ] UI states tested for all eligibility reasons
- [ ] Error messages tested (duplicate vs cooling period)

---

## Dependencies

- TASK-001 through TASK-006 (all implementation complete)
- Test data: candidates, requisitions, applications with various statuses
- Vitest (backend testing)
- Playwright (E2E testing)

---

## Test Data Setup

**Seed Data**:
- Test candidate 1: No previous applications
- Test candidate 2: Active application for Req A
- Test candidate 3: Rejected 45 days ago for Req B
- Test candidate 4: Rejected 91 days ago for Req C
- Test candidate 5: Hired for Req D (terminal status)

**Cleanup**:
- Delete test applications after each test
- Reset dates for cooling period tests
