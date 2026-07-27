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
vi.mock('../../config/env', () => ({
  env: {
    REDIS_URL: 'redis://localhost:6379',
    OFFER_TOKEN_SECRET: 'test-secret-key-for-testing-purposes-minimum-32-chars'
  }
}));

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
    managerId: string;
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
      managerId: manager.id,
      token
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
