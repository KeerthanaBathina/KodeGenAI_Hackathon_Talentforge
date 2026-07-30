import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  submitGdprErasureRequest: vi.fn(),
  loggerError: vi.fn(),
  loggerWarn: vi.fn(),
  loggerInfo: vi.fn(),
  loggerDebug: vi.fn()
}));

vi.mock('../../services/gdprErasureRequestService', () => {
  class GdprErasureRequestError extends Error {
    code: string;

    constructor(message: string, code: string) {
      super(message);
      this.name = 'GdprErasureRequestError';
      this.code = code;
    }
  }

  return {
    submitGdprErasureRequest: mocks.submitGdprErasureRequest,
    GdprErasureRequestError
  };
});

vi.mock('../../services/consentService', () => ({
  recordConsent: vi.fn(),
  getCurrentPolicyVersion: vi.fn(() => '1.0'),
  getActiveConsent: vi.fn(),
  revokeConsent: vi.fn(),
  getConsentHistory: vi.fn()
}));

vi.mock('../../middleware/authenticate', () => ({
  authenticate: (req: any, res: any, next: () => void) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required'
        }
      });
      return;
    }

    const token = String(authHeader).replace('Bearer ', '').trim();

    if (token === 'candidate-token') {
      req.user = {
        id: 'candidate-auth-id',
        candidateId: '11111111-1111-1111-1111-111111111111',
        email: 'candidate@example.com',
        role: 'candidate'
      };
      next();
      return;
    }

    if (token === 'admin-token') {
      req.user = {
        id: '22222222-2222-2222-2222-222222222222',
        email: 'admin@example.com',
        role: 'admin'
      };
      next();
      return;
    }

    res.status(401).json({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required'
      }
    });
  }
}));

vi.mock('../../utils/logger', () => ({
  default: {
    error: mocks.loggerError,
    warn: mocks.loggerWarn,
    info: mocks.loggerInfo,
    debug: mocks.loggerDebug
  }
}));

import consentRouter from '../consent';
import { GdprErasureRequestError } from '../../services/gdprErasureRequestService';

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/consent', consentRouter);
  return app;
}

describe('POST /api/consent/erasure-request', () => {
  const app = createTestApp();

  beforeEach(() => {
    vi.clearAllMocks();

    mocks.submitGdprErasureRequest.mockResolvedValue({
      request: {
        id: '33333333-3333-3333-3333-333333333333',
        candidateId: '11111111-1111-1111-1111-111111111111',
        requestedAt: new Date('2026-07-30T12:00:00.000Z'),
        dueAt: new Date('2026-08-29T12:00:00.000Z'),
        status: 'pending',
        processedAt: null,
        failureReason: null,
        requestReason: 'Please remove my personal data.',
        createdAt: new Date('2026-07-30T12:00:00.000Z'),
        updatedAt: new Date('2026-07-30T12:00:00.000Z')
      },
      idempotent: false
    });
  });

  it('rejects unauthenticated requests', async () => {
    const response = await request(app)
      .post('/api/consent/erasure-request')
      .send({});

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
  });

  it('rejects non-candidate roles', async () => {
    const response = await request(app)
      .post('/api/consent/erasure-request')
      .set('Authorization', 'Bearer admin-token')
      .send({});

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
    expect(mocks.submitGdprErasureRequest).not.toHaveBeenCalled();
  });

  it('creates a new erasure request for candidate submissions', async () => {
    const response = await request(app)
      .post('/api/consent/erasure-request')
      .set('Authorization', 'Bearer candidate-token')
      .set('User-Agent', 'ConsentRouteTest/1.0')
      .send({ requestReason: '  Please remove my personal data.  ' });

    expect(response.status).toBe(201);
    expect(response.body.id).toBe('33333333-3333-3333-3333-333333333333');
    expect(response.body.idempotent).toBe(false);

    expect(mocks.submitGdprErasureRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        candidateId: '11111111-1111-1111-1111-111111111111',
        actorId: 'candidate-auth-id',
        actorRole: 'candidate',
        requestReason: 'Please remove my personal data.',
        userAgent: 'ConsentRouteTest/1.0'
      })
    );
  });

  it('returns 200 for idempotent re-submissions when pending request already exists', async () => {
    mocks.submitGdprErasureRequest.mockResolvedValueOnce({
      request: {
        id: '33333333-3333-3333-3333-333333333333',
        candidateId: '11111111-1111-1111-1111-111111111111',
        requestedAt: new Date('2026-07-30T12:00:00.000Z'),
        dueAt: new Date('2026-08-29T12:00:00.000Z'),
        status: 'pending',
        processedAt: null,
        failureReason: null,
        requestReason: null,
        createdAt: new Date('2026-07-30T12:00:00.000Z'),
        updatedAt: new Date('2026-07-30T12:00:00.000Z')
      },
      idempotent: true
    });

    const response = await request(app)
      .post('/api/consent/erasure-request')
      .set('Authorization', 'Bearer candidate-token')
      .send({});

    expect(response.status).toBe(200);
    expect(response.body.idempotent).toBe(true);
  });

  it('returns payload validation errors for malformed request body', async () => {
    const response = await request(app)
      .post('/api/consent/erasure-request')
      .set('Authorization', 'Bearer candidate-token')
      .send({ requestReason: '' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_REQUEST_PAYLOAD');
    expect(Array.isArray(response.body.error.details)).toBe(true);
    expect(mocks.submitGdprErasureRequest).not.toHaveBeenCalled();
  });

  it('maps candidate-not-found domain errors to 404', async () => {
    mocks.submitGdprErasureRequest.mockRejectedValueOnce(
      new GdprErasureRequestError('Candidate not found', 'CANDIDATE_NOT_FOUND')
    );

    const response = await request(app)
      .post('/api/consent/erasure-request')
      .set('Authorization', 'Bearer candidate-token')
      .send({});

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('CANDIDATE_NOT_FOUND');
  });
});
