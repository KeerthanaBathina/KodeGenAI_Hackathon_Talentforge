---
id: task_003
us_id: us_004
epic: EP-005
title: "Implement No-Show Recording and Reschedule Flow"
status: completed
layer: backend
effort: 4h
priority: critical
created: 2026-07-25
completed: 2026-07-26
---

# TASK-003 — Implement No-Show Recording and Reschedule Flow

## Context

**User Story**: US-004 — Interview Lifecycle State Machine — No-Show, Reschedule, Cancel, and Automated Reminders  
**Epic**: EP-005 — Interview Scheduling and Lifecycle Management  
**Addresses**: Scenario 3 (no-show recorded), Scenario 4 (reschedule creates new interview)

No-show tracking helps identify candidate reliability patterns and informs hiring decisions. Reschedule functionality allows second chances while maintaining audit trail linkage between original and rescheduled interviews.

---

## Objective

Implement no-show and reschedule logic so that:
1. no-shows increment candidate's no-show count and prompt application decision
2. reschedule creates new interview record linked to original
3. original interview archived with 'rescheduled' status
4. new calendar invites sent to all participants
5. reminder jobs rescheduled for new time

---

## Technical Specifications

| Area | Requirement |
|------|-------------|
| No-show tracking | Increment candidate.noShowCount field, record reason |
| Application decision | Flag application for recruiter decision (reschedule or reject) |
| Reschedule flow | Create new interview, link via rescheduledFromId/rescheduledToId |
| Calendar updates | Send updated invites to candidate and panelists |
| Reminder rescheduling | Cancel old reminder jobs, schedule new ones |
| Audit trail | Log no-show event and reschedule event with full context |

---

## Implementation Steps

### Step 1 — Add no-show tracking fields to schema

1. **Update Candidate model** in `backend/prisma/schema.prisma`:
   ```prisma
   model Candidate {
     id            String   @id @default(uuid()) @db.Uuid
     // ... existing fields
     noShowCount   Int      @default(0)  // NEW: Track no-shows
     // ... rest of fields
   }
   ```

2. **Update InterviewStage model** for reschedule linkage:
   ```prisma
   model InterviewStage {
     id               String   @id @default(uuid()) @db.Uuid
     // ... existing fields
     cancelReason     String?  @db.Text  // NEW: Reason for cancellation/no-show
     rescheduledFromId String? @db.Uuid  // NEW: Original interview if this is a reschedule
     rescheduledToId   String? @db.Uuid  // NEW: New interview if this was rescheduled
     
     // Self-referential relations
     rescheduledFrom  InterviewStage? @relation("InterviewReschedule", fields: [rescheduledFromId], references: [id])
     rescheduledTo    InterviewStage? @relation("InterviewReschedule")
     
     // ... rest of fields
   }
   ```

3. Run migration:
   ```bash
   npx prisma migrate dev --name add_noshow_reschedule_tracking
   ```

### Step 2 — Implement no-show recording service

