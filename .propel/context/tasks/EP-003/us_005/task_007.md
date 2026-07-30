---
id: task_007
us_id: us_005
epic: EP-003
title: "Integration Tests for Escalation and Fallback Scenarios"
status: done
layer: test
effort: 2h
priority: high
created: 2026-07-24
completed: 2026-07-24
---

# TASK-007 — Integration Tests for Escalation and Fallback Scenarios

## Context

**User Story**: US-005 — Low-Confidence Escalation to Manual Review and AI Fallback Mode  
**Epic**: EP-003 — AI Resume Parsing  
**Addresses**: All scenarios (comprehensive testing of escalation and fallback logic)

Create integration tests that validate the complete flow of low-confidence escalation and fallback mode behavior.

---

## Objective

Test end-to-end scenarios:
1. Low-confidence screening routes to manual review
2. High queue depth triggers fallback mode
3. Worker offline triggers fallback mode
4. Applications submitted during fallback bypass screening
5. Fallback mode auto-recovers when system healthy
6. Manual review queue operations

---

## Implementation Steps

### Step 1 — Create Low-Confidence Escalation Tests

Create `backend/src/services/__tests__/lowConfidenceEscalation.integration.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { performScreening } from '../screeningService';
import { prisma } from '@/db/prisma';
import { calculateConfidence } from '../confidenceService';

describe('Low-Confidence Escalation Integration', () => {
  let testApplicationId: string;
  let testResumeId: string;

  beforeEach(async () => {
    // Create test data with low-quality resume (sparse data)
    const candidate = await prisma.candidate.create({
      data: { name: 'Test Candidate', email: 'test@example.com' },
    });

    const requisition = await prisma.requisition.create({
      data: {
        title: 'Software Engineer',
        requiredSkills: ['Python', 'Docker', 'Kubernetes'],
        preferredSkills: ['AWS', 'React'],
        minExperienceYears: 5,
        educationLevel: 'bachelors',
      },
    });

    const resume = await prisma.resume.create({
      data: {
        candidateId: candidate.id,
        originalFilename: 'test-resume.pdf',
        fileUrl: 'https://example.com/resume.pdf',
        status: 'parsed',
        // Sparse parsedData to produce low confidence
        parsedData: {
          skills: ['Python'], // Only 1 skill
          experience: [], // No experience data
          education: [], // No education data
        },
      },
    });

    const application = await prisma.application.create({
      data: {
        candidateId: candidate.id,
        requisitionId: requisition.id,
        status: 'screening',
      },
    });

    testApplicationId = application.id;
    testResumeId = resume.id;
  });

  afterEach(async () => {
    // Cleanup
    await prisma.screening.deleteMany();
    await prisma.application.deleteMany();
    await prisma.resume.deleteMany();
    await prisma.requisition.deleteMany();
    await prisma.candidate.deleteMany();
  });

  it('should escalate application to manual review when confidence < 0.5', async () => {
    // Perform screening
    const screening = await performScreening(testApplicationId);

    // Verify screening created with low confidence
    expect(screening.confidence).toBeDefined();
    expect(screening.confidence).toBeLessThan(0.5);

    // Verify application status updated to pending_manual_review
    const application = await prisma.application.findUnique({
      where: { id: testApplicationId },
    });

    expect(application?.status).toBe('pending_manual_review');
    expect(application?.manualReviewReason).toBe('low_confidence');
  });

  it('should not escalate application when confidence >= 0.5', async () => {
    // Update resume with better data
    await prisma.resume.update({
      where: { id: testResumeId },
      data: {
        parsedData: {
          skills: ['Python', 'Docker', 'AWS', 'React'],
          experience: [{ title: 'Engineer', years: 5 }],
          education: [{ degree: 'bachelors' }],
        },
      },
    });

    // Perform screening
    const screening = await performScreening(testApplicationId);

    // Verify high confidence
    expect(screening.confidence).toBeGreaterThanOrEqual(0.5);

    // Verify application not in manual review
    const application = await prisma.application.findUnique({
      where: { id: testApplicationId },
    });

    expect(application?.status).not.toBe('pending_manual_review');
  });

  it('should calculate confidence based on score stability, data quality, and match clarity', () => {
    const { confidence, factors } = calculateConfidence(
      45, // Score near threshold
      { shortlistThreshold: 75, rejectThreshold: 39 },
      {
        parsedData: { skills: ['Python'], experience: [], education: [] },
        positiveFactors: ['Python'],
        skillGaps: ['Docker', 'Kubernetes'],
      }
    );

    // Verify confidence components
    expect(factors.scoreStability).toBeDefined();
    expect(factors.dataQuality).toBeDefined();
    expect(factors.matchClarity).toBeDefined();

    // Low data quality should result in low confidence
    expect(confidence).toBeLessThan(0.6);
  });
});
```

