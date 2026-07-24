---
id: task_003
us_id: us_004
epic: EP-002
title: "Create Application Withdrawal Service and API Endpoint"
status: done
layer: backend
effort: 3h
priority: high
created: 2026-07-24
completed: 2026-07-24
---

# TASK-003 — Create Application Withdrawal Service and API Endpoint

## Context

**User Story**: US-004 — Application Submission Confirmation and Pre-Review Withdrawal  
**Epic**: EP-002 — Job Application Submission  
**Addresses**: Scenario 3 (withdrawal allowed before review), Scenario 4 (blocked after review)

Implement business logic and API endpoint for candidates to withdraw their application before HR review begins. After review starts, withdrawal is blocked.

---

## Objective

Create withdrawal service that:
1. Validates application status (only 'submitted' can be withdrawn)
2. Updates status to 'withdrawn'
3. Sends withdrawal confirmation email
4. Logs audit event
5. Returns appropriate errors for invalid withdrawals

---

## Implementation

### 1. Withdrawal Service

**File**: `backend/src/services/applicationWithdrawalService.ts`

```typescript
import prisma from '../db/prisma';
import { auditEvent } from './auditService';
import { sendApplicationWithdrawnEmail } from './emailService';
import logger from '../utils/logger';
import type { Application } from '@prisma/client';

export interface WithdrawApplicationParams {
  applicationId: string;
  candidateId: string;
}

export class WithdrawalError extends Error {
  constructor(
    public code: string,
    message: string
  ) {
    super(message);
    this.name = 'WithdrawalError';
  }
}

/**
 * Withdraw application before HR review
 * Only allows withdrawal when status is 'submitted'
 */
export async function withdrawApplication(
  params: WithdrawApplicationParams
): Promise<Application> {
  const { applicationId, candidateId } = params;

  try {
    logger.debug('Attempting to withdraw application', { applicationId, candidateId });

    // Fetch application with relations
    const application = await prisma.application.findUnique({
      where: { id: applicationId },
      include: {
        requisition: true,
        candidate: {
          include: {
            profile: true,
          },
        },
      },
    });

    if (!application) {
      throw new WithdrawalError('APPLICATION_NOT_FOUND', 'Application not found');
    }

    // Verify ownership
    if (application.candidateId !== candidateId) {
      throw new WithdrawalError(
        'UNAUTHORIZED',
        'You are not authorized to withdraw this application'
      );
    }

    // Check if withdrawal is allowed (only 'submitted' status)
    if (application.status !== 'submitted') {
      const readableStatus = application.status.replace(/_/g, ' ');
      throw new WithdrawalError(
        'WITHDRAWAL_NOT_ALLOWED',
        `Cannot withdraw application with status "${readableStatus}". Withdrawal is only allowed for submitted applications that have not entered review.`
      );
    }

    // Update status to withdrawn
    const withdrawnApplication = await prisma.application.update({
      where: { id: applicationId },
      data: {
        status: 'withdrawn',
        updatedAt: new Date(),
      },
      include: {
        requisition: true,
        candidate: {
          include: {
            profile: true,
          },
        },
      },
    });

    // Audit event
    await auditEvent({
      entityType: 'application',
      entityId: withdrawnApplication.id,
      action: 'application.withdrawn',
      actorId: candidateId,
      metadata: {
        requisitionId: withdrawnApplication.requisitionId,
        withdrawnAt: withdrawnApplication.updatedAt,
        previousStatus: 'submitted',
      },
    });

    // Send withdrawal confirmation email (async)
    setImmediate(async () => {
      try {
        await sendApplicationWithdrawnEmail({
          candidateEmail: withdrawnApplication.candidate.email,
          candidateName: withdrawnApplication.candidate.profile?.fullName || 'Candidate',
          requisitionTitle: withdrawnApplication.requisition.title,
          applicationId: withdrawnApplication.id,
          withdrawnAt: withdrawnApplication.updatedAt,
        });
      } catch (error) {
        logger.error('Withdrawal email failed but withdrawal succeeded', {
          applicationId: withdrawnApplication.id,
          error,
        });
      }
    });

    logger.info('Application withdrawn successfully', {
      applicationId: withdrawnApplication.id,
      candidateId,
      requisitionId: withdrawnApplication.requisitionId,
    });

    return withdrawnApplication;
  } catch (error) {
    if (error instanceof WithdrawalError) {
      throw error;
    }

    logger.error('Failed to withdraw application', {
      applicationId,
      candidateId,
      error: error instanceof Error ? error.message : String(error),
    });

    throw new WithdrawalError('WITHDRAWAL_FAILED', 'Failed to withdraw application');
  }
}

/**
 * Check if application can be withdrawn
 */
export async function canWithdrawApplication(
  params: WithdrawApplicationParams
): Promise<{ canWithdraw: boolean; reason?: string }> {
  const { applicationId, candidateId } = params;

  const application = await prisma.application.findUnique({
    where: { id: applicationId },
  });

  if (!application) {
    return { canWithdraw: false, reason: 'Application not found' };
  }

  if (application.candidateId !== candidateId) {
    return { canWithdraw: false, reason: 'Not authorized' };
  }

  if (application.status !== 'submitted') {
    const readableStatus = application.status.replace(/_/g, ' ');
    return {
      canWithdraw: false,
      reason: `Application is ${readableStatus} and cannot be withdrawn`,
    };
  }

  return { canWithdraw: true };
}
```

