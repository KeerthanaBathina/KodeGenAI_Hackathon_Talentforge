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
  getPipelineAnalytics: vi.fn(),
  loggerInfo: vi.fn(),
  loggerWarn: vi.fn(),
  loggerError: vi.fn(),
  loggerDebug: vi.fn()
}));

vi.mock('../../services/pipelineAnalyticsService', async () => {
  const actual = await vi.importActual<typeof import('../../services/pipelineAnalyticsService')>(
    '../../services/pipelineAnalyticsService'
  );

  return {
    ...actual,
    getPipelineAnalytics: mocks.getPipelineAnalytics
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

describe('Pipeline analytics API', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.getPipelineAnalytics.mockResolvedValue({
      totalApplications: 120,
      shortlistRatePct: 41.67,
      avgTimeToHireDays: 14.25,
      offerAcceptanceRatePct: 66.67,
      lastRefreshedAt: '2026-07-29T10:00:00.000Z',
      generatedAt: '2026-07-29T10:00:01.000Z'
    });
  });

  it('returns KPI metrics for authenticated recruiter', async () => {
    const response = await request(app)
      .get('/api/analytics/pipeline')
      .set('Authorization', 'Bearer recruiter-token');

    expect(response.status).toBe(200);
    expect(response.body.totalApplications).toBe(120);
    expect(response.body).toHaveProperty('shortlistRatePct');
    expect(response.body).toHaveProperty('avgTimeToHireDays');
    expect(response.body).toHaveProperty('offerAcceptanceRatePct');
    expect(response.body).toHaveProperty('lastRefreshedAt');
    expect(response.body).toHaveProperty('generatedAt');
    expect(mocks.getPipelineAnalytics).toHaveBeenCalledWith(undefined);
  });

  it('passes requisitionId filter to service when provided', async () => {
    const requisitionId = '11111111-1111-1111-1111-111111111111';

    const response = await request(app)
      .get(`/api/analytics/pipeline?requisitionId=${requisitionId}`)
      .set('Authorization', 'Bearer admin-token');

    expect(response.status).toBe(200);
    expect(mocks.getPipelineAnalytics).toHaveBeenCalledWith(requisitionId);
  });

  it('rejects invalid requisitionId with 400', async () => {
    const response = await request(app)
      .get('/api/analytics/pipeline?requisitionId=not-a-uuid')
      .set('Authorization', 'Bearer recruiter-token');

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_QUERY_PARAMS');
  });

  it('rejects unauthenticated requests with 401', async () => {
    const response = await request(app).get('/api/analytics/pipeline');

    expect(response.status).toBe(401);
  });

  it('rejects unauthorized role with 403', async () => {
    const response = await request(app)
      .get('/api/analytics/pipeline')
      .set('Authorization', 'Bearer candidate-token');

    expect(response.status).toBe(403);
  });

  it('returns freshness metadata fields as ISO timestamps', async () => {
    const response = await request(app)
      .get('/api/analytics/pipeline')
      .set('Authorization', 'Bearer recruiter-token');

    expect(response.status).toBe(200);
    expect(new Date(response.body.generatedAt).toString()).not.toBe('Invalid Date');
    expect(new Date(response.body.lastRefreshedAt).toString()).not.toBe('Invalid Date');
  });
});
