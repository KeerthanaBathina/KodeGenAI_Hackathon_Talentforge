import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  candidateFindUnique: vi.fn(),
  passwordResetTokenUpdateMany: vi.fn(),
  passwordResetTokenCreate: vi.fn(),
  passwordResetTokenFindUnique: vi.fn(),
  auditLogEvent: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
  loggerInfo: vi.fn(),
  loggerError: vi.fn()
}));

vi.mock('../../config/env', () => ({
  env: {
    FRONTEND_URL: 'http://localhost:3000'
  }
}));

vi.mock('../../db/prisma', () => ({
  default: {
    candidate: {
      findUnique: mocks.candidateFindUnique
    },
    passwordResetToken: {
      updateMany: mocks.passwordResetTokenUpdateMany,
      create: mocks.passwordResetTokenCreate,
      findUnique: mocks.passwordResetTokenFindUnique
    }
  }
}));

vi.mock('../auditService', () => ({
  auditService: {
    logEvent: mocks.auditLogEvent
  }
}));

vi.mock('../emailService', () => ({
  sendPasswordResetEmail: mocks.sendPasswordResetEmail
}));

vi.mock('../../utils/passwordValidator', () => ({
  validatePasswordStrength: () => ({ valid: true })
}));

vi.mock('../../utils/logger', () => ({
  default: {
    info: mocks.loggerInfo,
    error: mocks.loggerError
  }
}));

import { generateResetToken, validateResetToken } from '../passwordResetService';

describe('passwordResetService anonymized account guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.passwordResetTokenUpdateMany.mockResolvedValue({ count: 0 });
    mocks.passwordResetTokenCreate.mockResolvedValue({ id: 'token-1' });
    mocks.auditLogEvent.mockResolvedValue(undefined);
  });

  it('returns generic response and blocks token creation for anonymized candidates', async () => {
    mocks.candidateFindUnique.mockResolvedValue({
      id: 'candidate-1',
      email: 'anon-candidate-1@redacted',
      status: 'anonymized',
      profile: {
        fullName: 'ANONYMISED'
      }
    });

    const result = await generateResetToken('anon-candidate-1@redacted', '127.0.0.1', 'vitest');

    expect(result).toEqual({
      success: true,
      message: 'If this email is registered, you will receive a password reset link'
    });

    expect(mocks.passwordResetTokenUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          candidateId: 'candidate-1',
          usedAt: null
        }
      })
    );

    expect(mocks.passwordResetTokenCreate).not.toHaveBeenCalled();
    expect(mocks.sendPasswordResetEmail).not.toHaveBeenCalled();

    expect(mocks.auditLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'password_reset_blocked_anonymized',
        resourceType: 'candidate',
        resourceId: 'candidate-1'
      })
    );
  });

  it('treats reset tokens for anonymized candidates as invalid', async () => {
    mocks.passwordResetTokenFindUnique.mockResolvedValue({
      id: 'token-1',
      candidateId: 'candidate-1',
      token: 'token-abc',
      expiresAt: new Date(Date.now() + 60_000),
      usedAt: null,
      candidate: {
        id: 'candidate-1',
        email: 'anon-candidate-1@redacted',
        status: 'anonymized'
      }
    });

    const validation = await validateResetToken('token-abc');

    expect(validation).toEqual({
      valid: false,
      error: 'TOKEN_NOT_FOUND'
    });
  });
});
