import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

vi.mock('../../config/env', () => ({
  env: {
    NODE_ENV: 'test',
    JWT_SECRET: 'test-secret-key-32-characters-long',
    JWT_EXPIRES_IN: '24h',
    DATABASE_URL: 'postgresql://test',
    DIRECT_URL: 'postgresql://test',
    UPSTASH_REDIS_REST_URL: 'https://test.upstash.io',
    UPSTASH_REDIS_REST_TOKEN: 'test-token',
    SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'test-key',
    FRONTEND_URL: 'http://localhost:3000'
  }
}));

const mocks = vi.hoisted(() => ({
  getFunnelAnalytics: vi.fn(),
  getConfusionMatrixAnalytics: vi.fn(),
  loggerInfo: vi.fn(),
  loggerWarn: vi.fn(),
  loggerError: vi.fn(),
  loggerDebug: vi.fn()
}));

vi.mock('../../services/funnelAnalyticsService', async () => {
  const actual = await vi.importActual<typeof import('../../services/funnelAnalyticsService')>(
    '../../services/funnelAnalyticsService'
  );

  return {
    ...actual,
    getFunnelAnalytics: mocks.getFunnelAnalytics
  };
});

vi.mock('../../services/confusionMatrixService', async () => {
  const actual = await vi.importActual<typeof import('../../services/confusionMatrixService')>(
    '../../services/confusionMatrixService'
  );

  return {
    ...actual,
    getConfusionMatrixAnalytics: mocks.getConfusionMatrixAnalytics
  };
});

vi.mock('../../utils/logger', () => ({
  default: {
    info: mocks.loggerInfo,
    warn: mocks.loggerWarn,
    error: mocks.loggerError,
    debug: mocks.loggerDebug
  }
}));

vi.mock('../../middleware/requestLogger', () => ({
  requestLogger: (_req: any, _res: any, next: any) => next(),
  requestAuditLogger: (_req: any, _res: any, next: any) => next()
}));

