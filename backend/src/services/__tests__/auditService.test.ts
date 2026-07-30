import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../db/prisma', () => ({
  default: {
    auditEvent: {
      findFirst: vi.fn(),
      create: vi.fn()
    }
  }
}));

vi.mock('../../utils/logger', () => ({
  default: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn()
  }
}));

const queueMocks = vi.hoisted(() => ({
  createAuditEventQueueJobData: vi.fn((event, options) => ({
    event,
    idempotencyKey: options?.idempotencyKey,
    source: options?.source,
    requestedAt: new Date().toISOString()
  })),
  enqueueAuditEvent: vi.fn()
}));

vi.mock('../../queues/auditEventQueue', () => ({
  createAuditEventQueueJobData: queueMocks.createAuditEventQueueJobData,
  enqueueAuditEvent: queueMocks.enqueueAuditEvent
}));

import prisma from '../../db/prisma';
import logger from '../../utils/logger';
import { AUDIT_EVENT_TYPES } from '../../constants/auditEventTypes';
import { auditEvent, auditEventOrThrow, persistAuditEventOrThrow } from '../auditService';

const mockCreate = vi.mocked(
  (prisma as unknown as { auditEvent: { create: ReturnType<typeof vi.fn> } }).auditEvent.create
);
const mockFindFirst = vi.mocked(
  (prisma as unknown as { auditEvent: { findFirst: ReturnType<typeof vi.fn> } }).auditEvent.findFirst
);
const mockLogError = vi.mocked(logger.error);
const mockLogWarn = vi.mocked(logger.warn);

const baseInput = {
  actorId: '11111111-1111-1111-1111-111111111111',
  eventType: 'application.submitted',
  entityType: 'application',
  entityId: '22222222-2222-2222-2222-222222222222',
  payload: {
    applicationId: '22222222-2222-2222-2222-222222222222'
  }
};

beforeEach(() => {
  vi.clearAllMocks();
  mockFindFirst.mockResolvedValue(null);
  mockCreate.mockResolvedValue({ id: '33333333-3333-3333-3333-333333333333' });
  queueMocks.enqueueAuditEvent.mockResolvedValue('audit-job-123');
});

describe('auditEvent', () => {
  it('enqueues normalized payload for async persistence', async () => {
    await auditEvent(baseInput);

    expect(queueMocks.createAuditEventQueueJobData).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'application.submitted',
        entityType: 'application',
        entityId: '22222222-2222-2222-2222-222222222222',
        payload: baseInput.payload
      }),
      expect.objectContaining({
        source: 'auditService'
      })
    );

    expect(queueMocks.enqueueAuditEvent).toHaveBeenCalledOnce();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('maps legacy input to canonical event before enqueue', async () => {
    await auditEvent({
      action: 'privacy_consent_accepted',
      actorId: '11111111-1111-1111-1111-111111111111',
      resourceType: 'privacy_consent',
      resourceId: '22222222-2222-2222-2222-222222222222',
      metadata: {
        source: 'legacy-service'
      }
    });

    expect(queueMocks.createAuditEventQueueJobData).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: AUDIT_EVENT_TYPES.PRIVACY_CONSENT_ACCEPTED,
        entityType: 'privacy_consent',
        entityId: '22222222-2222-2222-2222-222222222222',
        payload: expect.objectContaining({
          source: 'legacy-service',
          legacyEventType: 'privacy_consent_accepted'
        })
      }),
      expect.any(Object)
    );
  });

  it('converts non-uuid entity IDs in queued payload', async () => {
    await auditEvent({
      eventType: 'weekly_digest_sent',
      entityType: 'digest',
      entityId: 'weekly_digest',
      payload: {
        runId: 'run-1'
      }
    });

    expect(queueMocks.createAuditEventQueueJobData).toHaveBeenCalledWith(
      expect.objectContaining({
        entityId: expect.stringMatching(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i),
        payload: expect.objectContaining({
          entityRef: 'weekly_digest',
          legacyEventType: 'weekly_digest_sent'
        })
      }),
      expect.any(Object)
    );
  });

  it('swallows invalid payload errors and logs failure', async () => {
    await expect(
      auditEvent({
        ...baseInput,
        eventType: ' '
      })
    ).resolves.toBeUndefined();

    expect(mockLogError).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: ' ' }),
      'auditEvent: failed to write audit record'
    );
    expect(queueMocks.enqueueAuditEvent).not.toHaveBeenCalled();
  });

  it('falls back to direct write when enqueue fails', async () => {
    queueMocks.enqueueAuditEvent.mockRejectedValueOnce(new Error('Redis unavailable'));

    await auditEvent(baseInput);

    await vi.waitFor(() => {
      expect(mockCreate).toHaveBeenCalledOnce();
    });

    expect(mockCreate).toHaveBeenCalledOnce();
    expect(mockLogError).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'application.submitted',
        entityType: 'application',
        entityId: '22222222-2222-2222-2222-222222222222'
      }),
      'auditEvent: failed to enqueue audit record'
    );
    expect(mockLogWarn).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'application.submitted'
      }),
      'auditEvent: enqueue failed, direct-write fallback succeeded'
    );
  });

  it('logs when enqueue and direct-write fallback both fail', async () => {
    queueMocks.enqueueAuditEvent.mockRejectedValueOnce(new Error('Redis unavailable'));
    mockCreate.mockRejectedValueOnce(new Error('DB down'));

    await auditEvent(baseInput);

    await vi.waitFor(() => {
      expect(mockLogError).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'application.submitted'
        }),
        'auditEvent: enqueue failed and direct-write fallback failed'
      );
    });
  });
});

