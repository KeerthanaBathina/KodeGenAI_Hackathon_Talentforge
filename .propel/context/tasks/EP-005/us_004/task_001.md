---
id: task_001
us_id: us_004
epic: EP-005
title: "Implement Interview State Machine with Transition Validation"
status: completed
layer: backend
effort: 4h
priority: critical
created: 2026-07-25
completed: 2026-07-26
---

# TASK-001 — Implement Interview State Machine with Transition Validation

## Context

**User Story**: US-004 — Interview Lifecycle State Machine — No-Show, Reschedule, Cancel, and Automated Reminders  
**Epic**: EP-005 — Interview Scheduling and Lifecycle Management  
**Addresses**: Scenario 5 (invalid state transition rejected)

Interview lifecycle must follow a state machine with enforced transitions to prevent invalid status combinations (e.g., cannot reschedule a cancelled interview). The system must validate transitions and reject invalid requests with descriptive errors.

---

## Objective

Implement state machine logic so that:
1. all state transitions are validated against allowed paths
2. invalid transitions return HTTP 422 with descriptive error messages
3. state changes are atomic and logged to audit trail
4. transition rules are centralized and easily maintainable

---

## Technical Specifications

| Area | Requirement |
|------|-------------|
| State enum | scheduled, completed, cancelled, no_show, rescheduled |
| Valid transitions | scheduled → [completed, cancelled, no_show, rescheduled]; completed → []; cancelled → []; no_show → [rescheduled]; rescheduled → [] |
| Validation | Check current state before allowing transition; return 422 if invalid |
| Audit trail | Log all state transitions with timestamp, actor, reason |
| Error messages | Clear, actionable messages (e.g., "Cannot transition from completed to no_show") |

---

## Implementation Steps

### Step 1 — Update schema to add 'rescheduled' state

1. **Update InterviewStageState enum** in `backend/prisma/schema.prisma`:
   ```prisma
   enum InterviewStageState {
     scheduled
     completed
     cancelled
     no_show
     rescheduled  // NEW
   }
   ```

2. **Add fields to InterviewStage model** (if not present):
   - `cancelReason` (String, nullable) - Reason for cancellation/no-show
   - `rescheduledFromId` (String, nullable) - FK to original interview if this is a reschedule
   - `rescheduledToId` (String, nullable) - FK to new interview if this was rescheduled

3. Run Prisma migration:
   ```bash
   npx prisma migrate dev --name add_interview_state_machine
   ```

### Step 2 — Create state machine service

1. **Create `backend/src/services/interviewStateMachine.ts`**:

   ```typescript
   import { InterviewStageState } from '@prisma/client';
   
   // Define valid state transitions
   const STATE_TRANSITIONS: Record<InterviewStageState, InterviewStageState[]> = {
     scheduled: ['completed', 'cancelled', 'no_show', 'rescheduled'],
     completed: [], // Terminal state - no transitions allowed
     cancelled: [], // Terminal state
     no_show: ['rescheduled'], // Can only reschedule after no-show
     rescheduled: [], // Terminal state
   };
   
   export interface StateTransitionResult {
     allowed: boolean;
     reason?: string;
   }
   
   /**
    * Validate if a state transition is allowed
    */
   export function canTransition(
     from: InterviewStageState,
     to: InterviewStageState
   ): StateTransitionResult {
     const allowedStates = STATE_TRANSITIONS[from];
     
     if (!allowedStates) {
       return {
         allowed: false,
         reason: `Unknown state: ${from}`,
       };
     }
     
     if (!allowedStates.includes(to)) {
       return {
         allowed: false,
         reason: `Cannot transition from ${from} to ${to}. Allowed transitions: ${allowedStates.join(', ') || 'none'}`,
       };
     }
     
     return { allowed: true };
   }
   
   /**
    * Get all allowed transitions for a given state
    */
   export function getAllowedTransitions(
     currentState: InterviewStageState
   ): InterviewStageState[] {
     return STATE_TRANSITIONS[currentState] || [];
   }
   
   /**
    * Check if state is terminal (no transitions allowed)
    */
   export function isTerminalState(state: InterviewStageState): boolean {
     return STATE_TRANSITIONS[state]?.length === 0;
   }
   ```

### Step 3 — Create interview state service

1. **Create `backend/src/services/interviewStateService.ts`**:

   ```typescript
   import { prisma } from '../db/prisma';
   import { InterviewStageState } from '@prisma/client';
   import { canTransition } from './interviewStateMachine';
   import { auditEvent } from './auditService';
   import logger from '../utils/logger';
   
   export interface TransitionInterviewStateDTO {
     interviewStageId: string;
     newState: InterviewStageState;
     reason?: string;
     actorId: string;
   }
   
   /**
    * Transition interview to new state with validation
    */
   export async function transitionInterviewState(
     dto: TransitionInterviewStateDTO
   ): Promise<any> {
     const { interviewStageId, newState, reason, actorId } = dto;
     
     // Get current interview state
     const interview = await prisma.interviewStage.findUnique({
       where: { id: interviewStageId },
       select: { id: true, state: true, type: true, scheduledAt: true },
     });
     
     if (!interview) {
       throw new Error('Interview not found');
     }
     
     // Validate transition
     const transitionCheck = canTransition(interview.state, newState);
     if (!transitionCheck.allowed) {
       const error: any = new Error(transitionCheck.reason || 'Invalid state transition');
       error.code = 'INVALID_STATE_TRANSITION';
       error.currentState = interview.state;
       error.requestedState = newState;
       throw error;
     }
     
     // Update interview state
     const updatedInterview = await prisma.interviewStage.update({
       where: { id: interviewStageId },
       data: {
         state: newState,
         ...(reason && { cancelReason: reason }),
       },
     });
     
     // Create audit event
     await auditEvent({
       actorId,
       eventType: `interview_state_${newState}`,
       entityType: 'interview_stage',
       entityId: interviewStageId,
       payload: {
         previousState: interview.state,
         newState,
         reason: reason || null,
         scheduledAt: interview.scheduledAt,
       },
     });
     
     logger.info(
       {
         interviewStageId,
         previousState: interview.state,
         newState,
         actorId,
       },
       `[interview-state] State transition: ${interview.state} → ${newState}`
     );
     
     return updatedInterview;
   }
   
   /**
    * Get interview state with allowed transitions
    */
   export async function getInterviewStateInfo(interviewStageId: string) {
     const interview = await prisma.interviewStage.findUnique({
       where: { id: interviewStageId },
       select: { id: true, state: true, type: true, scheduledAt: true },
     });
     
     if (!interview) {
       throw new Error('Interview not found');
     }
     
     const allowedTransitions = getAllowedTransitions(interview.state);
     
     return {
       currentState: interview.state,
       allowedTransitions,
       isTerminal: isTerminalState(interview.state),
     };
   }
   ```

