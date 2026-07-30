---
id: task_003
us_id: us_003
epic: EP-003
title: "Create Screening Service with Recommendation Routing"
status: done
layer: backend
effort: 3h
priority: critical
created: 2026-07-24
completed: 2026-07-24
---

# TASK-003 — Create Screening Service with Recommendation Routing

## Context

**User Story**: US-003 — AI Screening Score Computation with Configurable Thresholds  
**Epic**: EP-003 — AI Resume Parsing  
**Addresses**: All scenarios (score computation, recommendation, routing)

Create the orchestration service that combines scoring algorithm, threshold evaluation, and recommendation routing. Ensures scores are written within 60s SLA and routes applications to appropriate queues.

---

## Objective

Implement screening service that:
1. Fetches parsed resume data and requisition requirements
2. Computes screening score using scoring algorithm
3. Determines recommendation based on active thresholds
4. Stores screening result with threshold version
5. Routes to appropriate queue (shortlist, manual review, auto-reject)

---

## Implementation Steps

### Step 1 — Create Screening Service

Create `backend/src/services/screeningService.ts`:

```typescript
import prisma from '../db/prisma';
import { computeScreeningScore } from './scoringService';
import { getActiveThresholds, getRecommendation } from './thresholdService';
import { auditEvent } from './auditService';
import logger from '../utils/logger';

export interface ScreeningResult {
  id: string;
  applicationId: string;
  score: number;
  recommendation: 'shortlist' | 'manual_review' | 'reject';
  factors: any;
  thresholdVersion: number;
}

export class ScreeningError extends Error {
  code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = 'ScreeningError';
    this.code = code;
  }
}

export async function performScreening(applicationId: string): Promise<ScreeningResult> {
  const startTime = Date.now();

  try {
    // 1. Fetch application with parsed resume and requisition
    const application = await prisma.application.findUnique({
      where: { id: applicationId },
      include: {
        resume: true,
        requisition: {
          select: {
            id: true,
            title: true,
            requiredSkills: true,
            preferredSkills: true,
            minExperienceYears: true,
            educationLevel: true,
          },
        },
        candidate: {
          include: {
            profile: true,
          },
        },
      },
    });

    if (!application) {
      throw new ScreeningError('Application not found', 'APPLICATION_NOT_FOUND');
    }

    if (!application.resume) {
      throw new ScreeningError('Resume not found for application', 'RESUME_NOT_FOUND');
    }

    if (!application.resume.parsedData) {
      throw new ScreeningError('Resume not parsed yet', 'RESUME_NOT_PARSED');
    }

    // 2. Get active thresholds
    const thresholds = await getActiveThresholds();

    // 3. Compute screening score
    const { score, factors } = computeScreeningScore({
      parsedData: application.resume.parsedData as any,
      requisition: {
        requiredSkills: application.requisition.requiredSkills as string[],
        preferredSkills: application.requisition.preferredSkills as string[],
        minExperienceYears: application.requisition.minExperienceYears,
        educationLevel: application.requisition.educationLevel,
      },
    });

    // 4. Determine recommendation
    const recommendation = getRecommendation(score, thresholds);

    // 5. Store screening result
    const screening = await prisma.screening.create({
      data: {
        applicationId,
        score,
        recommendation,
        factors: factors as any,
        thresholdVersion: thresholds.version,
        screenedAt: new Date(),
      },
    });

    // 6. Update application status based on recommendation
    let newStatus: string;
    switch (recommendation) {
      case 'shortlist':
        newStatus = 'shortlisted';
        break;
      case 'manual_review':
        newStatus = 'pending_review';
        break;
      case 'reject':
        newStatus = 'screening_rejected';
        break;
    }

    await prisma.application.update({
      where: { id: applicationId },
      data: { status: newStatus },
    });

    // 7. Log audit event
    await auditEvent({
      entityType: 'application',
      entityId: applicationId,
      action: `screening.${recommendation}`,
      actorId: 'system',
      metadata: {
        score,
        recommendation,
        thresholdVersion: thresholds.version,
        candidateId: application.candidateId,
      },
    });

    const elapsed = Date.now() - startTime;
    logger.info('Screening completed', {
      applicationId,
      score,
      recommendation,
      elapsed: `${elapsed}ms`,
      candidateId: application.candidateId,
    });

    return {
      id: screening.id,
      applicationId,
      score,
      recommendation,
      factors,
      thresholdVersion: thresholds.version,
    };
  } catch (error) {
    const elapsed = Date.now() - startTime;
    logger.error('Screening failed', {
      applicationId,
      elapsed: `${elapsed}ms`,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

export async function getScreeningByApplication(
  applicationId: string
): Promise<ScreeningResult | null> {
  const screening = await prisma.screening.findFirst({
    where: { applicationId },
    orderBy: { screenedAt: 'desc' },
  });

  if (!screening) {
    return null;
  }

  return {
    id: screening.id,
    applicationId: screening.applicationId,
    score: screening.score,
    recommendation: screening.recommendation as any,
    factors: screening.factors,
    thresholdVersion: screening.thresholdVersion,
  };
}
```

