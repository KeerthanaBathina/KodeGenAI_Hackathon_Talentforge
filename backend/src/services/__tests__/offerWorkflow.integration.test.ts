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
vi.mock('../../config/env', () => ({
  env: {
    REDIS_URL: 'redis://localhost:6379',
    OFFER_TOKEN_SECRET: 'test-secret-key'
  }
}));

describe('Offer Generation Integration', () => {
  let testData: {
    candidateId: string;
    requisitionId: string;
    applicationId: string;
    decisionId: string;
    hiringManagerId: string;
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
    await prisma.template.create({
      data: {
        name: 'Offer Letter Template',
        type: 'offer',
        subject: 'Offer Letter',
        bodyHtml: '<h1>Offer for {{candidateName}}</h1><p>Role: {{roleTitle}}</p>',
        version: 1,
        active: true
      }
    });

    testData = {
      candidateId: candidate.id,
      requisitionId: requisition.id,
      applicationId: application.id,
      decisionId: decision.id,
      hiringManagerId: hiringManager.id
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
      where: { 
        OR: [
          { id: testData.candidateId },
          { id: testData.hiringManagerId }
        ]
      }
    });
    await prisma.template.deleteMany({
      where: { type: 'offer' }
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
