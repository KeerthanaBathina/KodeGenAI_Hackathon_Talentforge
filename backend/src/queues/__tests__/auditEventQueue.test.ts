import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PersistableAuditEventInput } from '../../services/auditService';

const mocks = vi.hoisted(() => ({
  queueInstances: new Map<string, any>(),
  redisOn: vi.fn(),
  loggerDebug: vi.fn(),
  loggerInfo: vi.fn(),
  loggerError: vi.fn()
}));

vi.mock('../../config/env', () => ({
  env: {
    REDIS_URL: 'redis://localhost:6379'
  }
}));

vi.mock('ioredis', () => ({
  default: vi.fn().mockImplementation(() => ({
    on: mocks.redisOn,
    connect: vi.fn(),
    disconnect: vi.fn()
  }))
}));

vi.mock('../../utils/logger', () => ({
  default: {
    debug: mocks.loggerDebug,
    info: mocks.loggerInfo,
    error: mocks.loggerError,
    warn: vi.fn(),
    fatal: vi.fn()
  }
}));

vi.mock('bullmq', () => ({
  Queue: vi.fn().mockImplementation((name: string, opts: any) => {
    const queue = {
      name,
      opts,
      add: vi.fn(async (jobName: string, data: any, options: any) => ({
        id: options?.jobId ?? `${name}-${Date.now()}`,
        name: jobName,
        data,
        opts: options
      })),
      close: vi.fn(async () => undefined),
      on: vi.fn()
    };

    mocks.queueInstances.set(name, queue);
    return queue;
  })
}));

import {
  AUDIT_EVENT_DEAD_LETTER_QUEUE_NAME,
  AUDIT_EVENT_QUEUE_NAME,
  auditEventDeadLetterQueue,
  auditEventQueue,
  buildAuditEventJobId,
  closeAuditEventQueues,
  createAuditEventQueueJobData,
  enqueueAuditEvent,
  moveAuditEventToDeadLetter
} from '../auditEventQueue';

const baseEvent: PersistableAuditEventInput = {
  actorId: '11111111-1111-1111-1111-111111111111',
  eventType: 'application.submitted',
  entityType: 'application',
  entityId: '22222222-2222-2222-2222-222222222222',
  payload: {
    applicationId: '22222222-2222-2222-2222-222222222222'
  },
  ipAddress: '203.0.113.10',
  userAgent: 'Vitest/2.0'
};

describe('auditEventQueue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates queue with reliability-first retry defaults', () => {
    expect(auditEventQueue.name).toBe(AUDIT_EVENT_QUEUE_NAME);
    expect(auditEventQueue.opts.defaultJobOptions.attempts).toBe(5);
    expect(auditEventQueue.opts.defaultJobOptions.backoff).toEqual({
      type: 'exponential',
      delay: 1000
    });
    expect(auditEventQueue.opts.defaultJobOptions.removeOnFail).toBe(false);
  });

  it('creates dead-letter queue for terminal failures', () => {
    expect(auditEventDeadLetterQueue.name).toBe(AUDIT_EVENT_DEAD_LETTER_QUEUE_NAME);
    expect(auditEventDeadLetterQueue.opts.defaultJobOptions.removeOnComplete).toBe(false);
  });

  it('builds deterministic job IDs from event payload', () => {
    const jobDataA = createAuditEventQueueJobData(baseEvent);
    const jobDataB = createAuditEventQueueJobData(baseEvent);

    const firstId = buildAuditEventJobId(jobDataA);
    const secondId = buildAuditEventJobId(jobDataB);

    expect(firstId).toBe(secondId);
  });

  it('uses explicit idempotency key when provided', async () => {
    const jobData = createAuditEventQueueJobData(baseEvent, {
      idempotencyKey: 'request-abc-123',
      source: 'route-test'
    });

    const jobId = await enqueueAuditEvent(jobData);
    expect(jobId).toBe('audit-request-abc-123');

    expect(auditEventQueue.add).toHaveBeenCalledWith(
      'persist-audit-event',
      expect.objectContaining({ source: 'route-test' }),
      expect.objectContaining({
        jobId: 'audit-request-abc-123',
        attempts: 5
      })
    );
  });

  it('resolves deterministic idempotency key when none is provided', () => {
    const jobData = createAuditEventQueueJobData(baseEvent);
    expect(jobData.idempotencyKey).toMatch(/^[0-9a-f]{40}$/i);
  });

  it('validates required payload fields before enqueue', async () => {
    const invalidEvent = {
      ...baseEvent,
      eventType: ''
    };

    expect(() => createAuditEventQueueJobData(invalidEvent)).toThrow(
      'Audit queue payload requires event.eventType'
    );
  });

  it('moves failed jobs to dead-letter queue with failure metadata', async () => {
    const jobData = createAuditEventQueueJobData(baseEvent, {
      idempotencyKey: 'dlq-test'
    });

    const deadLetterJobId = await moveAuditEventToDeadLetter({
      originalJobId: 'audit-dlq-test',
      attemptsMade: 5,
      failedReason: 'database timeout',
      data: jobData
    });

    expect(deadLetterJobId).toBe('dlq-audit-dlq-test');
    expect(auditEventDeadLetterQueue.add).toHaveBeenCalledWith(
      'dead-letter-audit-event',
      expect.objectContaining({
        originalJobId: 'audit-dlq-test',
        attemptsMade: 5,
        failedReason: 'database timeout'
      }),
      expect.objectContaining({
        jobId: 'dlq-audit-dlq-test'
      })
    );
  });

  it('suppresses duplicate enqueue attempts without throwing', async () => {
    const duplicateError = new Error('JobId already exists');
    (auditEventQueue.add as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(duplicateError);

    const jobData = createAuditEventQueueJobData(baseEvent, {
      idempotencyKey: 'duplicate-request'
    });

    const jobId = await enqueueAuditEvent(jobData);

    expect(jobId).toBe('audit-duplicate-request');
    expect(mocks.loggerInfo).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: 'audit-duplicate-request',
        idempotencyKey: 'duplicate-request'
      }),
      'Audit event duplicate enqueue suppressed'
    );
  });

  it('closes both queue connections during shutdown', async () => {
    await closeAuditEventQueues();

    expect(auditEventQueue.close).toHaveBeenCalledOnce();
    expect(auditEventDeadLetterQueue.close).toHaveBeenCalledOnce();
  });
});