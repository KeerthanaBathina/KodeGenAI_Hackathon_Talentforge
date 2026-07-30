---
id: task_002
us_id: us_004
epic: EP-005
title: "Implement BullMQ Reminder Job Scheduling and Email Templates"
status: completed
layer: backend
effort: 5h
priority: critical
created: 2026-07-25
completed: 2026-07-26
---

# TASK-002 — Implement BullMQ Reminder Job Scheduling and Email Templates

## Context

**User Story**: US-004 — Interview Lifecycle State Machine — No-Show, Reschedule, Cancel, and Automated Reminders  
**Epic**: EP-005 — Interview Scheduling and Lifecycle Management  
**Addresses**: Scenario 1 (24-hour reminder), Scenario 2 (1-hour reminder)

Automated reminders reduce no-show rates by up to 30% without manual recruiter effort. The system must schedule reminder emails at 24 hours and 1 hour before the interview time, ensuring all participants (candidate, panelists, recruiter) receive timely notifications.

---

## Objective

Implement automated reminder system so that:
1. reminder jobs are scheduled when an interview is created or rescheduled
2. 24-hour and 1-hour reminders are sent to all participants
3. reminders are cancelled if the interview is cancelled/rescheduled
4. email templates are professional and include all necessary details
5. job failures are logged and retried appropriately

---

## Technical Specifications

| Area | Requirement |
|------|-------------|
| Job scheduling | BullMQ delayed jobs created at interview scheduling time |
| Reminder timing | 24 hours before (T-24h), 1 hour before (T-1h) |
| Recipients | Candidate, all confirmed panelists, recruiter |
| Email templates | `interview_reminder_24h` and `interview_reminder_1h` |
| Job cancellation | When interview cancelled/rescheduled, remove pending reminder jobs |
| Retry logic | 3 retries with exponential backoff for failed sends |

---

## Implementation Steps

### Step 1 — Set up BullMQ queue for reminders

1. **Create `backend/src/queues/interviewReminderQueue.ts`**:

   ```typescript
   import { Queue, Worker, Job } from 'bullmq';
   import { redis } from '../config/redis';
   import { sendInterviewReminder } from '../services/emailService';
   import logger from '../utils/logger';
   
   export const interviewReminderQueue = new Queue('interview-reminders', {
     connection: redis,
     defaultJobOptions: {
       attempts: 3,
       backoff: {
         type: 'exponential',
         delay: 2000,
       },
       removeOnComplete: {
         age: 7 * 24 * 60 * 60, // Keep for 7 days
       },
       removeOnFail: {
         age: 30 * 24 * 60 * 60, // Keep failures for 30 days
       },
     },
   });
   
   export interface ReminderJobData {
     interviewStageId: string;
     reminderType: '24h' | '1h';
   }
   
   /**
    * Schedule reminder jobs for an interview
    */
   export async function scheduleInterviewReminders(
     interviewStageId: string,
     scheduledAt: Date
   ): Promise<void> {
     const scheduledTime = new Date(scheduledAt).getTime();
     const now = Date.now();
     
     // Calculate delay for 24-hour reminder
     const reminder24hDelay = scheduledTime - now - 24 * 60 * 60 * 1000;
     if (reminder24hDelay > 0) {
       await interviewReminderQueue.add(
         '24h-reminder',
         {
           interviewStageId,
           reminderType: '24h',
         } as ReminderJobData,
         {
           delay: reminder24hDelay,
           jobId: `${interviewStageId}-24h`,
         }
       );
       
       logger.info(
         { interviewStageId, delay: reminder24hDelay },
         '[reminders] Scheduled 24-hour reminder'
       );
     }
     
     // Calculate delay for 1-hour reminder
     const reminder1hDelay = scheduledTime - now - 60 * 60 * 1000;
     if (reminder1hDelay > 0) {
       await interviewReminderQueue.add(
         '1h-reminder',
         {
           interviewStageId,
           reminderType: '1h',
         } as ReminderJobData,
         {
           delay: reminder1hDelay,
           jobId: `${interviewStageId}-1h`,
         }
       );
       
       logger.info(
         { interviewStageId, delay: reminder1hDelay },
         '[reminders] Scheduled 1-hour reminder'
       );
     }
   }
   
   /**
    * Cancel all reminder jobs for an interview
    */
   export async function cancelInterviewReminders(
     interviewStageId: string
   ): Promise<void> {
     await interviewReminderQueue.remove(`${interviewStageId}-24h`);
     await interviewReminderQueue.remove(`${interviewStageId}-1h`);
     
     logger.info({ interviewStageId }, '[reminders] Cancelled reminder jobs');
   }
   
   /**
    * Worker to process reminder jobs
    */
   export const interviewReminderWorker = new Worker<ReminderJobData>(
     'interview-reminders',
     async (job: Job<ReminderJobData>) => {
       const { interviewStageId, reminderType } = job.data;
       
       logger.info(
         { interviewStageId, reminderType, jobId: job.id },
         '[reminders] Processing reminder job'
       );
       
       try {
         await sendInterviewReminder(interviewStageId, reminderType);
         
         logger.info(
           { interviewStageId, reminderType },
           '[reminders] Reminder sent successfully'
         );
       } catch (error) {
         logger.error(
           { error, interviewStageId, reminderType },
           '[reminders] Failed to send reminder'
         );
         throw error; // BullMQ will retry
       }
     },
     {
       connection: redis,
       concurrency: 5,
     }
   );
   
   // Error handling
   interviewReminderWorker.on('failed', (job, err) => {
     logger.error(
       {
         jobId: job?.id,
         interviewStageId: job?.data?.interviewStageId,
         error: err,
       },
       '[reminders] Reminder job failed'
     );
   });
   ```