### Step 2 — Create Fallback Mode Integration Tests

Create `backend/src/services/__tests__/fallbackMode.integration.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  enableFallbackMode,
  disableFallbackMode,
  checkSystemHealthAndUpdateFallbackMode,
  updateWorkerHeartbeat,
} from '../fallbackModeService';
import { redis } from '@/db/redis';
import { screeningQueue } from '@/queues/screeningQueue';

describe('Fallback Mode Integration', () => {
  beforeEach(async () => {
    // Clear fallback mode state
    await disableFallbackMode();
    // Clear queue
    await screeningQueue.drain();
  });

  afterEach(async () => {
    await disableFallbackMode();
  });

  it('should enable fallback mode when queue depth > 100', async () => {
    // Add 101 jobs to queue
    const jobs = [];
    for (let i = 0; i < 101; i++) {
      jobs.push(
        screeningQueue.add('screen-application', {
          applicationId: `app-${i}`,
          resumeId: `resume-${i}`,
          triggeredBy: 'test',
        })
      );
    }
    await Promise.all(jobs);

    // Check system health
    const state = await checkSystemHealthAndUpdateFallbackMode();

    expect(state.active).toBe(true);
    expect(state.reason).toBe('high_queue_depth');
    expect(state.queueDepth).toBeGreaterThan(100);
  });

  it('should enable fallback mode when worker offline > 5 minutes', async () => {
    // Simulate worker offline by not updating heartbeat
    // Set last heartbeat to 6 minutes ago
    const sixMinutesAgo = Date.now() - 6 * 60 * 1000;
    await redis.set('screening_worker:last_seen', sixMinutesAgo.toString());

    // Check system health
    const state = await checkSystemHealthAndUpdateFallbackMode();

    expect(state.active).toBe(true);
    expect(state.reason).toBe('worker_offline');
  });

  it('should disable fallback mode when queue depth < 20 and worker online', async () => {
    // Enable fallback mode
    await enableFallbackMode('high_queue_depth', { queueDepth: 150 });

    // Update worker heartbeat (mark as online)
    await updateWorkerHeartbeat();

    // Ensure queue is empty
    await screeningQueue.drain();

    // Check system health
    const state = await checkSystemHealthAndUpdateFallbackMode();

    expect(state.active).toBe(false);
  });

  it('should not disable fallback mode if queue still high', async () => {
    // Enable fallback mode
    await enableFallbackMode('high_queue_depth', { queueDepth: 150 });

    // Worker is online
    await updateWorkerHeartbeat();

    // But queue is still high (50 jobs)
    const jobs = [];
    for (let i = 0; i < 50; i++) {
      jobs.push(
        screeningQueue.add('screen-application', {
          applicationId: `app-${i}`,
          resumeId: `resume-${i}`,
          triggeredBy: 'test',
        })
      );
    }
    await Promise.all(jobs);

    // Check system health
    const state = await checkSystemHealthAndUpdateFallbackMode();

    // Should still be active (queue > 20)
    expect(state.active).toBe(true);
  });
});
```

### Step 3 — Create Application Routing Tests

Create `backend/src/services/__tests__/fallbackRouting.integration.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { submitApplication } from '../applicationService';
import { enableFallbackMode, disableFallbackMode } from '../fallbackModeService';
import { prisma } from '@/db/prisma';
import * as screeningQueue from '@/queues/screeningQueue';

vi.mock('@/queues/screeningQueue');

describe('Fallback Mode Application Routing', () => {
  let candidateId: string;
  let requisitionId: string;
  let resumeId: string;

  beforeEach(async () => {
    await disableFallbackMode();

    const candidate = await prisma.candidate.create({
      data: { name: 'Test', email: 'test@example.com' },
    });
    candidateId = candidate.id;

    const requisition = await prisma.requisition.create({
      data: { title: 'Engineer', requiredSkills: ['Python'] },
    });
    requisitionId = requisition.id;

    const resume = await prisma.resume.create({
      data: {
        candidateId,
        originalFilename: 'test.pdf',
        fileUrl: 'https://example.com/test.pdf',
        status: 'parsed',
        parsedData: { skills: ['Python'] },
      },
    });
    resumeId = resume.id;
  });

  afterEach(async () => {
    await disableFallbackMode();
    await prisma.application.deleteMany();
    await prisma.resume.deleteMany();
    await prisma.requisition.deleteMany();
    await prisma.candidate.deleteMany();
  });

  it('should route to manual review when fallback mode active', async () => {
    // Enable fallback mode
    await enableFallbackMode('worker_offline', { workerOfflineDuration: 600 });

    // Submit application
    const application = await submitApplication({
      candidateId,
      requisitionId,
      resumeId,
    });

    // Verify status and reason
    expect(application.status).toBe('pending_manual_review');
    expect(application.manualReviewReason).toBe('fallback_mode');

    // Verify screening NOT enqueued
    expect(screeningQueue.enqueueScreening).not.toHaveBeenCalled();
  });

  it('should route to screening when fallback mode inactive', async () => {
    // Ensure fallback mode is off
    await disableFallbackMode();

    // Submit application
    const application = await submitApplication({
      candidateId,
      requisitionId,
      resumeId,
    });

    // Verify status
    expect(application.status).toBe('screening');

    // Verify screening enqueued
    expect(screeningQueue.enqueueScreening).toHaveBeenCalledWith({
      applicationId: application.id,
      resumeId,
      triggeredBy: 'application_submission',
    });
  });
});
```

