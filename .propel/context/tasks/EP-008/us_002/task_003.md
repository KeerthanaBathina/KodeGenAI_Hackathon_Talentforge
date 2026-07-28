---
id: task_003
us_id: us_002
epic: EP-008
title: "Implement Email Delivery Worker with Status Tracking"
status: completed
layer: backend
effort: 5h
priority: high
created: 2026-07-29
completed: 2026-07-29
---

# TASK-003 — Implement Email Delivery Worker with Status Tracking

## Context

**User Story**: US-002 — Email Delivery via Resend API with Exponential Backoff Retry  
**Epic**: EP-008 — Communication Service  
**Addresses**: Scenario 1, 2, 3

Create BullMQ worker to process email delivery jobs, integrate with Resend API, and update Communication records with delivery status. Worker must handle retries for transient failures and mark permanent failures for DLQ processing.

---

## Objective

Implement:
1. BullMQ worker for email-delivery queue
2. Job processor that resolves template, renders content, and sends via Resend
3. Communication record status updates (queued → sent → delivered/failed)
4. Retry logic for transient failures (throw error)
5. Permanent failure handling (mark failed, do not retry)
6. DLQ handler for exhausted jobs

---

## Technical Specifications

| Area | Requirement |
|------|-------------|
| Worker file | `backend/src/workers/emailDeliveryWorker.ts` |
| Queue name | `email-delivery` (from TASK-001) |
| Concurrency | 5 (process up to 5 emails concurrently) |
| Job timeout | 30 seconds per job |
| Status flow | `queued` → `sent` (on first success) → `delivered` (on Resend webhook, future) |
| Failed status | Set on permanent error or DLQ exhaustion |
| Retry count | Track in Communication.retryCount field |

---

## Implementation Steps

### Step 1 — Create worker file structure

1. Create `backend/src/workers/emailDeliveryWorker.ts`
2. Import dependencies:
   - BullMQ Worker, Job
   - emailDeliveryQueue connection
   - resolveTemplate (from TASK-005 US-001)
   - renderTemplate (from US-001)
   - sendEmailViaResend (from TASK-002)
   - Prisma client for Communication updates

3. Define worker options:
   ```typescript
   const workerOptions = {
     connection, // Shared Redis connection
     concurrency: 5,
     lockDuration: 30000, // 30 seconds
   };
   ```

### Step 2 — Implement job processor

1. Create async job handler:
   ```typescript
   async function processEmailDeliveryJob(
     job: Job<EmailDeliveryJobData>
   ): Promise<void> {
     const { communicationId, to, templateType, templateId, tokenData, idempotencyKey } = job.data;

     logger.info({ communicationId, jobId: job.id }, 'Processing email delivery job');

     try {
       // Step 1: Resolve template with locale fallback
       const template = await resolveTemplate(templateType, 'en'); // Default to English

       // Step 2: Render template with token data
       const rendered = renderTemplate(template, tokenData);

       // Step 3: Send email via Resend
       const result = await sendEmailViaResend({
         to,
         subject: rendered.subject,
         html: rendered.bodyHtml,
         text: rendered.bodyText,
         idempotencyKey,
       });

       // Step 4: Update Communication record with success
       await updateCommunicationStatus(communicationId, {
         status: 'sent',
         messageId: result.messageId,
         sentAt: new Date(),
         retryCount: job.attemptsMade,
       });

       logger.info(
         { communicationId, messageId: result.messageId },
         'Email sent successfully'
       );
     } catch (error) {
       // Update retry count
       await updateCommunicationRetryCount(communicationId, job.attemptsMade);

       if (error instanceof PermanentEmailError) {
         // Permanent failure - mark as failed, do not retry
         await updateCommunicationStatus(communicationId, {
           status: 'failed',
           retryCount: job.attemptsMade,
         });

         logger.error(
           { communicationId, error },
           'Permanent email delivery failure'
         );

         // Do not throw - prevents BullMQ retry
         return;
       }

       // Transient failure - throw to trigger BullMQ retry
       logger.warn(
         { communicationId, attempt: job.attemptsMade, error },
         'Transient email delivery failure - will retry'
       );

       throw error; // Triggers exponential backoff retry
     }
   }
   ```

### Step 3 — Implement Communication update functions