### Step 2 — Create email templates

1. **Create `backend/src/templates/emails/interview_reminder_24h.html`**:

   ```html
   <!DOCTYPE html>
   <html>
   <head>
     <meta charset="UTF-8">
     <title>Interview Reminder - Tomorrow</title>
   </head>
   <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
     <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
       <h2 style="color: #2c3e50;">Interview Reminder - Tomorrow</h2>
       
       <p>Hi {{recipientName}},</p>
       
       <p>This is a reminder that your interview is scheduled for <strong>tomorrow</strong>.</p>
       
       <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
         <h3 style="margin-top: 0; color: #2c3e50;">Interview Details</h3>
         <p style="margin: 10px 0;"><strong>Position:</strong> {{positionTitle}}</p>
         <p style="margin: 10px 0;"><strong>Date & Time:</strong> {{interviewDateTime}}</p>
         <p style="margin: 10px 0;"><strong>Duration:</strong> {{duration}} minutes</p>
         <p style="margin: 10px 0;"><strong>Interview Type:</strong> {{interviewType}}</p>
         {{#if meetingLink}}
         <p style="margin: 10px 0;"><strong>Meeting Link:</strong> <a href="{{meetingLink}}">{{meetingLink}}</a></p>
         {{/if}}
         {{#if location}}
         <p style="margin: 10px 0;"><strong>Location:</strong> {{location}}</p>
         {{/if}}
       </div>
       
       {{#if panelists}}
       <div style="margin: 20px 0;">
         <h4 style="color: #2c3e50;">Interview Panel</h4>
         <ul style="list-style: none; padding: 0;">
           {{#each panelists}}
           <li style="margin: 5px 0;">{{name}} - {{role}}</li>
           {{/each}}
         </ul>
       </div>
       {{/if}}
       
       <div style="background-color: #fff3cd; padding: 15px; border-radius: 8px; margin: 20px 0;">
         <p style="margin: 0;"><strong>📋 Preparation Tips:</strong></p>
         <ul style="margin: 10px 0;">
           <li>Review the job description and your application</li>
           <li>Test your audio/video connection (if virtual)</li>
           <li>Prepare questions for the interviewers</li>
           <li>Have a copy of your resume handy</li>
         </ul>
       </div>
       
       <p>If you need to reschedule or have any questions, please contact the recruiting team as soon as possible.</p>
       
       <p>Best regards,<br>
       {{companyName}} Recruiting Team</p>
       
       <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 30px 0;">
       <p style="font-size: 12px; color: #666;">
         This is an automated reminder. Please do not reply to this email.
       </p>
     </div>
   </body>
   </html>
   ```

