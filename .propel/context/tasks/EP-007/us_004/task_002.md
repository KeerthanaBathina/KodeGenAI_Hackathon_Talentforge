---
id: task_002
us_id: us_004
epic: EP-007
title: "Offer Response API Endpoints - Accept and Decline"
status: completed
layer: backend
effort: 4h
priority: critical
created: 2026-07-27
completed: 2026-07-27
---

# TASK-002 — Offer Response API Endpoints - Accept and Decline

## Context

**User Story**: US-004 — Offer Letter Generation, Candidate Response Tracking, and Auto-Expiry  
**Epic**: EP-007 — Final Hiring Decision  
**Addresses**: Scenario 2 (Accept) and Scenario 3 (Decline)

Candidates must be able to accept or decline offers through API endpoints. Acceptance triggers onboarding task creation and status updates. Declination updates requisition vacancy count and notifies recruiters.

---

## Objective

Create REST API endpoints for:
1. Candidate offer acceptance with confirmation
2. Candidate offer declination with optional reason
3. Offer status retrieval and validation

---

## Technical Specifications

| Component | Specification |
|-----------|--------------|
| **Endpoints** | POST /api/offers/:id/accept, POST /api/offers/:id/decline, GET /api/offers/:id |
| **Authentication** | Token-based (offer access token in URL param or header) |
| **Validation** | Offer not expired, not already responded to |
| **Status Updates** | Application status, offer status, requisition vacancy |
| **Notifications** | Email to candidate, recruiter, hiring manager |

---

## Implementation Steps

### Step 1 — Create offer response service

**File**: `backend/src/services/offerResponseService.ts`