1. Create helper functions in `backend/src/services/communicationService.ts`:
   ```typescript
   export async function updateCommunicationStatus(
     communicationId: string,
     data: {
       status: CommunicationStatus;
       messageId?: string;
       sentAt?: Date;
       deliveredAt?: Date;
       retryCount?: number;
     }
   ): Promise<void> {
     await prisma.communication.update({
       where: { id: communicationId },
       data,
     });

     logger.debug({ communicationId, status: data.status }, 'Communication status updated');
   }

   export async function updateCommunicationRetryCount(
     communicationId: string,
     retryCount: number
   ): Promise<void> {
     await prisma.communication.update({
       where: { id: communicationId },
       data: { retryCount },
     });
   }
   ```

### Step 4 — Add DLQ failed job handler

1. Implement failed job event listener:
   ```typescript
   worker.on('failed', async (job, error) => {
     if (!job) return;

     const { communicationId } = job.data;
     const isFinalAttempt = job.attemptsMade >= (job.opts.attempts || 5);

     if (isFinalAttempt) {
       logger.error(
         {
           communicationId,
           jobId: job.id,
           attempts: job.attemptsMade,
           error,
         },
         'Email delivery job exhausted - moving to DLQ'
       );

       // Update Communication to failed status
       await updateCommunicationStatus(communicationId, {
         status: 'failed',
         retryCount: job.attemptsMade,
       });

       // Trigger ops alert (TASK-004)
       await triggerDLQAlert({
         communicationId,
         jobId: job.id,
         attempts: job.attemptsMade,
         error: error.message,
       });
     }
   });
   ```

### Step 5 — Add worker lifecycle management

1. Export worker instance:
   ```typescript
   export const emailDeliveryWorker = new Worker(
     'email-delivery',
     processEmailDeliveryJob,
     workerOptions
   );
   ```

2. Add graceful shutdown:
   ```typescript
   export async function shutdownEmailDeliveryWorker(): Promise<void> {
     await emailDeliveryWorker.close();
     logger.info('Email delivery worker shut down');
   }
   ```

3. Add worker event logging:
   ```typescript
   worker.on('completed', (job) => {
     logger.info({ jobId: job.id }, 'Email delivery job completed');
   });

   worker.on('error', (error) => {
     logger.error({ error }, 'Email delivery worker error');
   });
   ```

### Step 6 — Integrate worker with application startup

1. Update `backend/src/startWorkers.ts` to start email delivery worker:
   ```typescript
   import { emailDeliveryWorker } from './workers/emailDeliveryWorker';

   // Worker already starts on import, just log
   logger.info('Email delivery worker started');
   ```

---

## Validation

| Check | Method | Expected Result |
|-------|--------|-----------------|
| Worker processes job | unit test | Job handler called with correct data |
| Template resolution | unit test | resolveTemplate called with correct type |
| Template rendering | unit test | renderTemplate called with correct tokens |
| Resend API called | unit test | sendEmailViaResend called with rendered content |
| Success status update | unit test | Communication updated to 'sent' with messageId and sentAt |
| Retry count tracked | unit test | Communication.retryCount updated on each attempt |
| Transient error retry | unit test | Throwing error triggers BullMQ retry |
| Permanent error fail | unit test | PermanentEmailError marks Communication as 'failed', no retry |
| DLQ handler | unit test | Final attempt triggers DLQ alert and status update |
| Concurrency | integration test | Worker processes multiple jobs concurrently |
| Worker shutdown | integration test | Worker closes gracefully without losing jobs |

---

## Dependencies

- TASK-001 (Email delivery queue)
- TASK-002 (Resend service and idempotency)
- EP-008 / US-001 / TASK-005 (resolveTemplate function)
- EP-008 / US-001 (renderTemplate function)
- Communication model (already exists in schema)

## Security Constraints

- **OWASP A09 (Security Logging)**: Do not log email content or sensitive token values
- **OWASP A04 (Insecure Design)**: Worker must validate job data before processing
- **OWASP A05 (Security Misconfiguration)**: Worker lock duration prevents job duplication
- Job timeout (30s) prevents resource exhaustion
- Communication updates must be atomic (use transactions if needed)

---

## Definition of Done

