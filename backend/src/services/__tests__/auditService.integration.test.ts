import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createAuditEventQueueJobData: vi.fn(),
  enqueueAuditEvent: vi.fn(),
  prismaAuditFindFirst: vi.fn(),
  prismaAuditCreate: vi.fn(),
  loggerDebug: vi.fn(),
  loggerInfo: vi.fn(),
  loggerWarn: vi.fn(),
  loggerError: vi.fn()
}));

vi.mock('../../queues/auditEventQueue', () => ({
  createAuditEventQueueJobData: mocks.createAuditEventQueueJobData,
  enqueueAuditEvent: mocks.enqueueAuditEvent
}));

vi.mock('../../db/prisma', () => ({
  default: {
    auditEvent: {
      findFirst: mocks.prismaAuditFindFirst,
      create: mocks.prismaAuditCreate
    }
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

import {
  auditEvent,
  auditEventOrThrow,
  persistAuditEventOrThrow,
} from '../auditService';

interface AuditCreateCall {
  data: {
    actor?: { connect: { id: string } };
    eventType: string;
    entityType: string;
    entityId: string;
    payloadJson: Record<string, unknown>;
    ipAddress: string | null;
    userAgent: string | null;
  };
}

describe('auditService integration behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.createAuditEventQueueJobData.mockImplementation((event: unknown, options: { idempotencyKey?: string; source?: string } = {}) => ({
      event,
      idempotencyKey: options.idempotencyKey ?? 'generated-idempotency',
      source: options.source ?? 'auditService',
      requestedAt: '2026-07-30T00:00:00.000Z'
    }));

    mocks.enqueueAuditEvent.mockResolvedValue('audit-job-001');
    mocks.prismaAuditFindFirst.mockResolvedValue(null);
    mocks.prismaAuditCreate.mockResolvedValue({ id: 'audit-row-001' });
  });

  it('persists complete audit record fields with explicit idempotency', async () => {
    const result = await persistAuditEventOrThrow(
      {
        actorId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        eventType: 'auth.login',
        entityType: 'user',
        entityId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        payload: {
          email: 'admin@example.com'
        },
        ipAddress: '203.0.113.10',
        userAgent: 'AuditService/1.0'
      },
      {
        idempotencyKey: 'request-id-001',
        source: 'integration-test'
      }
    );

    expect(result).toBe('created');
    expect(mocks.prismaAuditCreate).toHaveBeenCalledTimes(1);

    const createArg = mocks.prismaAuditCreate.mock.calls[0]?.[0] as AuditCreateCall;

    expect(createArg.data).toMatchObject({
      actor: { connect: { id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' } },
      eventType: 'auth.login',
      entityType: 'user',
      entityId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      ipAddress: '203.0.113.10',
      userAgent: 'AuditService/1.0',
      payloadJson: expect.objectContaining({
        email: 'admin@example.com',
        auditIdempotencyKey: 'request-id-001'
      })
    });
  });

  it('suppresses duplicate persistence deterministically on replay', async () => {
    const input = {
      actorId: null,
      eventType: 'decision.application_decision',
      entityType: 'application',
      entityId: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
      payload: {
        requestId: 'replay-001',
        outcome: 'offer'
      },
      ipAddress: '203.0.113.11',
      userAgent: 'AuditService/1.1'
    };

    mocks.prismaAuditFindFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'existing-audit-row' });

    const first = await persistAuditEventOrThrow(input, {
      idempotencyKey: 'request-id-replay-001',
      source: 'integration-test'
    });

    const second = await persistAuditEventOrThrow(input, {
      idempotencyKey: 'request-id-replay-001',
      source: 'integration-test'
    });

    expect(first).toBe('created');
    expect(second).toBe('duplicate_suppressed');
    expect(mocks.prismaAuditCreate).toHaveBeenCalledTimes(1);
  });

  it('normalizes legacy auth event types and null request context on strict persistence', async () => {
    await auditEventOrThrow({
      eventType: 'login_failed',
      entityType: 'user',
      entityId: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
      payload: {
        email: 'user@example.com',
        reason: 'invalid_password'
      },
      ipAddress: null,
      userAgent: null
    });

    const createArg = mocks.prismaAuditCreate.mock.calls[0]?.[0] as AuditCreateCall;

    expect(createArg.data.eventType).toBe('auth.login_failed');
    expect(createArg.data.entityType).toBe('user');
    expect(createArg.data.entityId).toBe('dddddddd-dddd-dddd-dddd-dddddddddddd');
    expect(createArg.data.ipAddress).toBeNull();
    expect(createArg.data.userAgent).toBeNull();
    expect(createArg.data.payloadJson).toMatchObject({
      email: 'user@example.com',
      reason: 'invalid_password'
    });
  });

  it('falls back to direct write when queue enqueue fails', async () => {
    mocks.enqueueAuditEvent.mockRejectedValueOnce(new Error('redis unavailable'));

    await auditEvent({
      actorId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      eventType: 'communication.retry',
      entityType: 'communication',
      entityId: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
      payload: {
        retryCount: 1,
        requestId: 'fallback-001'
      },
      ipAddress: '203.0.113.12',
      userAgent: 'AuditService/1.2'
    });

    await vi.waitFor(() => {
      expect(mocks.prismaAuditCreate).toHaveBeenCalledTimes(1);
    });

    const createArg = mocks.prismaAuditCreate.mock.calls[0]?.[0] as AuditCreateCall;
    expect(createArg.data).toMatchObject({
      eventType: 'communication.retry',
      entityType: 'communication',
      entityId: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'
    });
  });
});
