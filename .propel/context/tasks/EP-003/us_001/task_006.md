---
id: task_006
us_id: us_001
epic: EP-003
title: "Integrate BullMQ for AI Resume Parsing Queue"
status: done
layer: backend
effort: 2h
priority: high
created: 2026-07-24
completed: 2026-07-24
---

# TASK-006 — Integrate BullMQ for AI Resume Parsing Queue

## Context

**User Story**: US-001 — Secure Resume Upload via Presigned URL with Malware Scanning  
**Epic**: EP-003 — AI Resume Parsing  
**Addresses**: Scenario 4 (clean file triggers AI parsing queue)

Integrate BullMQ job queue for AI resume parsing. When a file passes malware scan, enqueue it for asynchronous parsing by AI worker.

---

## Objective

Set up BullMQ integration that:
1. Creates resume-parsing queue
2. Enqueues clean files for parsing
3. Stores job metadata (resumeId, applicationId, storageKey)
4. Configures job retry strategy
5. Logs queue operations

---

## Implementation

### 1. Queue Configuration

**File**: `backend/src/queues/resumeParsingQueue.ts`

```typescript
import { Queue } from 'bullmq';
import { env } from '../config/env';
import logger from '../utils/logger';

export interface ResumeParsingJobData {
  resumeId: string;
  applicationId: string;
  storageKey: string;
  candidateId: string;
}

const connection = {
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
  password: env.REDIS_PASSWORD,
};

export const resumeParsingQueue = new Queue<ResumeParsingJobData>('resume-parsing', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
    removeOnComplete: {
      age: 86400, // 24 hours
      count: 100,
    },
    removeOnFail: {
      age: 604800, // 7 days
    },
  },
});

resumeParsingQueue.on('error', (error) => {
  logger.error('Resume parsing queue error', { error });
});

logger.info('Resume parsing queue initialized');

export async function enqueueResumeForParsing(
  data: ResumeParsingJobData
): Promise<string> {
  const job = await resumeParsingQueue.add('parse-resume', data, {
    jobId: `parse-${data.resumeId}`,
  });

  logger.info('Resume enqueued for parsing', {
    jobId: job.id,
    resumeId: data.resumeId,
    applicationId: data.applicationId,
  });

  return job.id!;
}
```

### 2. Update Scan Webhook Service

**File**: `backend/src/services/scanWebhookService.ts`

```typescript
import { enqueueResumeForParsing } from '../queues/resumeParsingQueue';

// In processScanResult function, after updating resume:
if (status === 'clean') {
  logger.info('Clean file ready for parsing', { resumeId });
  
  setImmediate(async () => {
    try {
      const jobId = await enqueueResumeForParsing({
        resumeId,
        applicationId: resume.applicationId,
        storageKey: resume.storageKey,
        candidateId: resume.application.candidateId,
      });

      // Update resume with parsing status
      await prisma.resume.update({
        where: { id: resumeId },
        data: {
          scanResult: {
            ...resume.scanResult,
            parsingJobId: jobId,
            parsingStatus: 'queued',
          },
        },
      });

      logger.info('Resume queued for AI parsing', { resumeId, jobId });
    } catch (error) {
      logger.error('Failed to enqueue resume for parsing', { resumeId, error });
    }
  });
} else {
  // ... quarantine flow
}
```

### 3. Environment Variables

**File**: `backend/src/config/env.ts`

```typescript
const envSchema = z.object({
  // ... existing vars
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),
  REDIS_PASSWORD: z.string().optional(),
});
```

### 4. Queue Health Check

**File**: `backend/src/routes/health.ts`

```typescript
import { resumeParsingQueue } from '../queues/resumeParsingQueue';

// Add queue health check
router.get('/queue-health', async (req, res) => {
  try {
    const waiting = await resumeParsingQueue.getWaitingCount();
    const active = await resumeParsingQueue.getActiveCount();
    const failed = await resumeParsingQueue.getFailedCount();

    return res.status(200).json({
      queue: 'resume-parsing',
      status: 'healthy',
      counts: {
        waiting,
        active,
        failed,
      },
    });
  } catch (error) {
    return res.status(500).json({
      queue: 'resume-parsing',
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});
```

### 5. Package Dependencies

**File**: `backend/package.json`

```json
{
  "dependencies": {
    "bullmq": "^4.0.0"
  }
}
```

---

## Acceptance Criteria

- [x] resumeParsingQueue.ts with BullMQ queue configuration
- [x] enqueueResumeForParsing function created
- [x] Job data includes resumeId, applicationId, storageKey, candidateId
- [x] Retry strategy configured (3 attempts, exponential backoff)
- [x] Job retention configured (24h complete, 7d failed)
- [x] Integrated into scan webhook service
- [x] Resume.scanResult updated with parsingJobId and parsingStatus
- [x] Queue health check endpoint added
- [x] Environment variables for Redis configured
- [x] BullMQ dependency added to package.json

---

## Testing Requirements

**Unit Tests** (`resumeParsingQueue.test.ts`):
- ✓ Enqueues job with correct data
- ✓ Generates unique job ID
- ✓ Logs queue operations
- ✓ Handles Redis connection errors

**Integration Tests**:
- ✓ Job successfully added to queue
- ✓ Queue health check returns correct counts
- ✓ Retry strategy works for failed jobs

---

## Dependencies

- Redis server running (local or cloud)
- env.REDIS_HOST, REDIS_PORT, REDIS_PASSWORD configured
- BullMQ package installed

---

## Notes

**Worker Implementation**: The actual AI parsing worker that processes jobs from this queue will be implemented in US-002 (AI Resume Parsing). This task only sets up the queue and enqueues jobs.

**Job Processing**: Jobs will remain in "waiting" state until the worker is implemented in US-002. This is expected behavior.

---

## Effort Estimate

**2 hours** — Standard BullMQ queue setup