### Step 4 — Add state transition routes

1. **Add routes in `backend/src/routes/interviews.ts`**:

   ```typescript
   import { transitionInterviewState, getInterviewStateInfo } from '../services/interviewStateService';
   import { InterviewStageState } from '@prisma/client';
   
   /**
    * PATCH /api/interviews/:interviewId/state
    * Transition interview to new state
    */
   const TransitionStateSchema = z.object({
     state: z.enum(['completed', 'cancelled', 'no_show', 'rescheduled']),
     reason: z.string().optional(),
   });
   
   router.patch(
     '/:interviewId/state',
     authenticate,
     authorize(['recruiter', 'hr_manager', 'admin']),
     async (req, res) => {
       try {
         const { interviewId } = req.params;
         const body = TransitionStateSchema.parse(req.body);
         const userId = req.user!.id;
         
         const updatedInterview = await transitionInterviewState({
           interviewStageId: interviewId,
           newState: body.state as InterviewStageState,
           reason: body.reason,
           actorId: userId,
         });
         
         res.status(200).json(updatedInterview);
       } catch (error) {
         if (error instanceof z.ZodError) {
           res.status(400).json({
             error: 'Invalid request body',
             details: error.issues,
           });
           return;
         }
         
         if (error instanceof Error) {
           if ((error as any).code === 'INVALID_STATE_TRANSITION') {
             res.status(422).json({
               error: error.message,
               currentState: (error as any).currentState,
               requestedState: (error as any).requestedState,
             });
             return;
           }
           
           if (error.message.includes('not found')) {
             res.status(404).json({ error: error.message });
             return;
           }
         }
         
         logger.error({ error, interviewId }, 'Failed to transition interview state');
         res.status(500).json({ error: 'Failed to transition interview state' });
       }
     }
   );
   
   /**
    * GET /api/interviews/:interviewId/state
    * Get current state and allowed transitions
    */
   router.get('/:interviewId/state', authenticate, async (req, res) => {
     try {
       const { interviewId } = req.params;
       const stateInfo = await getInterviewStateInfo(interviewId);
       res.status(200).json(stateInfo);
     } catch (error) {
       if (error instanceof Error && error.message.includes('not found')) {
         res.status(404).json({ error: error.message });
         return;
       }
       
       logger.error({ error, interviewId: req.params.interviewId }, 'Failed to get interview state');
       res.status(500).json({ error: 'Failed to get interview state' });
     }
   });
   ```

### Step 5 — Add unit tests

1. **Create `backend/src/services/__tests__/interviewStateMachine.test.ts`**:
   - Test valid transitions (scheduled → completed, scheduled → cancelled, etc.)
   - Test invalid transitions (completed → no_show, cancelled → rescheduled)
   - Test terminal states (no transitions allowed)
   - Test unknown states

2. **Create `backend/src/routes/__tests__/interviewState.test.ts`**:
   - Test PATCH /api/interviews/:id/state with valid transition (200)
   - Test PATCH with invalid transition (422)
   - Test PATCH with non-existent interview (404)
   - Test GET /api/interviews/:id/state returns current state + allowed transitions
   - Test audit event creation on state change
   - Test authorization (only recruiters/hr_managers can transition)

---

## Validation

| Check | Method | Expected Result |
|-------|--------|-----------------|
| valid transition | unit test | scheduled → completed succeeds |
| invalid transition | unit test | completed → no_show rejected |
| terminal state | unit test | completed → any state rejected |
| API transition | integration test | PATCH returns 200 with updated state |
| invalid API transition | integration test | PATCH returns 422 with error message |
| audit event | integration test | state change logged to audit_events |

---

## Dependencies

- Existing InterviewStage model
- Audit service (existing)
- Authentication and authorization middleware (existing)

---

## Security Constraints

- Only recruiters, HR managers, and admins can transition interview states
- State transitions are atomic (database transaction)
- All state changes logged to audit trail

---

## Definition of Done

- [x] InterviewStageState enum includes 'rescheduled'
- [x] State machine service with transition validation implemented
- [x] PATCH /api/interviews/:id/state endpoint created
- [x] GET /api/interviews/:id/state endpoint returns allowed transitions
- [x] Invalid transitions return HTTP 422 with descriptive error
- [x] State transitions logged to audit_events
- [x] Unit tests cover all valid and invalid transitions
- [x] Integration tests verify API behavior
- [x] Type definitions exported for frontend use