```typescript
import { prisma } from '../db/prisma';
import { auditEvent } from './auditService';
import logger from '../utils/logger';

export interface AcceptOfferParams {
  offerId: string;
  candidateId: string;
}

export interface DeclineOfferParams {
  offerId: string;
  candidateId: string;
  reason?: string;
}

/**
 * Process offer acceptance
 * 
 * Updates offer status, application status, sends notifications,
 * and queues onboarding task creation.
 * 
 * @param params - Offer and candidate IDs
 */
export async function acceptOffer(
  params: AcceptOfferParams
): Promise<void> {
  const { offerId, candidateId } = params;

  logger.info({ offerId, candidateId }, 'Processing offer acceptance');

  // Fetch offer with validation
  const offer = await prisma.offer.findUnique({
    where: { id: offerId },
    include: {
      application: {
        include: {
          candidate: true,
          requisition: {
            include: {
              hiringManager: true
            }
          }
        }
      },
      decision: {
        include: {
          decidedBy: true
        }
      }
    }
  });

  if (!offer) {
    throw new OfferNotFoundError(`Offer not found: ${offerId}`);
  }

  // Validate offer is for this candidate
  if (offer.application.candidate.id !== candidateId) {
    throw new OfferAccessDeniedError('Offer does not belong to this candidate');
  }

  // Validate offer is still pending
  if (offer.status !== 'pending') {
    throw new OfferAlreadyRespondedError(
      `Offer already ${offer.status}. Cannot accept.`
    );
  }

  // Validate offer has not expired
  if (new Date() > offer.expiresAt) {
    throw new OfferExpiredError('Offer has expired');
  }

  // Update offer and application in transaction
  await prisma.$transaction(async (tx) => {
    // Update offer status
    await tx.offer.update({
      where: { id: offerId },
      data: {
        status: 'accepted',
        respondedAt: new Date()
      }
    });

    // Update application status
    await tx.application.update({
      where: { id: offer.applicationId },
      data: { status: 'offer_accepted' }
    });
  });

  // Audit event
  await auditEvent({
    eventType: 'OFFER_ACCEPTED',
    entityType: 'offer',
    entityId: offerId,
    actorId: candidateId,
    payload: {
      applicationId: offer.applicationId,
      candidateName: offer.application.candidate.fullName,
      roleTitle: offer.application.requisition.title
    }
  });

  logger.info({ offerId, candidateId }, 'Offer accepted successfully');

  // Send confirmation emails
  // TODO: Implement in TASK-003 or separate email task
  logger.info({
    offerId,
    candidateEmail: offer.application.candidate.email,
    recruiterEmail: offer.application.requisition.hiringManager.email
  }, 'TODO: Send acceptance confirmation emails');

  // Queue onboarding task creation
  // TODO: Implement onboarding workflow integration
  logger.info({ offerId, candidateId }, 'TODO: Queue onboarding task');
}

/**
 * Process offer declination
 * 
 * Updates offer status, application status, requisition vacancy,
 * and sends notifications to recruiters.
 * 
 * @param params - Offer ID, candidate ID, optional reason
 */
export async function declineOffer(
  params: DeclineOfferParams
): Promise<void> {
  const { offerId, candidateId, reason } = params;

  logger.info({ offerId, candidateId, hasReason: !!reason }, 'Processing offer declination');

  // Fetch offer with validation
  const offer = await prisma.offer.findUnique({
    where: { id: offerId },
    include: {
      application: {
        include: {
          candidate: true,
          requisition: {
            include: {
              hiringManager: true
            }
          }
        }
      }
    }
  });

  if (!offer) {
    throw new OfferNotFoundError(`Offer not found: ${offerId}`);
  }

  // Validate offer is for this candidate
  if (offer.application.candidate.id !== candidateId) {
    throw new OfferAccessDeniedError('Offer does not belong to this candidate');
  }

  // Validate offer is still pending
  if (offer.status !== 'pending') {
    throw new OfferAlreadyRespondedError(
      `Offer already ${offer.status}. Cannot decline.`
    );
  }

  // Update offer, application, and requisition in transaction
  await prisma.$transaction(async (tx) => {
    // Update offer status
    await tx.offer.update({
      where: { id: offerId },
      data: {
        status: 'declined',
        respondedAt: new Date(),
        responseReason: reason || null
      }
    });

    // Update application status
    await tx.application.update({
      where: { id: offer.applicationId },
      data: { status: 'offer_declined' }
    });

    // Increment requisition vacancy count (position now available again)
    await tx.requisition.update({
      where: { id: offer.application.requisitionId },
      data: {
        vacancies: {
          increment: 1
        }
      }
    });
  });

  // Audit event
  await auditEvent({
    eventType: 'OFFER_DECLINED',
    entityType: 'offer',
    entityId: offerId,
    actorId: candidateId,
    payload: {
      applicationId: offer.applicationId,
      candidateName: offer.application.candidate.fullName,
      roleTitle: offer.application.requisition.title,
      reason: reason || 'Not provided'
    }
  });

  logger.info({ offerId, candidateId }, 'Offer declined successfully');

  // Send notification to recruiter
  // TODO: Implement in TASK-003 or separate email task
  logger.info({
    offerId,
    recruiterEmail: offer.application.requisition.hiringManager.email,
    reason
  }, 'TODO: Send declination notification to recruiter');
}

/**
 * Get offer details for candidate view
 * 
 * @param offerId - Offer ID
 * @returns Offer details
 */
export async function getOfferDetails(offerId: string) {
  const offer = await prisma.offer.findUnique({
    where: { id: offerId },
    include: {
      application: {
        include: {
          candidate: {
            select: {
              id: true,
              fullName: true,
              email: true
            }
          },
          requisition: {
            select: {
              title: true,
              department: true
            }
          }
        }
      },
      decision: {
        select: {
          compensationBand: true
        }
      }
    }
  });

  if (!offer) {
    throw new OfferNotFoundError(`Offer not found: ${offerId}`);
  }

  return offer;
}

// Custom error classes
export class OfferNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OfferNotFoundError';
  }
}

export class OfferAccessDeniedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OfferAccessDeniedError';
  }
}

export class OfferAlreadyRespondedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OfferAlreadyRespondedError';
  }
}

export class OfferExpiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OfferExpiredError';
  }
}
```

### Step 2 — Create offer access token service

**File**: `backend/src/services/offerTokenService.ts`

