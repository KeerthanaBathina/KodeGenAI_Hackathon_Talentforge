---
id: task_002
us_id: us_002
epic: EP-001
title: "Update Resend OTP Endpoint with Rate Limit Enforcement"
status: done
layer: backend
effort: 3h
priority: high
created: 2026-07-24
completed: 2026-07-24
---

# TASK-002 — Update Resend OTP Endpoint with Rate Limit Enforcement

## Context

**User Story**: US-002 — OTP Resend Rate Limiting with Lockout Window  
**Epic**: EP-001 — Candidate Onboarding and Identity  
**Addresses Acceptance Criteria**: Scenario 2 (fourth resend returns HTTP 429), Scenario 3 (counter resets after window)

The existing resend OTP endpoint must integrate the rate limiter from TASK-001 and return proper HTTP 429 responses with retry-after information when the limit is exceeded.

---

## Objective

Modify the POST `/api/v1/auth/resend-otp` endpoint to:
- Check rate limit before generating and sending OTP
- Return HTTP 429 with `Retry-After` header when limit exceeded
- Include remaining attempts and reset timestamp in response body
- Log rate limit violations for security monitoring

---

## Technical Specifications

| Aspect | Requirement | Standard |
|--------|-------------|----------|
| Rate Check Timing | Before OTP generation | Prevent wasted work and email quota |
| HTTP Status | 429 Too Many Requests | RFC 6585 standard |
| `Retry-After` Header | Seconds until reset | RFC 7231 §7.1.3 |
| Response Body | JSON with `resetAt`, `remaining` | Client needs countdown timer data |
| Logging | Rate limit hit with email hash | Security audit trail (GDPR-safe) |

**Endpoint Contract**:

```typescript
// Success Response (HTTP 200)
{
  "success": true,
  "message": "Verification code sent",
  "data": {
    "email": "user@example.com",
    "remaining": 2,
    "resetAt": "2026-07-24T12:30:00.000Z"
  }
}

// Rate Limit Response (HTTP 429)
{
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Too many resend requests. Please wait 8 minutes before trying again.",
    "retryAfter": 480,
    "resetAt": "2026-07-24T12:30:00.000Z"
  }
}
```

---

## Implementation Steps

### Step 1 — Locate Resend OTP Route Handler

Identify the route handler for OTP resend. Expected location:
- `backend/src/routes/auth.ts` or
- `backend/src/modules/auth/auth.routes.ts` or
- `backend/src/controllers/auth/resendOtp.ts`

If the endpoint doesn't exist yet, create it following the project's routing conventions.

### Step 2 — Integrate Rate Limiter

Modify the resend OTP handler to check rate limit before processing:

```typescript
import { OtpResendRateLimiter } from '../services/otpRateLimiter';
import { createHash } from 'crypto';

// POST /api/v1/auth/resend-otp
export async function resendOtpHandler(req: Request, res: Response) {
  const { email } = req.body;

  // Validate email format
  if (!email || !isValidEmail(email)) {
    return res.status(400).json({
      error: {
        code: 'INVALID_EMAIL',
        message: 'Valid email address is required',
      },
    });
  }

  try {
    // Check rate limit BEFORE generating OTP or querying database
    const rateLimitResult = await OtpResendRateLimiter.checkAndIncrement(email);

    if (!rateLimitResult.allowed) {
      // Log rate limit violation (hash email for GDPR compliance)
      const emailHash = createHash('sha256').update(email).digest('hex').substring(0, 16);
      console.warn('OTP resend rate limit exceeded', {
        emailHash,
        retryAfter: rateLimitResult.retryAfterSeconds,
        timestamp: new Date().toISOString(),
      });

      // Calculate human-readable wait time
      const minutes = Math.ceil((rateLimitResult.retryAfterSeconds || 0) / 60);
      
      // Return HTTP 429 with Retry-After header
      res.set('Retry-After', String(rateLimitResult.retryAfterSeconds || 0));
      return res.status(429).json({
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: `Too many resend requests. Please wait ${minutes} minute${minutes !== 1 ? 's' : ''} before trying again.`,
          retryAfter: rateLimitResult.retryAfterSeconds,
          resetAt: rateLimitResult.resetAt.toISOString(),
        },
      });
    }

    // Proceed with OTP generation and sending
    // [existing OTP generation logic here]
    const otp = await generateOtp(email);
    await sendOtpEmail(email, otp);

    // Return success with rate limit info
    return res.status(200).json({
      success: true,
      message: 'Verification code sent',
      data: {
        email,
        remaining: rateLimitResult.remaining,
        resetAt: rateLimitResult.resetAt.toISOString(),
      },
    });

  } catch (error) {
    console.error('Resend OTP error:', error);
    
    // Don't expose rate limiter failures to client
    if (error instanceof Error && error.message === 'Rate limit check failed') {
      // Fail open: allow request but log incident
      console.error('Rate limiter service unavailable - failing open');
    }
    
    return res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to send verification code',
      },
    });
  }
}
```

