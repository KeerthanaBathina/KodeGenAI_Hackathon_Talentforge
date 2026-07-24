---
id: task_005
us_id: us_002
epic: EP-003
title: "Implement Dead-Letter Queue and Error Handling for Failed Parses"
status: done
layer: backend
effort: 1.5h
priority: high
created: 2026-07-24
completed: 2026-07-24
---

# TASK-005 — Implement Dead-Letter Queue and Error Handling for Failed Parses

## Context

**User Story**: US-002 — AI Resume Parsing Worker with BullMQ and spaCy NER  
**Epic**: EP-003 — AI Resume Parsing  
**Addresses**: Scenario 3 (retry with backoff, dead-letter queue after 3 failures)

Implement robust error handling for resume parsing failures, including dead-letter queue management and candidate notification.

---

## Objective

Create error handling system that:
1. Captures failed jobs after 3 retry attempts
2. Moves permanently failed jobs to dead-letter queue
3. Sends notification to support team for manual review
4. Provides admin interface to view failed jobs
5. Allows manual retry of dead-letter jobs

---

## Implementation Steps

### Step 1 — Configure Dead-Letter Queue

Update `backend/src/queues/resumeParseQueue.ts`:

```typescript
import { Queue, QueueEvents } from 'bullmq';

// Add dead-letter queue
export const resumeParseDeadLetterQueue = new Queue('resume-parse-dead-letter', {
  connection,
  defaultJobOptions: {
    removeOnComplete: false, // Keep completed jobs
    removeOnFail: false, // Keep failed jobs
  },
});

// Listen for failed events
const queueEvents = new QueueEvents('resume-parse', { connection });

queueEvents.on('failed', async ({ jobId, failedReason, prev }) => {
  if (prev === 'completed') return; // Skip if job was completed before
  
  const job = await resumeParseQueue.getJob(jobId!);
  
  if (!job) return;
  
  // Check if this was the final attempt
  if (job.attemptsMade >= (job.opts.attempts || 3)) {
    logger.error('Resume parsing failed permanently', {
      jobId,
      resumeId: job.data.resumeId,
      failedReason,
      attempts: job.attemptsMade,
    });
    
    // Move to dead-letter queue
    await resumeParseDeadLetterQueue.add(
      'dead-letter-job',
      {
        ...job.data,
        originalJobId: jobId,
        failedReason,
        failedAt: new Date().toISOString(),
        attempts: job.attemptsMade,
      },
      {
        jobId: `dlq-${jobId}`,
      }
    );
    
    // Update resume status
    await prisma.resume.update({
      where: { id: job.data.resumeId },
      data: {
        scanStatus: 'parse_failed',
        scanResult: {
          parseError: failedReason,
          attempts: job.attemptsMade,
          failedAt: new Date().toISOString(),
        },
      },
    });
    
    // Notify support team
    await notifySupportTeam(job.data.resumeId, failedReason);
  }
});

logger.info('Dead-letter queue initialized');
```

### Step 2 — Create Support Notification Service

Create `backend/src/services/supportNotificationService.ts`:

```typescript
import { sendEmail } from './emailService';
import logger from '../utils/logger';
import { env } from '../config/env';

export async function notifySupportTeam(
  resumeId: string,
  error: string
): Promise<void> {
  try {
    if (env.SUPPORT_EMAIL) {
      await sendEmail({
        to: env.SUPPORT_EMAIL,
        subject: `[AI Interview] Resume Parsing Failed - ${resumeId}`,
        html: `
          <h2>Resume Parsing Failure</h2>
          <p><strong>Resume ID:</strong> ${resumeId}</p>
          <p><strong>Error:</strong> ${error}</p>
          <p>This job has been moved to the dead-letter queue and requires manual review.</p>
          <p>
            <a href="${env.FRONTEND_URL}/admin/failed-jobs/${resumeId}">View in Admin Panel</a>
          </p>
        `,
      });
      
      logger.info('Support notification sent', { resumeId });
    }
  } catch (notificationError) {
    logger.error('Failed to send support notification', {
      resumeId,
      error: notificationError instanceof Error ? notificationError.message : String(notificationError),
    });
    // Don't throw - notification failure shouldn't block
  }
}
```

### Step 3 — Create Dead-Letter Queue Management API

Create `backend/src/routes/admin/deadLetterJobs.ts`:

```typescript
import { Router } from 'express';
import { resumeParseDeadLetterQueue, resumeParseQueue } from '../../queues/resumeParseQueue';
import { authenticate } from '../../middleware/authenticate';
import { requireRole } from '../../middleware/authorize';

const router = Router();

// GET /api/admin/dead-letter-jobs
router.get('/', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const jobs = await resumeParseDeadLetterQueue.getJobs(['completed', 'failed', 'waiting']);
    
    const jobDetails = await Promise.all(
      jobs.map(async (job) => ({
        id: job.id,
        resumeId: job.data.resumeId,
        failedReason: job.data.failedReason,
        failedAt: job.data.failedAt,
        attempts: job.data.attempts,
        data: job.data,
      }))
    );
    
    res.json({
      jobs: jobDetails,
      count: jobDetails.length,
    });
  } catch (error) {
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch dead-letter jobs',
      },
    });
  }
});

// POST /api/admin/dead-letter-jobs/:jobId/retry
router.post('/:jobId/retry', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const { jobId } = req.params;
    
    const job = await resumeParseDeadLetterQueue.getJob(`dlq-${jobId}`);
    
    if (!job) {
      return res.status(404).json({
        error: {
          code: 'JOB_NOT_FOUND',
          message: 'Dead-letter job not found',
        },
      });
    }
    
    // Re-enqueue in main queue
    await resumeParseQueue.add('parse-resume', job.data, {
      jobId: `retry-${jobId}-${Date.now()}`,
    });
    
    // Remove from dead-letter queue
    await job.remove();
    
    res.json({
      success: true,
      message: 'Job re-queued successfully',
    });
  } catch (error) {
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to retry job',
      },
    });
  }
});

export default router;
```

### Step 4 — Add Environment Variables

Update `backend/src/config/env.ts`:

```typescript
// Add to envSchema
SUPPORT_EMAIL: z.string().email().optional(),
```

Update `backend/.env`:

```bash
SUPPORT_EMAIL=support@talentforge.ai
```

### Step 5 — Create Monitoring Dashboard Data Endpoint

Create `backend/src/routes/admin/queueStats.ts`:

```typescript
import { Router } from 'express';
import { resumeParseQueue, resumeParseDeadLetterQueue } from '../../queues/resumeParseQueue';
import { authenticate } from '../../middleware/authenticate';
import { requireRole } from '../../middleware/authorize';

const router = Router();

// GET /api/admin/queue-stats
router.get('/', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      resumeParseQueue.getWaitingCount(),
      resumeParseQueue.getActiveCount(),
      resumeParseQueue.getCompletedCount(),
      resumeParseQueue.getFailedCount(),
      resumeParseQueue.getDelayedCount(),
    ]);
    
    const deadLetterCount = await resumeParseDeadLetterQueue.getWaitingCount();
    
    res.json({
      resumeParseQueue: {
        waiting,
        active,
        completed,
        failed,
        delayed,
      },
      deadLetterQueue: {
        count: deadLetterCount,
      },
      health: {
        healthy: active < 100 && failed < 20 && deadLetterCount < 10,
        issues: [],
      },
    });
  } catch (error) {
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch queue stats',
      },
    });
  }
});

export default router;
```

---

## Acceptance Criteria

- [ ] Jobs move to dead-letter queue after 3 failed attempts
- [ ] Resume status updates to `parse_failed` on permanent failure
- [ ] Support team receives email notification for failed jobs
- [ ] Admin can view all dead-letter jobs
- [ ] Admin can manually retry dead-letter jobs
- [ ] Queue stats endpoint shows dead-letter queue count

---

## Testing Checklist

- [ ] Unit test: Failed job moves to dead-letter queue after 3 attempts
- [ ] Unit test: Support notification sent on permanent failure
- [ ] Integration test: Dead-letter job API lists jobs correctly
- [ ] Integration test: Retry endpoint re-queues job successfully
- [ ] Integration test: Queue stats endpoint returns accurate counts
- [ ] E2E test: Simulate 3 failures and verify dead-letter handling

---

## Dependencies

- BullMQ QueueEvents for failure monitoring
- Email service for support notifications
- Admin authentication and authorization middleware
- Prisma schema with `parse_failed` status

---

## Definition of Done

- [ ] Dead-letter queue created and configured
- [ ] Failure event handler implemented
- [ ] Support notification service created
- [ ] Admin API endpoints created and tested
- [ ] Queue monitoring dashboard endpoint created
- [ ] All tests passing
