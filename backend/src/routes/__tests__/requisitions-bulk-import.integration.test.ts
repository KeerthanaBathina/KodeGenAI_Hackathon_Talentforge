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
  importRequisitionsFromCSV: vi.fn(),
  generateErrorReportCSV: vi.fn(),
  redisSetex: vi.fn(),
  redisGet: vi.fn(),
  loggerInfo: vi.fn(),
  loggerWarn: vi.fn(),
  loggerError: vi.fn(),
  loggerDebug: vi.fn()
}));

vi.mock('../../services/csvImportService', () => ({
  importRequisitionsFromCSV: mocks.importRequisitionsFromCSV,
  generateErrorReportCSV: mocks.generateErrorReportCSV
}));

vi.mock('../../db/redis', () => ({
  redis: {
    setex: mocks.redisSetex,
    get: mocks.redisGet
  }
}));

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

describe('Requisitions bulk import API', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.importRequisitionsFromCSV.mockResolvedValue({
      success: true,
      totalRows: 2,
      validRows: 2,
      invalidRows: 0,
      duplicateRows: 0,
      importedRequisitions: ['req-1', 'req-2'],
      errors: [],
      duplicates: []
    });

    mocks.generateErrorReportCSV.mockReturnValue('row_number,error_type,field,value,message\n');
    mocks.redisSetex.mockResolvedValue('OK');
    mocks.redisGet.mockResolvedValue(null);
  });

  describe('POST /api/requisitions/bulk-import', () => {
    it('imports valid CSV and returns summary', async () => {
      const csv =
        'role_title,department,location,job_type,slots,job_family\n' +
        'Senior Engineer,Engineering,Remote,full_time,2,Software Development\n' +
        'Product Manager,Product,Remote,full_time,1,Product Management';

      const response = await request(app)
        .post('/api/requisitions/bulk-import')
        .set('Authorization', 'Bearer recruiter-token')
        .attach('file', Buffer.from(csv), 'requisitions.csv');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.results.totalRows).toBe(2);
      expect(response.body.results.importedCount).toBe(2);
      expect(response.body.results.invalidCount).toBe(0);
      expect(response.body.results.duplicateCount).toBe(0);
      expect(response.body.errorReportUrl).toBeUndefined();
      expect(mocks.importRequisitionsFromCSV).toHaveBeenCalledOnce();
    });

    it('returns error report URL when invalid rows exist', async () => {
      mocks.importRequisitionsFromCSV.mockResolvedValueOnce({
        success: true,
        totalRows: 2,
        validRows: 1,
        invalidRows: 1,
        duplicateRows: 0,
        importedRequisitions: ['req-1'],
        errors: [
          {
            rowNumber: 3,
            field: 'role_title',
            value: '',
            message: 'Role title is required'
          }
        ],
        duplicates: []
      });

      const csv =
        'role_title,department,location,job_type,slots,job_family\n' +
        'Senior Engineer,Engineering,Remote,full_time,2,Software Development\n' +
        ',Marketing,NYC,full_time,1,Product Management';

      const response = await request(app)
        .post('/api/requisitions/bulk-import')
        .set('Authorization', 'Bearer recruiter-token')
        .attach('file', Buffer.from(csv), 'requisitions.csv');

      expect(response.status).toBe(200);
      expect(response.body.results.importedCount).toBe(1);
      expect(response.body.results.invalidCount).toBe(1);
      expect(response.body.errorReportUrl).toMatch(/^\/api\/requisitions\/bulk-import\/error-report\//);
      expect(mocks.redisSetex).toHaveBeenCalledOnce();
    });

    it('maps missing required column failures to 400', async () => {
      mocks.importRequisitionsFromCSV.mockRejectedValueOnce(
        new Error('Missing required column: job_type')
      );

      const csv = 'role_title,department\nSenior Engineer,Engineering';

      const response = await request(app)
        .post('/api/requisitions/bulk-import')
        .set('Authorization', 'Bearer recruiter-token')
        .attach('file', Buffer.from(csv), 'requisitions.csv');

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('INVALID_CSV_FORMAT');
    });

    it('rejects non-csv file types', async () => {
      const response = await request(app)
        .post('/api/requisitions/bulk-import')
        .set('Authorization', 'Bearer recruiter-token')
        .attach('file', Buffer.from('not csv'), 'document.txt');

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('INVALID_FILE_TYPE');
    });

    it('rejects missing uploaded file', async () => {
      const response = await request(app)
        .post('/api/requisitions/bulk-import')
        .set('Authorization', 'Bearer recruiter-token');

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('No file uploaded');
    });

    it('rejects file larger than 5MB', async () => {
      const oversized = Buffer.alloc(5 * 1024 * 1024 + 1, 'a');
      const response = await request(app)
        .post('/api/requisitions/bulk-import')
        .set('Authorization', 'Bearer recruiter-token')
        .attach('file', oversized, 'large.csv');

      expect(response.status).toBe(413);
      expect(response.body.error).toBe('FILE_TOO_LARGE');
    });

    it('requires authentication', async () => {
      const response = await request(app)
        .post('/api/requisitions/bulk-import')
        .attach('file', Buffer.from('a,b\n1,2'), 'requisitions.csv');

      expect(response.status).toBe(401);
    });

    it('requires recruiter or admin role', async () => {
      const response = await request(app)
        .post('/api/requisitions/bulk-import')
        .set('Authorization', 'Bearer candidate-token')
        .attach('file', Buffer.from('a,b\n1,2'), 'requisitions.csv');

      expect(response.status).toBe(403);
    });
  });

  describe('GET /api/requisitions/bulk-import/error-report/:reportId', () => {
    it('downloads stored error report CSV', async () => {
      mocks.redisGet.mockResolvedValueOnce('row_number,error_type\n2,validation\n');

      const response = await request(app)
        .get('/api/requisitions/bulk-import/error-report/report-123')
        .set('Authorization', 'Bearer recruiter-token');

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('text/csv');
      expect(response.text).toContain('row_number,error_type');
    });

    it('returns 404 when report does not exist', async () => {
      mocks.redisGet.mockResolvedValueOnce(null);

      const response = await request(app)
        .get('/api/requisitions/bulk-import/error-report/nonexistent')
        .set('Authorization', 'Bearer recruiter-token');

      expect(response.status).toBe(404);
      expect(response.body.error).toContain('not found or expired');
    });

    it('requires authentication', async () => {
      const response = await request(app).get('/api/requisitions/bulk-import/error-report/report-123');
      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/requisitions/bulk-import/template', () => {
    it('downloads csv template', async () => {
      const response = await request(app)
        .get('/api/requisitions/bulk-import/template')
        .set('Authorization', 'Bearer recruiter-token');

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('text/csv');
      expect(response.text).toContain('role_title');
      expect(response.text).toContain('job_family');
      expect(response.text).toContain('Senior Software Engineer');
    });

    it('requires authentication', async () => {
      const response = await request(app).get('/api/requisitions/bulk-import/template');
      expect(response.status).toBe(401);
    });
  });
});