describe('auditEventOrThrow', () => {
  it('re-throws database error', async () => {
    mockCreate.mockRejectedValue(new Error('DB connection lost'));
    await expect(auditEventOrThrow(baseInput)).rejects.toThrow('DB connection lost');
  });

  it('resolves when insert succeeds', async () => {
    await expect(auditEventOrThrow(baseInput)).resolves.toBeUndefined();
  });

  it('persists mapped legacy payloads via strict write path', async () => {
    await auditEventOrThrow({
      action: 'privacy_consent_accepted',
      actorId: baseInput.actorId,
      resourceType: 'privacy_consent',
      resourceId: baseInput.entityId,
      metadata: {
        source: 'legacy'
      }
    });

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventType: AUDIT_EVENT_TYPES.PRIVACY_CONSENT_ACCEPTED,
          entityType: 'privacy_consent',
          entityId: baseInput.entityId,
          payloadJson: expect.objectContaining({
            source: 'legacy',
            legacyEventType: 'privacy_consent_accepted'
          })
        })
      })
    );
  });

  it('truncates long user-agent on strict persistence path', async () => {
    const longUserAgent = 'A'.repeat(700);

    await auditEventOrThrow({
      ...baseInput,
      userAgent: longUserAgent
    });

    const call = mockCreate.mock.calls[0];
    const persistedUserAgent = (call as [{ data: { userAgent: string } }])[0].data.userAgent;
    expect(persistedUserAgent).toHaveLength(512);
  });
});

describe('persistAuditEventOrThrow idempotency', () => {
  it('suppresses duplicate writes for replayed idempotency key', async () => {
    mockFindFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'existing-event-id' } as any);

    const first = await persistAuditEventOrThrow(
      {
        actorId: baseInput.actorId,
        eventType: baseInput.eventType,
        entityType: baseInput.entityType,
        entityId: baseInput.entityId,
        payload: {
          ...baseInput.payload
        },
        ipAddress: null,
        userAgent: null
      },
      {
        idempotencyKey: 'replay-123',
        source: 'test'
      }
    );

    const second = await persistAuditEventOrThrow(
      {
        actorId: baseInput.actorId,
        eventType: baseInput.eventType,
        entityType: baseInput.entityType,
        entityId: baseInput.entityId,
        payload: {
          ...baseInput.payload
        },
        ipAddress: null,
        userAgent: null
      },
      {
        idempotencyKey: 'replay-123',
        source: 'test'
      }
    );

    expect(first).toBe('created');
    expect(second).toBe('duplicate_suppressed');
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockFindFirst).toHaveBeenCalledTimes(2);
  });
});
