import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveCanonicalAuditEventType } from '../../constants/auditEventTypes';

const mocks = vi.hoisted(() => ({
  prismaScreeningThresholdFindFirst: vi.fn(),
  prismaScreeningThresholdCreate: vi.fn(),
  auditLogEvent: vi.fn(),
  loggerDebug: vi.fn(),
  loggerInfo: vi.fn(),
  loggerWarn: vi.fn(),
  loggerError: vi.fn()
}));

vi.mock('../../middleware/authenticate', () => ({
  authenticate: (req: { user?: unknown }, _res: unknown, next: () => void) => {
    req.user = {
      id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      email: 'admin.thresholds@example.com',
      role: 'admin'
    };
    next();
  }
}));

vi.mock('../../middleware/authorize', () => ({
  authorize: () => (_req: unknown, _res: unknown, next: () => void) => next()
}));

vi.mock('../../db/prisma', () => {
  const prisma = {
    screeningThreshold: {
      findFirst: mocks.prismaScreeningThresholdFindFirst,
      create: mocks.prismaScreeningThresholdCreate
    }
  };

  return {
    default: prisma,
    prisma
  };
});

vi.mock('../../services/auditService', () => ({
  auditService: {
    logEvent: mocks.auditLogEvent,
    logEventOrThrow: vi.fn()
  },
  auditEvent: vi.fn(),
  auditEventOrThrow: vi.fn()
}));

vi.mock('../../utils/logger', () => ({
  default: {
    debug: mocks.loggerDebug,
    info: mocks.loggerInfo,
    warn: mocks.loggerWarn,
    error: mocks.loggerError
  }
}));

import thresholdsRouter from '../admin/thresholds';

function createTestApp(): express.Express {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json());
  app.use('/api/admin/thresholds', thresholdsRouter);
  return app;
}

describe('Audit config coverage matrix', () => {
  const app = createTestApp();

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auditLogEvent.mockResolvedValue(undefined);
  });

  it('captures threshold version event with old/new values and request metadata', async () => {
    const effectiveFrom = '2026-07-15T00:00:00.000Z';

    mocks.prismaScreeningThresholdFindFirst.mockResolvedValue({
      id: 'threshold-prev',
      shortlistThreshold: 75,
      borderlineMin: 40,
      borderlineMax: 74,
      rejectThreshold: 39,
      version: 4,
      effectiveFrom: new Date('2026-07-01T00:00:00.000Z')
    });

    mocks.prismaScreeningThresholdCreate.mockResolvedValue({
      id: 'threshold-new',
      shortlistThreshold: 78,
      borderlineMin: 45,
      borderlineMax: 77,
      rejectThreshold: 44,
      version: 5,
      effectiveFrom: new Date(effectiveFrom),
      createdAt: new Date('2026-07-10T00:00:00.000Z')
    });

    const response = await request(app)
      .post('/api/admin/thresholds')
      .set('x-forwarded-for', '198.51.100.31')
      .set('user-agent', 'AuditConfig/1.0')
      .send({
        shortlistThreshold: 78,
        borderlineMin: 45,
        borderlineMax: 77,
        rejectThreshold: 44,
        effectiveFrom
      });

    expect(response.status).toBe(201);

    expect(mocks.prismaScreeningThresholdCreate).toHaveBeenCalledWith({
      data: {
        shortlistThreshold: 78,
        borderlineMin: 45,
        borderlineMax: 77,
        rejectThreshold: 44,
        effectiveFrom: new Date(effectiveFrom),
        version: 5
      }
    });

    expect(mocks.auditLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'threshold.version_created',
        actorId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        resourceType: 'ScreeningThreshold',
        resourceId: 'threshold-new',
        ipAddress: '198.51.100.31',
        userAgent: 'AuditConfig/1.0',
        metadata: expect.objectContaining({
          version: 5,
          oldValues: {
            shortlistThreshold: 75,
            borderlineMin: 40,
            borderlineMax: 74,
            rejectThreshold: 39
          },
          newValues: {
            shortlistThreshold: 78,
            borderlineMin: 45,
            borderlineMax: 77,
            rejectThreshold: 44
          }
        })
      })
    );

    const auditInput = mocks.auditLogEvent.mock.calls[0]?.[0] as { action?: string };
    const canonical = resolveCanonicalAuditEventType(String(auditInput.action ?? ''));
    expect(canonical.eventType).toBe('config.threshold_version_created');
  });
});
