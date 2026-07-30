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
  OfferAccessDeniedError: class extends Error {},
  OfferAlreadyRespondedError: class extends Error {},
  OfferExpiredError: class extends Error {}
}));

vi.mock('../../services/offerTokenService', () => ({
  verifyOfferToken: mocks.verifyOfferToken
}));

vi.mock('../../utils/logger');
vi.mock('../../config/env', () => ({
  env: {
    OFFER_TOKEN_SECRET: 'test-secret-key-for-testing-purposes'
  }
}));

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
    const offerId = '550e8400-e29b-41d4-a716-446655440000';
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
      .post('/api/offers/550e8400-e29b-41d4-a716-446655440000/accept')
      .send({});

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('should reject with token mismatch', async () => {
    const offerId = '550e8400-e29b-41d4-a716-446655440000';
    
    mocks.verifyOfferToken.mockReturnValue({
      offerId: '660e8400-e29b-41d4-a716-446655440001',
      candidateId: 'candidate-456',
      action: 'respond'
    });

    const response = await request(app)
      .post(`/api/offers/${offerId}/accept`)
      .send({ token: 'valid-token' });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('TOKEN_MISMATCH');
  });

  it('should reject expired offer', async () => {
    const { OfferExpiredError } = await import('../../services/offerResponseService');
    const offerId = '550e8400-e29b-41d4-a716-446655440000';
    
    mocks.verifyOfferToken.mockReturnValue({
      offerId,
      candidateId: 'candidate-456',
      action: 'respond'
    });
    mocks.acceptOffer.mockRejectedValue(new OfferExpiredError('Offer has expired'));

    const response = await request(app)
      .post(`/api/offers/${offerId}/accept`)
      .send({ token: 'valid-token' });

    expect(response.status).toBe(410);
    expect(response.body.error.code).toBe('OFFER_EXPIRED');
  });

  it('should reject already responded offer', async () => {
    const { OfferAlreadyRespondedError } = await import('../../services/offerResponseService');
    const offerId = '550e8400-e29b-41d4-a716-446655440000';
    
    mocks.verifyOfferToken.mockReturnValue({
      offerId,
      candidateId: 'candidate-456',
      action: 'respond'
    });
    mocks.acceptOffer.mockRejectedValue(new OfferAlreadyRespondedError('Offer already accepted'));

    const response = await request(app)
      .post(`/api/offers/${offerId}/accept`)
      .send({ token: 'valid-token' });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('ALREADY_RESPONDED');
  });

  it('should reject invalid UUID format', async () => {
    const response = await request(app)
      .post('/api/offers/invalid-id/accept')
      .send({ token: 'valid-token' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.message).toContain('Invalid offer ID format');
  });
});

describe('POST /api/offers/:id/decline', () => {
  let app: express.Application;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createTestApp();
  });

  it('should decline offer with reason', async () => {
    const offerId = '550e8400-e29b-41d4-a716-446655440000';
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

  it('should decline offer without reason', async () => {
    const offerId = '550e8400-e29b-41d4-a716-446655440000';
    const token = 'valid-token';

    mocks.verifyOfferToken.mockReturnValue({
      offerId,
      candidateId: 'candidate-456',
      action: 'respond'
    });
    mocks.declineOffer.mockResolvedValue(undefined);

    const response = await request(app)
      .post(`/api/offers/${offerId}/decline`)
      .send({ token });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(mocks.declineOffer).toHaveBeenCalledWith({
      offerId,
      candidateId: 'candidate-456',
      reason: undefined
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
    const offerId = '550e8400-e29b-41d4-a716-446655440000';
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
    expect(response.body.data.position.title).toBe('Engineer');
    expect(response.body.data.pdfUrl).toBe('https://storage.example.com/offer.pdf');
  });

  it('should reject missing token', async () => {
    const response = await request(app)
      .get('/api/offers/550e8400-e29b-41d4-a716-446655440000');

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('MISSING_TOKEN');
  });

  it('should reject invalid token', async () => {
    mocks.verifyOfferToken.mockImplementation(() => {
      throw new Error('Invalid offer access token');
    });

    const response = await request(app)
      .get('/api/offers/550e8400-e29b-41d4-a716-446655440000?token=invalid-token');

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('INVALID_TOKEN');
  });

  it('should reject token for different offer', async () => {
    const offerId = '550e8400-e29b-41d4-a716-446655440000';
    
    mocks.verifyOfferToken.mockReturnValue({
      offerId: '660e8400-e29b-41d4-a716-446655440001',
      candidateId: 'candidate-456',
      action: 'view'
    });

    const response = await request(app)
      .get(`/api/offers/${offerId}?token=valid-token`);

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('TOKEN_MISMATCH');
  });
});
