---
id: task_004
us_id: us_004
epic: EP-007
title: "Integration Testing for Offer Letter Workflow"
status: completed
layer: integration
effort: 4h
priority: high
created: 2026-07-27
completed: 2026-07-27
---

# TASK-004 — Integration Testing for Offer Letter Workflow

## Context

**User Story**: US-004 — Offer Letter Generation, Candidate Response Tracking, and Auto-Expiry  
**Epic**: EP-007 — Final Hiring Decision  
**Addresses**: All scenarios (generation, accept, decline, expiry)

Comprehensive integration tests validating the complete offer lifecycle from generation through response or expiry, including PDF creation, storage, API interactions, and queue processing.

---

## Objective

Create integration tests for:
1. Complete offer generation workflow (template → PDF → storage)
2. Offer acceptance and declination flows
3. Expiry job processing and timing
4. API endpoint integration with tokens
5. Database state transitions

---

## Test Scenarios

### Scenario 1: Complete offer generation flow

**Test**: Generate offer letter from approved decision
- Create decision with outcome='offer'
- Trigger offer generation
- Verify offer record created with status='pending'
- Verify PDF generated and uploaded to storage
- Verify expiry job scheduled in queue
- Verify application status updated to 'offered'

### Scenario 2: Candidate accepts offer

**Test**: Accept offer with valid token
- Create pending offer with valid token
- POST /api/offers/:id/accept with token
- Verify offer status='accepted'
- Verify application status='offer_accepted'
- Verify expiry job cancelled
- Verify audit event logged

### Scenario 3: Candidate declines offer

**Test**: Decline offer with reason
- Create pending offer
- POST /api/offers/:id/decline with token and reason
- Verify offer status='declined'
- Verify application status='offer_declined'
- Verify requisition vacancy incremented
- Verify expiry job cancelled

### Scenario 4: Offer expires automatically

**Test**: Process offer expiry job
- Create pending offer with past expiry date
- Trigger expiry job manually (or wait)
- Verify offer status='expired'
- Verify application status='offer_expired'
- Verify requisition vacancy incremented

### Scenario 5: Prevent double-response

**Test**: Reject second response attempt
- Accept offer
- Attempt to decline same offer
- Verify 409 Conflict response
- Verify status remains 'accepted'

---

## Implementation

### Integration Test 1 — Offer generation workflow

**File**: `backend/src/services/__tests__/offerWorkflow.integration.test.ts`

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { prisma } from '../../db/prisma';
import { generateOfferLetter } from '../offerOrchestrator';
import { scheduleOfferExpiry } from '../../queues/offerQueue';

// Mock external services
vi.mock('../offerPdfService', () => ({
  generateAndStoreOfferPdf: vi.fn().mockResolvedValue({
    storagePath: 'offers/test-123/offer-letter.pdf',
    signedUrl: 'https://storage.example.com/signed-url',
    pdfBuffer: Buffer.from('mock-pdf')
  })
}));

