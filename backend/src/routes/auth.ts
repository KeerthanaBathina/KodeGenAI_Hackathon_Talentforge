import { Router } from 'express';
import { z } from 'zod';
import { createHash } from 'crypto';
import {
  AuthError,
  GENERIC_REGISTRATION_MESSAGE,
  registerCandidate,
  resendOtp,
  verifyOtp
} from '../services/authService';
import { OtpResendRateLimiter } from '../services/otpRateLimiter';
import { authenticateUser, LoginError } from '../services/loginService';
import { JwtService } from '../services/jwtService';
import {
  exchangeGoogleCode,
  exchangeGitHubCode,
  getGoogleAuthUrl,
  getGitHubAuthUrl,
  OAuthError
} from '../services/oauthService';
import {
  generateResetToken,
  validateResetToken,
  consumeResetToken,
  PasswordResetError,
} from '../services/passwordResetService';
import { passwordResetRateLimitMiddleware } from '../middleware/passwordResetRateLimit';
import logger from '../utils/logger';

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

const verifyOtpSchema = z.object({
  email: z.string().email(),
  otp: z.string().regex(/^\d{6}$/)
});

const resendOtpSchema = z.object({
  email: z.string().email()
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

const router = Router();

router.post('/register', async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      message: 'Invalid request payload',
      errors: parsed.error.flatten().fieldErrors
    });
    return;
  }

  try {
    await registerCandidate(parsed.data);
    res.status(202).json({
      message: GENERIC_REGISTRATION_MESSAGE,
      next: '/verify-otp'
    });
  } catch (error) {
    if (error instanceof AuthError && error.code === 'INVALID_PASSWORD') {
      res.status(400).json({ message: error.message });
      return;
    }

    logger.error({ error }, 'auth: register endpoint failed');
    res.status(500).json({ message: 'Unable to process registration request' });
  }
});

router.post('/verify-otp', async (req, res) => {
  const parsed = verifyOtpSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      message: 'Invalid request payload',
      errors: parsed.error.flatten().fieldErrors
    });
    return;
  }

  try {
    const result = await verifyOtp(parsed.data);
    res.status(200).json({
      message: 'Verification successful',
      redirectTo: result.redirectTo,
      candidateId: result.candidateId
    });
  } catch (error) {
    if (error instanceof AuthError && error.code === 'OTP_EXPIRED') {
      res.status(400).json({
        message: 'Code expired - please request a new one',
        canResend: true
      });
      return;
    }

    if (error instanceof AuthError && error.code === 'INVALID_OTP') {
      res.status(400).json({
        message: 'Invalid verification code',
        canResend: false
      });
      return;
    }

    logger.error({ error }, 'auth: verify-otp endpoint failed');
    res.status(500).json({ message: 'Unable to verify OTP' });
  }
});

router.post('/resend-otp', async (req, res) => {
  const parsed = resendOtpSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      message: 'Invalid request payload',
      errors: parsed.error.flatten().fieldErrors
    });
    return;
  }

  const { email } = parsed.data;

  try {
    // Check rate limit BEFORE processing request
    const rateLimitResult = await OtpResendRateLimiter.checkAndIncrement(email);

    if (!rateLimitResult.allowed) {
      // Log rate limit violation (hash email for GDPR compliance)
      const emailHash = createHash('sha256').update(email).digest('hex').substring(0, 16);
      logger.warn({
        emailHash,
        retryAfter: rateLimitResult.retryAfterSeconds,
        timestamp: new Date().toISOString()
      }, 'OTP resend rate limit exceeded');

      // Calculate human-readable wait time
      const minutes = Math.ceil((rateLimitResult.retryAfterSeconds || 0) / 60);

      // Return HTTP 429 with Retry-After header
      res.set('Retry-After', String(rateLimitResult.retryAfterSeconds || 0));
      res.status(429).json({
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: `Too many resend requests. Please wait ${minutes} minute${minutes !== 1 ? 's' : ''} before trying again.`,
          retryAfter: rateLimitResult.retryAfterSeconds,
          resetAt: rateLimitResult.resetAt.toISOString()
        }
      });
      return;
    }

    // Proceed with OTP resend
    await resendOtp(parsed.data);

    res.status(202).json({
      success: true,
      message: GENERIC_REGISTRATION_MESSAGE,
      data: {
        email,
        remaining: rateLimitResult.remaining,
        resetAt: rateLimitResult.resetAt.toISOString()
      }
    });
  } catch (error) {
    // Handle rate limiter failures gracefully
    if (error instanceof Error && error.message === 'Rate limit check failed') {
      logger.error({ error }, 'Rate limiter service unavailable - failing open');
      // Continue with OTP resend (fail open for availability)
      try {
        await resendOtp(parsed.data);
        res.status(202).json({ message: GENERIC_REGISTRATION_MESSAGE });
        return;
      } catch (resendError) {
        logger.error({ error: resendError }, 'auth: resend-otp endpoint failed');
        res.status(500).json({ message: 'Unable to resend OTP' });
        return;
      }
    }

    logger.error({ error }, 'auth: resend-otp endpoint failed');
    res.status(500).json({ message: 'Unable to resend OTP' });
  }
});

