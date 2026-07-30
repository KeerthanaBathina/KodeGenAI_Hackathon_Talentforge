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
  getNoShowAnalytics: vi.fn(),
  loggerInfo: vi.fn(),
  loggerWarn: vi.fn(),
  loggerError: vi.fn(),
  loggerDebug: vi.fn()
}));

vi.mock('../../services/noShowAnalyticsService', async () => {
  const actual = await vi.importActual<typeof import('../../services/noShowAnalyticsService')>(
    '../../services/noShowAnalyticsService'
  );

  return {
    ...actual,
    getNoShowAnalytics: mocks.getNoShowAnalytics
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

function buildTrend30dDescending(): Array<{
  date: string;
  scheduledCount: number;
  noShowCount: number;
  noShowRatePct: number;
}> {
  const start = new Date('2026-07-30T00:00:00.000Z');

  return Array.from({ length: 30 }, (_, index) => {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() - index);

    return {
      date: date.toISOString().slice(0, 10),
      scheduledCount: 20 + index,
      noShowCount: index % 5,
      noShowRatePct: Number((((index % 5) / (20 + index)) * 100).toFixed(2))
    };
  });
}

describe('No-Show Analytics API', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.getNoShowAnalytics.mockResolvedValue({
      noShowRatePct: 20,
      noShowCount: 4,
      scheduledCount: 20,
      trend30d: buildTrend30dDescending(),
      lastRefreshedAt: '2026-07-30T08:00:00.000Z',
      generatedAt: '2026-07-30T08:00:01.000Z'
    });
  });

  it('returns no-show analytics payload for authenticated recruiter', async () => {
    const response = await request(app)
      .get('/api/analytics/no-show')
      .set('Authorization', 'Bearer recruiter-token');

    expect(response.status).toBe(200);
    expect(response.body.noShowRatePct).toBe(20);
    expect(response.body.noShowCount).toBe(4);
    expect(response.body.scheduledCount).toBe(20);
    expect(response.body.trend30d).toHaveLength(30);
    expect(response.body).toHaveProperty('lastRefreshedAt');
    expect(response.body).toHaveProperty('generatedAt');
    expect(mocks.getNoShowAnalytics).toHaveBeenCalledWith(undefined);
  });

  it('passes requisitionId filter when provided', async () => {
    const requisitionId = '11111111-1111-1111-1111-111111111111';

    const response = await request(app)
      .get(`/api/analytics/no-show?requisitionId=${requisitionId}`)
      .set('Authorization', 'Bearer admin-token');

    expect(response.status).toBe(200);
    expect(mocks.getNoShowAnalytics).toHaveBeenCalledWith(requisitionId);
  });

  it('rejects invalid requisitionId with 400', async () => {
    const response = await request(app)
      .get('/api/analytics/no-show?requisitionId=not-a-uuid')
      .set('Authorization', 'Bearer recruiter-token');

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_QUERY_PARAMS');
  });

  it('rejects unauthenticated requests with 401', async () => {
    const response = await request(app).get('/api/analytics/no-show');

    expect(response.status).toBe(401);
  });

  it('rejects unauthorized role with 403', async () => {
    const response = await request(app)
      .get('/api/analytics/no-show')
      .set('Authorization', 'Bearer candidate-token');

    expect(response.status).toBe(403);
  });

  it('returns trend points ordered newest to oldest with exactly 30 calendar points', async () => {
    const response = await request(app)
      .get('/api/analytics/no-show')
      .set('Authorization', 'Bearer recruiter-token');

    expect(response.status).toBe(200);
    expect(response.body.trend30d).toHaveLength(30);

    const firstDate = new Date(response.body.trend30d[0].date).getTime();
    const lastDate = new Date(response.body.trend30d[29].date).getTime();
    expect(firstDate).toBeGreaterThan(lastDate);
  });

  it('returns 500 with stable contract when no-show service fails', async () => {
    mocks.getNoShowAnalytics.mockRejectedValueOnce(new Error('analytics failure'));

    const response = await request(app)
      .get('/api/analytics/no-show')
      .set('Authorization', 'Bearer recruiter-token');

    expect(response.status).toBe(500);
    expect(response.body.error.code).toBe('INTERNAL_ERROR');
    expect(response.body.error.message).toBe('Failed to retrieve no-show analytics');
  });
});
