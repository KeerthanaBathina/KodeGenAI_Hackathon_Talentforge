---
id: task_001
us_id: us_001
epic: EP-007
title: "Backend Prerequisite Validation Service"
status: completed
layer: backend
effort: 3h
priority: critical
created: 2026-07-27
completed: 2026-07-27
---

# TASK-001 — Backend Prerequisite Validation Service

## Context

**User Story**: US-001 — Prerequisite Validation Before Enabling Final Decision Controls  
**Epic**: EP-007 — Final Hiring Decision  
**Addresses**: Scenario 3 (API enforcement)

Before a hiring decision can be made, the system must verify that all required evaluation steps are complete. This includes checking interview stage completion and assessment score availability.

---

## Objective

Implement a reusable service layer that validates prerequisite completion for hiring decisions. This service will be used by both the API validation middleware and the frontend checklist component.

---

## Technical Specifications

| Area | Requirement |
|------|-------------|
| Service | `prerequisiteValidationService.ts` in `backend/src/services/` |
| Database queries | Prisma queries for `InterviewStage`, `AssessmentSession`, `Scorecard` |
| Return type | `PrerequisiteCheckResult` with `isComplete`, `incompleteStages[]`, `missingItems[]` |
| Error handling | Throw descriptive errors for missing application or data issues |
| Logging | Log validation failures with application ID and missing prerequisites |

---

## Implementation Steps

### Step 1 — Create TypeScript types

1. Create `backend/src/types/prerequisiteValidation.ts`
2. Define interfaces:
   ```typescript
   export interface PrerequisiteCheckResult {
     isComplete: boolean;
     incompleteStages: IncompleteStage[];
     missingAssessment: boolean;
     message?: string;
   }
   
   export interface IncompleteStage {
     id: string;
     type: InterviewStageType;
     state: InterviewStageState;
     scheduledDate?: Date;
     hasScorecards: boolean;
   }
   
   export interface RequiredPrerequisites {
     requireAllInterviewStages: boolean;
     requireAssessment: boolean;
     requiredStageTypes?: InterviewStageType[];
   }
   ```

### Step 2 — Implement prerequisite validation service

1. Create `backend/src/services/prerequisiteValidationService.ts`
2. Implement core functions:
   - `checkPrerequisites(applicationId: string, requirements?: RequiredPrerequisites): Promise<PrerequisiteCheckResult>`
   - `getInterviewStageCompletion(applicationId: string): Promise<InterviewStage[]>`
   - `hasAssessmentScore(applicationId: string): Promise<boolean>`
   - `validateAllStagesComplete(stages: InterviewStage[]): IncompleteStage[]`

### Step 3 — Query interview stages

1. Fetch all interview stages for application:
   ```typescript
   const stages = await prisma.interviewStage.findMany({
     where: { applicationId },
     include: {
       scorecards: {
         select: { id: true, recommendation: true }
       }
     },
     orderBy: { scheduledDate: 'asc' }
   });
   ```
2. Check each stage state:
   - `completed` = stage complete ✅
   - `scheduled`, `in_progress` = incomplete ❌
   - `cancelled` = skip validation (optional)

### Step 4 — Query assessment completion

1. Check for assessment session with score:
   ```typescript
   const assessment = await prisma.assessmentSession.findFirst({
     where: {
       applicationId,
       status: 'completed',
       score: { not: null }
     }
   });
   return assessment !== null;
   ```

### Step 5 — Build validation result

1. Aggregate incomplete stages
2. Check assessment requirement
3. Build descriptive message:
   - "All prerequisites complete" (isComplete = true)
   - "Missing: Technical Interview (scheduled), Assessment Score" (isComplete = false)
4. Return `PrerequisiteCheckResult`

### Step 6 — Add logging and error handling

1. Log validation results:
   ```typescript
   logger.info('Prerequisite validation', {
     applicationId,
     isComplete,
     incompleteStages: result.incompleteStages.length,
     missingAssessment: result.missingAssessment
   });
   ```
2. Handle edge cases:
   - Application not found → throw `ApplicationNotFoundError`
   - No stages configured → return complete (empty requirement)
   - Database errors → log and re-throw

---

## API Specifications

### checkPrerequisites()

**Input**
```typescript
applicationId: "uuid-application-123"
requirements: {
  requireAllInterviewStages: true,
  requireAssessment: true
}
```

**Output (Incomplete)**
```typescript
{
  isComplete: false,
  incompleteStages: [
    {
      id: "uuid-stage-1",
      type: "technical",
      state: "scheduled",
      scheduledDate: "2026-07-28T10:00:00Z",
      hasScorecards: false
    }
  ],
  missingAssessment: true,
  message: "Missing: Technical Interview (scheduled), Assessment Score"
}
```

**Output (Complete)**
```typescript
{
  isComplete: true,
  incompleteStages: [],
  missingAssessment: false,
  message: "All prerequisites complete"
}
```

---

## Validation

| Check | Method | Expected Result |
|-------|--------|-----------------|
| All stages complete | Unit test | isComplete = true |
| One stage incomplete | Unit test | isComplete = false, specific stage in array |
| Assessment missing | Unit test | missingAssessment = true |
| No stages configured | Unit test | isComplete = true (empty requirement) |
| Application not found | Unit test | Throws ApplicationNotFoundError |

---

## Dependencies

- Prisma schema with `InterviewStage`, `Scorecard`, `AssessmentSession` models
- Existing database relationships

---

## Definition of Done

- [✅] TypeScript types defined for validation results
- [✅] Service function `checkPrerequisites()` implemented
- [✅] Query functions for stages and assessment completed
- [✅] Validation logic handles all stage states
- [✅] Descriptive error messages generated
- [✅] Logging added for validation results
- [✅] Unit tests cover all scenarios (complete, incomplete, missing data) - **21 tests passing**
- [✅] Service exported and documented

---

## Notes

- Stage state `cancelled` can be treated as optional (skip in validation)
- Default requirements: all stages + assessment required
- Future enhancement: configurable prerequisites per requisition
- Service is reusable for both API validation and frontend display