2. **Create `backend/src/templates/emails/interview_reminder_1h.html`**:

   ```html
   <!DOCTYPE html>
   <html>
   <head>
     <meta charset="UTF-8">
     <title>Interview Starting Soon</title>
   </head>
   <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
     <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
       <h2 style="color: #2c3e50;">⏰ Interview Starting in 1 Hour</h2>
       
       <p>Hi {{recipientName}},</p>
       
       <p>This is a final reminder that your interview is starting in <strong>1 hour</strong>.</p>
       
       <div style="background-color: #e8f5e9; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #4caf50;">
         <h3 style="margin-top: 0; color: #2c3e50;">Interview Details</h3>
         <p style="margin: 10px 0;"><strong>Position:</strong> {{positionTitle}}</p>
         <p style="margin: 10px 0;"><strong>Starts at:</strong> {{interviewDateTime}}</p>
         <p style="margin: 10px 0;"><strong>Interview Type:</strong> {{interviewType}}</p>
         {{#if meetingLink}}
         <p style="margin: 10px 0;">
           <a href="{{meetingLink}}" 
              style="display: inline-block; background-color: #4caf50; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">
             Join Meeting
           </a>
         </p>
         {{/if}}
         {{#if location}}
         <p style="margin: 10px 0;"><strong>Location:</strong> {{location}}</p>
         {{/if}}
       </div>
       
       <div style="background-color: #fff3cd; padding: 15px; border-radius: 8px; margin: 20px 0;">
         <p style="margin: 0;"><strong>✅ Final Checklist:</strong></p>
         <ul style="margin: 10px 0;">
           <li>Test your internet connection and device</li>
           <li>Find a quiet, well-lit space</li>
           <li>Have your resume and notes ready</li>
           <li>Join 5 minutes early</li>
         </ul>
       </div>
       
       <p>Good luck! We're looking forward to speaking with you.</p>
       
       <p>Best regards,<br>
       {{companyName}} Recruiting Team</p>
       
       <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 30px 0;">
       <p style="font-size: 12px; color: #666;">
         This is an automated reminder. Please do not reply to this email.
       </p>
     </div>
   </body>
   </html>
   ```

### Step 3 — Implement reminder sending service

1. **Add to `backend/src/services/emailService.ts`**:

   ```typescript
   import { prisma } from '../db/prisma';
   import { sendEmail } from '../email/emailProvider';
   import { renderEmailTemplate } from '../email/templateRenderer';
   import logger from '../utils/logger';
   import { format } from 'date-fns';
   
   export async function sendInterviewReminder(
     interviewStageId: string,
     reminderType: '24h' | '1h'
   ): Promise<void> {
     // Fetch interview details with all participants
     const interview = await prisma.interviewStage.findUnique({
       where: { id: interviewStageId },
       include: {
         requisition: {
           include: {
             recruiter: true,
           },
         },
         application: {
           include: {
             candidate: true,
           },
         },
         panelistConfirmations: {
           where: { status: 'confirmed' },
           include: {
             panelist: true,
           },
         },
       },
     });
     
     if (!interview) {
       throw new Error(`Interview ${interviewStageId} not found`);
     }
     
     // Skip if interview is not in scheduled state
     if (interview.state !== 'scheduled') {
       logger.warn(
         { interviewStageId, state: interview.state },
         '[reminders] Skipping reminder for non-scheduled interview'
       );
       return;
     }
     
     // Prepare email data
     const templateData = {
       positionTitle: interview.requisition.title,
       interviewDateTime: format(new Date(interview.scheduledAt), 'EEEE, MMMM d, yyyy \'at\' h:mm a'),
       duration: interview.duration || 60,
       interviewType: interview.type,
       meetingLink: interview.meetingLink,
       location: interview.location,
       panelists: interview.panelistConfirmations.map(pc => ({
         name: pc.panelist.fullName,
         role: pc.panelist.role,
       })),
       companyName: 'TalentForge',
     };
     
     const templateName = reminderType === '24h' 
       ? 'interview_reminder_24h' 
       : 'interview_reminder_1h';
     
     const subject = reminderType === '24h'
       ? `Reminder: Interview Tomorrow - ${interview.requisition.title}`
       : `Starting Soon: Interview in 1 Hour - ${interview.requisition.title}`;
     
     // Send to candidate
     const candidateEmail = renderEmailTemplate(templateName, {
       ...templateData,
       recipientName: interview.application.candidate.fullName,
     });
     
     await sendEmail({
       to: interview.application.candidate.email,
       subject,
       html: candidateEmail,
     });
     
     // Send to recruiter
     const recruiterEmail = renderEmailTemplate(templateName, {
       ...templateData,
       recipientName: interview.requisition.recruiter.fullName,
     });
     
     await sendEmail({
       to: interview.requisition.recruiter.email,
       subject,
       html: recruiterEmail,
     });
     
     // Send to all confirmed panelists
     for (const panelistConfirmation of interview.panelistConfirmations) {
       const panelistEmail = renderEmailTemplate(templateName, {
         ...templateData,
         recipientName: panelistConfirmation.panelist.fullName,
       });
       
       await sendEmail({
         to: panelistConfirmation.panelist.email,
         subject,
         html: panelistEmail,
       });
     }
     
     logger.info(
       {
         interviewStageId,
         reminderType,
         recipientCount: 2 + interview.panelistConfirmations.length,
       },
       '[reminders] Interview reminders sent'
     );
   }
   ```