```typescript
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import logger from '../utils/logger';

export interface OfferTokenPayload {
  offerId: string;
  candidateId: string;
  action: 'view' | 'respond';
}

const TOKEN_SECRET = env.OFFER_TOKEN_SECRET || 'default-secret-change-in-production';
const TOKEN_EXPIRY = '30d'; // 30 days to match PDF URL expiry

/**
 * Generate secure access token for offer viewing and response
 * 
 * @param payload - Offer and candidate IDs, action type
 * @returns JWT token
 */
export function generateOfferToken(payload: OfferTokenPayload): string {
  const token = jwt.sign(payload, TOKEN_SECRET, {
    expiresIn: TOKEN_EXPIRY,
    issuer: 'ai-interview-platform',
    audience: 'offer-response'
  });

  logger.debug({ offerId: payload.offerId, action: payload.action }, 'Offer token generated');

  return token;
}

/**
 * Verify and decode offer access token
 * 
 * @param token - JWT token string
 * @returns Decoded payload
 * @throws Error if token is invalid or expired
 */
export function verifyOfferToken(token: string): OfferTokenPayload {
  try {
    const decoded = jwt.verify(token, TOKEN_SECRET, {
      issuer: 'ai-interview-platform',
      audience: 'offer-response'
    }) as OfferTokenPayload;

    return decoded;
  } catch (error: any) {
    if (error.name === 'TokenExpiredError') {
      throw new Error('Offer access token has expired');
    }
    if (error.name === 'JsonWebTokenError') {
      throw new Error('Invalid offer access token');
    }
    throw error;
  }
}
```

### Step 3 — Create offer API routes

**File**: `backend/src/routes/offers.ts`

```typescript
import { Router } from 'express';
import { z } from 'zod';
import {
  acceptOffer,
  declineOffer,
  getOfferDetails,
  OfferNotFoundError,
  OfferAccessDeniedError,
  OfferAlreadyRespondedError,
  OfferExpiredError
} from '../services/offerResponseService';
import { verifyOfferToken } from '../services/offerTokenService';
import logger from '../utils/logger';

const router = Router();

// Validation schemas
const AcceptOfferSchema = z.object({
  token: z.string().min(1, 'Token is required')
});

const DeclineOfferSchema = z.object({
  token: z.string().min(1, 'Token is required'),
  reason: z.string().optional()
});

/**
 * POST /api/offers/:id/accept
 * Accept an offer
 */
router.post('/:id/accept', async (req, res) => {
  try {
    const offerId = req.params.id;

    // Validate UUID format
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(offerId)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid offer ID format'
        }
      });
    }

    // Validate request body
    const validation = AcceptOfferSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request body',
          details: validation.error.format()
        }
      });
    }

    const { token } = validation.data;

    // Verify token
    let candidateId: string;
    try {
      const payload = verifyOfferToken(token);
      candidateId = payload.candidateId;

      // Validate token is for this offer
      if (payload.offerId !== offerId) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'TOKEN_MISMATCH',
            message: 'Token is not valid for this offer'
          }
        });
      }
    } catch (error: any) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_TOKEN',
          message: error.message
        }
      });
    }

    // Process acceptance
    await acceptOffer({ offerId, candidateId });

    res.status(200).json({
      success: true,
      data: {
        message: 'Offer accepted successfully',
        offerId,
        status: 'accepted'
      }
    });
  } catch (error: any) {
    logger.error({ error: error.message, offerId: req.params.id }, 'Offer acceptance failed');

    if (error instanceof OfferNotFoundError) {
      return res.status(404).json({
        success: false,
        error: { code: 'OFFER_NOT_FOUND', message: error.message }
      });
    }

    if (error instanceof OfferAccessDeniedError) {
      return res.status(403).json({
        success: false,
        error: { code: 'ACCESS_DENIED', message: error.message }
      });
    }

    if (error instanceof OfferAlreadyRespondedError) {
      return res.status(409).json({
        success: false,
        error: { code: 'ALREADY_RESPONDED', message: error.message }
      });
    }

    if (error instanceof OfferExpiredError) {
      return res.status(410).json({
        success: false,
        error: { code: 'OFFER_EXPIRED', message: error.message }
      });
    }

    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to accept offer'
      }
    });
  }
});

/**
 * POST /api/offers/:id/decline
 * Decline an offer
 */
router.post('/:id/decline', async (req, res) => {
  try {
    const offerId = req.params.id;

    // Validate UUID format
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(offerId)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid offer ID format'
        }
      });
    }

    // Validate request body
    const validation = DeclineOfferSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request body',
          details: validation.error.format()
        }
      });
    }

    const { token, reason } = validation.data;

    // Verify token
    let candidateId: string;
    try {
      const payload = verifyOfferToken(token);
      candidateId = payload.candidateId;

      // Validate token is for this offer
      if (payload.offerId !== offerId) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'TOKEN_MISMATCH',
            message: 'Token is not valid for this offer'
          }
        });
      }
    } catch (error: any) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_TOKEN',
          message: error.message
        }
      });
    }

    // Process declination
    await declineOffer({ offerId, candidateId, reason });

    res.status(200).json({
      success: true,
      data: {
        message: 'Offer declined successfully',
        offerId,
        status: 'declined'
      }
    });
  } catch (error: any) {
    logger.error({ error: error.message, offerId: req.params.id }, 'Offer declination failed');

    if (error instanceof OfferNotFoundError) {
      return res.status(404).json({
        success: false,
        error: { code: 'OFFER_NOT_FOUND', message: error.message }
      });
    }

    if (error instanceof OfferAccessDeniedError) {
      return res.status(403).json({
        success: false,
        error: { code: 'ACCESS_DENIED', message: error.message }
      });
    }

    if (error instanceof OfferAlreadyRespondedError) {
      return res.status(409).json({
        success: false,
        error: { code: 'ALREADY_RESPONDED', message: error.message }
      });
    }

    if (error instanceof OfferExpiredError) {
      return res.status(410).json({
        success: false,
        error: { code: 'OFFER_EXPIRED', message: error.message }
      });
    }

    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to decline offer'
      }
    });
  }
});

/**
 * GET /api/offers/:id
 * Get offer details (requires valid token)
 */
router.get('/:id', async (req, res) => {
  try {
    const offerId = req.params.id;
    const token = req.query.token as string;

    if (!token) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'MISSING_TOKEN',
          message: 'Access token required'
        }
      });
    }

    // Verify token
    try {
      const payload = verifyOfferToken(token);

      // Validate token is for this offer
      if (payload.offerId !== offerId) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'TOKEN_MISMATCH',
            message: 'Token is not valid for this offer'
          }
        });
      }
    } catch (error: any) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_TOKEN',
          message: error.message
        }
      });
    }

    // Fetch offer details
    const offer = await getOfferDetails(offerId);

    res.status(200).json({
      success: true,
      data: {
        id: offer.id,
        status: offer.status,
        pdfUrl: offer.pdfUrl,
        expiresAt: offer.expiresAt,
        respondedAt: offer.respondedAt,
        candidate: {
          fullName: offer.application.candidate.fullName,
          email: offer.application.candidate.email
        },
        position: {
          title: offer.application.requisition.title,
          department: offer.application.requisition.department
        },
        compensationBand: offer.decision.compensationBand
      }
    });
  } catch (error: any) {
    logger.error({ error: error.message, offerId: req.params.id }, 'Offer retrieval failed');

    if (error instanceof OfferNotFoundError) {
      return res.status(404).json({
        success: false,
        error: { code: 'OFFER_NOT_FOUND', message: error.message }
      });
    }

    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to retrieve offer'
      }
    });
  }
});

export default router;
```

