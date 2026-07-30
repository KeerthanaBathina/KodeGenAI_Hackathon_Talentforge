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
    get: vi.fn().mockResolvedValue(null)
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

    res.status(401).json({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required'
      }
    });
  }
}));

import { app } from '../../app';

describe('Bulk Import Concurrency', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.generateErrorReportCSV.mockReturnValue('row_number,error_type,field,value,message\n');
    mocks.redisSetex.mockResolvedValue('OK');
  });

  it('should handle multiple simultaneous uploads', async () => {
    mocks.importRequisitionsFromCSV.mockResolvedValue({
      success: true,
      totalRows: 1,
      validRows: 1,
      invalidRows: 0,
      duplicateRows: 0,
      importedRequisitions: ['req-1'],
      errors: [],
      duplicates: []
    });

    const csv1 = `role_title,department,location,job_type,slots,job_family\nEngineer A,Engineering,Remote,full_time,2,Software Development`;
    const csv2 = `role_title,department,location,job_type,slots,job_family\nManager B,Product,San Francisco,full_time,1,Product Management`;

    const [response1, response2] = await Promise.all([
      request(app)
        .post('/api/requisitions/bulk-import')
        .set('Authorization', 'Bearer recruiter-token')
        .attach('file', Buffer.from(csv1), 'file1.csv'),
      request(app)
        .post('/api/requisitions/bulk-import')
        .set('Authorization', 'Bearer recruiter-token')
        .attach('file', Buffer.from(csv2), 'file2.csv')
    ]);

    expect(response1.status).toBe(200);
    expect(response2.status).toBe(200);
    expect(response1.body.results.importedCount).toBe(1);
    expect(response2.body.results.importedCount).toBe(1);
    expect(mocks.importRequisitionsFromCSV).toHaveBeenCalledTimes(2);
  });

  it('should detect race condition duplicates', async () => {
    let call = 0;
    mocks.importRequisitionsFromCSV.mockImplementation(async () => {
      call += 1;

      if (call === 1) {
        return {
          success: true,
          totalRows: 1,
          validRows: 1,
          invalidRows: 0,
          duplicateRows: 0,
          importedRequisitions: ['req-race-1'],
          errors: [],
          duplicates: []
        };
      }

      return {
        success: true,
        totalRows: 1,
        validRows: 1,
        invalidRows: 0,
        duplicateRows: 1,
        importedRequisitions: [],
        errors: [],
        duplicates: [
          {
            rowNumber: 2,
            title: 'Same Engineer',
            department: 'Engineering',
            location: 'Remote',
            existingRequisitionId: 'req-race-1'
          }
        ]
      };
    });

    const csv = `role_title,department,location,job_type,slots,job_family\nSame Engineer,Engineering,Remote,full_time,2,Software Development`;

    const [response1, response2] = await Promise.all([
      request(app)
        .post('/api/requisitions/bulk-import')
        .set('Authorization', 'Bearer recruiter-token')
        .attach('file', Buffer.from(csv), 'file1.csv'),
      request(app)
        .post('/api/requisitions/bulk-import')
        .set('Authorization', 'Bearer recruiter-token')
        .attach('file', Buffer.from(csv), 'file2.csv')
    ]);

    const imported = [response1.body.results.importedCount, response2.body.results.importedCount].filter(
      (count: number) => count > 0
    );
    const duplicates = [response1.body.results.duplicateCount, response2.body.results.duplicateCount].filter(
      (count: number) => count > 0
    );

    expect(response1.status).toBe(200);
    expect(response2.status).toBe(200);
    expect(imported.length).toBe(1);
    expect(duplicates.length).toBe(1);
  });
});
