import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../services/authService', () => ({
  GENERIC_REGISTRATION_MESSAGE: 'If this email is new to us, you will receive a verification code',
  registerCandidate: vi.fn().mockResolvedValue({ message: 'If this email is new to us, you will receive a verification code' }),
  verifyOtp: vi.fn().mockResolvedValue({
    redirectTo: '/onboarding/profile',
    candidateId: 'CAND-ABC123'
  }),
  resendOtp: vi.fn().mockResolvedValue({ message: 'If this email is new to us, you will receive a verification code' }),
  AuthError: class AuthError extends Error {
    code: string;

    constructor(code: string, message: string) {
      super(message);
      this.code = code;
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

import authRouter from '../auth';
import { AuthError, verifyOtp } from '../../services/authService';

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRouter);
  return app;
}

describe('auth routes', () => {
  it('POST /api/auth/register returns 400 on invalid payload', async () => {
    const app = createTestApp();

    const response = await request(app).post('/api/auth/register').send({
      email: 'invalid-email',
      password: 'short'
    });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe('Invalid request payload');
  });

  it('POST /api/auth/register returns 202 on accepted registration', async () => {
    const app = createTestApp();

    const response = await request(app).post('/api/auth/register').send({
      email: 'user@example.com',
      password: 'ValidPass1'
    });

    expect(response.status).toBe(202);
    expect(response.body.message).toBe('If this email is new to us, you will receive a verification code');
    expect(response.body.next).toBe('/verify-otp');
  });

  it('POST /api/auth/verify-otp returns 200 on valid OTP', async () => {
    const app = createTestApp();

    const response = await request(app).post('/api/auth/verify-otp').send({
      email: 'user@example.com',
      otp: '123456'
    });

    expect(response.status).toBe(200);
    expect(response.body.redirectTo).toBe('/onboarding/profile');
  });

  it('POST /api/auth/verify-otp returns 400 for expired OTP domain error', async () => {
    const app = createTestApp();
    vi.mocked(verifyOtp).mockRejectedValueOnce(new AuthError('OTP_EXPIRED', 'Code expired - please request a new one'));

    const response = await request(app).post('/api/auth/verify-otp').send({
      email: 'user@example.com',
      otp: '123456'
    });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe('Code expired - please request a new one');
    expect(response.body.canResend).toBe(true);
  });

  it('POST /api/auth/resend-otp returns 202 on accepted request', async () => {
    const app = createTestApp();

    const response = await request(app).post('/api/auth/resend-otp').send({
      email: 'user@example.com'
    });

    expect(response.status).toBe(202);
    expect(response.body.message).toBe('If this email is new to us, you will receive a verification code');
  });
});
