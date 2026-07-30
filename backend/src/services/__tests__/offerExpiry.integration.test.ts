import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { prisma } from '../../db/prisma';
import { processOfferExpiry } from '../offerExpiryService';

vi.mock('../auditService', () => ({
  auditEvent: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('../../utils/logger');
vi.mock('../../config/env', () => ({
  env: {
    REDIS_URL: 'redis://localhost:6379'
  }
}));

describe('Offer Expiry Integration', () => {
  let testData: {
    offerId: string;
    requisitionId: string;
    candidateId: string;
    managerId: string;
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
      requisitionId: requisition.id,
      candidateId: candidate.id,
      managerId: manager.id
    };
  });

  afterEach(async () => {
    // Clean up
    await prisma.offer.deleteMany({ where: { id: testData.offerId } });
    await prisma.decision.deleteMany({});
    await prisma.application.deleteMany({});
    await prisma.requisition.deleteMany({ where: { id: testData.requisitionId } });
    await prisma.user.deleteMany({ 
      where: { 
        OR: [
          { id: testData.candidateId },
          { id: testData.managerId }
        ]
      } 
    });
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

    // Verify vacancy not incremented
    const requisition = await prisma.requisition.findUnique({
      where: { id: testData.requisitionId }
    });

    expect(requisition!.vacancies).toBe(1); // Still 1
  });

  it('should skip already declined offer', async () => {
    // Decline offer first
    await prisma.offer.update({
      where: { id: testData.offerId },
      data: { status: 'declined', respondedAt: new Date() }
    });

    await processOfferExpiry(testData.offerId);

    // Verify status unchanged
    const offer = await prisma.offer.findUnique({
      where: { id: testData.offerId }
    });

    expect(offer!.status).toBe('declined'); // Still declined
  });
});