### Step 3 — Add Request Validation Middleware

Create or update input validation for the resend endpoint:

```typescript
import { z } from 'zod';

const resendOtpSchema = z.object({
  email: z.string().email('Invalid email format').toLowerCase(),
});

// Validation middleware
export function validateResendOtp(req: Request, res: Response, next: NextFunction) {
  try {
    req.body = resendOtpSchema.parse(req.body);
    next();
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: error.errors[0].message,
          fields: error.errors,
        },
      });
    }
    next(error);
  }
}
```

### Step 4 — Update Route Registration

Ensure validation middleware is applied:

```typescript
router.post('/auth/resend-otp', validateResendOtp, resendOtpHandler);
```

### Step 5 — Add Integration Test

Create `backend/src/routes/__tests__/auth.resend-otp.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../app';
import { OtpResendRateLimiter } from '../../services/otpRateLimiter';

describe('POST /api/v1/auth/resend-otp', () => {
  beforeEach(async () => {
    // Reset rate limiter between tests
    await OtpResendRateLimiter.reset('test@example.com');
  });

  it('should send OTP on first request', async () => {
    const response = await request(app)
      .post('/api/v1/auth/resend-otp')
      .send({ email: 'test@example.com' })
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data.remaining).toBe(2);
  });

  it('should send OTP on second and third requests', async () => {
    // First two requests
    await request(app).post('/api/v1/auth/resend-otp').send({ email: 'test@example.com' });
    await request(app).post('/api/v1/auth/resend-otp').send({ email: 'test@example.com' });

    // Third request should succeed
    const response = await request(app)
      .post('/api/v1/auth/resend-otp')
      .send({ email: 'test@example.com' })
      .expect(200);

    expect(response.body.data.remaining).toBe(0);
  });

  it('should return 429 on fourth request', async () => {
    // Exhaust rate limit
    await request(app).post('/api/v1/auth/resend-otp').send({ email: 'test@example.com' });
    await request(app).post('/api/v1/auth/resend-otp').send({ email: 'test@example.com' });
    await request(app).post('/api/v1/auth/resend-otp').send({ email: 'test@example.com' });

    // Fourth request should be rate limited
    const response = await request(app)
      .post('/api/v1/auth/resend-otp')
      .send({ email: 'test@example.com' })
      .expect(429);

    expect(response.body.error.code).toBe('RATE_LIMIT_EXCEEDED');
    expect(response.headers['retry-after']).toBeDefined();
    expect(response.body.error.retryAfter).toBeGreaterThan(0);
  });

  it('should scope rate limit per email', async () => {
    // Exhaust limit for first email
    await request(app).post('/api/v1/auth/resend-otp').send({ email: 'user1@example.com' });
    await request(app).post('/api/v1/auth/resend-otp').send({ email: 'user1@example.com' });
    await request(app).post('/api/v1/auth/resend-otp').send({ email: 'user1@example.com' });

    // Different email should still work
    const response = await request(app)
      .post('/api/v1/auth/resend-otp')
      .send({ email: 'user2@example.com' })
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data.remaining).toBe(2);
  });

  it('should reject invalid email format', async () => {
    const response = await request(app)
      .post('/api/v1/auth/resend-otp')
      .send({ email: 'not-an-email' })
      .expect(400);

    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });
});
```

---

## Validation

| Check | Method | Expected Result |
|-------|--------|-----------------|
| First resend succeeds | POST with valid email | HTTP 200, `remaining: 2` |
| Third resend succeeds | POST 3 times | HTTP 200, `remaining: 0` |
| Fourth resend blocked | POST 4th time | HTTP 429, `Retry-After` header present |
| Error message shows minutes | Trigger 429 | Message includes human-readable wait time |
| Rate limit per email | Different emails | Independent counters |
| Invalid email rejected | POST with malformed email | HTTP 400 |

---

## Dependencies

- TASK-001 (Rate limit service implementation)
- Existing OTP generation and email sending logic

## Security Constraints

- **OWASP A07 (Identification and Authentication Failures)**: Rate limiting must occur BEFORE OTP generation to prevent resource exhaustion
- **OWASP A09 (Security Logging and Monitoring Failures)**: Log rate limit violations with hashed email for audit trail
- **GDPR Compliance**: Never log plaintext email addresses; use SHA-256 hash prefix

---

## Definition of Done

- [ ] Resend OTP endpoint checks rate limit before processing
- [ ] HTTP 429 returned with `Retry-After` header when limit exceeded
- [ ] Response includes `resetAt` timestamp and human-readable wait time
- [ ] Rate limit violations logged with email hash (not plaintext)
- [ ] Integration tests cover 1st, 3rd, 4th request scenarios
- [ ] Test confirms per-email scoping (not per-IP)
- [ ] Invalid email format returns HTTP 400

## Traceability

- **US**: US-002 — OTP Resend Rate Limiting with Lockout Window
- **Epic**: EP-001 — Candidate Onboarding and Identity
- **AC**: Scenarios 2, 3, 4
