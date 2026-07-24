---
id: task_005
us_id: us_003
epic: EP-003
title: "Integrate BullMQ Screening Queue Triggered by Parsing"
status: done
layer: backend
effort: 1.5h
priority: high
created: 2026-07-24
completed: 2026-07-24
---

# TASK-005 — Integrate BullMQ Screening Queue Triggered by Parsing

## Context

**User Story**: US-003 — AI Screening Score Computation with Configurable Thresholds  
**Epic**: EP-003 — AI Resume Parsing  
**Addresses**: Scenario 1 (60s SLA from parsing completion)

Create BullMQ queue for screening jobs that is automatically triggered when resume parsing completes. Ensures screening happens asynchronously without blocking the parse webhook.

---

## Objective

Implement screening queue that:
1. Creates `resume-screening` BullMQ queue
2. Automatically enqueues job when parsing succeeds
3. Worker consumes jobs and calls screening service
4. Handles screening failures with retry
5. Meets 60s SLA for score computation

---

## Implementation Steps

### Step 1 — Create Screening Queue

Create `backend/src/queues/screeningQueue.ts`:

```typescript
import { Queue, Worker } from 'bullmq';
import { performScreening } from '../services/screeningService';
import logger from '../utils/logger';

export interface ScreeningJobData {
  applicationId: string;
  resumeId: string;
  triggeredBy: 'parsing' | 'manual';
}

const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD,
};

export const screeningQueue = new Queue<ScreeningJobData>('resume-screening', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000, // 5s, then 10s, then 20s
    },
    timeout: 60000, // 60 seconds max
    removeOnComplete: {
      age: 86400, // 24 hours
      count: 1000,
    },
    removeOnFail: {
      age: 604800, // 7 days
    },
  },
});

screeningQueue.on('error', (error) => {
  logger.error('Screening queue error', { error });
});

export async function enqueueScreening(data: ScreeningJobData): Promise<string> {
  const job = await screeningQueue.add('screen-application', data, {
    jobId: `screen-${data.applicationId}`,
    priority: data.triggeredBy === 'manual' ? 1 : 2,
  });

  logger.info('Application enqueued for screening', {
    jobId: job.id,
    applicationId: data.applicationId,
  });

  return job.id!;
}

// Screening worker
export const screeningWorker = new Worker<ScreeningJobData>(
  'resume-screening',
  async (job) => {
    const { applicationId, triggeredBy } = job.data;

    logger.info('Processing screening job', {
      jobId: job.id,
      applicationId,
      triggeredBy,
    });

    const startTime = Date.now();

    try {
      const result = await performScreening(applicationId);

      const elapsed = Date.now() - startTime;

      logger.info('Screening job completed', {
        jobId: job.id,
        applicationId,
        score: result.score,
        recommendation: result.recommendation,
        elapsed: `${elapsed}ms`,
      });

      return result;
    } catch (error) {
      const elapsed = Date.now() - startTime;

      logger.error('Screening job failed', {
        jobId: job.id,
        applicationId,
        elapsed: `${elapsed}ms`,
        error: error instanceof Error ? error.message : String(error),
      });

      throw error;
    }
  },
  {
    connection,
    concurrency: 5, // Process 5 screenings concurrently
  }
);

screeningWorker.on('completed', (job, result) => {
  logger.info('Screening worker completed job', {
    jobId: job.id,
    applicationId: job.data.applicationId,
    score: result.score,
  });
});

screeningWorker.on('failed', (job, error) => {
  logger.error('Screening worker failed job', {
    jobId: job?.id,
    applicationId: job?.data.applicationId,
    error: error.message,
  });
});

logger.info('Screening queue and worker initialized');
```

### Step 2 — Trigger Screening After Parse Completion

Update `backend/src/services/parseResultService.ts`:

```typescript
import { enqueueScreening } from '../queues/screeningQueue';

// In processParseResult(), after successful parse:
if (status === 'success' && parsedData) {
  // Store parsed data
  await prisma.resume.update({
    where: { id: resumeId },
    data: {
      parsedData: parsedData as any,
      updatedAt: new Date(),
    },
  });

  // Trigger screening
  setImmediate(async () => {
    try {
      await enqueueScreening({
        applicationId: resume.application.id,
        resumeId,
        triggeredBy: 'parsing',
      });
    } catch (error) {
      logger.error('Failed to enqueue screening', { resumeId, error });
    }
  });

  // ... rest of the code
}
```

### Step 3 — Add Manual Screening Trigger

Update `backend/src/routes/screenings.ts`:

```typescript
import { enqueueScreening } from '../queues/screeningQueue';

// POST /api/screenings/trigger
router.post('/trigger', authenticate, async (req, res) => {
  try {
    const { applicationId } = req.body;

    if (!applicationId) {
      return res.status(400).json({
        error: {
          code: 'MISSING_APPLICATION_ID',
          message: 'applicationId is required',
        },
      });
    }

    // Find resume for application
    const application = await prisma.application.findUnique({
      where: { id: applicationId },
      include: { resume: true },
    });

    if (!application || !application.resume) {
      return res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'Application or resume not found',
        },
      });
    }

    const jobId = await enqueueScreening({
      applicationId,
      resumeId: application.resume.id,
      triggeredBy: 'manual',
    });

    res.status(202).json({
      message: 'Screening job enqueued',
      jobId,
    });
  } catch (error) {
    logger.error('Failed to trigger screening', { error });
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to trigger screening',
      },
    });
  }
});
```

### Step 4 — Add Queue Health Monitoring

Update `backend/src/routes/admin/queueStats.ts`:

```typescript
import { screeningQueue } from '../../queues/screeningQueue';

router.get('/', authenticate, async (req, res) => {
  try {
    const [parseStats, screeningStats] = await Promise.all([
      getQueueHealth(), // From resumeParseQueue
      getScreeningQueueHealth(),
    ]);

    res.json({
      resumeParse: parseStats,
      screening: screeningStats,
    });
  } catch (error) {
    logger.error('Failed to fetch queue stats', { error });
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch queue stats',
      },
    });
  }
});

async function getScreeningQueueHealth() {
  const [waiting, active, completed, failed, delayed] = await Promise.all([
    screeningQueue.getWaitingCount(),
    screeningQueue.getActiveCount(),
    screeningQueue.getCompletedCount(),
    screeningQueue.getFailedCount(),
    screeningQueue.getDelayedCount(),
  ]);

  return {
    queue: 'resume-screening',
    waiting,
    active,
    completed,
    failed,
    delayed,
    healthy: active < 50 && failed < 10,
  };
}
```

---

## Acceptance Criteria

- [ ] Screening queue created with 60s timeout
- [ ] Queue automatically triggered on successful parse
- [ ] Worker processes up to 5 screenings concurrently
- [ ] Failed screenings retry 3 times with backoff
- [ ] Manual screening trigger available for admins
- [ ] Queue health monitoring includes screening stats

---

## Testing Checklist

- [ ] Unit test: enqueueScreening creates job
- [ ] Integration test: Parse completion triggers screening
- [ ] Integration test: Worker processes job successfully
- [ ] Integration test: Failed job retries 3 times
- [ ] Performance test: Screening completes within 60s
- [ ] Load test: 10 concurrent screenings process correctly

---

## Dependencies

- Screening service (TASK-003)
- Parse result service (US-002)
- Redis connection
- BullMQ library

---

## Definition of Done

- [ ] Screening queue created and worker running
- [ ] Auto-trigger from parse completion working
- [ ] Manual trigger endpoint created
- [ ] Queue monitoring integrated
- [ ] Worker concurrency configured
- [ ] All tests passing
