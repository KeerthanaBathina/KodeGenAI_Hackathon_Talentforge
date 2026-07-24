---
id: task_001
us_id: us_002
epic: EP-003
title: "Create BullMQ Resume Parse Queue with Retry Configuration"
status: done
layer: backend
effort: 1h
priority: critical
created: 2026-07-24
completed: 2026-07-24
---

# TASK-001 — Create BullMQ Resume Parse Queue with Retry Configuration

## Context

**User Story**: US-002 — AI Resume Parsing Worker with BullMQ and spaCy NER  
**Epic**: EP-003 — AI Resume Parsing  
**Addresses**: Scenario 1 (30s SLA), Scenario 3 (retry with backoff)

Extend the existing BullMQ integration (from US-001) to add a dedicated `resume-parse` queue with job retry policies. This queue will be consumed by the Python worker service.

---

## Objective

Create BullMQ queue configuration that:
1. Defines `resume-parse` queue separate from `resume-upload`
2. Configures retry policy: 3 attempts with exponential backoff (2s, 4s, 8s)
3. Sets job retention: 7 days for failed jobs, 24 hours for completed
4. Adds job timeout: 30 seconds max per job

---

## Implementation Steps

### Step 1 — Update Queue Configuration

Create or update `backend/src/queues/resumeParseQueue.ts`:

```typescript
import { Queue } from 'bullmq';
import { env } from '../config/env';
import logger from '../utils/logger';

export interface ResumeParseJobData {
  resumeId: string;
  applicationId: string;
  storageKey: string;
  candidateId: string;
  fileName: string;
  mimeType: string;
}

const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD,
};

export const resumeParseQueue = new Queue<ResumeParseJobData>('resume-parse', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000, // Start at 2 seconds
    },
    timeout: 30000, // 30 seconds max
    removeOnComplete: {
      age: 86400, // 24 hours
      count: 500,
    },
    removeOnFail: {
      age: 604800, // 7 days
    },
  },
});

resumeParseQueue.on('error', (error) => {
  logger.error('Resume parse queue error', { error });
});

logger.info('Resume parse queue initialized');

export async function enqueueResumeForParse(data: ResumeParseJobData): Promise<string> {
  const job = await resumeParseQueue.add('parse-resume', data, {
    jobId: `parse-${data.resumeId}`,
    priority: 1, // Higher priority than other background jobs
  });

  logger.info('Resume enqueued for parsing', {
    jobId: job.id,
    resumeId: data.resumeId,
    applicationId: data.applicationId,
  });

  return job.id!;
}
```

### Step 2 — Update Scan Webhook Service

Modify `backend/src/services/scanWebhookService.ts` to use the new parse queue:

```typescript
import { enqueueResumeForParse } from '../queues/resumeParseQueue';

// In processScanResult, update the clean file path:
if (status === 'clean') {
  setImmediate(async () => {
    try {
      const jobId = await enqueueResumeForParse({
        resumeId,
        applicationId: resume.applicationId,
        storageKey: resume.storageKey,
        candidateId: resume.application.candidateId,
        fileName: resume.fileName,
        mimeType: resume.mimeType,
      });

      await prisma.resume.update({
        where: { id: resumeId },
        data: {
          scanResult: {
            ...(resume.scanResult as object),
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
}
```

### Step 3 — Add Queue Monitoring

Create `backend/src/queues/queueMonitor.ts` for health checks:

```typescript
import { resumeParseQueue } from './resumeParseQueue';
import logger from '../utils/logger';

export async function getQueueHealth() {
  const waiting = await resumeParseQueue.getWaitingCount();
  const active = await resumeParseQueue.getActiveCount();
  const failed = await resumeParseQueue.getFailedCount();
  const delayed = await resumeParseQueue.getDelayedCount();

  return {
    queue: 'resume-parse',
    waiting,
    active,
    failed,
    delayed,
    healthy: active < 100 && failed < 10,
  };
}
```

---

## Acceptance Criteria

- [ ] `resume-parse` queue created with 3 retry attempts
- [ ] Exponential backoff configured (2s → 4s → 8s)
- [ ] Job timeout set to 30 seconds
- [ ] Failed jobs retained for 7 days
- [ ] Completed jobs retained for 24 hours
- [ ] Queue health monitoring endpoint available

---

## Testing Checklist

- [ ] Unit test: Queue initializes with correct config
- [ ] Unit test: `enqueueResumeForParse` creates job with correct data
- [ ] Integration test: Job retries 3 times on failure
- [ ] Integration test: Job fails after 30s timeout
- [ ] Monitoring: Health check returns queue stats

---

## Dependencies

- BullMQ library already installed (from US-001)
- Redis connection configured in env.ts
- `resumeParsingQueue.ts` from US-001 (can be refactored or replaced)

---

## Definition of Done

- [ ] Queue configuration file created and exported
- [ ] Retry policy verified with failing test job
- [ ] Timeout policy verified with long-running test job
- [ ] Monitoring endpoint returns accurate queue stats
- [ ] All tests passing