1. **Create `backend/src/services/noShowService.ts`**:

   ```typescript
   import { prisma } from '../db/prisma';
   import { transitionInterviewState } from './interviewStateService';
   import { auditEvent } from './auditService';
   import logger from '../utils/logger';
   
   export interface RecordNoShowDTO {
     interviewStageId: string;
     reason?: string;
     actorId: string;
   }
   
   /**
    * Record an interview no-show
    */
   export async function recordNoShow(dto: RecordNoShowDTO): Promise<any> {
     const { interviewStageId, reason, actorId } = dto;
     
     // Get interview details
     const interview = await prisma.interviewStage.findUnique({
       where: { id: interviewStageId },
       include: {
         application: {
           include: {
             candidate: true,
           },
         },
       },
     });
     
     if (!interview) {
       throw new Error('Interview not found');
     }
     
     // Transition to no_show state (validates state machine)
     const updatedInterview = await transitionInterviewState({
       interviewStageId,
       newState: 'no_show',
       reason,
       actorId,
     });
     
     // Increment candidate's no-show count
     const updatedCandidate = await prisma.candidate.update({
       where: { id: interview.application.candidate.id },
       data: {
         noShowCount: {
           increment: 1,
         },
       },
     });
     
     // Create specific no-show audit event
     await auditEvent({
       actorId,
       eventType: 'interview_no_show',
       entityType: 'interview_stage',
       entityId: interviewStageId,
       payload: {
         candidateId: interview.application.candidate.id,
         previousNoShowCount: updatedCandidate.noShowCount - 1,
         newNoShowCount: updatedCandidate.noShowCount,
         reason: reason || null,
         scheduledAt: interview.scheduledAt,
       },
     });
     
     logger.info(
       {
         interviewStageId,
         candidateId: interview.application.candidate.id,
         noShowCount: updatedCandidate.noShowCount,
       },
       '[no-show] Interview no-show recorded'
     );
     
     return {
       interview: updatedInterview,
       candidate: {
         id: updatedCandidate.id,
         noShowCount: updatedCandidate.noShowCount,
       },
     };
   }
   
   /**
    * Get candidate's no-show history
    */
   export async function getCandidateNoShowHistory(candidateId: string) {
     const candidate = await prisma.candidate.findUnique({
       where: { id: candidateId },
       select: {
         id: true,
         fullName: true,
         email: true,
         noShowCount: true,
       },
     });
     
     if (!candidate) {
       throw new Error('Candidate not found');
     }
     
     // Get all no-show interviews for this candidate
     const noShowInterviews = await prisma.interviewStage.findMany({
       where: {
         application: {
           candidateId,
         },
         state: 'no_show',
       },
       include: {
         requisition: {
           select: {
             title: true,
           },
         },
       },
       orderBy: {
         scheduledAt: 'desc',
       },
     });
     
     return {
       candidate: {
         id: candidate.id,
         fullName: candidate.fullName,
         email: candidate.email,
         noShowCount: candidate.noShowCount,
       },
       noShowInterviews: noShowInterviews.map(interview => ({
         id: interview.id,
         scheduledAt: interview.scheduledAt,
         positionTitle: interview.requisition.title,
         cancelReason: interview.cancelReason,
       })),
     };
   }
   ```

### Step 3 — Implement reschedule service