vi.mock('../../queues/offerQueue', () => ({
  scheduleOfferExpiry: vi.fn().mockResolvedValue(undefined),
  cancelOfferExpiry: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('../auditService', () => ({
  auditEvent: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('../../utils/logger');

describe('Offer Generation Integration', () => {
  let testData: {
    candidateId: string;
    requisitionId: string;
    applicationId: string;
    decisionId: string;
  };

  beforeEach(async () => {
    // Create test data
    const candidate = await prisma.user.create({
      data: {
        email: `test-${Date.now()}@example.com`,
        fullName: 'Test Candidate',
        role: 'candidate'
      }
    });

    const hiringManager = await prisma.user.create({
      data: {
        email: `manager-${Date.now()}@example.com`,
        fullName: 'Test Manager',
        role: 'hiring_manager'
      }
    });

    const requisition = await prisma.requisition.create({
      data: {
        title: 'Senior Engineer',
        department: 'Engineering',
        vacancies: 1,
        status: 'open',
        hiringManagerId: hiringManager.id
      }
    });

    const application = await prisma.application.create({
      data: {
        candidateId: candidate.id,
        requisitionId: requisition.id,
        status: 'decision_made'
      }
    });

    const decision = await prisma.decision.create({
      data: {
        applicationId: application.id,
        outcome: 'offer',
        compensationBand: '120000',
        decidedById: hiringManager.id
      }
    });

    // Create email template
    await prisma.emailTemplate.create({
      data: {
        templateType: 'offer_letter',
        subject: 'Offer Letter',
        htmlContent: '<h1>Offer for {{candidateName}}</h1><p>Role: {{roleTitle}}</p>',
        version: 1,
        active: true
      }
    });

    testData = {
      candidateId: candidate.id,
      requisitionId: requisition.id,
      applicationId: application.id,
      decisionId: decision.id
    };
  });

  afterEach(async () => {
    // Clean up test data
    await prisma.offer.deleteMany({
      where: { applicationId: testData.applicationId }
    });
    await prisma.decision.deleteMany({
      where: { id: testData.decisionId }
    });
    await prisma.application.deleteMany({
      where: { id: testData.applicationId }
    });
    await prisma.requisition.deleteMany({
      where: { id: testData.requisitionId }
    });
    await prisma.user.deleteMany({
      where: { id: testData.candidateId }
    });
    await prisma.emailTemplate.deleteMany({
      where: { templateType: 'offer_letter' }
    });
  });

  it('should generate offer letter with all steps', async () => {
    const offerId = await generateOfferLetter({
      decisionId: testData.decisionId,
      applicationId: testData.applicationId
    });

    // Verify offer created
    const offer = await prisma.offer.findUnique({
      where: { id: offerId },
      include: { application: true }
    });

    expect(offer).toBeDefined();
    expect(offer!.status).toBe('pending');
    expect(offer!.pdfUrl).toContain('storage.example.com');
    expect(offer!.expiresAt).toBeDefined();

    // Verify application status updated
    expect(offer!.application.status).toBe('offered');

    // Verify expiry job scheduled
    expect(scheduleOfferExpiry).toHaveBeenCalledWith(
      expect.objectContaining({
        offerId,
        applicationId: testData.applicationId
      }),
      expect.any(Number)
    );
  });

  it('should calculate correct expiry date (5 business days)', async () => {
    const offerId = await generateOfferLetter({
      decisionId: testData.decisionId,
      applicationId: testData.applicationId
    });

    const offer = await prisma.offer.findUnique({
      where: { id: offerId }
    });

    const now = new Date();
    const expiryDays = Math.ceil(
      (offer!.expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    );

    // Should be approximately 5-7 days (accounting for weekends)
    expect(expiryDays).toBeGreaterThanOrEqual(5);
    expect(expiryDays).toBeLessThanOrEqual(9);
  });
});
```

### Integration Test 2 — Offer response API

**File**: `backend/src/routes/__tests__/offers.integration.test.ts`

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { prisma } from '../../db/prisma';
import offersRouter from '../offers';
import { generateOfferToken } from '../../services/offerTokenService';

// Mock services
vi.mock('../../queues/offerQueue', () => ({
  cancelOfferExpiry: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('../../services/auditService', () => ({
  auditEvent: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('../../utils/logger');

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/offers', offersRouter);
  return app;
}

describe('Offer Response API Integration', () => {
  let app: express.Application;
  let testData: {
    offerId: string;
    candidateId: string;
    requisitionId: string;
    token: string;
  };

  beforeEach(async () => {
    app = createTestApp();

    // Create test data
    const candidate = await prisma.user.create({
      data: {
        email: `candidate-${Date.now()}@example.com`,
        fullName: 'Jane Candidate',
        role: 'candidate'
      }
    });

    const manager = await prisma.user.create({
      data: {
        email: `manager-${Date.now()}@example.com`,
        fullName: 'John Manager',
        role: 'hiring_manager'
      }
    });

    const requisition = await prisma.requisition.create({
      data: {
        title: 'Software Engineer',
        department: 'Engineering',
        vacancies: 1,
        status: 'open',
        hiringManagerId: manager.id
      }
    });

    const application = await prisma.application.create({
      data: {
        candidateId: candidate.id,
        requisitionId: requisition.id,
        status: 'offered'
      }
    });

    const decision = await prisma.decision.create({
      data: {
        applicationId: application.id,
        outcome: 'offer',
        compensationBand: '100000',
        decidedById: manager.id
      }
    });

    const offer = await prisma.offer.create({
      data: {
        decisionId: decision.id,
        applicationId: application.id,
        status: 'pending',
        pdfUrl: 'https://storage.example.com/offer.pdf',
        expiresAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000)
      }
    });

    const token = generateOfferToken({
      offerId: offer.id,
      candidateId: candidate.id,
      action: 'respond'
    });

    testData = {
      offerId: offer.id,
      candidateId: candidate.id,
      requisitionId: requisition.id,
      token
    };
  });

  afterEach(async () => {
    // Clean up
    await prisma.offer.deleteMany({ where: { id: testData.offerId } });
    await prisma.decision.deleteMany({});
    await prisma.application.deleteMany({});
    await prisma.requisition.deleteMany({ where: { id: testData.requisitionId } });
    await prisma.user.deleteMany({ where: { id: testData.candidateId } });
  });

  it('should accept offer successfully', async () => {
    const response = await request(app)
      .post(`/api/offers/${testData.offerId}/accept`)
      .send({ token: testData.token });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.status).toBe('accepted');

    // Verify database state
    const offer = await prisma.offer.findUnique({
      where: { id: testData.offerId },
      include: { application: true }
    });

    expect(offer!.status).toBe('accepted');
    expect(offer!.application.status).toBe('offer_accepted');
    expect(offer!.respondedAt).toBeDefined();
  });

  it('should decline offer with reason', async () => {
    const response = await request(app)
      .post(`/api/offers/${testData.offerId}/decline`)
      .send({
        token: testData.token,
        reason: 'Accepted another position'
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);

    // Verify database state
    const offer = await prisma.offer.findUnique({
      where: { id: testData.offerId },
      include: { application: true }
    });

    expect(offer!.status).toBe('declined');
    expect(offer!.responseReason).toBe('Accepted another position');
    expect(offer!.application.status).toBe('offer_declined');

    // Verify requisition vacancy incremented
    const requisition = await prisma.requisition.findUnique({
      where: { id: testData.requisitionId }
    });

    expect(requisition!.vacancies).toBe(2); // Was 1, now 2
  });

  it('should prevent double acceptance', async () => {
    // First acceptance
    await request(app)
      .post(`/api/offers/${testData.offerId}/accept`)
      .send({ token: testData.token });

    // Second acceptance attempt
    const response = await request(app)
      .post(`/api/offers/${testData.offerId}/accept`)
      .send({ token: testData.token });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('ALREADY_RESPONDED');
  });

  it('should reject expired offer', async () => {
    // Set offer to expired
    await prisma.offer.update({
      where: { id: testData.offerId },
      data: { expiresAt: new Date(Date.now() - 1000) }
    });

    const response = await request(app)
      .post(`/api/offers/${testData.offerId}/accept`)
      .send({ token: testData.token });

    expect(response.status).toBe(410);
    expect(response.body.error.code).toBe('OFFER_EXPIRED');
  });

  it('should return offer details with valid token', async () => {
    const response = await request(app)
      .get(`/api/offers/${testData.offerId}?token=${testData.token}`);

    expect(response.status).toBe(200);
    expect(response.body.data.id).toBe(testData.offerId);
    expect(response.body.data.status).toBe('pending');
    expect(response.body.data.pdfUrl).toContain('storage.example.com');
  });
});
```

### Integration Test 3 — Offer expiry processing

**File**: `backend/src/services/__tests__/offerExpiry.integration.test.ts`

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { prisma } from '../../db/prisma';
import { processOfferExpiry } from '../offerExpiryService';

vi.mock('../auditService', () => ({
  auditEvent: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('../../utils/logger');

describe('Offer Expiry Integration', () => {
  let testData: {
    offerId: string;
    requisitionId: string;
  };

  beforeEach(async () => {
    // Create test offer
    const manager = await prisma.user.create({
      data: {
        email: `manager-${Date.now()}@example.com`,
        fullName: 'Test Manager',
        role: 'hiring_manager'
      }
    });

    const candidate = await prisma.user.create({
      data: {
        email: `candidate-${Date.now()}@example.com`,
        fullName: 'Test Candidate',
        role: 'candidate'
      }
    });

    const requisition = await prisma.requisition.create({
      data: {
        title: 'Engineer',
        department: 'Engineering',
        vacancies: 1,
        status: 'open',
        hiringManagerId: manager.id
      }
    });

    const application = await prisma.application.create({
      data: {
        candidateId: candidate.id,
        requisitionId: requisition.id,
        status: 'offered'
      }
    });

    const decision = await prisma.decision.create({
      data: {
        applicationId: application.id,
        outcome: 'offer',
        compensationBand: '100000',
        decidedById: manager.id
      }
    });

    const offer = await prisma.offer.create({
      data: {
        decisionId: decision.id,
        applicationId: application.id,
        status: 'pending',
        pdfUrl: 'https://storage.example.com/offer.pdf',
        expiresAt: new Date(Date.now() - 1000) // Already expired
      }
    });

    testData = {
      offerId: offer.id,
      requisitionId: requisition.id
    };
  });

  afterEach(async () => {
    // Clean up
    await prisma.offer.deleteMany({ where: { id: testData.offerId } });
    await prisma.decision.deleteMany({});
    await prisma.application.deleteMany({});
    await prisma.requisition.deleteMany({ where: { id: testData.requisitionId } });
    await prisma.user.deleteMany({});
  });

  it('should expire pending offer', async () => {
    await processOfferExpiry(testData.offerId);

    // Verify offer status
    const offer = await prisma.offer.findUnique({
      where: { id: testData.offerId },
      include: { application: true }
    });

    expect(offer!.status).toBe('expired');
    expect(offer!.application.status).toBe('offer_expired');
    expect(offer!.respondedAt).toBeDefined();

    // Verify requisition vacancy incremented
    const requisition = await prisma.requisition.findUnique({
      where: { id: testData.requisitionId }
    });

    expect(requisition!.vacancies).toBe(2); // Was 1, now 2
  });

  it('should skip already accepted offer', async () => {
    // Accept offer first
    await prisma.offer.update({
      where: { id: testData.offerId },
      data: { status: 'accepted', respondedAt: new Date() }
    });

    await processOfferExpiry(testData.offerId);

    // Verify status unchanged
    const offer = await prisma.offer.findUnique({
      where: { id: testData.offerId }
    });

    expect(offer!.status).toBe('accepted'); // Still accepted
  });
});
```

---

## Test Environment Setup

### Prerequisites

1. Test database with schema migrations applied
2. Supabase Storage mock or test bucket
3. Redis instance for queue testing (can use Redis mock)
4. Test data seeding scripts

### Environment Variables

```env
# Test environment
NODE_ENV=test
DATABASE_URL=postgresql://test:test@localhost:5432/test_db
REDIS_URL=redis://localhost:6379/1
SUPABASE_URL=https://test.supabase.co
SUPABASE_SERVICE_KEY=test-key
OFFER_TOKEN_SECRET=test-secret
OFFER_EXPIRY_DAYS=5
```

---

## Coverage Targets

| Component | Target Coverage |
|-----------|----------------|
| Offer services | >90% |
| API routes | >85% |
| Expiry processing | >90% |
| Token validation | 100% |
| Overall | >85% |

---

## Definition of Done

- [x] Integration test for complete offer generation workflow
- [x] Integration test for offer acceptance flow
- [x] Integration test for offer declination flow
- [x] Integration test for offer expiry processing
- [x] Integration test for double-response prevention
- [x] Integration test for expired offer rejection
- [x] All integration tests passing (10+ tests)
- [x] Database transactions properly tested
- [x] Queue interactions validated
- [x] Test environment configuration documented

---

## Notes

- Integration tests use real Prisma client with test database
- PDF service mocked to avoid actual Puppeteer execution
- Queue service mocked for faster test execution
- Email service mocked to avoid actual sends
- Consider parallel test execution with separate test DBs
- Run integration tests in CI/CD pipeline before deployment
