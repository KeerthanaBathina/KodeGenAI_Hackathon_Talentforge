---
id: task_004
us_id: us_005
epic: EP-003
title: "Fallback Mode Application Routing and Bypass Logic"
status: done
layer: backend
effort: 1.5h
priority: high
created: 2026-07-24
completed: 2026-07-24
---

# TASK-004 — Fallback Mode Application Routing and Bypass Logic

## Context

**User Story**: US-005 — Low-Confidence Escalation to Manual Review and AI Fallback Mode  
**Epic**: EP-003 — AI Resume Parsing  
**Addresses**: Scenario 2 (applications routed directly to manual review when fallback active)

Implement application submission routing logic that bypasses AI screening when fallback mode is active.

---

## Objective

Route applications appropriately based on fallback mode state:
1. Check fallback mode on application submission
2. Route to manual review queue when fallback active
3. Route to AI screening queue when fallback inactive
4. Log routing decisions for audit

---

## Implementation Steps

### Step 1 — Update Application Service

Update `backend/src/services/applicationService.ts`:

```typescript
import { getFallbackModeState } from '@/services/fallbackModeService';
import { enqueueScreening } from '@/queues/screeningQueue';
import { auditService } from '@/services/auditService';

/**
 * Submit application and route based on fallback mode
 */
export async function submitApplication(data: {
  candidateId: string;
  requisitionId: string;
  resumeId: string;
  coverLetter?: string;
}) {
  // Create application
  const application = await prisma.application.create({
    data: {
      candidateId: data.candidateId,
      requisitionId: data.requisitionId,
      status: 'pending', // Temporary status
      coverLetter: data.coverLetter,
      resumes: {
        connect: { id: data.resumeId },
      },
    },
  });

  // Check fallback mode
  const fallbackMode = await getFallbackModeState();

  if (fallbackMode.active) {
    // Bypass AI screening - route directly to manual review
    await prisma.application.update({
      where: { id: application.id },
      data: {
        status: 'pending_manual_review',
        manualReviewReason: 'fallback_mode',
      },
    });

    await auditService.logEvent({
      entity: 'application',
      entityId: application.id,
      action: 'routed_to_manual_review',
      metadata: {
        reason: 'fallback_mode_active',
        fallbackReason: fallbackMode.reason,
      },
    });

    console.log(`[ApplicationService] Routed application ${application.id} to manual review (fallback mode active)`);
  } else {
    // Normal flow - update status and enqueue screening
    await prisma.application.update({
      where: { id: application.id },
      data: { status: 'screening' },
    });

    // Enqueue AI screening
    await enqueueScreening({
      applicationId: application.id,
      resumeId: data.resumeId,
      triggeredBy: 'application_submission',
    });

    await auditService.logEvent({
      entity: 'application',
      entityId: application.id,
      action: 'screening_enqueued',
      metadata: { resumeId: data.resumeId },
    });

    console.log(`[ApplicationService] Enqueued screening for application ${application.id}`);
  }

  return application;
}
```

### Step 2 — Update Resume Parse Service

Update `backend/src/services/parseResultService.ts`:

```typescript
import { getFallbackModeState } from '@/services/fallbackModeService';

/**
 * Process parsed resume result
 */
export async function processParseResult(params: {
  resumeId: string;
  applicationId?: string;
  parsedData: any;
}) {
  // ... existing code to update resume with parsedData ...

  // If associated with application, trigger screening
  if (params.applicationId) {
    const fallbackMode = await getFallbackModeState();

    if (fallbackMode.active) {
      // Fallback mode - route to manual review
      await prisma.application.update({
        where: { id: params.applicationId },
        data: {
          status: 'pending_manual_review',
          manualReviewReason: 'fallback_mode',
        },
      });

      console.log(`[ParseResult] Application ${params.applicationId} routed to manual review (fallback mode)`);
    } else {
      // Normal flow - enqueue screening
      setImmediate(async () => {
        await enqueueScreening({
          applicationId: params.applicationId!,
          resumeId: params.resumeId,
          triggeredBy: 'parsing',
        });
      });

      console.log(`[ParseResult] Enqueued screening for application ${params.applicationId}`);
    }
  }
}
```