### Step 2 — Create Screening API Endpoints

Create `backend/src/routes/screenings.ts`:

```typescript
import { Router } from 'express';
import { performScreening, getScreeningByApplication } from '../services/screeningService';
import { authenticate } from '../middleware/authenticate';
import logger from '../utils/logger';

const router = Router();

// POST /api/screenings/perform
// Manually trigger screening (for testing/admin use)
router.post('/perform', authenticate, async (req, res) => {
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

    const result = await performScreening(applicationId);

    res.status(200).json(result);
  } catch (error) {
    logger.error('Screening endpoint error', { error });
    res.status(500).json({
      error: {
        code: 'SCREENING_FAILED',
        message: error instanceof Error ? error.message : 'Screening failed',
      },
    });
  }
});

// GET /api/screenings/application/:applicationId
// Get screening result for an application
router.get('/application/:applicationId', authenticate, async (req, res) => {
  try {
    const { applicationId } = req.params;

    const screening = await getScreeningByApplication(applicationId);

    if (!screening) {
      return res.status(404).json({
        error: {
          code: 'SCREENING_NOT_FOUND',
          message: 'No screening found for this application',
        },
      });
    }

    res.json(screening);
  } catch (error) {
    logger.error('Get screening error', { error });
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch screening',
      },
    });
  }
});

export default router;
```

### Step 3 — Register Routes

Update `backend/src/app.ts`:

```typescript
import screeningsRouter from './routes/screenings';
import thresholdsRouter from './routes/admin/thresholds';

// ... in createApp():
app.use('/api/screenings', screeningsRouter);
app.use('/api/admin/thresholds', thresholdsRouter);
```

---

## Acceptance Criteria

- [ ] Screening completes within 60s (typically <2s)
- [ ] Score and factors stored in database
- [ ] Threshold version captured for audit trail
- [ ] Application status updated based on recommendation
- [ ] Shortlisted applications routed to HR review queue
- [ ] Rejected applications routed to auto-rejection flow
- [ ] Manual review applications flagged appropriately

---

## Testing Checklist

- [ ] Unit test: Screening with score 80 → shortlist recommendation
- [ ] Unit test: Screening with score 35 → reject recommendation
- [ ] Unit test: Screening with score 55 → manual_review recommendation
- [ ] Integration test: Full screening flow end-to-end
- [ ] Integration test: Application status updated correctly
- [ ] Integration test: Threshold version stored
- [ ] Performance test: Screening completes in <2s

---

## Dependencies

- Scoring service (TASK-002)
- Threshold service (TASK-001)
- Prisma schema with Screening model
- Application status enum updated

---

## Definition of Done

- [ ] Screening service created
- [ ] API endpoints created and tested
- [ ] Routes registered in app.ts
- [ ] Application status routing working
- [ ] Audit logging implemented
- [ ] Performance validated (<60s SLA, typically <2s)