- [x] `emailDeliveryWorker.ts` created with Worker instance
- [x] Job processor resolves template, renders content, and sends email
- [x] Communication status updated on successful delivery ('sent' with messageId)
- [x] Communication.retryCount incremented on each attempt
- [x] Transient errors throw to trigger retry
- [x] Permanent errors mark Communication as 'failed' without retry
- [x] DLQ handler updates status on job exhaustion
- [x] DLQ handler triggers ops alert (stub for TASK-004)
- [x] Worker concurrency set to 5
- [x] Worker integrated with application startup
- [x] Unit tests cover job processing, status updates, and error handling
- [x] Worker logs job lifecycle events (started, completed, failed, error)

## Implementation Summary

**Completed**: 2026-07-29

### Components Created

1. **communicationService.ts** (100 lines)
   - `updateCommunicationStatus` - Update status, messageId, timestamps
   - `updateCommunicationRetryCount` - Track retry attempts
   - `getCommunication` - Fetch communication with relations
   - Full CRUD for Communication model status tracking

2. **emailDeliveryWorker.ts** (281 lines)
   - BullMQ Worker configured for `email-delivery` queue
   - Concurrency: 5, Lock duration: 30 seconds
   - Job processor workflow:
     1. Resolve template with locale fallback
     2. Render template with token data
     3. Send email via Resend API
     4. Update Communication status to 'sent'
   - Error handling:
     - Permanent errors: mark as failed, do not retry
     - Transient errors: throw to trigger exponential backoff
   - DLQ handler: trigger alert on final failure
   - Event handlers: completed, failed, error
   - Graceful shutdown support

3. **startWorkers.ts** (updated)
   - Integrated emailDeliveryWorker on startup

### Test Coverage

**Communication Service Tests**: 14/14 passing
- Status updates (queued, sent, delivered, failed, bounced)
- Retry count tracking
- Optional field handling
- Error propagation

**Email Delivery Worker Tests**: 20/20 passing
- Successful job processing (3 tests)
- Template resolution and rendering (4 tests)
- Permanent error handling (3 tests)
- Transient error handling (3 tests)
- Retry count tracking (2 tests)
- Worker configuration (2 tests)
- Event handlers (3 tests)

**Total**: 34/34 tests passing (100%)

### Job Processing Workflow

1. **Template Resolution**: Call `resolveTemplate(templateType, 'en')`
   - 3-tier fallback: exact match → fallback locale → default
   - Throws PermanentEmailError if template not found

2. **Template Rendering**: Call `renderTemplate(template, tokenData)`
   - Token replacement in subject and body
   - Returns subject, bodyHtml, bodyText

3. **Email Sending**: Call `sendEmailViaResend(...)`
   - Sends via Resend API with idempotency key
   - Returns messageId on success
   - Throws TransientEmailError or PermanentEmailError on failure

4. **Status Update**: Call `updateCommunicationStatus(...)`
   - Update to 'sent' with messageId and sentAt timestamp
   - Include retry count from job.attemptsMade

### Error Handling Strategy

**Permanent Errors** (do not retry):
- Template not found (404)
- Invalid email address (422)
- Authentication failure (401)
- Authorization failure (403)

**Actions**:
1. Update Communication.retryCount
2. Update Communication.status = 'failed'
3. Log error
4. Return (do not throw)

**Transient Errors** (retry with exponential backoff):
- Server errors (500, 502, 503, 504)
- Timeouts (ETIMEDOUT, ECONNABORTED)
- Unknown errors (default to retry)

**Actions**:
1. Update Communication.retryCount
2. Log warning
3. Throw error (triggers BullMQ retry)

### DLQ (Dead Letter Queue) Handler

On final attempt failure:
1. Check `job.attemptsMade >= job.opts.attempts`
2. Update Communication.status = 'failed'
3. Log error with job details
4. Call `triggerDLQAlert(...)` (stub for TASK-004)

### Integration Notes

- Uses shared Redis connection from `emailDeliveryQueue`
- Imports `resolveTemplate` from `templateService` (US-001)
- Imports `renderTemplate` from `templateRenderer` (US-001)
- Imports `sendEmailViaResend` from `resendEmailService` (TASK-002)
- Ready for DLQ alerting webhook (TASK-004)

### Security Compliance

✓ **OWASP A09**: Logs metadata only (communicationId, to, subject), never email content or token values
✓ **OWASP A04**: Validates job data before processing
✓ **OWASP A05**: Lock duration (30s) prevents job duplication

---

## Traceability

| Artefact | ID |
|----------|----|
| User Story | US-002 |
| Epic | EP-008 |
| Scenario | 1, 2, 3 |
| FR | FR-058, FR-059 |
