import crypto from 'node:crypto';
import { CandidateStatus, OtpChallengePurpose, Prisma } from '@prisma/client';
import { env } from '../config/env';
import prisma from '../db/prisma';
import logger from '../utils/logger';
import { sendOtpEmail } from './emailService';

export const GENERIC_REGISTRATION_MESSAGE =
  'If this email is new to us, you will receive a verification code';

const OTP_EXPIRED_MESSAGE = 'Code expired - please request a new one';

const PASSWORD_POLICY_REGEX = /^(?=.*[A-Z])(?=.*\d).{8,}$/;

export type RegistrationInput = {
  email: string;
  password: string;
};

export type VerifyOtpInput = {
  email: string;
  otp: string;
};

export type ResendOtpInput = {
  email: string;
};

export type VerifyOtpResult = {
  redirectTo: string;
  candidateId: string;
};

export class AuthError extends Error {
  constructor(
    public readonly code: 'INVALID_PASSWORD' | 'INVALID_OTP' | 'OTP_EXPIRED',
    message: string
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isPasswordStrong(password: string): boolean {
  return PASSWORD_POLICY_REGEX.test(password);
}

function generateOtp(): string {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

function hashOtp(email: string, otp: string): string {
  return crypto
    .createHmac('sha256', env.OTP_HASH_SALT)
    .update(`${normalizeEmail(email)}:${otp}`)
    .digest('hex');
}

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function generateCandidatePublicId(): string {
  const token = crypto.randomBytes(6).toString('hex').toUpperCase();
  return `CAND-${token}`;
}

async function createOtpChallenge(candidateId: string, email: string): Promise<{ otp: string; expiresAt: Date }> {
  const otp = generateOtp();
  const expiresAt = new Date(Date.now() + env.OTP_EXPIRY_MINUTES * 60_000);

  await prisma.candidateOtpChallenge.create({
    data: {
      candidateId,
      purpose: OtpChallengePurpose.registration,
      otpHash: hashOtp(email, otp),
      expiresAt
    }
  });

  return { otp, expiresAt };
}

export async function registerCandidate(input: RegistrationInput): Promise<{ message: string }> {
  const email = normalizeEmail(input.email);

  if (!isPasswordStrong(input.password)) {
    throw new AuthError('INVALID_PASSWORD', 'Password must be at least 8 characters with one uppercase letter and one number');
  }

  const existing = await prisma.candidate.findUnique({
    where: { email },
    select: { id: true }
  });

  if (existing) {
    logger.info({ email }, 'auth: duplicate registration attempt handled with generic response');
    return { message: GENERIC_REGISTRATION_MESSAGE };
  }

  try {
    const passwordHash = hashPassword(input.password);

    const candidate = await prisma.$transaction(async (tx) => {
      const created = await tx.candidate.create({
        data: {
          email,
          status: CandidateStatus.pending_verification
        }
      });

      await tx.candidateCredential.create({
        data: {
          candidateId: created.id,
          passwordHash
        }
      });

      return created;
    });

    const challenge = await createOtpChallenge(candidate.id, email);
    await sendOtpEmail({ email, otp: challenge.otp, expiresAt: challenge.expiresAt });

    logger.info({ email, candidateId: candidate.id }, 'auth: registration completed with OTP issuance');
    return { message: GENERIC_REGISTRATION_MESSAGE };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      logger.info({ email }, 'auth: duplicate registration race handled with generic response');
      return { message: GENERIC_REGISTRATION_MESSAGE };
    }

    throw error;
  }
}

export async function verifyOtp(input: VerifyOtpInput): Promise<VerifyOtpResult> {
  const email = normalizeEmail(input.email);
  const candidate = await prisma.candidate.findUnique({
    where: { email },
    select: {
      id: true,
      candidatePublicId: true
    }
  });

  if (!candidate) {
    throw new AuthError('INVALID_OTP', 'Invalid verification code');
  }

  const challenge = await prisma.candidateOtpChallenge.findFirst({
    where: {
      candidateId: candidate.id,
      purpose: OtpChallengePurpose.registration,
      consumedAt: null
    },
    orderBy: { createdAt: 'desc' }
  });

  if (!challenge) {
    throw new AuthError('INVALID_OTP', 'Invalid verification code');
  }

  if (challenge.expiresAt.getTime() < Date.now()) {
    throw new AuthError('OTP_EXPIRED', OTP_EXPIRED_MESSAGE);
  }

  const expectedHash = hashOtp(email, input.otp);
  const expectedBuffer = Buffer.from(expectedHash, 'hex');
  const actualBuffer = Buffer.from(challenge.otpHash, 'hex');

  if (
    expectedBuffer.length !== actualBuffer.length ||
    !crypto.timingSafeEqual(expectedBuffer, actualBuffer)
  ) {
    throw new AuthError('INVALID_OTP', 'Invalid verification code');
  }

  const candidatePublicId = candidate.candidatePublicId ?? generateCandidatePublicId();

  await prisma.$transaction(async (tx) => {
    await tx.candidateOtpChallenge.update({
      where: { id: challenge.id },
      data: { consumedAt: new Date() }
    });

    await tx.candidate.update({
      where: { id: candidate.id },
      data: {
        status: CandidateStatus.active,
        candidatePublicId
      }
    });
  });

  logger.info({ email, candidateId: candidate.id }, 'auth: OTP verification succeeded');

  return {
    redirectTo: '/onboarding/profile',
    candidateId: candidatePublicId
  };
}

export async function resendOtp(input: ResendOtpInput): Promise<{ message: string }> {
  const email = normalizeEmail(input.email);
  const candidate = await prisma.candidate.findUnique({
    where: { email },
    select: {
      id: true,
      status: true
    }
  });

  if (!candidate || candidate.status === CandidateStatus.active) {
    logger.info({ email }, 'auth: resend OTP completed with generic response');
    return { message: GENERIC_REGISTRATION_MESSAGE };
  }

  const challenge = await createOtpChallenge(candidate.id, email);
  await sendOtpEmail({ email, otp: challenge.otp, expiresAt: challenge.expiresAt });

  logger.info({ email, candidateId: candidate.id }, 'auth: resend OTP issued');

  return { message: GENERIC_REGISTRATION_MESSAGE };
}
