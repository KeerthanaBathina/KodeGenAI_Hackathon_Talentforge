import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  candidateFindUnique: vi.fn(),
  candidateUpdate: vi.fn(),
  bcryptCompare: vi.fn(),
  sendAccountLockoutEmail: vi.fn(),
  auditEvent: vi.fn(),
  loggerWarn: vi.fn(),
  loggerError: vi.fn(),
  loggerInfo: vi.fn()
}));

vi.mock('../../db/prisma', () => ({
  default: {
    candidate: {
      findUnique: mocks.candidateFindUnique,
      update: mocks.candidateUpdate
    }
  }
}));

vi.mock('bcrypt', () => ({
  default: {
    compare: mocks.bcryptCompare
  }
}));

vi.mock('../emailService', () => ({
  sendAccountLockoutEmail: mocks.sendAccountLockoutEmail
}));

vi.mock('../auditService', () => ({
  auditEvent: mocks.auditEvent
}));

vi.mock('../../utils/logger', () => ({
  default: {
    warn: mocks.loggerWarn,
    error: mocks.loggerError,
    info: mocks.loggerInfo
  }
}));

import { authenticateUser, LoginError } from '../loginService';

describe('loginService anonymized account guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.candidateUpdate.mockResolvedValue({});
    mocks.auditEvent.mockResolvedValue(undefined);
    mocks.bcryptCompare.mockResolvedValue(true);
  });

  it('blocks login for anonymized candidates with generic invalid credentials', async () => {
    mocks.candidateFindUnique.mockResolvedValue({
      id: 'candidate-1',
      email: 'anon-candidate-1@redacted',
      status: 'anonymized',
      candidatePublicId: null,
      failedLoginAttempts: 0,
      lockedUntil: null,
      lastLoginAttemptAt: null,
      credential: {
        passwordHash: 'hash'
      }
    });

    await expect(
      authenticateUser({
        email: 'anon-candidate-1@redacted',
        password: 'SomePassword123',
        ipAddress: '127.0.0.1',
        userAgent: 'vitest'
      })
    ).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS'
    } satisfies Partial<LoginError>);

    expect(mocks.candidateUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'candidate-1' },
        data: {
          lastLoginAttemptAt: expect.any(Date)
        }
      })
    );

    expect(mocks.auditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'login_blocked',
        entityType: 'candidate',
        entityId: 'candidate-1',
        payload: expect.objectContaining({
          reason: 'account_anonymized'
        })
      })
    );

    expect(mocks.bcryptCompare).not.toHaveBeenCalled();
    expect(mocks.sendAccountLockoutEmail).not.toHaveBeenCalled();
  });
});
