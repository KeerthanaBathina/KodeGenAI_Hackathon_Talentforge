import express from 'express';
import { MulterError } from 'multer';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  randomUUID: vi.fn(),
  resumeGeneratePresignedUrl: vi.fn(),
  prismaApplicationFindUnique: vi.fn(),
  importRequisitionsFromCSV: vi.fn(),
  generateErrorReportCSV: vi.fn(),
  redisSetex: vi.fn(),
  redisGet: vi.fn(),
  auditEvent: vi.fn(),
  loggerDebug: vi.fn(),
  loggerInfo: vi.fn(),
  loggerWarn: vi.fn(),
  loggerError: vi.fn()
}));

vi.mock('crypto', async () => {
  const actual = await vi.importActual<typeof import('crypto')>('crypto');
  return {
    ...actual,
    randomUUID: mocks.randomUUID
  };
});

vi.mock('../../services/requisitionService', () => ({
  listRequisitions: vi.fn(),
  getFilterOptions: vi.fn(),
  getRequisitionById: vi.fn()
}));

vi.mock('../../services/applicationDraftService', () => ({
  hasDraft: vi.fn().mockResolvedValue(false)
}));

vi.mock('../../services/applicationStatusService', () => ({
  checkApplicationEligibility: vi.fn().mockResolvedValue({ eligible: true })
}));

vi.mock('../../services/csvImportService', () => ({
  importRequisitionsFromCSV: mocks.importRequisitionsFromCSV,
  generateErrorReportCSV: mocks.generateErrorReportCSV
}));

vi.mock('../../services/resumeService', () => ({
  generatePresignedUrl: mocks.resumeGeneratePresignedUrl,
  ResumeUploadError: class ResumeUploadError extends Error {
    code: string;

    constructor(code: string, message: string) {
      super(message);
      this.name = 'ResumeUploadError';
      this.code = code;
    }
  }
}));

vi.mock('../../db/prisma', () => ({
  default: {
    application: {
      findUnique: mocks.prismaApplicationFindUnique
    }
  }
}));

vi.mock('../../db/redis', () => ({
  redis: {
    setex: mocks.redisSetex,
    get: mocks.redisGet
  }
}));

vi.mock('../../services/auditService', () => ({
  auditEvent: mocks.auditEvent
}));