vi.mock('../../middleware/authenticate', () => ({
  authenticate: (req: any, res: any, next: any) => {
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

    const token = String(authHeader).replace('Bearer ', '');
    if (token === 'recruiter-token') {
      req.user = {
        id: '11111111-1111-1111-1111-111111111111',
        email: 'recruiter@test.com',
        role: 'recruiter'
      };
      next();
      return;
    }

    if (token === 'admin-token') {
      req.user = {
        id: '22222222-2222-2222-2222-222222222222',
        email: 'admin@test.com',
        role: 'admin'
      };
      next();
      return;
    }

    if (token === 'candidate-token') {
      req.user = {
        id: '33333333-3333-3333-3333-333333333333',
        email: 'candidate@test.com',
        role: 'candidate'
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

import { app } from '../../app';

describe('Funnel Analytics API', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.getFunnelAnalytics.mockResolvedValue({
      stages: [
        {
          stageName: 'applications',
          stageCount: 100,
          conversionRatePct: 100,
          dropCount: 0,
          dropRatePct: 0,
          isLargestDropTransition: false
        },
        {
          stageName: 'shortlisted',
          stageCount: 50,
          conversionRatePct: 50,
          dropCount: 50,
          dropRatePct: 50,
          isLargestDropTransition: true
        },
        {
          stageName: 'interviews_complete',
          stageCount: 30,
          conversionRatePct: 60,
          dropCount: 20,
          dropRatePct: 40,
          isLargestDropTransition: false
        }
      ],
      largestDropTransition: 'shortlisted',
      lastRefreshedAt: '2026-07-30T10:00:00.000Z',
      generatedAt: '2026-07-30T10:00:01.000Z'
    });
  });

  it('returns funnel stages for authenticated recruiter', async () => {
    const response = await request(app)
      .get('/api/analytics/funnel')
      .set('Authorization', 'Bearer recruiter-token');

    expect(response.status).toBe(200);
    expect(response.body.stages).toHaveLength(3);
    expect(response.body.stages[0].stageName).toBe('applications');
    expect(response.body.stages[0].stageCount).toBe(100);
    expect(response.body.largestDropTransition).toBe('shortlisted');
    expect(response.body).toHaveProperty('lastRefreshedAt');
    expect(response.body).toHaveProperty('generatedAt');
    expect(mocks.getFunnelAnalytics).toHaveBeenCalledWith(undefined);
  });

  it('passes requisitionId filter when provided', async () => {
    const requisitionId = '11111111-1111-1111-1111-111111111111';

    const response = await request(app)
      .get(`/api/analytics/funnel?requisitionId=${requisitionId}`)
      .set('Authorization', 'Bearer admin-token');

    expect(response.status).toBe(200);
    expect(mocks.getFunnelAnalytics).toHaveBeenCalledWith(requisitionId);
  });

  it('rejects invalid requisitionId with 400', async () => {
    const response = await request(app)
      .get('/api/analytics/funnel?requisitionId=not-a-uuid')
      .set('Authorization', 'Bearer recruiter-token');

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_QUERY_PARAMS');
  });

  it('rejects unauthenticated requests with 401', async () => {
    const response = await request(app).get('/api/analytics/funnel');

    expect(response.status).toBe(401);
  });

  it('rejects unauthorized role with 403', async () => {
    const response = await request(app)
      .get('/api/analytics/funnel')
      .set('Authorization', 'Bearer candidate-token');

    expect(response.status).toBe(403);
  });

  it('includes correct conversion rates and drop metadata', async () => {
    const response = await request(app)
      .get('/api/analytics/funnel')
      .set('Authorization', 'Bearer recruiter-token');

    expect(response.status).toBe(200);
    const stages = response.body.stages;
    expect(stages[1].conversionRatePct).toBe(50);
    expect(stages[1].dropCount).toBe(50);
    expect(stages[1].isLargestDropTransition).toBe(true);
  });
});

describe('Confusion Matrix Analytics API', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.getConfusionMatrixAnalytics.mockResolvedValue({
      truePositives: 50,
      falsePositives: 10,
      trueNegatives: 80,
      falseNegatives: 5,
      precision: 0.8333,
      recall: 0.9091,
      f1Score: 0.8696,
      accuracy: 0.8571,
      lastRefreshedAt: '2026-07-30T10:00:00.000Z',
      generatedAt: '2026-07-30T10:00:01.000Z'
    });
  });

  it('returns confusion matrix metrics for authenticated recruiter', async () => {
    const response = await request(app)
      .get('/api/analytics/confusion-matrix')
      .set('Authorization', 'Bearer recruiter-token');

    expect(response.status).toBe(200);
    expect(response.body.truePositives).toBe(50);
    expect(response.body.falsePositives).toBe(10);
    expect(response.body.trueNegatives).toBe(80);
    expect(response.body.falseNegatives).toBe(5);
    expect(response.body).toHaveProperty('precision');
    expect(response.body).toHaveProperty('recall');
    expect(response.body).toHaveProperty('f1Score');
    expect(response.body).toHaveProperty('accuracy');
    expect(response.body).toHaveProperty('lastRefreshedAt');
    expect(response.body).toHaveProperty('generatedAt');
    expect(mocks.getConfusionMatrixAnalytics).toHaveBeenCalledWith(undefined);
  });

  it('passes requisitionId filter when provided', async () => {
    const requisitionId = '11111111-1111-1111-1111-111111111111';

    const response = await request(app)
      .get(`/api/analytics/confusion-matrix?requisitionId=${requisitionId}`)
      .set('Authorization', 'Bearer admin-token');

    expect(response.status).toBe(200);
    expect(mocks.getConfusionMatrixAnalytics).toHaveBeenCalledWith(requisitionId);
  });

  it('rejects invalid requisitionId with 400', async () => {
    const response = await request(app)
      .get('/api/analytics/confusion-matrix?requisitionId=not-a-uuid')
      .set('Authorization', 'Bearer recruiter-token');

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_QUERY_PARAMS');
  });

  it('rejects unauthenticated requests with 401', async () => {
    const response = await request(app).get('/api/analytics/confusion-matrix');

    expect(response.status).toBe(401);
  });

  it('rejects unauthorized role with 403', async () => {
    const response = await request(app)
      .get('/api/analytics/confusion-matrix')
      .set('Authorization', 'Bearer candidate-token');

    expect(response.status).toBe(403);
  });

  it('includes valid precision/recall/F1 metrics', async () => {
    const response = await request(app)
      .get('/api/analytics/confusion-matrix')
      .set('Authorization', 'Bearer recruiter-token');

    expect(response.status).toBe(200);
    expect(response.body.precision).toBeCloseTo(0.8333, 3);
    expect(response.body.recall).toBeCloseTo(0.9091, 3);
    expect(response.body.f1Score).toBeCloseTo(0.8696, 3);
    expect(response.body.accuracy).toBeCloseTo(0.8571, 3);
  });

  it('returns zero metrics when no data exists', async () => {
    mocks.getConfusionMatrixAnalytics.mockResolvedValue({
      truePositives: 0,
      falsePositives: 0,
      trueNegatives: 0,
      falseNegatives: 0,
      precision: 0,
      recall: 0,
      f1Score: 0,
      accuracy: 0,
      lastRefreshedAt: null,
      generatedAt: '2026-07-30T10:00:01.000Z'
    });

    const response = await request(app)
      .get('/api/analytics/confusion-matrix')
      .set('Authorization', 'Bearer recruiter-token');

    expect(response.status).toBe(200);
    expect(response.body.truePositives).toBe(0);
    expect(response.body.precision).toBe(0);
    expect(response.body.recall).toBe(0);
    expect(response.body.f1Score).toBe(0);
  });
});
