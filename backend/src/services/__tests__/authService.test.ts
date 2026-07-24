import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockCandidateFindUnique,
  mockCandidateCreate,
  mockCandidateUpdate,
  mockCredentialCreate,
  mockOtpCreate,
  mockOtpFindFirst,
  mockOtpUpdate,
  mockTransaction,
  mockSendOtpEmail
} = vi.hoisted(() => ({
  mockCandidateFindUnique: vi.fn(),
  mockCandidateCreate: vi.fn(),
  mockCandidateUpdate: vi.fn(),
  mockCredentialCreate: vi.fn(),
  mockOtpCreate: vi.fn(),
  mockOtpFindFirst: vi.fn(),
  mockOtpUpdate: vi.fn(),
  mockTransaction: vi.fn(),
  mockSendOtpEmail: vi.fn()
}));

vi.mock('../../db/prisma', () => ({
  default: {
    candidate: {
      findUnique: mockCandidateFindUnique,
      create: mockCandidateCreate,
      update: mockCandidateUpdate
    },
    candidateCredential: {
      create: mockCredentialCreate
    },
    candidateOtpChallenge: {
      create: mockOtpCreate,
      findFirst: mockOtpFindFirst,
      update: mockOtpUpdate
    },
    $transaction: mockTransaction
  }
}));

vi.mock('../emailService', () => ({
  sendOtpEmail: mockSendOtpEmail
}));

vi.mock('../../utils/logger', () => ({
  default: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn()
  }
}));

import { CandidateStatus, OtpChallengePurpose } from '@prisma/client';
import {
  AuthError,
  GENERIC_REGISTRATION_MESSAGE,
  registerCandidate,
  resendOtp,
  verifyOtp
} from '../authService';

beforeEach(() => {
  vi.clearAllMocks();

  mockTransaction.mockImplementation(async (callback: (tx: unknown) => unknown) =>
    callback({
      candidate: {
        create: mockCandidateCreate,
        update: mockCandidateUpdate
      },
      candidateCredential: {
        create: mockCredentialCreate
      },
      candidateOtpChallenge: {
        update: mockOtpUpdate
      }
    })
  );
});

describe('registerCandidate', () => {
  it('creates a pending candidate and sends OTP for new email', async () => {
    mockCandidateFindUnique.mockResolvedValue(null);
    mockCandidateCreate.mockResolvedValue({ id: 'cand-1', email: 'new@example.com' });
    mockCredentialCreate.mockResolvedValue({ candidateId: 'cand-1' });
    mockOtpCreate.mockResolvedValue({ id: 'otp-1' });
    mockSendOtpEmail.mockResolvedValue(undefined);

    const result = await registerCandidate({
      email: 'NEW@example.com',
      password: 'ValidPass1'
    });

    expect(result.message).toBe(GENERIC_REGISTRATION_MESSAGE);
    expect(mockCandidateCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: 'new@example.com',
          status: CandidateStatus.pending_verification
        })
      })
    );
    expect(mockOtpCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          candidateId: 'cand-1',
          purpose: OtpChallengePurpose.registration
        })
      })
    );
    expect(mockSendOtpEmail).toHaveBeenCalledOnce();
  });

  it('returns generic response for duplicate email without creating records', async () => {
    mockCandidateFindUnique.mockResolvedValue({ id: 'cand-1' });

    const result = await registerCandidate({
      email: 'existing@example.com',
      password: 'ValidPass1'
    });

    expect(result.message).toBe(GENERIC_REGISTRATION_MESSAGE);
    expect(mockCandidateCreate).not.toHaveBeenCalled();
    expect(mockSendOtpEmail).not.toHaveBeenCalled();
  });

  it('rejects weak passwords', async () => {
    await expect(
      registerCandidate({
        email: 'new@example.com',
        password: 'weakpass'
      })
    ).rejects.toMatchObject({ code: 'INVALID_PASSWORD' });
  });
});

describe('verifyOtp', () => {
  it('activates candidate and marks OTP consumed for valid OTP', async () => {
    mockCandidateFindUnique.mockResolvedValue({
      id: 'cand-1',
      candidatePublicId: null
    });

    const hashedOtp = await registerAndGetHashedOtp('user@example.com', '123456');

    mockOtpFindFirst.mockResolvedValue({
      id: 'otp-1',
      otpHash: hashedOtp,
      expiresAt: new Date(Date.now() + 60_000)
    });

    const result = await verifyOtp({ email: 'user@example.com', otp: '123456' });

    expect(result.redirectTo).toBe('/onboarding/profile');
    expect(result.candidateId).toMatch(/^CAND-/);
    expect(mockOtpUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'otp-1' }
      })
    );
    expect(mockCandidateUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: CandidateStatus.active })
      })
    );
  });

  it('returns OTP_EXPIRED when code is expired', async () => {
    mockCandidateFindUnique.mockResolvedValue({ id: 'cand-1', candidatePublicId: null });
    mockOtpFindFirst.mockResolvedValue({
      id: 'otp-1',
      otpHash: await registerAndGetHashedOtp('user@example.com', '123456'),
      expiresAt: new Date(Date.now() - 60_000)
    });

    await expect(verifyOtp({ email: 'user@example.com', otp: '123456' })).rejects.toMatchObject({
      code: 'OTP_EXPIRED'
    });
  });

  it('returns INVALID_OTP when hash does not match', async () => {
    mockCandidateFindUnique.mockResolvedValue({ id: 'cand-1', candidatePublicId: null });
    mockOtpFindFirst.mockResolvedValue({
      id: 'otp-1',
      otpHash: 'ff'.repeat(32),
      expiresAt: new Date(Date.now() + 60_000)
    });

    await expect(verifyOtp({ email: 'user@example.com', otp: '000000' })).rejects.toMatchObject({
      code: 'INVALID_OTP'
    });
  });
});

describe('resendOtp', () => {
  it('issues a new OTP for pending candidate', async () => {
    mockCandidateFindUnique.mockResolvedValue({
      id: 'cand-1',
      status: CandidateStatus.pending_verification
    });
    mockOtpCreate.mockResolvedValue({ id: 'otp-2' });
    mockSendOtpEmail.mockResolvedValue(undefined);

    const result = await resendOtp({ email: 'pending@example.com' });

    expect(result.message).toBe(GENERIC_REGISTRATION_MESSAGE);
    expect(mockOtpCreate).toHaveBeenCalledOnce();
    expect(mockSendOtpEmail).toHaveBeenCalledOnce();
  });

  it('returns generic response for unknown candidate', async () => {
    mockCandidateFindUnique.mockResolvedValue(null);

    const result = await resendOtp({ email: 'missing@example.com' });

    expect(result.message).toBe(GENERIC_REGISTRATION_MESSAGE);
    expect(mockOtpCreate).not.toHaveBeenCalled();
    expect(mockSendOtpEmail).not.toHaveBeenCalled();
  });
});

async function registerAndGetHashedOtp(email: string, otp: string): Promise<string> {
  const { createHmac } = await import('node:crypto');
  const { env } = await import('../../config/env');

  return createHmac('sha256', env.OTP_HASH_SALT)
    .update(`${email.toLowerCase()}:${otp}`)
    .digest('hex');
}
