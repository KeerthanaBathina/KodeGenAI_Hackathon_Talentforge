---
id: task_002
us_id: us_003
epic: EP-005
title: "Build Scorecard API with Partial Save and Validation Logic"
status: completed
layer: backend
effort: 5h
priority: critical
created: 2026-07-25
completed: 2026-07-25
---

# TASK-002 — Build Scorecard API with Partial Save and Validation Logic

## Context

**User Story**: US-003 — Scorecard Capture with Mandatory Rubric Dimensions and Recommendation Submission  
**Epic**: EP-005 — Interview Scheduling and Lifecycle Management  
**Addresses**: Scenario 2 (mandatory scoring), Scenario 4 (partial save)

The scorecard API must support creating draft scorecards, partial saves as dimensions are scored, and validation that all dimensions are scored before submission is allowed.

---

## Objective

Implement backend API endpoints so that:
1. interviewers can create draft scorecards for their assigned interviews
2. dimension scores are saved incrementally (partial save)
3. validation enforces all dimensions scored before submission
4. aggregate score is calculated and stored on submission

---

## Technical Specifications

| Area | Requirement |
|------|-------------|
| Create draft | POST /api/scorecards - create draft scorecard for interview stage |
| Retrieve scorecard | GET /api/scorecards/:scorecardId - fetch scorecard with dimensions |
| Partial save | PATCH /api/scorecards/:scorecardId - update dimension scores (draft only) |
| Validation | check all rubric dimensions are scored before allowing submission |
| Aggregate calculation | average of all dimension scores (1-5 scale) |

---

## Implementation Steps

### Step 1 — Create scorecard creation endpoint

1. **POST /api/scorecards**
   - Request body: `{ interviewStageId: string }`
   - Verify requester is the assigned interviewer for this stage
   - Check if scorecard already exists for this interviewer and stage (prevent duplicates)
   - Create scorecard with status `draft`
   - Fetch rubric template for the interview stage type
   - Initialize empty dimension records for each rubric dimension
   - Return created scorecard with dimensions

2. Authorization: Only the assigned interviewer can create their own scorecard

### Step 2 — Implement scorecard retrieval endpoint

1. **GET /api/scorecards/:scorecardId**
   - Fetch scorecard with all dimension records
   - Include rubric template information (dimension names, descriptions, display order)
   - Return scorecard with dimensions array and metadata

2. Authorization: Interviewer (owner), recruiter, HR manager can view

### Step 3 — Add partial save endpoint

1. **PATCH /api/scorecards/:scorecardId**
   - Request body:
     ```typescript
     {
       dimensions: Array<{
         dimensionName: string;
         score: number;  // 1-5
         notes?: string;
       }>;
       recommendation?: 'advance' | 'hold' | 'reject';
     }
     ```
   - Verify scorecard is in `draft` status (reject if `submitted`)
   - Validate scores are 1-5 integers
   - Upsert dimension records (create if not exists, update if exists)
   - Update recommendation if provided
   - Return updated scorecard with completion percentage

2. Authorization: Only the scorecard owner (interviewer) can update

### Step 4 — Add validation helper functions

1. Create `validateScorecardComplete(scorecardId)`:
   - Fetch all rubric dimensions for the interview stage type
   - Check all dimensions have scores
   - Check recommendation is selected
   - Return boolean and missing dimensions array

2. Create `calculateAggregateScore(scorecardId)`:
   - Fetch all dimension scores
   - Calculate average: `sum(scores) / count(scores)`
   - Round to 1 decimal place
   - Return aggregate score

### Step 5 — Add endpoint to check scorecard completeness

1. **GET /api/scorecards/:scorecardId/validation**
   - Check if all dimensions are scored
   - Check if recommendation is selected
   - Return:
     ```typescript
     {
       isComplete: boolean;
       missingDimensions: string[];
       hasRecommendation: boolean;
       completionPercentage: number;
     }
     ```

2. Authorization: Interviewer (owner), recruiter, HR manager

---

## Validation

| Check | Method | Expected Result |
|-------|--------|-----------------|
| create scorecard | POST /api/scorecards | draft scorecard created with empty dimensions |
| duplicate prevention | POST /api/scorecards (2x) | second request returns existing scorecard or 409 conflict |
| partial save | PATCH with 2 of 4 dimensions | dimensions saved, completionPercentage = 50% |
| validation endpoint | GET /validation with incomplete scorecard | isComplete = false, missingDimensions = [...] |
| submitted immutability | PATCH on submitted scorecard | returns 403 or 422 error |
| authorization | PATCH as different user | returns 403 forbidden |

---

## Dependencies

- TASK-001 (database schema and models)
- Interview stage assignment (from US-002)
- Prisma client (existing)

---

## Security Constraints

- Only the assigned interviewer can create or update their scorecard
- Submitted scorecards must be immutable (reject PATCH requests)
- Validate all inputs: scores must be 1-5, dimensionName must exist in rubric

---

## Definition of Done

- [x] POST /api/scorecards creates draft scorecard with rubric dimensions
- [x] GET /api/scorecards/:id retrieves scorecard with dimensions and metadata
- [x] PATCH /api/scorecards/:id saves dimension scores (partial save)
- [x] PATCH rejects updates to submitted scorecards (403 or 422)
- [x] GET /api/scorecards/:id/validation checks completeness
- [x] Unit tests cover create, retrieve, partial save, validation
- [x] Authorization tests verify only scorecard owner can update

---

## Completion Summary

**Date**: 2026-07-25  
**Files Created/Modified**:
- `backend/src/services/scorecardService.ts` - Complete service layer with 10 functions (CRUD operations, validation, authorization)
- `backend/src/routes/scorecards.ts` - 5 API endpoints with Zod validation and authentication
- `backend/src/routes/__tests__/scorecards.test.ts` - 9 passing unit tests covering all endpoints
- `backend/src/app.ts` - Integrated scorecards router into Express application

**Implementation Details**:
1. **POST /api/scorecards**: Creates draft scorecard after verifying user is assigned panelist, initializes empty dimensions from rubric template
2. **GET /api/scorecards/:id**: Retrieves scorecard with formatted dimensions, enforces view authorization (owner, recruiter, HR, admin)
3. **PATCH /api/scorecards/:id**: Partial save with dimension upserts, validates draft status, returns completion percentage
4. **GET /api/scorecards/:id/validation**: Returns structured validation object (isComplete, missingDimensions, hasRecommendation, completionPercentage)
5. **GET /api/scorecards/rubric/:stageType**: Returns ordered rubric template dimensions for interview type

**Authorization Helpers**:
- `canViewScorecard()`: Returns true for recruiter/hr_manager/admin or scorecard owner
- `canUpdateScorecard()`: Returns true only for scorecard owner with draft status

**Validation Logic**:
- All dimension scores required (1-5 range enforced by Zod)
- Recommendation required for completeness
- Completion percentage calculated as (scored dimensions / total dimensions) × 100
- Submitted scorecards rejected with 403 Forbidden on update attempts

**Test Coverage** (9 passing tests):
- ✓ Request validation (400 for missing fields)
- ✓ Scorecard retrieval with authorization
- ✓ 403 for unauthorized view
- ✓ 404 for missing scorecard
- ✓ Partial save with validation response
- ✓ 403 for unauthorized update
- ✓ Score range validation (1-5)
- ✓ Validation endpoint with missing dimensions
- ✓ Validation endpoint with complete scorecard

**Migration**: Ready but not applied (requires DATABASE_URL and DIRECT_URL environment variables)