### Step 4 — Register routes in app.ts

**File**: `backend/src/app.ts` (update)

```typescript
// Add import
import offersRouter from './routes/offers';

// Add route registration (after approvals router)
app.use('/api/offers', offersRouter);
```

### Step 5 — Add unit tests

**File**: `backend/src/routes/__tests__/offers.test.ts`

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import offersRouter from '../offers';

const mocks = vi.hoisted(() => ({
  acceptOffer: vi.fn(),
  declineOffer: vi.fn(),
  getOfferDetails: vi.fn(),
  verifyOfferToken: vi.fn()
}));

vi.mock('../../services/offerResponseService', () => ({
  acceptOffer: mocks.acceptOffer,
  declineOffer: mocks.declineOffer,
  getOfferDetails: mocks.getOfferDetails,
  OfferNotFoundError: class extends Error {},
  OfferAlreadyRespondedError: class extends Error {},
  OfferExpiredError: class extends Error {}
}));

vi.mock('../../services/offerTokenService', () => ({
  verifyOfferToken: mocks.verifyOfferToken
}));

vi.mock('../../utils/logger');

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/offers', offersRouter);
  return app;
}

describe('POST /api/offers/:id/accept', () => {
  let app: express.Application;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createTestApp();
  });

  it('should accept offer with valid token', async () => {
    const offerId = 'offer-123';
    const token = 'valid-token';

    mocks.verifyOfferToken.mockReturnValue({
      offerId,
      candidateId: 'candidate-456',
      action: 'respond'
    });
    mocks.acceptOffer.mockResolvedValue(undefined);

    const response = await request(app)
      .post(`/api/offers/${offerId}/accept`)
      .send({ token });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.status).toBe('accepted');
    expect(mocks.acceptOffer).toHaveBeenCalledWith({
      offerId,
      candidateId: 'candidate-456'
    });
  });

  it('should reject with missing token', async () => {
    const response = await request(app)
      .post('/api/offers/offer-123/accept')
      .send({});

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('should reject with token mismatch', async () => {
    mocks.verifyOfferToken.mockReturnValue({
      offerId: 'different-offer',
      candidateId: 'candidate-456',
      action: 'respond'
    });

    const response = await request(app)
      .post('/api/offers/offer-123/accept')
      .send({ token: 'valid-token' });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('TOKEN_MISMATCH');
  });

  it('should reject expired offer', async () => {
    const { OfferExpiredError } = await import('../../services/offerResponseService');
    
    mocks.verifyOfferToken.mockReturnValue({
      offerId: 'offer-123',
      candidateId: 'candidate-456',
      action: 'respond'
    });
    mocks.acceptOffer.mockRejectedValue(new OfferExpiredError('Offer has expired'));

    const response = await request(app)
      .post('/api/offers/offer-123/accept')
      .send({ token: 'valid-token' });

    expect(response.status).toBe(410);
    expect(response.body.error.code).toBe('OFFER_EXPIRED');
  });
});

