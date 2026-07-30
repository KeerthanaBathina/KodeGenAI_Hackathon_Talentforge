import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const mocks = vi.hoisted(() => ({
  streamAuditLogCsv: vi.fn(),
  loggerInfo: vi.fn(),
  loggerWarn: vi.fn(),
  loggerError: vi.fn(),
  loggerDebug: vi.fn()
}));

vi.mock('../../services/auditLogExportService', () => ({
  streamAuditLogCsv: mocks.streamAuditLogCsv
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

describe('GET /api/admin/audit-log/export.csv', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.streamAuditLogCsv.mockImplementation(async (_filters, res) => {
      res.status(200);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="audit-log.csv"');
      res.send([
        'event_id,event_type,entity_type,entity_id,created_at,actor_id,actor_email,ip_address,user_agent,payload_json',
        'evt-1,auth.login,session,11111111-1111-1111-1111-111111111111,2026-07-30T10:00:00.000Z,,,198.51.100.10,AuditTest/1.0,"{""action"":""login""}"'
      ].join('\n'));
    });
  });

  it('rejects unauthenticated requests', async () => {
    const response = await request(app).get('/api/admin/audit-log/export.csv');

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
  });

  it('rejects authenticated users without admin/compliance role', async () => {
    const response = await request(app)
      .get('/api/admin/audit-log/export.csv')
      .set('Authorization', 'Bearer recruiter-token');

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
  });

  it('allows compliance users and streams csv with expected headers/content', async () => {
    const response = await request(app)
      .get('/api/admin/audit-log/export.csv')
      .set('Authorization', 'Bearer compliance-token');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/csv');
    expect(response.headers['content-disposition']).toContain('attachment; filename="audit-log.csv"');
    expect(response.text).toContain('event_id,event_type,entity_type,entity_id');
    expect(response.text).toContain('evt-1,auth.login,session');
    expect(mocks.streamAuditLogCsv).toHaveBeenCalledOnce();
  });

  it('returns structured validation errors for malformed query params', async () => {
    const response = await request(app)
      .get('/api/admin/audit-log/export.csv?page=0&pageSize=500')
      .set('Authorization', 'Bearer admin-token');

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_QUERY_PARAMS');
    expect(Array.isArray(response.body.error.details)).toBe(true);
    expect(response.body.error.details.length).toBeGreaterThan(0);
  });

  it('returns validation error for edge date range where from is after to', async () => {
    const response = await request(app)
      .get('/api/admin/audit-log/export.csv?from=2026-08-02T00:00:00.000Z&to=2026-08-01T00:00:00.000Z')
      .set('Authorization', 'Bearer admin-token');

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_QUERY_PARAMS');
  });

  it('applies shared filters before invoking export service', async () => {
    await request(app)
      .get('/api/admin/audit-log/export.csv')
      .query({
        actorEmail: ' Auditor@Example.com ',
        eventTypes: ['auth.login,auth.logout'],
        entityType: 'session',
        entityId: '99999999-9999-9999-9999-999999999999',
        from: '2026-07-01T00:00:00.000Z',
        to: '2026-07-31T23:59:59.999Z'
      })
      .set('Authorization', 'Bearer admin-token')
      .expect(200);

    expect(mocks.streamAuditLogCsv).toHaveBeenCalledWith(
      expect.objectContaining({
        actorEmail: 'auditor@example.com',
        eventTypes: ['auth.login', 'auth.logout'],
        entityType: 'session',
        entityId: '99999999-9999-9999-9999-999999999999',
        from: expect.any(Date),
        to: expect.any(Date)
      }),
      expect.any(Object)
    );
  });

  it('returns 500 when export service fails before streaming starts', async () => {
    mocks.streamAuditLogCsv.mockRejectedValueOnce(new Error('export failed'));

    const response = await request(app)
      .get('/api/admin/audit-log/export.csv')
      .set('Authorization', 'Bearer admin-token');

    expect(response.status).toBe(500);
    expect(response.body.error.code).toBe('INTERNAL_ERROR');
  });
});
