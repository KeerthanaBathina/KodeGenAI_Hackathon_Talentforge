import bcrypt from 'bcrypt';
import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveCanonicalAuditEventType } from '../../constants/auditEventTypes';

const mocks = vi.hoisted(() => ({
  prismaUserFindUnique: vi.fn(),
  authenticateUser: vi.fn(),
  auditEvent: vi.fn(),
  loggerDebug: vi.fn(),
  loggerInfo: vi.fn(),
  loggerWarn: vi.fn(),
  loggerError: vi.fn()
}));

vi.mock('../../db/prisma', () => ({
  default: {
    user: {
      findUnique: mocks.prismaUserFindUnique
    }
  }
}));

vi.mock('../../services/authService', () => ({
  GENERIC_REGISTRATION_MESSAGE: 'If this email exists, we sent a verification code.',
  registerCandidate: vi.fn(),
  resendOtp: vi.fn(),
  verifyOtp: vi.fn()
}));

vi.mock('../../services/otpRateLimiter', () => ({
  OtpResendRateLimiter: {
    checkAndIncrement: vi.fn()
  }
}));

vi.mock('../../services/loginService', () => ({
  authenticateUser: mocks.authenticateUser,
  LoginError: class LoginError extends Error {
    code: 'INVALID_CREDENTIALS' | 'ACCOUNT_LOCKED' | 'ACCOUNT_NOT_FOUND';
    lockedUntil?: Date;

    constructor(
      message: string,
      code: 'INVALID_CREDENTIALS' | 'ACCOUNT_LOCKED' | 'ACCOUNT_NOT_FOUND',
      lockedUntil?: Date
    ) {
      super(message);
      this.name = 'LoginError';
      this.code = code;
      this.lockedUntil = lockedUntil;
    }
  }
}));

vi.mock('../../services/oauthService', () => ({
  exchangeGoogleCode: vi.fn(),
  exchangeGitHubCode: vi.fn(),
  getGoogleAuthUrl: vi.fn().mockReturnValue('https://accounts.google.com/o/oauth2/v2/auth'),
  getGitHubAuthUrl: vi.fn().mockReturnValue('https://github.com/login/oauth/authorize'),
  OAuthError: class OAuthError extends Error {
    code: string;

    constructor(message: string, code = 'OAUTH_ERROR') {
      super(message);
      this.name = 'OAuthError';
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

    constructor(message: string, code = 'PASSWORD_RESET_ERROR') {
      super(message);
      this.name = 'PasswordResetError';
      this.code = code;
    }
  }
}));

vi.mock('../../middleware/passwordResetRateLimit', () => ({
  passwordResetRateLimitMiddleware: (
    _req: unknown,
    _res: unknown,
    next: () => void
  ) => next()
}));

vi.mock('../../services/jwtService', () => ({
  JwtService: {
    createAuthCookie: vi.fn().mockReturnValue({
      token: 'jwt-token',
      options: {
        httpOnly: true,
        secure: false,
        sameSite: 'lax',
        path: '/'
      }
    })
  }
}));

vi.mock('../../services/auditService', () => ({
  auditEvent: mocks.auditEvent
}));

vi.mock('../../utils/logger', () => ({
  default: {
    debug: mocks.loggerDebug,
    info: mocks.loggerInfo,
    warn: mocks.loggerWarn,
    error: mocks.loggerError
  }
}));

import authRouter from '../auth';

interface CapturedAuditInput {
  actorId?: string | null;
  eventType?: string;
  entityType?: string;
  entityId?: string;
  payload?: Record<string, unknown>;
  ipAddress?: string | null;
  userAgent?: string | null;
}

const INTERNAL_USER_ID = '11111111-1111-1111-1111-111111111111';

function createTestApp(): express.Express {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json());
  app.use('/api/auth', authRouter);
  return app;
}

function findAuditCallByCanonicalEvent(canonicalEventType: string): CapturedAuditInput {
  for (const [arg] of mocks.auditEvent.mock.calls) {
    const candidate = arg as CapturedAuditInput;
    const resolved = resolveCanonicalAuditEventType(String(candidate.eventType ?? ''));

    if (resolved.eventType === canonicalEventType) {
      return candidate;
    }
  }

  throw new Error(`Expected audit event ${canonicalEventType} but none was captured.`);
}

