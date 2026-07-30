import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  prismaDecisionFindUnique: vi.fn(),
  prismaDecisionCreate: vi.fn(),
  prismaApplicationFindUnique: vi.fn(),
  validateReasonCode: vi.fn(),
  processDecisionOutcome: vi.fn(),
  getOutcomeMessage: vi.fn(),
  auditEvent: vi.fn(),
  loggerDebug: vi.fn(),
  loggerInfo: vi.fn(),
  loggerWarn: vi.fn(),
  loggerError: vi.fn()
}));

vi.mock('../../middleware/authenticate', () => ({
  authenticate: (req: { user?: unknown }, _res: unknown, next: () => void) => {
    req.user = {
      id: '11111111-1111-1111-1111-111111111111',
      email: 'hiring.manager@example.com',
      role: 'hiring_manager'
    };
    next();
  }
}));

vi.mock('../../middleware/authorize', () => ({
  authorize: () => (_req: unknown, _res: unknown, next: () => void) => next()
}));

vi.mock('../../middleware/validateDecisionPrerequisites', () => ({
  validateDecisionPrerequisites: (_req: unknown, _res: unknown, next: () => void) => next()
}));

vi.mock('../../db/prisma', () => ({
  default: {
    decision: {
      findUnique: mocks.prismaDecisionFindUnique,
      create: mocks.prismaDecisionCreate
    },
    application: {
      findUnique: mocks.prismaApplicationFindUnique
    }
  }
}));

vi.mock('../../services/reasonCodeService', () => ({
  validateReasonCode: mocks.validateReasonCode
}));

vi.mock('../../services/decisionOutcomeProcessor', () => ({
  processDecisionOutcome: mocks.processDecisionOutcome,
  getOutcomeMessage: mocks.getOutcomeMessage
}));

vi.mock('../../services/auditService', () => ({
  auditEvent: mocks.auditEvent
}));

vi.mock('../../utils/logger', () => ({
  default: {
    debug: mocks.loggerDebug,
    info: mocks.loggerInfo,
    warn: mocks.loggerWarn,
    error: mocks.loggerError
  }
}));

import decisionsRouter from '../decisions';

const FIXED_ACTOR_ID = '11111111-1111-1111-1111-111111111111';
const APPLICATION_ID_A = '550e8400-e29b-41d4-a716-446655440000';
const APPLICATION_ID_B = '550e8400-e29b-41d4-a716-446655440001';
const REASON_CODE_ID = '660e8400-e29b-41d4-a716-446655440000';

function createTestApp(): express.Express {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json());
  app.use('/api/decisions', decisionsRouter);
  return app;
}

describe('Audit decision coverage matrix', () => {
  const app = createTestApp();

  beforeEach(() => {
    vi.clearAllMocks();

    mocks.prismaDecisionFindUnique.mockResolvedValue(null);
    mocks.prismaApplicationFindUnique.mockResolvedValue({
      id: APPLICATION_ID_A,
      requisitionId: 'requisition-001',
      candidateId: 'candidate-001'
    });
    mocks.validateReasonCode.mockResolvedValue({ valid: true });
    mocks.processDecisionOutcome.mockResolvedValue(undefined);
    mocks.getOutcomeMessage.mockReturnValue('Decision submitted');
    mocks.auditEvent.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('logs decision audit event with reason context and complete request metadata', async () => {
    mocks.prismaDecisionCreate.mockResolvedValue({
      id: 'decision-001',
      applicationId: APPLICATION_ID_A,
      outcome: 'reject',
      reasonCodeId: REASON_CODE_ID,
      compensationBand: null,
      decidedAt: new Date('2026-03-10T12:00:00.000Z'),
      decidedById: FIXED_ACTOR_ID
    });

    const response = await request(app)
      .post('/api/decisions')
      .set('x-forwarded-for', '198.51.100.21')
      .set('user-agent', 'AuditDecision/1.0')
      .send({
        applicationId: APPLICATION_ID_A,
        outcome: 'reject',
        reasonCodeId: REASON_CODE_ID,
        justification: 'Deterministic decision justification for audit matrix testing.'
      });

    expect(response.status).toBe(201);

    expect(mocks.auditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: FIXED_ACTOR_ID,
        actorRole: 'hiring_manager',
        eventType: 'decision.application_decision',
        entityType: 'application',
        entityId: APPLICATION_ID_A,
        ipAddress: '198.51.100.21',
        userAgent: 'AuditDecision/1.0',
        payload: expect.objectContaining({
          decisionId: 'decision-001',
          applicationId: APPLICATION_ID_A,
          outcome: 'reject',
          outcomeEventType: 'decision.reject',
          reasonCodeId: REASON_CODE_ID,
          reason_code_id: REASON_CODE_ID,
          requisitionId: 'requisition-001',
          candidateId: 'candidate-001'
        })
      })
    );
  });

  it('uses deterministic time fixture and preserves audit ordering across sequential decisions', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-15T09:00:00.000Z'));

    mocks.prismaApplicationFindUnique
      .mockResolvedValueOnce({
        id: APPLICATION_ID_A,
        requisitionId: 'requisition-001',
        candidateId: 'candidate-001'
      })
      .mockResolvedValueOnce({
        id: APPLICATION_ID_B,
        requisitionId: 'requisition-002',
        candidateId: 'candidate-002'
      });

    mocks.prismaDecisionCreate
      .mockResolvedValueOnce({
        id: 'decision-001',
        applicationId: APPLICATION_ID_A,
        outcome: 'hold',
        reasonCodeId: REASON_CODE_ID,
        compensationBand: null,
        decidedAt: new Date('2026-03-15T09:00:00.000Z'),
        decidedById: FIXED_ACTOR_ID
      })
      .mockResolvedValueOnce({
        id: 'decision-002',
        applicationId: APPLICATION_ID_B,
        outcome: 'hold',
        reasonCodeId: REASON_CODE_ID,
        compensationBand: null,
        decidedAt: new Date('2026-03-15T09:00:00.000Z'),
        decidedById: FIXED_ACTOR_ID
      });

    const basePayload = {
      outcome: 'hold',
      reasonCodeId: REASON_CODE_ID,
      justification: 'Deterministic decision justification for ordering verification.'
    };

    const firstResponse = await request(app)
      .post('/api/decisions')
      .set('x-forwarded-for', '198.51.100.22')
      .set('user-agent', 'AuditDecision/1.1')
      .send({
        ...basePayload,
        applicationId: APPLICATION_ID_A
      });

    const secondResponse = await request(app)
      .post('/api/decisions')
      .set('x-forwarded-for', '198.51.100.23')
      .set('user-agent', 'AuditDecision/1.2')
      .send({
        ...basePayload,
        applicationId: APPLICATION_ID_B
      });

    expect(firstResponse.status).toBe(201);
    expect(secondResponse.status).toBe(201);

    expect(mocks.prismaDecisionCreate).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({
          applicationId: APPLICATION_ID_A,
          decidedAt: new Date('2026-03-15T09:00:00.000Z')
        })
      })
    );

    expect(mocks.prismaDecisionCreate).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({
          applicationId: APPLICATION_ID_B,
          decidedAt: new Date('2026-03-15T09:00:00.000Z')
        })
      })
    );

    expect(mocks.auditEvent).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        entityId: APPLICATION_ID_A,
        payload: expect.objectContaining({ decisionId: 'decision-001' })
      })
    );

    expect(mocks.auditEvent).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        entityId: APPLICATION_ID_B,
        payload: expect.objectContaining({ decisionId: 'decision-002' })
      })
    );
  });
});