vi.mock('../../middleware/authenticate', () => ({
  authenticate: (req: { headers: Record<string, unknown>; user?: unknown }, res: any, next: () => void) => {
    const authHeader = String(req.headers.authorization ?? '');

    if (authHeader === 'Bearer candidate-token') {
      req.user = {
        id: '33333333-3333-3333-3333-333333333333',
        email: 'candidate@example.com',
        role: 'candidate'
      };
      next();
      return;
    }

    if (authHeader === 'Bearer recruiter-token') {
      req.user = {
        id: '22222222-2222-2222-2222-222222222222',
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

vi.mock('../../middleware/authorize', () => ({
  requireRole: (roles: string[]) =>
    (req: { user?: { role?: string } }, res: any, next: () => void) => {
      const role = req.user?.role;

      if (!role || !roles.includes(role)) {
        res.status(403).json({
          error: {
            code: 'FORBIDDEN',
            message: 'You do not have permission to access this resource'
          }
        });
        return;
      }

      next();
    }
}));

vi.mock('../../utils/logger', () => ({
  default: {
    debug: mocks.loggerDebug,
    info: mocks.loggerInfo,
    warn: mocks.loggerWarn,
    error: mocks.loggerError
  }
}));

import requisitionsRouter from '../requisitions';
import resumesRouter from '../resumes';

interface CapturedAuditInput {
  actorId?: string | null;
  eventType?: string;
  entityType?: string;
  entityId?: string;
  payload?: Record<string, unknown>;
  ipAddress?: string | null;
  userAgent?: string | null;
}

function createTestApp(): express.Express {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json());
  app.use('/api/requisitions', requisitionsRouter);
  app.use('/api/resumes', resumesRouter);

  app.use((err: Error, _req: unknown, res: any, next: () => void) => {
    if (err instanceof MulterError && err.code === 'LIMIT_FILE_SIZE') {
      res.status(413).json({
        success: false,
        error: 'FILE_TOO_LARGE',
        message: 'File size exceeds 5MB limit'
      });
      return;
    }

    if (err.message === 'Only CSV files are allowed') {
      res.status(400).json({
        success: false,
        error: 'INVALID_FILE_TYPE',
        message: 'Only CSV files are allowed'
      });
      return;
    }

    next();
  });

  return app;
}

function findAuditCall(eventType: string): CapturedAuditInput {
  for (const [arg] of mocks.auditEvent.mock.calls) {
    const payload = arg as CapturedAuditInput;
    if (payload.eventType === eventType) {
      return payload;
    }
  }

  throw new Error(`Expected audit event ${eventType} but none was captured.`);
}

describe('Audit upload coverage matrix', () => {
  const app = createTestApp();

  beforeEach(() => {
    vi.clearAllMocks();

    mocks.randomUUID.mockReset();
    mocks.auditEvent.mockResolvedValue(undefined);

    mocks.prismaApplicationFindUnique.mockResolvedValue({
      id: '44444444-4444-4444-8444-444444444444',
      candidateId: '33333333-3333-3333-3333-333333333333'
    });

    mocks.resumeGeneratePresignedUrl.mockResolvedValue({
      uploadUrl: 'https://storage.example.com/upload-url',
      resumeId: '55555555-5555-5555-5555-555555555555',
      storageKey: 'resumes/2026/05/resume.pdf',
      expiresIn: 600
    });

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

  it('logs resume upload started/completed events with complete actor and request context', async () => {
    mocks.randomUUID.mockReturnValueOnce('upload-request-001');

    const response = await request(app)
      .post('/api/resumes/presigned-url')
      .set('Authorization', 'Bearer candidate-token')
      .set('x-forwarded-for', '198.51.100.50')
      .set('user-agent', 'AuditUpload/1.0')
      .send({
        applicationId: '44444444-4444-4444-8444-444444444444',
        fileName: 'resume.pdf',
        fileSize: 1024,
        mimeType: 'application/pdf'
      });

    expect(response.status).toBe(200);

    const started = findAuditCall('upload.resume_started');
    const completed = findAuditCall('upload.resume_completed');

    expect(started).toMatchObject({
      actorId: '33333333-3333-3333-3333-333333333333',
      eventType: 'upload.resume_started',
      entityType: 'application',
      entityId: '44444444-4444-4444-8444-444444444444',
      ipAddress: '198.51.100.50',
      userAgent: 'AuditUpload/1.0',
      payload: expect.objectContaining({
        uploadRequestId: 'upload-request-001',
        fileName: 'resume.pdf',
        fileSize: 1024,
        mimeType: 'application/pdf'
      })
    });

    expect(completed).toMatchObject({
      actorId: '33333333-3333-3333-3333-333333333333',
      eventType: 'upload.resume_completed',
      entityType: 'application',
      entityId: '44444444-4444-4444-8444-444444444444',
      ipAddress: '198.51.100.50',
      userAgent: 'AuditUpload/1.0',
      payload: expect.objectContaining({
        uploadRequestId: 'upload-request-001',
        resumeId: '55555555-5555-5555-5555-555555555555',
        storageKey: 'resumes/2026/05/resume.pdf'
      })
    });

    const callEventTypes = mocks.auditEvent.mock.calls.map(
      ([arg]) => (arg as CapturedAuditInput).eventType
    );
    expect(callEventTypes).toEqual(['upload.resume_started', 'upload.resume_completed']);
  });

  it('logs requisition bulk import started/completed events in deterministic order', async () => {
    mocks.randomUUID.mockReturnValueOnce('import-session-001');

    const csv =
      'role_title,department,location,job_type,slots,job_family\n' +
      'Senior Engineer,Engineering,Remote,full_time,2,Software Development\n' +
      'Product Manager,Product,Remote,full_time,1,Product Management';

    const response = await request(app)
      .post('/api/requisitions/bulk-import')
      .set('Authorization', 'Bearer recruiter-token')
      .set('x-forwarded-for', '198.51.100.51')
      .set('user-agent', 'AuditUpload/1.1')
      .attach('file', Buffer.from(csv), 'requisitions.csv');

    expect(response.status).toBe(200);

    const started = findAuditCall('upload.requisition_import_started');
    const completed = findAuditCall('upload.requisition_import_completed');

    expect(started).toMatchObject({
      actorId: '22222222-2222-2222-2222-222222222222',
      eventType: 'upload.requisition_import_started',
      entityType: 'requisition_import',
      entityId: 'import-session-001',
      ipAddress: '198.51.100.51',
      userAgent: 'AuditUpload/1.1',
      payload: expect.objectContaining({
        fileName: 'requisitions.csv',
        mimeType: 'text/csv'
      })
    });

    expect(completed).toMatchObject({
      actorId: '22222222-2222-2222-2222-222222222222',
      eventType: 'upload.requisition_import_completed',
      entityType: 'requisition_import',
      entityId: 'import-session-001',
      ipAddress: '198.51.100.51',
      userAgent: 'AuditUpload/1.1',
      payload: expect.objectContaining({
        totalRows: 2,
        importedCount: 2,
        invalidCount: 0,
        duplicateCount: 0
      })
    });

    const callEventTypes = mocks.auditEvent.mock.calls.map(
      ([arg]) => (arg as CapturedAuditInput).eventType
    );
    expect(callEventTypes).toEqual([
      'upload.requisition_import_started',
      'upload.requisition_import_completed'
    ]);
  });
});