1. **Create `backend/src/services/rescheduleService.ts`**:

   ```typescript
   import { prisma } from '../db/prisma';
   import { transitionInterviewState } from './interviewStateService';
   import { scheduleInterviewReminders, cancelInterviewReminders } from '../queues/interviewReminderQueue';
   import { sendCalendarInvite } from './calendarService';
   import { auditEvent } from './auditService';
   import logger from '../utils/logger';
   
   export interface RescheduleInterviewDTO {
     originalInterviewId: string;
     newScheduledAt: Date;
     newDuration?: number;
     newMeetingLink?: string;
     newLocation?: string;
     reason?: string;
     actorId: string;
   }
   
   /**
    * Reschedule an interview
    */
   export async function rescheduleInterview(dto: RescheduleInterviewDTO): Promise<any> {
     const {
       originalInterviewId,
       newScheduledAt,
       newDuration,
       newMeetingLink,
       newLocation,
       reason,
       actorId,
     } = dto;
     
     // Get original interview
     const originalInterview = await prisma.interviewStage.findUnique({
       where: { id: originalInterviewId },
       include: {
         application: true,
         requisition: true,
         panelistConfirmations: {
           include: {
             panelist: true,
           },
         },
       },
     });
     
     if (!originalInterview) {
       throw new Error('Interview not found');
     }
     
     // Validate original interview can be rescheduled
     // (Only scheduled or no_show interviews can be rescheduled)
     if (originalInterview.state !== 'scheduled' && originalInterview.state !== 'no_show') {
       throw new Error(
         `Cannot reschedule interview in ${originalInterview.state} state. Only scheduled or no_show interviews can be rescheduled.`
       );
     }
     
     // Use Prisma transaction for atomicity
     const result = await prisma.$transaction(async (tx) => {
       // Create new interview
       const newInterview = await tx.interviewStage.create({
         data: {
           applicationId: originalInterview.applicationId,
           requisitionId: originalInterview.requisitionId,
           type: originalInterview.type,
           scheduledAt: newScheduledAt,
           duration: newDuration || originalInterview.duration,
           meetingLink: newMeetingLink || originalInterview.meetingLink,
           location: newLocation || originalInterview.location,
           state: 'scheduled',
           rescheduledFromId: originalInterviewId,
         },
       });
       
       // Update original interview to rescheduled state
       const updatedOriginal = await tx.interviewStage.update({
         where: { id: originalInterviewId },
         data: {
           state: 'rescheduled',
           cancelReason: reason || 'Rescheduled',
           rescheduledToId: newInterview.id,
         },
       });
       
       // Copy panelist assignments to new interview
       for (const confirmation of originalInterview.panelistConfirmations) {
         await tx.panelistConfirmation.create({
           data: {
             interviewStageId: newInterview.id,
             panelistId: confirmation.panelistId,
             status: 'pending', // Reset to pending for new interview
           },
         });
       }
       
       return { newInterview, updatedOriginal };
     });
     
     // Cancel reminder jobs for original interview
     await cancelInterviewReminders(originalInterviewId);
     
     // Schedule reminder jobs for new interview
     await scheduleInterviewReminders(result.newInterview.id, newScheduledAt);
     
     // Send calendar invites for new interview
     await sendCalendarInvite(result.newInterview.id);
     
     // Create audit event
     await auditEvent({
       actorId,
       eventType: 'interview_rescheduled',
       entityType: 'interview_stage',
       entityId: originalInterviewId,
       payload: {
         originalScheduledAt: originalInterview.scheduledAt,
         newScheduledAt,
         newInterviewId: result.newInterview.id,
         reason: reason || null,
       },
     });
     
     logger.info(
       {
         originalInterviewId,
         newInterviewId: result.newInterview.id,
         originalScheduledAt: originalInterview.scheduledAt,
         newScheduledAt,
       },
       '[reschedule] Interview rescheduled'
     );
     
     return {
       originalInterview: result.updatedOriginal,
       newInterview: result.newInterview,
     };
   }
   
   /**
    * Get reschedule history for an interview
    */
   export async function getInterviewRescheduleHistory(interviewStageId: string) {
     const interview = await prisma.interviewStage.findUnique({
       where: { id: interviewStageId },
       include: {
         rescheduledFrom: true,
         rescheduledTo: true,
       },
     });
     
     if (!interview) {
       throw new Error('Interview not found');
     }
     
     // Build reschedule chain
     const history = [];
     let current = interview;
     
     // Walk backwards to find original
     while (current.rescheduledFrom) {
       current = await prisma.interviewStage.findUnique({
         where: { id: current.rescheduledFromId! },
         include: {
           rescheduledFrom: true,
         },
       }) as any;
       
       if (current) {
         history.unshift({
           id: current.id,
           scheduledAt: current.scheduledAt,
           state: current.state,
           cancelReason: current.cancelReason,
         });
       }
     }
     
     // Add current interview
     history.push({
       id: interview.id,
       scheduledAt: interview.scheduledAt,
       state: interview.state,
       cancelReason: interview.cancelReason,
     });
     
     // Walk forwards to find latest
     current = interview;
     while (current.rescheduledTo) {
       current = await prisma.interviewStage.findUnique({
         where: { id: current.rescheduledToId! },
         include: {
           rescheduledTo: true,
         },
       }) as any;
       
       if (current) {
         history.push({
           id: current.id,
           scheduledAt: current.scheduledAt,
           state: current.state,
           cancelReason: current.cancelReason,
         });
       }
     }
     
     return {
       interviewId: interviewStageId,
       rescheduleCount: history.length - 1,
       history,
     };
   }
   ```

### Step 4 — Add API routes