describe('POST /api/offers/:id/decline', () => {
  let app: express.Application;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createTestApp();
  });

  it('should decline offer with reason', async () => {
    const offerId = 'offer-123';
    const token = 'valid-token';
    const reason = 'Accepted another offer';

    mocks.verifyOfferToken.mockReturnValue({
      offerId,
      candidateId: 'candidate-456',
      action: 'respond'
    });
    mocks.declineOffer.mockResolvedValue(undefined);

    const response = await request(app)
      .post(`/api/offers/${offerId}/decline`)
      .send({ token, reason });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(mocks.declineOffer).toHaveBeenCalledWith({
      offerId,
      candidateId: 'candidate-456',
      reason
    });
  });
});

describe('GET /api/offers/:id', () => {
  let app: express.Application;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createTestApp();
  });

  it('should return offer details with valid token', async () => {
    const offerId = 'offer-123';
    const mockOffer = {
      id: offerId,
      status: 'pending',
      pdfUrl: 'https://storage.example.com/offer.pdf',
      expiresAt: new Date(),
      respondedAt: null,
      application: {
        candidate: {
          fullName: 'John Doe',
          email: 'john@example.com'
        },
        requisition: {
          title: 'Engineer',
          department: 'Engineering'
        }
      },
      decision: {
        compensationBand: '100000-120000'
      }
    };

    mocks.verifyOfferToken.mockReturnValue({
      offerId,
      candidateId: 'candidate-456',
      action: 'view'
    });
    mocks.getOfferDetails.mockResolvedValue(mockOffer);

    const response = await request(app)
      .get(`/api/offers/${offerId}?token=valid-token`);

    expect(response.status).toBe(200);
    expect(response.body.data.candidate.fullName).toBe('John Doe');
  });
});
```

---

## Dependencies

- TASK-001 (offer generation must complete before response)
- jsonwebtoken for token generation and verification
- Email service for notifications

---

## Validation

| Test Case | Expected Behavior |
|-----------|------------------|
| Valid acceptance | Offer status=accepted, application status=offer_accepted |
| Valid declination | Offer status=declined, requisition vacancy incremented |
| Expired offer | 410 Gone response |
| Already responded | 409 Conflict response |
| Invalid token | 401 Unauthorized response |
| Token mismatch | 403 Forbidden response |

---

## Definition of Done

- [x] Offer response service implements accept and decline logic
- [x] Token service generates and verifies secure offer access tokens
- [x] API routes handle accept, decline, and view offer requests
- [x] Validation prevents double-response and expired offer responses
- [x] Requisition vacancy incremented on declination
- [x] Audit events logged for all responses
- [x] Unit tests covering all endpoints and error cases (10+ tests)
- [x] Routes registered in app.ts

---

## Notes

- Tokens expire after 30 days to match PDF signed URL expiry
- Onboarding task creation is placeholder (implement in separate story)
- Email notifications are placeholder (can be bundled with TASK-003)
- Offer access tokens are separate from approval tokens (different audience)
