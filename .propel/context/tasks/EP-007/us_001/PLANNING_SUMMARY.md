# US-001 Task Planning Summary

**User Story**: US-001 — Prerequisite Validation Before Enabling Final Decision Controls  
**Epic**: EP-007 — Final Hiring Decision  
**Planning Date**: 2026-07-27

---

## Overview

US-001 requires implementing prerequisite validation before allowing hiring managers to submit final decisions. The system must verify that all evaluation stages (interviews and assessments) are complete before enabling decision controls.

---

## Tasks Created

### Backend Tasks (3)

1. **TASK-001: Backend Prerequisite Validation Service** (3h, Critical)
   - Reusable service to check stage and assessment completion
   - Returns structured `PrerequisiteCheckResult`
   - Queries `InterviewStage` and `AssessmentSession` tables
   - Foundation for both API validation and frontend display

2. **TASK-002: Backend Decision API Validation Middleware** (2h, Critical)
   - Middleware for `POST /api/decisions` endpoint
   - Returns HTTP 422 when prerequisites incomplete
   - Includes detailed error breakdown
   - Audit logging for validation failures

3. **TASK-003: Backend Stage Completion WebSocket Events** (3h, High)
   - Emits `stage:completed` events via WebSocket
   - Triggers when scorecard submission completes a stage
   - Application-scoped rooms for targeted delivery
   - Supports real-time UI updates

### Frontend Tasks (3)

4. **TASK-004: Frontend Prerequisite Checklist Component** (4h, High)
   - React component displaying completion status
   - Visual indicators: green tick (complete), grey circle (pending)
   - Fetches status from `GET /api/applications/:id/prerequisites`
   - Exposes update method for WebSocket integration

5. **TASK-005: Frontend Decision Panel with Prerequisite Gating** (3h, High)
   - Integrates checklist into decision panel
   - Disables decision controls when prerequisites incomplete
   - Visual feedback (warnings, tooltips) for disabled state
   - Handles server validation errors (HTTP 422)

6. **TASK-006: Frontend Real-time WebSocket Integration** (3h, Medium)
   - WebSocket client subscribes to application events
   - Updates checklist in real-time when stages complete
   - Polling fallback when WebSocket unavailable
   - Connection status indicator

### Test Task (1)

7. **TASK-007: Integration Testing for Prerequisite Validation** (4h, High)
   - 30+ tests across all layers
   - Unit tests for validation service (8 tests)
   - API integration tests (6 tests)
   - WebSocket event tests (6 tests)
   - Frontend component tests (7 tests)
   - E2E scenario tests (3 workflows)

---

## Task Dependencies

```
TASK-001 (Prerequisite Service)
    ↓
    ├─→ TASK-002 (API Validation)
    └─→ TASK-004 (Checklist Component)
            ↓
            └─→ TASK-005 (Decision Panel)

TASK-003 (WebSocket Events)
    ↓
    └─→ TASK-006 (WebSocket Client)
            ↓
            └─→ TASK-005 (Decision Panel)

All → TASK-007 (Testing)
```

**Recommended Implementation Order**:
1. TASK-001 (foundation)
2. TASK-002 (API protection)
3. TASK-004 (UI display)
4. TASK-005 (UI integration)
5. TASK-003 (events)
6. TASK-006 (real-time)
7. TASK-007 (validation)

---

## Technology Layer Breakdown

### Backend Layer (8h total)
- **Database**: Queries `InterviewStage` (state field), `Scorecard`, `AssessmentSession`
- **Service**: `prerequisiteValidationService.ts` with `checkPrerequisites()` function
- **Middleware**: `validateDecisionPrerequisites` for route protection
- **WebSocket**: Socket.IO event emission for `stage:completed`, `assessment:completed`
- **API**: `POST /api/decisions` with validation, `GET /api/applications/:id/prerequisites`

### Frontend Layer (10h total)
- **Components**: `PrerequisiteChecklist.tsx`, `DecisionPanel.tsx` (enhanced)
- **API Client**: `prerequisites.ts` fetch functions
- **WebSocket**: Socket.IO client, `useApplicationWebSocket` hook
- **State Management**: React hooks for prerequisite status and gating logic
- **Styling**: Tailwind CSS for visual indicators and disabled states