### Step 4 — Integrate reminder scheduling into interview creation

1. **Update interview creation/rescheduling** to schedule reminder jobs:

   ```typescript
   import { scheduleInterviewReminders, cancelInterviewReminders } from '../queues/interviewReminderQueue';
   
   // In interview creation endpoint:
   const newInterview = await prisma.interviewStage.create({
     data: {
       // ... interview data
     },
   });
   
   // Schedule reminders
   await scheduleInterviewReminders(newInterview.id, newInterview.scheduledAt);
   
   // In interview cancellation/rescheduling:
   await cancelInterviewReminders(interviewStageId);
   ```

### Step 5 — Add monitoring and admin endpoints

1. **Create admin endpoint to view pending reminders**:

   ```typescript
   /**
    * GET /api/admin/reminders/pending
    * View all pending reminder jobs
    */
   router.get('/admin/reminders/pending', authenticate, authorize(['admin']), async (req, res) => {
     try {
       const jobs = await interviewReminderQueue.getJobs(['delayed']);
       
       const pendingReminders = jobs.map(job => ({
         jobId: job.id,
         interviewStageId: job.data?.interviewStageId,
         reminderType: job.data?.reminderType,
         scheduledFor: new Date(job.timestamp + (job.opts?.delay || 0)),
         attempts: job.attemptsMade,
       }));
       
       res.status(200).json({
         count: pendingReminders.length,
         reminders: pendingReminders,
       });
     } catch (error) {
       logger.error({ error }, 'Failed to fetch pending reminders');
       res.status(500).json({ error: 'Failed to fetch pending reminders' });
     }
   });
   ```

### Step 6 — Add unit and integration tests

1. **Create `backend/src/queues/__tests__/interviewReminderQueue.test.ts`**:
   - Test scheduleInterviewReminders creates two jobs (24h and 1h)
   - Test cancelInterviewReminders removes both jobs
   - Test jobs with past delay are not scheduled
   - Test job ID format is correct

2. **Create `backend/src/services/__tests__/emailService.reminder.test.ts`**:
   - Test sendInterviewReminder fetches interview details
   - Test reminder sent to candidate, recruiter, and panelists
   - Test correct email template used (24h vs 1h)
   - Test non-scheduled interviews skip reminder
   - Test missing interview throws error

---

## Validation

| Check | Method | Expected Result |
|-------|--------|-----------------|
| reminder scheduling | unit test | 24h and 1h jobs created with correct delay |
| reminder cancellation | unit test | both jobs removed when cancelled |
| email sending | integration test | reminder sent to all participants |
| template rendering | unit test | email includes interview details |
| job retry | integration test | failed jobs retried 3 times |
| non-scheduled skip | unit test | reminder not sent for cancelled interviews |

---

## Dependencies

- BullMQ (existing infrastructure)
- Email service (existing)
- InterviewStage model with scheduledAt field

---

## Security Constraints

- Reminder emails only sent for scheduled interviews
- Panelist list includes only confirmed panelists
- Admin-only access to reminder monitoring endpoints

---

## Definition of Done

- [x] BullMQ queue for interview reminders created
- [x] Reminder jobs scheduled at interview creation (24h and 1h)
- [x] Reminder jobs cancelled when interview cancelled/rescheduled
- [x] Email templates created for 24h and 1h reminders
- [x] Reminders sent to candidate, recruiter, and all confirmed panelists
- [x] Job failures logged and retried (3 attempts)
- [x] Unit tests cover job scheduling and cancellation
- [x] Integration tests verify email delivery
- [x] Admin endpoint to view pending reminders
