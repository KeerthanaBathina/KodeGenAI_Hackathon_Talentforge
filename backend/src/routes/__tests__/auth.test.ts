import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auditEvent: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('../../services/authService', () => ({
  GENERIC_REGISTRATION_MESSAGE: 'Registration successful. Continue to complete your profile.',
  registerCandidate: vi.fn().mockResolvedValue({
    message: 'Registration successful. Continue to complete your profile.',
    redirectTo: '/profile',
    candidateDbId: 'candidate-db-id',
    candidateId: 'CAND-ABC123',
    email: 'user@example.com'
  }),
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

vi.mock('../../services/otpRateLimiter', () => ({
  OtpResendRateLimiter: {
    checkAndIncrement: vi.fn().mockResolvedValue({
      allowed: true,
      remaining: 2,
      retryAfterSeconds: 0,
      resetAt: new Date(Date.now() + 60_000)
    })
  }
}));

vi.mock('../../services/loginService', () => ({
  authenticateUser: vi.fn(),
  LoginError: class LoginError extends Error {
    code: string;
    lockedUntil?: Date;

    constructor(message: string, code: string, lockedUntil?: Date) {
      super(message);
      this.code = code;
      this.lockedUntil = lockedUntil;
    }
  }
}));

vi.mock('../../services/userAuthService', () => ({
  authenticateInternalUser: vi.fn(),
  UserAuthError: class UserAuthError extends Error {
    code: string;

    constructor(message: string, code: string) {
      super(message);
      this.code = code;
    }
  }
}));

vi.mock('../../services/jwtService', () => ({
  JwtService: {
    createAuthCookie: vi.fn().mockReturnValue({
      token: 'mock-token',
      options: {},
    }),
  },
}));

vi.mock('../../services/oauthService', () => ({
  exchangeGoogleCode: vi.fn(),
  exchangeGitHubCode: vi.fn(),
  getGoogleAuthUrl: vi.fn().mockReturnValue('https://example.com/oauth/google'),
  getGitHubAuthUrl: vi.fn().mockReturnValue('https://example.com/oauth/github'),
  OAuthError: class OAuthError extends Error {
    code: string;

    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  }
}));

vi.mock('../../services/passwordResetService', () => ({
  generateResetToken: vi.fn(),
  validateResetToken: vi.fn(),
  consumeResetToken: vi.fn(),
  PasswordResetError: class PasswordResetError extends Error {
    code: string;

    constructor(message: string, code: string) {
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

vi.mock('../../services/auditService', () => ({
  auditEvent: mocks.auditEvent
}));

vi.mock('../../middleware/passwordResetRateLimit', () => ({
  passwordResetRateLimitMiddleware: (_req: any, _res: any, next: any) => next()
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

  it('POST /api/auth/register returns 201 on accepted registration', async () => {
    const app = createTestApp();

    const response = await request(app).post('/api/auth/register').send({
      email: 'user@example.com',
      password: 'ValidPass1',
      firstName: 'Jane',
      lastName: 'Doe',
      phone: '+919876543210'
    });

    expect(response.status).toBe(201);
    expect(response.body.message).toBe('Registration successful. Continue to complete your profile.');
    expect(response.body.redirectTo).toBe('/profile');
    expect(response.body.accessToken).toBeDefined();
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
    expect(response.body.message).toBe('Registration successful. Continue to complete your profile.');
  });

  it('POST /api/auth/logout clears auth cookie and emits logout audit event', async () => {
    const app = createTestApp();

    const response = await request(app)
      .post('/api/auth/logout')
      .set('Cookie', 'auth_token=test-token')
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.message).toBe('Logged out successfully');
    expect(response.headers['set-cookie']).toBeDefined();
    expect(response.headers['set-cookie'].some((cookie: string) =>
      cookie.startsWith('auth_token=') && (cookie.includes('Max-Age=0') || cookie.includes('Expires='))
    )).toBe(true);

    expect(mocks.auditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'auth.logout',
        entityType: 'session',
        payload: expect.objectContaining({
          hadAuthCookie: true,
        })
      })
    );
  });
});
