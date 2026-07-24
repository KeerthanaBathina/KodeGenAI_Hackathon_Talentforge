---
id: task_003
us_id: us_004
epic: EP-001
title: "Build Password Reset API Endpoints"
status: done
layer: backend
effort: 3h
priority: high
created: 2026-07-24
completed: 2026-07-24
---

# TASK-003 — Build Password Reset API Endpoints

## Context

**User Story**: US-004 — Forgot Password with Time-Limited Reset Link  
**Epic**: EP-001 — Candidate Onboarding and Identity  
**Addresses Acceptance Criteria**: All scenarios (request, validation, consumption)

The API endpoints expose the password reset flow to the frontend: requesting a reset link, validating tokens, and completing the password change. All responses must prevent user enumeration while providing clear feedback for legitimate errors.

---

## Objective

Create three RESTful endpoints:
- `POST /api/auth/request-password-reset` — Generate and email reset token
- `GET /api/auth/validate-reset-token/:token` — Check token validity (for UI feedback)
- `POST /api/auth/reset-password` — Consume token and update password

---

## Technical Specifications

| Endpoint | Method | Input | Output | Status Codes |
|----------|--------|-------|--------|--------------|
| `/request-password-reset` | POST | `{ email }` | Generic success message | 202 (always) |
| `/validate-reset-token/:token` | GET | Token in URL | `{ valid, error }` | 200, 400 |
| `/reset-password` | POST | `{ token, newPassword }` | Success/error message | 200, 400 |

**Rate Limiting**:
- `/request-password-reset`: 3 requests per hour per IP
- Other endpoints: standard rate limit (100 req/15min per IP)

---

## Implementation Steps

### Step 1 — Add Reset Endpoints to Auth Router

Edit `backend/src/routes/auth.ts`:

```typescript
import {
  generateResetToken,
  validateResetToken,
  consumeResetToken,
  PasswordResetError,
} from '../services/passwordResetService';

// ... existing imports and routes ...

// Request password reset
router.post('/request-password-reset', async (req, res) => {
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
      const statusCode = error.code === 'WEAK_PASSWORD' ? 400 : 400;
      res.status(statusCode).json({
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
```

### Step 2 — Add Rate Limiting for Reset Requests

Create or update `backend/src/middleware/passwordResetRateLimit.ts`:

```typescript
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env';
import logger from '../utils/logger';

const redis = new Redis({
  url: env.UPSTASH_REDIS_REST_URL,
  token: env.UPSTASH_REDIS_REST_TOKEN,
});

// 3 requests per hour per IP
const resetRequestLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(3, '1 h'),
  analytics: true,
  prefix: 'password_reset_request',
});

export async function passwordResetRateLimitMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const identifier = req.ip || req.socket.remoteAddress || 'unknown';

  try {
    const { success, limit, remaining, reset } = await resetRequestLimiter.limit(identifier);

    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', limit.toString());
    res.setHeader('X-RateLimit-Remaining', remaining.toString());
    res.setHeader('X-RateLimit-Reset', reset.toString());

    if (!success) {
      const retryAfter = Math.ceil((reset - Date.now()) / 1000);
      res.setHeader('Retry-After', retryAfter.toString());

      res.status(429).json({
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many password reset requests. Please try again later.',
          retryAfter,
          resetAt: new Date(reset).toISOString(),
        },
      });
      return;
    }

    next();
  } catch (error) {
    logger.error({ error, identifier }, 'Password reset rate limit check failed');
    // Fail open: allow request if rate limiter fails
    next();
  }
}
```

Apply middleware to reset endpoint:

```typescript
import { passwordResetRateLimitMiddleware } from '../middleware/passwordResetRateLimit';

router.post('/request-password-reset', passwordResetRateLimitMiddleware, async (req, res) => {
  // ... existing handler ...
});
```

### Step 3 — Update API Documentation

Add to `backend/docs/api-endpoints.md` (if exists):

```markdown
### Password Reset Flow

#### 1. Request Password Reset

```http
POST /api/auth/request-password-reset
Content-Type: application/json

{
  "email": "user@example.com"
}
```

**Response** (202 Accepted):
```json
{
  "success": true,
  "message": "If this email is registered, you will receive a password reset link"
}
```

**Rate Limit**: 3 requests per hour per IP

---

#### 2. Validate Reset Token

```http
GET /api/auth/validate-reset-token/:token
```

**Response** (200 OK — valid):
```json
{
  "valid": true,
  "message": "Token is valid"
}
```

**Response** (400 Bad Request — invalid/expired):
```json
{
  "valid": false,
  "error": "TOKEN_EXPIRED",
  "message": "This link has expired. Please request a new password reset link."
}
```

---

#### 3. Reset Password

```http
POST /api/auth/reset-password
Content-Type: application/json

{
  "token": "base64url-encoded-token",
  "newPassword": "NewSecurePass123!"
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "message": "Password reset successful. You can now log in with your new password."
}
```

**Response** (400 Bad Request — weak password):
```json
{
  "success": false,
  "error": {
    "code": "WEAK_PASSWORD",
    "message": "Password must contain at least one uppercase letter"
  }
}
```
```

---

## Acceptance Criteria

- [x] `POST /request-password-reset` returns 202 for all emails (non-enumeration)
- [x] `GET /validate-reset-token/:token` returns token validity status
- [x] `POST /reset-password` updates password and marks token as used
- [x] Rate limiting: 3 reset requests per hour per IP
- [x] Clear error messages for expired, used, and invalid tokens
- [x] Password validation errors returned with specific requirements
- [x] All endpoints logged to audit_events

---

## Testing

```typescript
describe('Password Reset API', () => {
  it('should return 202 for unknown email (non-enumeration)', async () => {
    const res = await request(app)
      .post('/api/auth/request-password-reset')
      .send({ email: 'unknown@example.com' })
      .expect(202);

    expect(res.body.message).toContain('If this email is registered');
  });

  it('should reject expired token', async () => {
    const expiredToken = await createExpiredToken();

    const res = await request(app)
      .get(`/api/auth/validate-reset-token/${expiredToken}`)
      .expect(400);

    expect(res.body.error).toBe('TOKEN_EXPIRED');
  });

  it('should successfully reset password', async () => {
    const { token } = await createValidToken();

    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token, newPassword: 'NewPass123!' })
      .expect(200);

    expect(res.body.success).toBe(true);
  });
});
```

---

## Dependencies

- TASK-002 (passwordResetService)
- Upstash Redis for rate limiting
- Email service for sending reset links

---

## Notes

- Non-enumeration: same response time for found/not found emails
- Consider adding CAPTCHA for additional abuse prevention
- Monitor reset request patterns for suspicious activity