### Step 3 — Add Fallback Mode Check Middleware (Optional)

Create `backend/src/middleware/fallbackModeCheck.ts`:

```typescript
import { Request, Response, NextFunction } from 'express';
import { getFallbackModeState } from '@/services/fallbackModeService';

/**
 * Middleware to attach fallback mode state to request
 */
export async function attachFallbackModeState(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const fallbackMode = await getFallbackModeState();
    req.fallbackMode = fallbackMode;
    next();
  } catch (error) {
    console.error('[FallbackModeMiddleware] Failed to get fallback mode state:', error);
    // Don't block request - continue without fallback mode info
    req.fallbackMode = { active: false };
    next();
  }
}

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      fallbackMode?: {
        active: boolean;
        reason?: string;
      };
    }
  }
}
```

### Step 4 — Add Unit Tests

Create `backend/src/services/__tests__/fallbackModeRouting.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { submitApplication } from '../applicationService';
import * as fallbackModeService from '../fallbackModeService';
import * as screeningQueue from '@/queues/screeningQueue';

vi.mock('../fallbackModeService');
vi.mock('@/queues/screeningQueue');
vi.mock('@/db/prisma');

describe('Fallback Mode Application Routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should route to manual review when fallback mode active', async () => {
    vi.mocked(fallbackModeService.getFallbackModeState).mockResolvedValue({
      active: true,
      reason: 'high_queue_depth',
    });

    const application = await submitApplication({
      candidateId: 'candidate-1',
      requisitionId: 'req-1',
      resumeId: 'resume-1',
    });

    // Should NOT enqueue screening
    expect(screeningQueue.enqueueScreening).not.toHaveBeenCalled();

    // Should update status to pending_manual_review
    // (verify via Prisma mock call)
  });

  it('should enqueue screening when fallback mode inactive', async () => {
    vi.mocked(fallbackModeService.getFallbackModeState).mockResolvedValue({
      active: false,
    });

    const application = await submitApplication({
      candidateId: 'candidate-1',
      requisitionId: 'req-1',
      resumeId: 'resume-1',
    });

    // Should enqueue screening
    expect(screeningQueue.enqueueScreening).toHaveBeenCalledWith({
      applicationId: expect.any(String),
      resumeId: 'resume-1',
      triggeredBy: 'application_submission',
    });
  });

  it('should set manualReviewReason to "fallback_mode"', async () => {
    vi.mocked(fallbackModeService.getFallbackModeState).mockResolvedValue({
      active: true,
      reason: 'worker_offline',
    });

    const application = await submitApplication({
      candidateId: 'candidate-1',
      requisitionId: 'req-1',
      resumeId: 'resume-1',
    });

    // Verify manualReviewReason set
    // (check Prisma update call)
  });
});
```

---

## Acceptance Criteria

- [ ] Applications submitted during fallback mode route to `pending_manual_review`
- [ ] Applications submitted outside fallback mode route to AI screening
- [ ] Manual review reason set to "fallback_mode" for bypassed applications
- [ ] Audit log records routing decisions
- [ ] Resume parse service checks fallback mode before triggering screening

---

## Testing Checklist

- [ ] Unit test: Fallback active routes to manual review
- [ ] Unit test: Fallback inactive enqueues screening
- [ ] Unit test: Manual review reason set correctly
- [ ] Integration test: End-to-end application submission with fallback
- [ ] Integration test: Fallback deactivation resumes normal flow

---

## Dependencies

- Fallback mode service (TASK-002)
- Application service
- Resume parse service
- Screening queue

---

## Definition of Done

- [ ] Application routing logic implemented
- [ ] Resume parse service updated
- [ ] Fallback mode check added
- [ ] Unit tests passing (5+ tests)
- [ ] Integration tests passing
- [ ] Audit logging implemented
