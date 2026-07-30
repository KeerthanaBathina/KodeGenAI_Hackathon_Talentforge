import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Job } from 'bullmq';
import type { AuditEventQueueJobData } from '../../queues/auditEventQueue';

const mocks = vi.hoisted(() => ({
  moveAuditEventToDeadLetter: vi.fn(),
  persistAuditEventOrThrow: vi.fn(),
  updateWorkerHeartbeat: vi.fn(),
  loggerDebug: vi.fn(),
  loggerWarn: vi.fn(),
  loggerError: vi.fn(),
  loggerInfo: vi.fn(),
  workerClose: vi.fn(),
  registeredHandlers: new Map<string, (...args: any[]) => any>()
}));

vi.mock('../../queues/auditEventQueue', () => ({
  AUDIT_EVENT_QUEUE_NAME: 'audit-events',
  connection: {},
  moveAuditEventToDeadLetter: mocks.moveAuditEventToDeadLetter
}));

vi.mock('../../services/auditService', () => ({
  persistAuditEventOrThrow: mocks.persistAuditEventOrThrow
}));

vi.mock('../../services/healthMetricsService', () => ({
  updateWorkerHeartbeat: mocks.updateWorkerHeartbeat
}));

vi.mock('../../utils/logger', () => ({
  default: {
    debug: mocks.loggerDebug,
    warn: mocks.loggerWarn,
    error: mocks.loggerError,
    info: mocks.loggerInfo
  }
}));

vi.mock('bullmq', () => ({
  Worker: vi.fn().mockImplementation((_queueName: string, _processor: any) => ({
    on: vi.fn((event: string, handler: (...args: any[]) => any) => {
      mocks.registeredHandlers.set(event, handler);
    }),
    close: mocks.workerClose
  }))
}));

import {
  processAuditEventJob,
  shutdownAuditEventWorker
} from '../auditEventWorker';

function createJob(overrides: Partial<Job<AuditEventQueueJobData>> = {}): Job<AuditEventQueueJobData> {
  const baseJob: Job<AuditEventQueueJobData> = {
    id: 'audit-job-1',
    attemptsMade: 0,
    opts: {
      attempts: 5
    },
    data: {
      event: {
        actorId: '11111111-1111-1111-1111-111111111111',
        eventType: 'application.submitted',
        entityType: 'application',
        entityId: '22222222-2222-2222-2222-222222222222',
        payload: {
          applicationId: '22222222-2222-2222-2222-222222222222'
        },
        ipAddress: '203.0.113.12',
        userAgent: 'Vitest/2.0'
      },
      idempotencyKey: 'req-abc',
      source: 'test-suite',
      requestedAt: new Date().toISOString()
    }
  } as Job<AuditEventQueueJobData>;

  return {
    ...baseJob,
    ...overrides,
    opts: {
      ...(baseJob.opts as Record<string, unknown>),
      ...(overrides.opts as Record<string, unknown> | undefined)
    } as Job<AuditEventQueueJobData>['opts'],
    data: {
      ...baseJob.data,
      ...(overrides.data as Partial<AuditEventQueueJobData> | undefined)
    }
  } as Job<AuditEventQueueJobData>;
}

describe('auditEventWorker', () => {
  beforeAll(() => {
    mocks.workerClose.mockResolvedValue(undefined);
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.moveAuditEventToDeadLetter.mockResolvedValue('dlq-audit-job-1');
    mocks.persistAuditEventOrThrow.mockResolvedValue('created');
    mocks.updateWorkerHeartbeat.mockResolvedValue(undefined);
  });

  it('persists queued audit events successfully', async () => {
    const job = createJob();

    await processAuditEventJob(job);

    expect(mocks.updateWorkerHeartbeat).toHaveBeenCalledWith('worker:audit:heartbeat');
    expect(mocks.persistAuditEventOrThrow).toHaveBeenCalledWith(
      job.data.event,
      expect.objectContaining({
        idempotencyKey: job.data.idempotencyKey,
        source: job.data.source
      })
    );
  });

  it('treats duplicate persistence replay as successful suppression', async () => {
    const job = createJob();
    mocks.persistAuditEventOrThrow.mockResolvedValueOnce('duplicate_suppressed');

    await expect(processAuditEventJob(job)).resolves.toBeUndefined();
    expect(mocks.moveAuditEventToDeadLetter).not.toHaveBeenCalled();
  });

  it('treats contract validation errors as permanent and sends to DLQ', async () => {
    const job = createJob({ attemptsMade: 1 });
    const permanentError = new Error('invalid payload');
    permanentError.name = 'AuditContractError';
    mocks.persistAuditEventOrThrow.mockRejectedValue(permanentError);

    await expect(processAuditEventJob(job)).resolves.toBeUndefined();
    expect(mocks.moveAuditEventToDeadLetter).toHaveBeenCalledWith(
      expect.objectContaining({
        originalJobId: 'audit-job-1',
        attemptsMade: 1,
        failedReason: 'invalid payload',
        data: job.data
      })
    );
  });

  it('rethrows transient failures to trigger retry', async () => {
    const job = createJob({ attemptsMade: 2 });
    mocks.persistAuditEventOrThrow.mockRejectedValue(new Error('database timeout'));

    await expect(processAuditEventJob(job)).rejects.toThrow('database timeout');
    expect(mocks.moveAuditEventToDeadLetter).not.toHaveBeenCalled();
  });

  it('moves final-attempt failures to DLQ from worker failed handler', async () => {
    const failedHandler = mocks.registeredHandlers.get('failed');
    expect(failedHandler).toBeDefined();

    const finalAttemptJob = createJob({
      id: 'audit-job-final',
      attemptsMade: 5,
      opts: { attempts: 5 } as any
    });

    await failedHandler?.(finalAttemptJob, new Error('redis unavailable'));

    expect(mocks.moveAuditEventToDeadLetter).toHaveBeenCalledWith(
      expect.objectContaining({
        originalJobId: 'audit-job-final',
        attemptsMade: 5,
        failedReason: 'redis unavailable'
      })
    );
  });

  it('does not move non-final failures to DLQ from failed handler', async () => {
    const failedHandler = mocks.registeredHandlers.get('failed');
    expect(failedHandler).toBeDefined();

    const retryableJob = createJob({
      id: 'audit-job-retry',
      attemptsMade: 2,
      opts: { attempts: 5 } as any
    });

    await failedHandler?.(retryableJob, new Error('temporary failure'));

    expect(mocks.moveAuditEventToDeadLetter).not.toHaveBeenCalled();
  });

  it('exports graceful shutdown helper', async () => {
    await shutdownAuditEventWorker();
    expect(mocks.workerClose).toHaveBeenCalledOnce();
  });

  it('processes enqueued payload contract end-to-end', async () => {
    const queuedPayload: AuditEventQueueJobData = {
      event: {
        actorId: null,
        eventType: 'security.rate_limit_exceeded',
        entityType: 'auth',
        entityId: '33333333-3333-3333-3333-333333333333',
        payload: {
          ipAddress: '198.51.100.20',
          endpoint: '/api/login'
        },
        ipAddress: '198.51.100.20',
        userAgent: 'LoadTester/1.0'
      },
      idempotencyKey: 'security-test',
      source: 'integration-check',
      requestedAt: new Date().toISOString()
    };

    await processAuditEventJob(createJob({ data: queuedPayload }));

    expect(mocks.persistAuditEventOrThrow).toHaveBeenCalledWith(
      queuedPayload.event,
      expect.objectContaining({
        idempotencyKey: queuedPayload.idempotencyKey,
        source: queuedPayload.source
      })
    );
  });
});