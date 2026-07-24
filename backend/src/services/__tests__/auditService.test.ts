import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../db/prisma', () => ({
  default: {
    auditEvent: {
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

import prisma from '../../db/prisma';
import logger from '../../utils/logger';
import { auditEvent, auditEventOrThrow } from '../auditService';

const mockCreate = vi.mocked(
  (prisma as unknown as { auditEvent: { create: ReturnType<typeof vi.fn> } }).auditEvent.create
);
const mockLogError = vi.mocked(logger.error);

const baseInput = {
  actorId: '11111111-1111-1111-1111-111111111111',
  eventType: 'application.submitted',
  entityType: 'application',
  entityId: '22222222-2222-2222-2222-222222222222',
  payload: { applicationId: '22222222-2222-2222-2222-222222222222' }
};

beforeEach(() => {
  vi.clearAllMocks();
  mockCreate.mockResolvedValue({ id: '33333333-3333-3333-3333-333333333333' });
});

describe('auditEvent', () => {
  it('calls prisma.auditEvent.create with required fields', async () => {
    await auditEvent(baseInput);

    expect(mockCreate).toHaveBeenCalledOnce();
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventType: 'application.submitted',
          entityType: 'application',
          entityId: '22222222-2222-2222-2222-222222222222',
          payloadJson: baseInput.payload
        })
      })
    );
  });

  it('sets ipAddress and userAgent when provided', async () => {
    await auditEvent({
      ...baseInput,
      ipAddress: '203.0.113.1',
      userAgent: 'Mozilla/5.0'
    });

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ipAddress: '203.0.113.1',
          userAgent: 'Mozilla/5.0'
        })
      })
    );
  });

  it('sets ipAddress and userAgent to null when omitted', async () => {
    await auditEvent(baseInput);

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ipAddress: null,
          userAgent: null
        })
      })
    );
  });

  it('truncates userAgent longer than 512 characters', async () => {
    const longUserAgent = 'A'.repeat(700);
    await auditEvent({ ...baseInput, userAgent: longUserAgent });

    const call = mockCreate.mock.calls[0];
    const userAgent = (call as [{ data: { userAgent: string } }])[0].data.userAgent;
    expect(userAgent).toHaveLength(512);
  });

  it('accepts null actorId for system events', async () => {
    await auditEvent({ ...baseInput, actorId: null });

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({
          actor: expect.anything()
        })
      })
    );
  });

  it('swallows database errors and logs without throwing', async () => {
    mockCreate.mockRejectedValue(new Error('DB connection lost'));

    await expect(auditEvent(baseInput)).resolves.toBeUndefined();

    expect(mockLogError).toHaveBeenCalledOnce();
    expect(mockLogError).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'application.submitted' }),
      'auditEvent: failed to write audit record'
    );
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
});