describe('Audit auth coverage matrix', () => {
  const app = createTestApp();

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auditEvent.mockResolvedValue(undefined);
    mocks.authenticateUser.mockRejectedValue(
      new Error('Candidate authentication path should not execute in this suite')
    );
  });

  it('captures login success with complete audit context', async () => {
    const passwordHash = await bcrypt.hash('ValidPass123!', 4);

    mocks.prismaUserFindUnique.mockResolvedValue({
      id: INTERNAL_USER_ID,
      email: 'audit-admin@example.com',
      fullName: 'Audit Admin',
      role: 'admin',
      active: true,
      credential: {
        passwordHash
      }
    });

    const response = await request(app)
      .post('/api/auth/login')
      .set('x-forwarded-for', '198.51.100.10')
      .set('user-agent', 'AuditAuth/1.0')
      .send({
        email: 'audit-admin@example.com',
        password: 'ValidPass123!'
      });

    expect(response.status).toBe(200);
    expect(mocks.authenticateUser).not.toHaveBeenCalled();

    const auditInput = findAuditCallByCanonicalEvent('auth.login');
    expect(auditInput).toMatchObject({
      entityType: 'user',
      entityId: INTERNAL_USER_ID,
      ipAddress: '198.51.100.10',
      userAgent: 'AuditAuth/1.0',
      payload: expect.objectContaining({
        email: 'audit-admin@example.com',
        role: 'admin',
        userType: 'internal_staff'
      })
    });
    expect(auditInput.actorId ?? null).toBeNull();
  });

  it('captures login failure with deterministic reason metadata', async () => {
    const passwordHash = await bcrypt.hash('ValidPass123!', 4);

    mocks.prismaUserFindUnique.mockResolvedValue({
      id: INTERNAL_USER_ID,
      email: 'audit-admin@example.com',
      fullName: 'Audit Admin',
      role: 'admin',
      active: true,
      credential: {
        passwordHash
      }
    });

    const response = await request(app)
      .post('/api/auth/login')
      .set('x-forwarded-for', '198.51.100.11')
      .set('user-agent', 'AuditAuth/1.1')
      .send({
        email: 'audit-admin@example.com',
        password: 'WrongPass123!'
      });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('INVALID_CREDENTIALS');

    const auditInput = findAuditCallByCanonicalEvent('auth.login_failed');
    expect(auditInput).toMatchObject({
      entityType: 'user',
      entityId: INTERNAL_USER_ID,
      ipAddress: '198.51.100.11',
      userAgent: 'AuditAuth/1.1',
      payload: expect.objectContaining({
        email: 'audit-admin@example.com',
        reason: 'invalid_password',
        role: 'admin'
      })
    });
    expect(auditInput.actorId ?? null).toBeNull();
  });

  it('captures blocked login for deactivated user with explicit semantics', async () => {
    const passwordHash = await bcrypt.hash('ValidPass123!', 4);

    mocks.prismaUserFindUnique.mockResolvedValue({
      id: INTERNAL_USER_ID,
      email: 'audit-admin@example.com',
      fullName: 'Audit Admin',
      role: 'admin',
      active: false,
      credential: {
        passwordHash
      }
    });

    const response = await request(app)
      .post('/api/auth/login')
      .set('x-forwarded-for', '198.51.100.12')
      .set('user-agent', 'AuditAuth/1.2')
      .send({
        email: 'audit-admin@example.com',
        password: 'ValidPass123!'
      });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('ACCOUNT_DEACTIVATED');

    const auditInput = findAuditCallByCanonicalEvent('auth.login_blocked');
    expect(auditInput).toMatchObject({
      entityType: 'user',
      entityId: INTERNAL_USER_ID,
      ipAddress: '198.51.100.12',
      userAgent: 'AuditAuth/1.2',
      payload: expect.objectContaining({
        email: 'audit-admin@example.com',
        reason: 'account_deactivated',
        role: 'admin'
      })
    });
    expect(auditInput.actorId ?? null).toBeNull();
  });

  it('captures logout event with actor null/system semantics and request metadata', async () => {
    const response = await request(app)
      .post('/api/auth/logout')
      .set('cookie', 'auth_token=mock-token')
      .set('x-forwarded-for', '198.51.100.13')
      .set('user-agent', 'AuditAuth/2.0');

    expect(response.status).toBe(200);

    const auditInput = findAuditCallByCanonicalEvent('auth.logout');
    expect(auditInput).toMatchObject({
      eventType: 'auth.logout',
      entityType: 'session',
      entityId: 'anonymous-session',
      ipAddress: '198.51.100.13',
      userAgent: 'AuditAuth/2.0',
      payload: expect.objectContaining({
        hadAuthCookie: true,
        route: '/api/auth/logout'
      })
    });
    expect(auditInput.actorId ?? null).toBeNull();
  });
});