### Test Layer (4h total)
- **Unit**: Service validation logic (8 tests)
- **Integration**: API validation (6), WebSocket (6), Frontend (7)
- **E2E**: Complete workflows (3 scenarios)
- **Helpers**: Test data generators for applications, stages, assessments

---

## Acceptance Criteria Coverage

| Scenario | Covered By |
|----------|------------|
| **Scenario 1**: Decision panel locked when stages incomplete | TASK-004, TASK-005 |
| **Scenario 2**: Panel unlocked when all complete | TASK-004, TASK-005 |
| **Scenario 3**: API enforces validation (HTTP 422) | TASK-001, TASK-002 |
| **Scenario 4**: Real-time WebSocket updates | TASK-003, TASK-006 |

All scenarios are fully covered by the task breakdown.

---

## API Specifications

### New Endpoints

1. **GET /api/applications/:applicationId/prerequisites**
   - Returns prerequisite status with item-level details
   - Used by frontend checklist component
   - Response: `{ isComplete: boolean, items: PrerequisiteItem[] }`

2. **POST /api/decisions** (enhanced)
   - Existing endpoint with added prerequisite validation middleware
   - Returns HTTP 422 when prerequisites incomplete
   - Error format: `{ error: { code, message, details: { incompleteStages[], missingAssessment } } }`

### WebSocket Events

1. **Event: `stage:completed`**
   - Emitted when scorecard submission completes a stage
   - Payload: `{ applicationId, stageId, stageType, completedAt, completedBy }`
   - Delivered to clients in `application:${applicationId}` room

2. **Event: `assessment:completed`**
   - Emitted when assessment score is ingested
   - Payload: `{ applicationId, assessmentId, score, completedAt }`

---

## Data Model Usage

### InterviewStage Model
```prisma
model InterviewStage {
  id          String              @id @default(uuid())
  type        InterviewStageType  // technical, behavioral, etc.
  state       InterviewStageState // scheduled, in_progress, completed, cancelled
  scorecards  Scorecard[]
  applicationId String
  application   Application @relation(...)
}
```

**Validation Logic**:
- Stage is "complete" when `state = 'completed'`
- Cancelled stages (`state = 'cancelled'`) can be ignored
- All required stages must be complete before decision

### AssessmentSession Model
```prisma
model AssessmentSession {
  id            String   @id
  applicationId String
  status        String   // completed
  score         Float?
}
```

**Validation Logic**:
- Assessment is "complete" when `status = 'completed'` AND `score IS NOT NULL`

---

## Effort Summary

| Task | Effort | Priority |
|------|--------|----------|
| TASK-001 | 3h | Critical |
| TASK-002 | 2h | Critical |
| TASK-003 | 3h | High |
| TASK-004 | 4h | High |
| TASK-005 | 3h | High |
| TASK-006 | 3h | Medium |
| TASK-007 | 4h | High |
| **TOTAL** | **22h** | - |

**Estimated Sprint Capacity**: ~2-3 sprints (assuming 2-week sprints, 1 developer)

---

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| WebSocket infrastructure doesn't exist | High | TASK-003 includes setup guide; can use polling fallback |
| Complex stage completion logic (multiple scorecards) | Medium | TASK-001 defines clear rules; covered by unit tests |
| Race condition between WebSocket and API calls | Low | Frontend state management handles updates idempotently |
| Database schema mismatch | High | Validated against existing schema.prisma during planning |

---

## Future Enhancements

1. **Configurable Prerequisites**: Allow requisitions to define custom prerequisite requirements
2. **Partial Completion**: Support "optional" vs "required" stages
3. **Override Capability**: Admin role can bypass prerequisite check with justification
4. **Stage Progress Tracking**: Show percentage completion for in-progress stages
5. **Notification Integration**: Send notifications when prerequisites complete

---

## Validation Checklist

- [x] All 4 acceptance criteria scenarios addressed
- [x] Tasks cover backend, frontend, and testing layers
- [x] Dependencies between tasks clearly defined
- [x] Effort estimates provided for each task
- [x] API specifications documented
- [x] Database model usage validated
- [x] Risk assessment completed
- [x] Implementation order recommended

---

## Next Steps

1. Review task breakdown with team
2. Assign tasks to developers based on expertise
3. Set up test database and WebSocket infrastructure
4. Begin implementation with TASK-001 (foundation)
5. Run daily standups to track progress
6. Conduct code reviews for each completed task
7. Run full test suite before marking US-001 complete