### Step 4 — Create Manual Review Queue Tests

Create `backend/src/services/__tests__/manualReviewQueue.integration.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getManualReviewQueue, getManualReviewQueueStats, markAsReviewed } from '../manualReviewQueueService';
import { prisma } from '@/db/prisma';

describe('Manual Review Queue Integration', () => {
  beforeEach(async () => {
    // Create test data
    const candidate = await prisma.candidate.create({
      data: { name: 'Test Candidate', email: 'test@example.com' },
    });

    const requisition = await prisma.requisition.create({
      data: { title: 'Engineer', requiredSkills: ['Python'] },
    });

    // Create 3 applications in manual review
    for (let i = 0; i < 3; i++) {
      await prisma.application.create({
        data: {
          candidateId: candidate.id,
          requisitionId: requisition.id,
          status: 'pending_manual_review',
          manualReviewReason: i === 0 ? 'low_confidence' : 'fallback_mode',
        },
      });
    }
  });

  afterEach(async () => {
    await prisma.application.deleteMany();
    await prisma.requisition.deleteMany();
    await prisma.candidate.deleteMany();
  });

  it('should fetch manual review queue with pagination', async () => {
    const result = await getManualReviewQueue({}, { page: 1, pageSize: 10 });

    expect(result.items).toHaveLength(3);
    expect(result.total).toBe(3);
    expect(result.page).toBe(1);
  });

  it('should filter by manual review reason', async () => {
    const result = await getManualReviewQueue(
      { reason: 'low_confidence' },
      { page: 1, pageSize: 10 }
    );

    expect(result.items).toHaveLength(1);
    expect(result.items[0].manualReviewReason).toBe('low_confidence');
  });

  it('should return queue statistics', async () => {
    const stats = await getManualReviewQueueStats();

    expect(stats.total).toBe(3);
    expect(stats.byReason.low_confidence).toBe(1);
    expect(stats.byReason.fallback_mode).toBe(2);
    expect(stats.oldestApplicationAge).toBeGreaterThanOrEqual(0);
  });

  it('should mark application as reviewed', async () => {
    const applications = await prisma.application.findMany({
      where: { status: 'pending_manual_review' },
    });
    const appId = applications[0].id;

    await markAsReviewed(appId, 'reviewer-1', 'shortlisted', 'Good candidate');

    const updated = await prisma.application.findUnique({ where: { id: appId } });
    expect(updated?.status).toBe('shortlisted');
    expect(updated?.reviewedBy).toBe('reviewer-1');
    expect(updated?.reviewNotes).toBe('Good candidate');
  });
});
```

---

## Acceptance Criteria

- [ ] Low-confidence screening routes to manual review
- [ ] High queue depth triggers fallback mode
- [ ] Worker offline triggers fallback mode
- [ ] Fallback mode auto-recovers
- [ ] Applications bypass screening during fallback
- [ ] Manual review queue operations work correctly

---

## Testing Checklist

- [ ] Integration test: Low confidence escalation (2+ tests)
- [ ] Integration test: Fallback mode triggers (4+ tests)
- [ ] Integration test: Application routing (2+ tests)
- [ ] Integration test: Manual review queue (4+ tests)
- [ ] All tests passing
- [ ] Test coverage >80% for new code

---

## Dependencies

- All backend services (TASK-001 through TASK-004)
- Test database setup
- Redis test instance

---

## Definition of Done

- [ ] Low-confidence escalation tests created
- [ ] Fallback mode tests created
- [ ] Application routing tests created
- [ ] Manual review queue tests created
- [ ] All integration tests passing (12+ tests)
- [ ] Test coverage report generated