### 2. API Endpoint

**File**: `backend/src/routes/applications.ts` (new or modify existing)

```typescript
import express from 'express';
import { z } from 'zod';
import {
  withdrawApplication,
  canWithdrawApplication,
  WithdrawalError,
} from '../services/applicationWithdrawalService';
import { authenticate } from '../middleware/authenticate';
import logger from '../utils/logger';

const router = express.Router();

/**
 * PATCH /api/applications/:id/withdraw
 * Withdraw application before HR review
 */
router.patch('/:id/withdraw', authenticate, async (req, res) => {
  try {
    const applicationId = req.params.id;

    if (!z.string().uuid().safeParse(applicationId).success) {
      return res.status(400).json({
        error: {
          code: 'INVALID_APPLICATION_ID',
          message: 'Invalid application ID format',
        },
      });
    }

    const candidateId = req.user!.id;

    const application = await withdrawApplication({ applicationId, candidateId });

    return res.status(200).json({
      id: application.id,
      status: application.status,
      message: 'Application withdrawn successfully',
    });
  } catch (error) {
    if (error instanceof WithdrawalError) {
      const statusCode = error.code === 'APPLICATION_NOT_FOUND' ? 404 
        : error.code === 'UNAUTHORIZED' ? 403
        : error.code === 'WITHDRAWAL_NOT_ALLOWED' ? 409
        : 400;

      return res.status(statusCode).json({
        error: {
          code: error.code,
          message: error.message,
        },
      });
    }

    logger.error('Error withdrawing application', {
      error: error instanceof Error ? error.message : String(error),
      candidateId: req.user?.id,
      applicationId: req.params.id,
    });

    return res.status(500).json({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An error occurred while withdrawing the application',
      },
    });
  }
});

/**
 * GET /api/applications/:id/can-withdraw
 * Check if application can be withdrawn
 */
router.get('/:id/can-withdraw', authenticate, async (req, res) => {
  try {
    const applicationId = req.params.id;
    const candidateId = req.user!.id;

    const result = await canWithdrawApplication({ applicationId, candidateId });

    return res.status(200).json(result);
  } catch (error) {
    logger.error('Error checking withdrawal eligibility', {
      error: error instanceof Error ? error.message : String(error),
      candidateId: req.user?.id,
      applicationId: req.params.id,
    });

    return res.status(500).json({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An error occurred while checking withdrawal eligibility',
      },
    });
  }
});

export default router;
```

### 3. Register Route

**File**: `backend/src/app.ts`

```typescript
import applicationsRouter from './routes/applications';

// ... existing routes
app.use('/api/applications', applicationsRouter);
```

---

## Acceptance Criteria

- [ ] `withdrawApplication()` function validates status is 'submitted'
- [ ] Returns `WithdrawalError` with code 'WITHDRAWAL_NOT_ALLOWED' for non-submitted applications
- [ ] Updates status to 'withdrawn' and sets updatedAt timestamp
- [ ] Verifies candidate owns the application (authorization)
- [ ] Sends withdrawal confirmation email asynchronously
- [ ] Logs audit event with action 'application.withdrawn'
- [ ] PATCH `/api/applications/:id/withdraw` endpoint created
- [ ] GET `/api/applications/:id/can-withdraw` endpoint created
- [ ] Returns HTTP 409 when withdrawal not allowed
- [ ] Returns HTTP 403 for unauthorized withdrawal attempts
- [ ] Returns HTTP 404 for non-existent applications

---

## Testing

**Unit Test**:
```typescript
describe('applicationWithdrawalService', () => {
  it('should withdraw submitted application successfully', async () => {
    const application = await withdrawApplication({
      applicationId: 'app-id',
      candidateId: 'candidate-id',
    });

    expect(application.status).toBe('withdrawn');
  });

  it('should throw error when withdrawing non-submitted application', async () => {
    await expect(
      withdrawApplication({
        applicationId: 'app-in-review-id',
        candidateId: 'candidate-id',
      })
    ).rejects.toThrow('WITHDRAWAL_NOT_ALLOWED');
  });

  it('should throw error when candidate does not own application', async () => {
    await expect(
      withdrawApplication({
        applicationId: 'app-id',
        candidateId: 'wrong-candidate-id',
      })
    ).rejects.toThrow('UNAUTHORIZED');
  });
});
```

**Integration Test**:
```typescript
describe('PATCH /api/applications/:id/withdraw', () => {
  it('should withdraw submitted application and return 200', async () => {
    const response = await request(app)
      .patch(`/api/applications/${applicationId}/withdraw`)
      .set('Cookie', [`token=${candidateToken}`]);

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('withdrawn');
  });

  it('should return HTTP 409 when application is under review', async () => {
    const response = await request(app)
      .patch(`/api/applications/${inReviewAppId}/withdraw`)
      .set('Cookie', [`token=${candidateToken}`]);

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('WITHDRAWAL_NOT_ALLOWED');
  });
});
```

---

## Dependencies

- TASK-001 (email templates)
- TASK-002 (email service)
- Audit service (existing)
- Authenticate middleware (existing)

---

## Effort

**Estimated**: 3 hours
- Service layer: 1.5h
- API endpoints: 1h
- Testing: 0.5h
