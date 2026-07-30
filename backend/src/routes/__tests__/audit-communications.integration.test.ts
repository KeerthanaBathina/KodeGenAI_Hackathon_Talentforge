import { CommunicationStatus } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveCanonicalAuditEventType } from '../../constants/auditEventTypes';

const mocks = vi.hoisted(() => ({
  prismaCommunicationUpdate: vi.fn(),
  prismaCommunicationFindUnique: vi.fn(),
  auditEvent: vi.fn(),
  loggerDebug: vi.fn(),
  loggerInfo: vi.fn(),
  loggerWarn: vi.fn(),
  loggerError: vi.fn()
}));

vi.mock('../../db/prisma', () => ({
  default: {
    communication: {
      update: mocks.prismaCommunicationUpdate,
      findUnique: mocks.prismaCommunicationFindUnique
    }
  }
}));

vi.mock('../../services/auditService', () => ({
  auditEvent: mocks.auditEvent
}));

vi.mock('../../utils/logger', () => ({
  logger: {
    debug: mocks.loggerDebug,
    info: mocks.loggerInfo,
    warn: mocks.loggerWarn,
    error: mocks.loggerError
  },
  default: {
    debug: mocks.loggerDebug,
    info: mocks.loggerInfo,
    warn: mocks.loggerWarn,
    error: mocks.loggerError
  }
}));

import {
  updateCommunicationRetryCount,
  updateCommunicationStatus
} from '../../services/communicationService';

interface CapturedAuditInput {
  actorId?: string | null;
  eventType?: string;
  entityType?: string;
  entityId?: string;
  payload?: Record<string, unknown>;
  ipAddress?: string | null;
  userAgent?: string | null;
}

function toCapturedAuditCalls(): CapturedAuditInput[] {
  return mocks.auditEvent.mock.calls.map(([arg]) => arg as CapturedAuditInput);
}

describe('Audit communication coverage matrix', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prismaCommunicationUpdate.mockResolvedValue({ id: 'comm-1' });
    mocks.auditEvent.mockResolvedValue(undefined);
  });

  it('captures send and retry events in deterministic order with explicit null/system semantics', async () => {
    await updateCommunicationStatus('comm-1', {
      status: 'queued' as CommunicationStatus
    });

    await updateCommunicationStatus('comm-1', {
      status: 'sent' as CommunicationStatus,
      messageId: 'msg-001',
      sentAt: new Date('2026-04-01T12:00:00.000Z')
    });

    await updateCommunicationRetryCount('comm-1', 2);

    const capturedCalls = toCapturedAuditCalls();
    const canonicalTypes = capturedCalls.map((call) =>
      resolveCanonicalAuditEventType(String(call.eventType ?? '')).eventType
    );

    expect(canonicalTypes).toEqual([
      'communication.queued',
      'communication.sent',
      'communication.retry'
    ]);

    for (const call of capturedCalls) {
      expect(call.entityType).toBe('communication');
      expect(call.entityId).toBe('comm-1');
      expect(call.actorId ?? null).toBeNull();
      expect(call.ipAddress ?? null).toBeNull();
      expect(call.userAgent ?? null).toBeNull();
    }

    expect(capturedCalls[1]?.payload).toMatchObject({
      status: 'sent',
      messageId: 'msg-001',
      sentAt: '2026-04-01T12:00:00.000Z'
    });

    expect(capturedCalls[2]?.payload).toMatchObject({ retryCount: 2 });
  });

  it('skips unsupported status transitions deterministically', async () => {
    await updateCommunicationStatus('comm-1', {
      status: 'delivered' as CommunicationStatus,
      deliveredAt: new Date('2026-04-01T12:10:00.000Z')
    });

    expect(mocks.auditEvent).not.toHaveBeenCalled();
  });

  it('captures failed status with reliability context', async () => {
    await updateCommunicationStatus('comm-2', {
      status: 'failed' as CommunicationStatus,
      retryCount: 5
    });

    const captured = toCapturedAuditCalls();
    expect(captured).toHaveLength(1);

    const first = captured[0] as CapturedAuditInput;
    const canonicalType = resolveCanonicalAuditEventType(String(first.eventType ?? '')).eventType;

    expect(canonicalType).toBe('communication.failed');
    expect(first).toMatchObject({
      entityType: 'communication',
      entityId: 'comm-2',
      payload: {
        status: 'failed',
        retryCount: 5
      }
    });
  });
});