// Login endpoint
router.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      message: 'Invalid request payload',
      errors: parsed.error.flatten().fieldErrors
    });
    return;
  }

  const { email, password } = parsed.data;
  const ipAddress = req.ip || req.socket.remoteAddress;
  const userAgent = req.headers['user-agent'];

  try {
    const result = await authenticateUser({
      email,
      password,
      ipAddress,
      userAgent,
    });

    if (!result.success || !result.user) {
      res.status(401).json({
        message: 'Authentication failed',
      });
      return;
    }

    // Generate JWT and set cookie
    const { token, options } = JwtService.createAuthCookie({
      sub: result.user.id,
      role: result.user.role,
      candidateId: result.user.candidateId,
    });

    res.cookie('auth_token', token, options);

    // Determine redirect URL based on role
    const redirectMap: Record<string, string> = {
      candidate: '/candidate/applications',
      hr: '/hr/dashboard',
      hr_reviewer: '/hr/dashboard',
      hr_manager: '/hr/dashboard',
      recruiter: '/recruiter/requisitions',
      admin: '/admin/dashboard',
      tech_interviewer: '/interviewer/dashboard',
    };

    const redirectTo = redirectMap[result.user.role] || '/dashboard';

    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        user: {
          id: result.user.id,
          email: result.user.email,
          role: result.user.role,
          candidateId: result.user.candidateId,
        },
        redirectTo,
      },
    });
  } catch (error) {
    if (error instanceof LoginError) {
      if (error.code === 'ACCOUNT_LOCKED') {
        res.status(423).json({
          error: {
            code: 'ACCOUNT_LOCKED',
            message: error.message,
            lockedUntil: error.lockedUntil?.toISOString(),
          },
        });
        return;
      }

      res.status(401).json({
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid email or password',
        },
      });
      return;
    }

    logger.error({ error }, 'auth: login endpoint failed');
    res.status(500).json({ message: 'Unable to process login request' });
  }
});

// Logout endpoint
router.post('/logout', (req, res) => {
  res.clearCookie('auth_token', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  });

  res.status(200).json({
    success: true,
    message: 'Logged out successfully',
  });
});

// OAuth: Google initiation
router.get('/oauth/google', (req, res) => {
  try {
    const state = req.query.state as string | undefined;
    const authUrl = getGoogleAuthUrl(state);
    res.redirect(authUrl);
  } catch (error) {
    logger.error({ error }, 'auth: Google OAuth initiation failed');
    res.status(500).json({ message: 'Unable to initiate Google OAuth' });
  }
});

// OAuth: Google callback
router.get('/oauth/google/callback', async (req, res) => {
  const code = req.query.code as string;
  const state = req.query.state as string | undefined;

  if (!code) {
    res.status(400).json({ message: 'Authorization code is required' });
    return;
  }

  const ipAddress = req.ip || req.socket.remoteAddress;
  const userAgent = req.headers['user-agent'];

  try {
    const result = await exchangeGoogleCode(code, ipAddress, userAgent);

    if (!result.success || !result.user) {
      res.status(401).json({ message: 'OAuth authentication failed' });
      return;
    }

    // Generate JWT and set cookie
    const { token, options } = JwtService.createAuthCookie({
      sub: result.user.id,
      role: result.user.role,
      candidateId: result.user.candidateId,
    });

    res.cookie('auth_token', token, options);

    // Redirect to appropriate dashboard
    const redirectMap: Record<string, string> = {
      candidate: '/candidate/applications',
      hr: '/hr/dashboard',
      hr_reviewer: '/hr/dashboard',
      hr_manager: '/hr/dashboard',
      recruiter: '/recruiter/requisitions',
      admin: '/admin/dashboard',
      tech_interviewer: '/interviewer/dashboard',
    };

    const redirectTo = redirectMap[result.user.role] || '/dashboard';
    res.redirect(redirectTo);
  } catch (error) {
    if (error instanceof OAuthError) {
      logger.error({ error, code: error.code }, 'Google OAuth callback failed');
      res.status(400).json({
        error: {
          code: error.code,
          message: error.message,
        },
      });
      return;
    }

    logger.error({ error }, 'auth: Google OAuth callback failed');
    res.status(500).json({ message: 'Unable to process OAuth callback' });
  }
});

// OAuth: GitHub initiation
router.get('/oauth/github', (req, res) => {
  try {
    const state = req.query.state as string | undefined;
    const authUrl = getGitHubAuthUrl(state);
    res.redirect(authUrl);
  } catch (error) {
    logger.error({ error }, 'auth: GitHub OAuth initiation failed');
    res.status(500).json({ message: 'Unable to initiate GitHub OAuth' });
  }
});

