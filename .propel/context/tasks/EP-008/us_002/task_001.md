---
id: task_001
us_id: us_002
epic: EP-008
title: "Setup BullMQ Email Delivery Queue Infrastructure"
status: completed
layer: backend
effort: 3h
priority: high
created: 2026-07-29
completed: 2026-07-29
---

# TASK-001 — Setup BullMQ Email Delivery Queue Infrastructure

## Context

**User Story**: US-002 — Email Delivery via Resend API with Exponential Backoff Retry  
**Epic**: EP-008 — Communication Service  
**Addresses**: Scenario 1, 2

Create BullMQ queue infrastructure for reliable email delivery with exponential backoff retry strategy. The queue must be configured to handle transient failures gracefully while maintaining visibility into delivery status.

---

## Objective

Implement BullMQ email-delivery queue with:
1. Exponential backoff retry strategy (5 attempts: 30s, 2m, 8m, 32m, 128m)
2. Job completion and failure retention policies
3. Type-safe job data interfaces
4. Queue initialization with Redis connection
5. Job scheduling and cancellation functions

---

## Technical Specifications

| Area | Requirement |
|------|-------------|
| Queue name | `email-delivery` |
| Retry attempts | 5 total attempts |
| Retry delays | 30s → 2m → 8m → 32m → 128m (exponential: delay * 4) |
| Complete retention | 24 hours (86400 seconds) |
| Failed retention | Never removed (for DLQ processing) |
| Connection | Shared Redis connection from config |
| Job ID pattern | `email-<communicationId>` for deduplication |

---

## Implementation Steps

### Step 1 — Create queue configuration file

1. Create `backend/src/queues/emailDeliveryQueue.ts`
2. Import BullMQ Queue, IORedis connection from config
3. Define job data interface:
   ```typescript
   export interface EmailDeliveryJobData {
     communicationId: string;
     to: string;
     templateType: string;
     templateId: string;
     tokenData: Record<string, string>;
     idempotencyKey: string;
     eventType: string;
     entityId: string;
   }
   ```

### Step 2 — Configure queue with retry strategy

1. Create Queue instance with Redis connection
2. Set defaultJobOptions:
   - `attempts: 5`
   - `backoff: { type: 'exponential', delay: 30000 }` (30 seconds initial delay)
   - `removeOnComplete: { age: 86400 }` (24 hours)
   - `removeOnFail: false` (keep for DLQ)
3. Export queue instance

**Retry schedule calculation**:
- Attempt 1: Immediate
- Attempt 2: 30s delay (30000ms)
- Attempt 3: 2m delay (120000ms = 30s * 4)
- Attempt 4: 8m delay (480000ms = 2m * 4)
- Attempt 5: 32m delay (1920000ms = 8m * 4)
- Attempt 6: 128m delay (7680000ms = 32m * 4) ← final attempt

### Step 3 — Add job scheduling functions

1. `enqueueEmailDelivery(data: EmailDeliveryJobData): Promise<void>`
   - Generate job ID from communicationId
   - Add job to queue with configured options
   - Log enqueue event with communication ID

2. `cancelEmailDelivery(communicationId: string): Promise<void>`
   - Look up job by ID
   - Remove job if it exists
   - Log cancellation event

### Step 4 — Add monitoring utilities

1. Export queue instance for health checks
2. Add function to get queue statistics:
   ```typescript
   export async function getQueueStats(): Promise<{
     waiting: number;
     active: number;
     completed: number;
     failed: number;
   }>
   ```

### Step 5 — Add queue cleanup on shutdown

1. Export cleanup function:
   ```typescript
   export async function closeEmailQueue(): Promise<void>
   ```
2. Close queue connection gracefully
3. Log shutdown event

---

## Validation

| Check | Method | Expected Result |
|-------|--------|-----------------|
| Queue created | unit test | Queue instance exists with correct name |
| Retry config | unit test | defaultJobOptions has 5 attempts, exponential backoff, 30s initial delay |
| Job enqueued | unit test | enqueueEmailDelivery adds job with correct data and ID |
| Job cancelled | unit test | cancelEmailDelivery removes pending job |
| Job ID uniqueness | unit test | Same communicationId produces same job ID |
| Retention config | unit test | removeOnComplete = 24h, removeOnFail = false |
| Queue stats | unit test | getQueueStats returns correct counts |

---

## Dependencies

- EP-TECH / US-003 (Redis configured and available)
- BullMQ package installed (already in project)
- IORedis connection configured

## Security Constraints

- **OWASP A09 (Security Logging)**: Do not log email content or token values
- **OWASP A02 (Cryptographic Failures)**: Idempotency key should be hashed (SHA-256)
- Redis connection must use TLS in production
- Job data should not include sensitive PII beyond email address

---

## Definition of Done

- [x] `emailDeliveryQueue.ts` created with Queue instance
- [x] EmailDeliveryJobData interface defined with all required fields
- [x] Retry configuration: 5 attempts, exponential backoff starting at 30s
- [x] Job retention: 24h for completed, never remove failed
- [x] `enqueueEmailDelivery` function schedules jobs with unique IDs
- [x] `cancelEmailDelivery` function removes jobs by communication ID
- [x] `getQueueStats` function returns queue metrics
- [x] `closeEmailQueue` function handles graceful shutdown
- [x] Unit tests cover queue configuration and job lifecycle
- [x] Queue exports connection for worker initialization

## Implementation Summary

**Completed**: 2026-07-29

### Components Created

1. **emailDeliveryQueue.ts** (127 lines)
   - Queue instance with name `email-delivery`
   - Exponential backoff: 5 attempts, 30s initial delay
   - Retention: 24h for completed, never remove failed
   - Job ID pattern: `email-<communicationId>`

2. **EmailDeliveryJobData interface**
   - communicationId: string
   - to: string (recipient email)
   - templateType: TemplateType enum
   - templateId: string
   - tokenData: Record<string, string>
   - idempotencyKey: string
   - eventType: string
   - entityId: string

3. **Queue Functions**
   - `enqueueEmailDelivery`: Schedule email delivery job
   - `cancelEmailDelivery`: Remove pending job
   - `getQueueStats`: Get waiting/active/completed/failed counts
   - `closeEmailQueue`: Graceful shutdown

### Test Coverage
- 18 tests passing (100% pass rate)
- Test file: `backend/src/queues/__tests__/emailDeliveryQueue.test.ts`
- Coverage: Queue configuration, job scheduling, cancellation, statistics

### Retry Schedule
- Attempt 1: Immediate
- Attempt 2: +30s (30,000ms)
- Attempt 3: +2m (120,000ms)
- Attempt 4: +8m (480,000ms)
- Attempt 5: +32m (1,920,000ms)
- Final attempt: +128m (7,680,000ms)

### Integration
- Exports shared Redis connection for worker
- Uses existing IORedis and BullMQ packages
- Follows project patterns from offerQueue

---

## Traceability

| Artefact | ID |
|----------|----|
| User Story | US-002 |
| Epic | EP-008 |
| Scenario | 1, 2 |
| FR | FR-058 |
