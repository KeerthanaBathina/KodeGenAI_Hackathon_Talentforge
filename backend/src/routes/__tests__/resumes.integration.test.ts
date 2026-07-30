import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  class MockResumeUploadError extends Error {
    code: string;

    constructor(code: string, message: string) {
      super(message);
      this.code = code;
      this.name = 'ResumeUploadError';
    }
  }

  return {
    prismaApplicationFindUnique: vi.fn(),
    generatePresignedUrl: vi.fn(),
    auditEvent: vi.fn(),
    loggerError: vi.fn(),
    ResumeUploadError: MockResumeUploadError,
  };
});

vi.mock('../../middleware/authenticate', () => ({
  authenticate: (req: any, _res: any, next: any) => {
    req.user = {
      id: 'candidate-123',
      email: 'candidate@example.com',
      role: 'candidate',
    };
    next();
  },
}));

vi.mock('../../db/prisma', () => ({
  default: {
    application: {
      findUnique: mocks.prismaApplicationFindUnique,
    },
  },
}));

vi.mock('../../services/resumeService', () => ({
  generatePresignedUrl: mocks.generatePresignedUrl,
  ResumeUploadError: mocks.ResumeUploadError,
}));

vi.mock('../../services/auditService', () => ({
  auditEvent: mocks.auditEvent,
}));

vi.mock('../../utils/logger', () => ({
  default: {
    error: mocks.loggerError,
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

import resumesRouter from '../resumes';

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/resumes', resumesRouter);
  return app;
}

describe('Resume upload route integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auditEvent.mockResolvedValue(undefined);
  });

  it('emits started and completed audit events for successful upload URL generation', async () => {
    mocks.prismaApplicationFindUnique.mockResolvedValue({
      id: '550e8400-e29b-41d4-a716-446655440001',
      candidateId: 'candidate-123',
    });

    mocks.generatePresignedUrl.mockResolvedValue({
      uploadUrl: 'https://storage.example.com/upload',
      storageKey: 'resumes/candidate-123/sample.pdf',
      resumeId: 'resume-123',
      expiresIn: 300,
    });

    const app = createTestApp();
    const response = await request(app)
      .post('/api/resumes/presigned-url')
      .send({
        applicationId: '550e8400-e29b-41d4-a716-446655440001',
        fileName: 'sample.pdf',
        fileSize: 1024,
        mimeType: 'application/pdf',
      });

    expect(response.status).toBe(200);
    expect(response.body.resumeId).toBe('resume-123');

    expect(mocks.auditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'upload.resume_started',
        entityType: 'application',
        entityId: '550e8400-e29b-41d4-a716-446655440001',
      })
    );

    expect(mocks.auditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'upload.resume_completed',
        entityType: 'application',
        entityId: '550e8400-e29b-41d4-a716-446655440001',
        payload: expect.objectContaining({
          resumeId: 'resume-123',
        }),
      })
    );
  });

  it('emits failed audit event when candidate does not own application', async () => {
    mocks.prismaApplicationFindUnique.mockResolvedValue({
      id: '550e8400-e29b-41d4-a716-446655440002',
      candidateId: 'candidate-other',
    });

    const app = createTestApp();
    const response = await request(app)
      .post('/api/resumes/presigned-url')
      .send({
        applicationId: '550e8400-e29b-41d4-a716-446655440002',
        fileName: 'sample.pdf',
        fileSize: 1024,
        mimeType: 'application/pdf',
      });

    expect(response.status).toBe(403);
    expect(mocks.generatePresignedUrl).not.toHaveBeenCalled();
    expect(mocks.auditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'upload.resume_failed',
        entityType: 'application',
        entityId: '550e8400-e29b-41d4-a716-446655440002',
        payload: expect.objectContaining({
          reason: 'unauthorized_application_access',
        }),
      })
    );
  });

  it('emits failed audit event when resume service rejects upload request', async () => {
    mocks.prismaApplicationFindUnique.mockResolvedValue({
      id: '550e8400-e29b-41d4-a716-446655440003',
      candidateId: 'candidate-123',
    });

    mocks.generatePresignedUrl.mockRejectedValue(
      new mocks.ResumeUploadError('INVALID_FILE_TYPE', 'Only PDF and DOCX files are accepted')
    );

    const app = createTestApp();
    const response = await request(app)
      .post('/api/resumes/presigned-url')
      .send({
        applicationId: '550e8400-e29b-41d4-a716-446655440003',
        fileName: 'sample.txt',
        fileSize: 1024,
        mimeType: 'application/pdf',
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_FILE_TYPE');

    expect(mocks.auditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'upload.resume_failed',
        entityType: 'application',
        entityId: '550e8400-e29b-41d4-a716-446655440003',
        payload: expect.objectContaining({
          errorCode: 'INVALID_FILE_TYPE',
        }),
      })
    );
  });
});