1. **Add routes to `backend/src/routes/interviews.ts`**:

   ```typescript
   import { recordNoShow, getCandidateNoShowHistory } from '../services/noShowService';
   import { rescheduleInterview, getInterviewRescheduleHistory } from '../services/rescheduleService';
   
   /**
    * POST /api/interviews/:interviewId/no-show
    * Record interview no-show
    */
   const NoShowSchema = z.object({
     reason: z.string().optional(),
   });
   
   router.post(
     '/:interviewId/no-show',
     authenticate,
     authorize(['recruiter', 'hr_manager', 'admin']),
     async (req, res) => {
       try {
         const { interviewId } = req.params;
         const body = NoShowSchema.parse(req.body);
         const userId = req.user!.id;
         
         const result = await recordNoShow({
           interviewStageId: interviewId,
           reason: body.reason,
           actorId: userId,
         });
         
         res.status(200).json(result);
       } catch (error) {
         // ... error handling
       }
     }
   );
   
   /**
    * POST /api/interviews/:interviewId/reschedule
    * Reschedule an interview
    */
   const RescheduleSchema = z.object({
     newScheduledAt: z.string().datetime(),
     newDuration: z.number().int().min(15).max(480).optional(),
     newMeetingLink: z.string().url().optional(),
     newLocation: z.string().optional(),
     reason: z.string().optional(),
   });
   
   router.post(
     '/:interviewId/reschedule',
     authenticate,
     authorize(['recruiter', 'hr_manager', 'admin']),
     async (req, res) => {
       try {
         const { interviewId } = req.params;
         const body = RescheduleSchema.parse(req.body);
         const userId = req.user!.id;
         
         const result = await rescheduleInterview({
           originalInterviewId: interviewId,
           newScheduledAt: new Date(body.newScheduledAt),
           newDuration: body.newDuration,
           newMeetingLink: body.newMeetingLink,
           newLocation: body.newLocation,
           reason: body.reason,
           actorId: userId,
         });
         
         res.status(201).json(result);
       } catch (error) {
         // ... error handling
       }
     }
   );
   
   /**
    * GET /api/interviews/:interviewId/reschedule-history
    * Get reschedule history for interview
    */
   router.get('/:interviewId/reschedule-history', authenticate, async (req, res) => {
     try {
       const { interviewId } = req.params;
       const history = await getInterviewRescheduleHistory(interviewId);
       res.status(200).json(history);
     } catch (error) {
       // ... error handling
     }
   });
   
   /**
    * GET /api/candidates/:candidateId/no-show-history
    * Get candidate's no-show history
    */
   router.get('/candidates/:candidateId/no-show-history', authenticate, async (req, res) => {
     try {
       const { candidateId } = req.params;
       const history = await getCandidateNoShowHistory(candidateId);
       res.status(200).json(history);
     } catch (error) {
       // ... error handling
     }
   });
   ```

### Step 5 — Add unit and integration tests

1. **Create `backend/src/services/__tests__/noShowService.test.ts`**:
   - Test recordNoShow increments candidate.noShowCount
   - Test recordNoShow transitions interview to no_show state
   - Test recordNoShow creates audit event
   - Test getCandidateNoShowHistory returns all no-shows
   - Test recordNoShow rejects invalid state transitions

2. **Create `backend/src/services/__tests__/rescheduleService.test.ts`**:
   - Test rescheduleInterview creates new interview
   - Test rescheduleInterview updates original to rescheduled state
   - Test rescheduleInterview links interviews via rescheduledFromId/ToId
   - Test rescheduleInterview copies panelist assignments
   - Test rescheduleInterview cancels old reminders and schedules new
   - Test rescheduleInterview sends calendar invites
   - Test rescheduleInterview rejects invalid states (completed, cancelled)
   - Test getInterviewRescheduleHistory returns full chain

---

## Validation

| Check | Method | Expected Result |
|-------|--------|-----------------|
| no-show increments count | unit test | candidate.noShowCount increases by 1 |
| reschedule creates new interview | unit test | new interview created with rescheduledFromId |
| reschedule archives original | unit test | original interview state = rescheduled |
| reschedule copies panelists | unit test | new interview has same panelists (pending status) |
| reminders rescheduled | integration test | old jobs cancelled, new jobs created |
| calendar invites sent | integration test | sendCalendarInvite called with new interview |
| audit events created | integration test | no_show and reschedule events logged |

---

## Dependencies

- State machine service (TASK-001)
- Reminder queue (TASK-002)
- Calendar service (existing)
- Audit service (existing)

---

## Security Constraints

- Only recruiters, HR managers, and admins can record no-shows
- Only recruiters, HR managers, and admins can reschedule
- Reschedule only allowed for scheduled or no_show interviews
- Candidate no-show count visible only to authorized roles

---

## Definition of Done

- [x] Candidate.noShowCount field added to schema
- [x] InterviewStage reschedule linkage fields added
- [x] recordNoShow service increments no-show count
- [x] rescheduleInterview creates new interview and archives original
- [x] Panelist assignments copied to new interview
- [x] Reminder jobs rescheduled on reschedule
- [x] Calendar invites sent for new interview
- [x] POST /api/interviews/:id/no-show endpoint
- [x] POST /api/interviews/:id/reschedule endpoint
- [x] GET /api/interviews/:id/reschedule-history endpoint
- [x] GET /api/candidates/:id/no-show-history endpoint
- [x] Unit tests cover all service functions
- [x] Integration tests verify API behavior
