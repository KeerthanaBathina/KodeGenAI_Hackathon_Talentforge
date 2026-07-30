import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const mocks = vi.hoisted(() => ({
  getAuditLogPage: vi.fn(),
  loggerInfo: vi.fn(),
  loggerWarn: vi.fn(),
  loggerError: vi.fn(),
  loggerDebug: vi.fn()
}));

vi.mock('../../services/auditLogQueryService', () => ({
  getAuditLogPage: mocks.getAuditLogPage
}));

vi.mock('../../utils/logger', () => ({
  default: {
    info: mocks.loggerInfo,
    warn: mocks.loggerWarn,
    error: mocks.loggerError,
    debug: mocks.loggerDebug
  }
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
    if (token === 'admin-token') {
      req.user = {
        id: '11111111-1111-1111-1111-111111111111',
        email: 'admin@example.com',
        role: 'admin'
      };
      next();
      return;
    }

    if (token === 'compliance-token') {
      req.user = {
        id: '22222222-2222-2222-2222-222222222222',
        email: 'compliance@example.com',
        role: 'compliance'
      };
      next();
      return;
    }

    if (token === 'recruiter-token') {
      req.user = {
        id: '33333333-3333-3333-3333-333333333333',
        email: 'recruiter@example.com',
        role: 'recruiter'
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

import auditLogRouter from '../admin/auditLog';

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/admin/audit-log', auditLogRouter);
  return app;
}

const app = createTestApp();

function buildResult(page = 1, pageSize = 50, totalItems = 0, startIndex = 1, count = 0) {
  const totalPages = totalItems === 0 ? 0 : Math.ceil(totalItems / pageSize);

  return {
    items: Array.from({ length: count }, (_, index) => {
      const sequence = startIndex + index;
      return {
        id: `evt-${sequence}`,
        actorId: null,
        actorEmail: sequence % 2 === 0 ? 'auditor@example.com' : null,
        eventType: sequence % 2 === 0 ? 'auth.login' : 'auth.logout',
        entityType: 'session',
        entityId: `55555555-5555-5555-5555-${String(sequence).padStart(12, '0')}`,
        payload: {
          sequence,
          source: 'integration-test'
        },
        ipAddress: '203.0.113.10',
        userAgent: 'AuditLogRouteTest/1.0',
        createdAt: new Date(`2026-07-30T10:${String(index).padStart(2, '0')}:00.000Z`).toISOString()
      };
    }),
    page,
    pageSize,
    totalItems,
    totalPages,
    hasNextPage: totalPages > 0 && page < totalPages,
    hasPrevPage: totalPages > 0 && page > 1
  };
}

describe('GET /api/admin/audit-log', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAuditLogPage.mockResolvedValue(buildResult(1, 50, 1, 1, 1));
  });

  it('rejects unauthenticated requests', async () => {
    const response = await request(app).get('/api/admin/audit-log');

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
  });

  it('rejects authenticated users without admin/compliance role', async () => {
    const response = await request(app)
      .get('/api/admin/audit-log')
      .set('Authorization', 'Bearer recruiter-token');

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
  });

  it('allows compliance users', async () => {
    const response = await request(app)
      .get('/api/admin/audit-log')
      .set('Authorization', 'Bearer compliance-token');

    expect(response.status).toBe(200);
    expect(response.body.items).toHaveLength(1);
    expect(mocks.getAuditLogPage).toHaveBeenCalledOnce();
  });

  it('returns structured validation errors for malformed query params', async () => {
    const response = await request(app)
      .get('/api/admin/audit-log?page=0&pageSize=500')
      .set('Authorization', 'Bearer admin-token');

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_QUERY_PARAMS');
    expect(Array.isArray(response.body.error.details)).toBe(true);
    expect(response.body.error.details.length).toBeGreaterThan(0);
  });

  it('returns validation error for edge date range where from is after to', async () => {
    const response = await request(app)
      .get('/api/admin/audit-log?from=2026-08-02T00:00:00.000Z&to=2026-08-01T00:00:00.000Z')
      .set('Authorization', 'Bearer admin-token');

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_QUERY_PARAMS');
  });

  it('applies actor email search filter', async () => {
    await request(app)
      .get('/api/admin/audit-log?actorEmail= Reviewer@Example.com ')
      .set('Authorization', 'Bearer admin-token')
      .expect(200);

    expect(mocks.getAuditLogPage).toHaveBeenCalledWith(
      expect.objectContaining({
        actorEmail: 'reviewer@example.com'
      })
    );
  });

  it('applies event type multi-select filter', async () => {
    await request(app)
      .get('/api/admin/audit-log?eventTypes=auth.login,auth.logout')
      .set('Authorization', 'Bearer admin-token')
      .expect(200);

    expect(mocks.getAuditLogPage).toHaveBeenCalledWith(
      expect.objectContaining({
        eventTypes: ['auth.login', 'auth.logout']
      })
    );
  });

  it('applies entity filters independently', async () => {
    await request(app)
      .get('/api/admin/audit-log?entityType=candidate&entityId=44444444-4444-4444-4444-444444444444')
      .set('Authorization', 'Bearer admin-token')
      .expect(200);

    expect(mocks.getAuditLogPage).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'candidate',
        entityId: '44444444-4444-4444-4444-444444444444'
      })
    );
  });

  it('applies date range filters independently', async () => {
    await request(app)
      .get('/api/admin/audit-log?from=2026-07-01T00:00:00.000Z&to=2026-07-31T23:59:59.999Z')
      .set('Authorization', 'Bearer admin-token')
      .expect(200);

    expect(mocks.getAuditLogPage).toHaveBeenCalledWith(
      expect.objectContaining({
        from: expect.any(Date),
        to: expect.any(Date)
      })
    );
  });

  it('supports combined filters and passes parsed pagination values', async () => {
    await request(app)
      .get('/api/admin/audit-log')
      .query({
        actorEmail: 'auditor@example.com',
        eventTypes: ['auth.login', 'auth.logout'],
        entityType: 'candidate',
        entityId: '77777777-7777-7777-7777-777777777777',
        from: '2026-07-01T00:00:00.000Z',
        to: '2026-07-31T23:59:59.999Z',
        page: '2',
        pageSize: '25'
      })
      .set('Authorization', 'Bearer admin-token')
      .expect(200);

    expect(mocks.getAuditLogPage).toHaveBeenCalledWith(
      expect.objectContaining({
        actorEmail: 'auditor@example.com',
        eventTypes: ['auth.login', 'auth.logout'],
        entityType: 'candidate',
        entityId: '77777777-7777-7777-7777-777777777777',
        page: 2,
        pageSize: 25,
        from: expect.any(Date),
        to: expect.any(Date)
      })
    );
  });

  it('returns deterministic page 3 metadata with records 101-150 at pageSize 50', async () => {
    mocks.getAuditLogPage.mockResolvedValueOnce(buildResult(3, 50, 175, 101, 50));

    const response = await request(app)
      .get('/api/admin/audit-log?page=3&pageSize=50')
      .set('Authorization', 'Bearer admin-token');

    expect(response.status).toBe(200);
    expect(response.body.page).toBe(3);
    expect(response.body.pageSize).toBe(50);
    expect(response.body.totalItems).toBe(175);
    expect(response.body.totalPages).toBe(4);
    expect(response.body.hasNextPage).toBe(true);
    expect(response.body.hasPrevPage).toBe(true);
    expect(response.body.items).toHaveLength(50);
    expect(response.body.items[0].id).toBe('evt-101');
    expect(response.body.items[49].id).toBe('evt-150');
  });

  it('returns 500 when query service fails', async () => {
    mocks.getAuditLogPage.mockRejectedValueOnce(new Error('database unavailable'));

    const response = await request(app)
      .get('/api/admin/audit-log')
      .set('Authorization', 'Bearer admin-token');

    expect(response.status).toBe(500);
    expect(response.body.error.code).toBe('INTERNAL_ERROR');
  });
});