// OAuth: GitHub callback
router.get('/oauth/github/callback', async (req, res) => {
  const code = req.query.code as string;
  const state = req.query.state as string | undefined;

  if (!code) {
    res.status(400).json({ message: 'Authorization code is required' });
    return;
  }

  const ipAddress = req.ip || req.socket.remoteAddress;
  const userAgent = req.headers['user-agent'];

  try {
    const result = await exchangeGitHubCode(code, ipAddress, userAgent);

    if (!result.success || !result.user) {
      res.status(401).json({ message: 'OAuth authentication failed' });
      return;
    }

    // Generate JWT and set cookie
    const { token, options } = JwtService.createAuthCookie({
      sub: result.user.id,
      role: result.user.role,
      candidateId: result.user.candidateId,
    });

    res.cookie('auth_token', token, options);

    // Redirect to appropriate dashboard
    const redirectMap: Record<string, string> = {
      candidate: '/candidate/applications',
      hr: '/hr/dashboard',
      hr_reviewer: '/hr/dashboard',
      hr_manager: '/hr/dashboard',
      recruiter: '/recruiter/requisitions',
      admin: '/admin/dashboard',
      tech_interviewer: '/interviewer/dashboard',
    };

    const redirectTo = redirectMap[result.user.role] || '/dashboard';
    res.redirect(redirectTo);
  } catch (error) {
    if (error instanceof OAuthError) {
      logger.error({ error, code: error.code }, 'GitHub OAuth callback failed');
      res.status(400).json({
        error: {
          code: error.code,
          message: error.message,
        },
      });
      return;
    }

    logger.error({ error }, 'auth: GitHub OAuth callback failed');
    res.status(500).json({ message: 'Unable to process OAuth callback' });
  }
});

// Request password reset
router.post('/request-password-reset', passwordResetRateLimitMiddleware, async (req, res) => {
  const schema = z.object({
    email: z.string().email(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      message: 'Invalid email address',
      errors: parsed.error.flatten().fieldErrors,
    });
    return;
  }

  const { email } = parsed.data;
  const ipAddress = req.ip || req.socket.remoteAddress;
  const userAgent = req.headers['user-agent'];

  try {
    const result = await generateResetToken(email, ipAddress, userAgent);

    // Always return 202 with generic message (non-enumeration)
    res.status(202).json({
      success: true,
      message: result.message,
    });
  } catch (error) {
    logger.error({ error, email }, 'auth: request-password-reset failed');
    res.status(500).json({
      message: 'Unable to process password reset request',
    });
  }
});

// Validate reset token (for UI feedback before form submission)
router.get('/validate-reset-token/:token', async (req, res) => {
  const { token } = req.params;

  if (!token) {
    res.status(400).json({
      valid: false,
      error: 'TOKEN_NOT_FOUND',
      message: 'Reset token is required',
    });
    return;
  }

  try {
    const validation = await validateResetToken(token);

    if (!validation.valid) {
      const messages: Record<string, string> = {
        TOKEN_EXPIRED: 'This link has expired. Please request a new password reset link.',
        TOKEN_USED: 'This link has already been used. Please request a new password reset link.',
        TOKEN_NOT_FOUND: 'Invalid reset link. Please request a new password reset link.',
      };

      res.status(400).json({
        valid: false,
        error: validation.error,
        message: messages[validation.error!] || 'Invalid reset link',
      });
      return;
    }

    res.status(200).json({
      valid: true,
      message: 'Token is valid',
    });
  } catch (error) {
    logger.error({ error, token: token.substring(0, 10) }, 'auth: validate-reset-token failed');
    res.status(500).json({
      valid: false,
      message: 'Unable to validate reset token',
    });
  }
});

// Reset password with token
router.post('/reset-password', async (req, res) => {
  const schema = z.object({
    token: z.string().min(1),
    newPassword: z.string().min(8),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      message: 'Invalid request payload',
      errors: parsed.error.flatten().fieldErrors,
    });
    return;
  }

  const { token, newPassword } = parsed.data;
  const ipAddress = req.ip || req.socket.remoteAddress;
  const userAgent = req.headers['user-agent'];

  try {
    const result = await consumeResetToken(token, newPassword, ipAddress, userAgent);

    res.status(200).json({
      success: true,
      message: result.message,
    });
  } catch (error) {
    if (error instanceof PasswordResetError) {
      res.status(400).json({
        success: false,
        error: {
          code: error.code,
          message: error.message,
        },
      });
      return;
    }

    logger.error({ error }, 'auth: reset-password failed');
    res.status(500).json({
      message: 'Unable to reset password',
    });
  }
});

export default router;
