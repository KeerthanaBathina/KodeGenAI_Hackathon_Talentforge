import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  candidateFindUnique: vi.fn(),
  erasureFindFirst: vi.fn(),
  erasureFindUnique: vi.fn(),
  erasureCreate: vi.fn(),
  erasureUpdate: vi.fn(),
  auditLogEvent: vi.fn(),
  loggerWarn: vi.fn(),
  loggerError: vi.fn(),
  loggerInfo: vi.fn(),
  loggerDebug: vi.fn()
}));

vi.mock('../../config/env', () => ({
  env: {
    GDPR_ANONYMIZATION_SLA_DAYS: 30
  }
}));

vi.mock('../../db/prisma', () => ({
  default: {
    candidate: {
      findUnique: mocks.candidateFindUnique
    },
    gdprErasureRequest: {
      findFirst: mocks.erasureFindFirst,
      findUnique: mocks.erasureFindUnique,
      create: mocks.erasureCreate,
      update: mocks.erasureUpdate
    }
  }
}));

vi.mock('../auditService', () => ({
  auditService: {
    logEvent: mocks.auditLogEvent
  }
}));

vi.mock('../../utils/logger', () => ({
  default: {
    warn: mocks.loggerWarn,
    error: mocks.loggerError,
    info: mocks.loggerInfo,
    debug: mocks.loggerDebug
  }
}));

import {
  calculateErasureDueAt,
  GdprErasureRequestError,
  submitGdprErasureRequest,
  updateGdprErasureRequestStatus
} from '../gdprErasureRequestService';

function buildPendingRequest(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'erasure-1',
    candidateId: '11111111-1111-1111-1111-111111111111',
    requestedAt: new Date('2026-07-01T10:00:00.000Z'),
    dueAt: new Date('2026-07-31T10:00:00.000Z'),
    status: 'pending',
    processedAt: null,
    failureReason: null,
    requestReason: null,
    createdAt: new Date('2026-07-01T10:00:00.000Z'),
    updatedAt: new Date('2026-07-01T10:00:00.000Z'),
    ...overrides
  };
}

describe('gdprErasureRequestService', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.candidateFindUnique.mockResolvedValue({ id: '11111111-1111-1111-1111-111111111111' });
    mocks.erasureFindFirst.mockResolvedValue(null);
    mocks.erasureFindUnique.mockResolvedValue(null);
    mocks.erasureCreate.mockResolvedValue(buildPendingRequest({
      requestReason: 'Please remove my data.'
    }));
    mocks.erasureUpdate.mockResolvedValue(buildPendingRequest());
    mocks.auditLogEvent.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('calculates due date using configured SLA window', () => {
    const dueAt = calculateErasureDueAt(new Date('2026-07-01T00:00:00.000Z'));
    expect(dueAt.toISOString()).toBe('2026-07-31T00:00:00.000Z');
  });

  it('creates a new pending request and logs audit event', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-01T10:00:00.000Z'));

    const result = await submitGdprErasureRequest({
      candidateId: '11111111-1111-1111-1111-111111111111',
      actorId: '11111111-1111-1111-1111-111111111111',
      actorRole: 'candidate',
      requestReason: '  Please remove my data.  '
    });

    expect(result.idempotent).toBe(false);
    expect(mocks.erasureCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          candidateId: '11111111-1111-1111-1111-111111111111',
          status: 'pending',
          requestReason: 'Please remove my data.',
          dueAt: new Date('2026-07-31T10:00:00.000Z')
        })
      })
    );
    expect(mocks.auditLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'gdpr.erasure_request.created',
        entityType: 'gdpr_erasure_request',
        entityId: 'erasure-1'
      })
    );
  });

  it('returns existing pending request for idempotent submissions', async () => {
    const existing = buildPendingRequest({ id: 'erasure-existing' });
    mocks.erasureFindFirst.mockResolvedValueOnce(existing);

    const result = await submitGdprErasureRequest({
      candidateId: '11111111-1111-1111-1111-111111111111'
    });

    expect(result.idempotent).toBe(true);
    expect(result.request.id).toBe('erasure-existing');
    expect(mocks.erasureCreate).not.toHaveBeenCalled();
    expect(mocks.auditLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'gdpr.erasure_request.idempotent_submission',
        entityId: 'erasure-existing'
      })
    );
  });

  it('resolves pending request after unique constraint conflict', async () => {
    const pendingAfterConflict = buildPendingRequest({ id: 'erasure-race' });

    mocks.erasureFindFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(pendingAfterConflict);
    mocks.erasureCreate.mockRejectedValueOnce({ code: 'P2002' });

    const result = await submitGdprErasureRequest({
      candidateId: '11111111-1111-1111-1111-111111111111'
    });

    expect(result.idempotent).toBe(true);
    expect(result.request.id).toBe('erasure-race');
    expect(mocks.loggerWarn).toHaveBeenCalledOnce();
  });

  it('throws candidate-not-found when candidate does not exist', async () => {
    mocks.candidateFindUnique.mockResolvedValueOnce(null);

    await expect(
      submitGdprErasureRequest({
        candidateId: '11111111-1111-1111-1111-111111111111'
      })
    ).rejects.toEqual(
      expect.objectContaining({
        name: 'GdprErasureRequestError',
        code: 'CANDIDATE_NOT_FOUND'
      })
    );
  });

  it('updates request status to completed and records audit trail', async () => {
    const processingRequest = buildPendingRequest({
      id: 'erasure-2',
      status: 'processing'
    });

    mocks.erasureFindUnique.mockResolvedValueOnce(processingRequest);
    mocks.erasureUpdate.mockResolvedValueOnce({
      ...processingRequest,
      status: 'completed',
      processedAt: new Date('2026-07-05T11:00:00.000Z'),
      failureReason: null
    });

    const updated = await updateGdprErasureRequestStatus({
      requestId: 'erasure-2',
      status: 'completed',
      actorId: 'admin-1',
      actorRole: 'admin'
    });

    expect(updated.status).toBe('completed');
    expect(updated.processedAt).not.toBeNull();
    expect(mocks.erasureUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'erasure-2' },
        data: expect.objectContaining({
          status: 'completed',
          failureReason: null
        })
      })
    );
    expect(mocks.auditLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'gdpr.erasure_request.status_updated',
        entityId: 'erasure-2'
      })
    );
  });

  it('rejects invalid status transitions', async () => {
    mocks.erasureFindUnique.mockResolvedValueOnce(buildPendingRequest({
      id: 'erasure-3',
      status: 'completed'
    }));

    await expect(
      updateGdprErasureRequestStatus({
        requestId: 'erasure-3',
        status: 'processing'
      })
    ).rejects.toBeInstanceOf(GdprErasureRequestError);
  });

  it('requires failure reason when marking request as failed', async () => {
    mocks.erasureFindUnique.mockResolvedValueOnce(buildPendingRequest({
      id: 'erasure-4',
      status: 'processing'
    }));

    await expect(
      updateGdprErasureRequestStatus({
        requestId: 'erasure-4',
        status: 'failed'
      })
    ).rejects.toEqual(
      expect.objectContaining({
        code: 'FAILURE_REASON_REQUIRED'
      })
    );
  });
});
