---
id: task_001
us_id: us_002
epic: EP-001
title: "Implement Redis Rate Limit Counter Service for OTP Resend"
status: done
layer: backend
effort: 4h
priority: high
created: 2026-07-24
completed: 2026-07-24
---

# TASK-001 — Implement Redis Rate Limit Counter Service for OTP Resend

## Context

**User Story**: US-002 — OTP Resend Rate Limiting with Lockout Window  
**Epic**: EP-001 — Candidate Onboarding and Identity  
**Addresses Acceptance Criteria**: All scenarios (counter increment, lockout threshold, window expiry, per-email scoping)

Rate limiting must be enforced via Upstash Redis to prevent email flooding and OTP brute-force attacks. This task creates a reusable rate limit counter service that tracks resend attempts per email with automatic TTL expiry.

---

## Objective

Create a Redis-backed rate limit service that:
- Tracks OTP resend attempts per candidate email
- Enforces a 3-request limit per 15-minute sliding window
- Returns remaining attempts and lockout expiry timestamps
- Automatically resets counters after window expiration

---

## Technical Specifications

| Component | Specification | Rationale |
|-----------|--------------|-----------|
| Redis Key Pattern | `otp_resend:<email>` | Per-email scoping; prevents cross-candidate lockout |
| Window Duration | 900 seconds (15 minutes) | Matches AC requirement; balance security vs. UX |
| Request Limit | 3 attempts | Prevents abuse while allowing legitimate retries |
| Lockout Response | HTTP 429 with `Retry-After` header | Standard rate limit signaling |
| Counter Storage | Atomic INCR + EXPIRE | Race-condition safe increment with TTL |

**Redis Commands Flow**:
```redis
# First request
INCR otp_resend:user@example.com   # Returns 1
EXPIRE otp_resend:user@example.com 900

# Subsequent requests
INCR otp_resend:user@example.com   # Returns 2, 3...
TTL otp_resend:user@example.com    # Get remaining window time

# Check before increment
GET otp_resend:user@example.com    # Check current count
```

---

## Implementation Steps

### Step 1 — Create Rate Limit Service

Create `backend/src/services/otpRateLimiter.ts`:

```typescript
import { redis } from '../db/redis';

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
  retryAfterSeconds?: number;
}

export class OtpResendRateLimiter {
  private static readonly KEY_PREFIX = 'otp_resend';
  private static readonly WINDOW_SECONDS = 900; // 15 minutes
  private static readonly MAX_ATTEMPTS = 3;

  /**
   * Check and increment rate limit counter for OTP resend.
   * 
   * @param email - Candidate email address (normalized to lowercase)
   * @returns Rate limit decision with remaining attempts and reset timestamp
   * 
   * @throws Error if Redis connection fails (caller should handle gracefully)
   */
  static async checkAndIncrement(email: string): Promise<RateLimitResult> {
    const key = `${this.KEY_PREFIX}:${email.toLowerCase()}`;
    
    try {
      // Get current count (null if key doesn't exist)
      const currentCount = await redis.get(key);
      const count = currentCount ? parseInt(currentCount, 10) : 0;

      // Check if already at limit
      if (count >= this.MAX_ATTEMPTS) {
        const ttl = await redis.ttl(key);
        const resetAt = new Date(Date.now() + ttl * 1000);
        
        return {
          allowed: false,
          remaining: 0,
          resetAt,
          retryAfterSeconds: ttl > 0 ? ttl : 0,
        };
      }

      // Increment counter
      const newCount = await redis.incr(key);

      // Set expiry on first increment
      if (newCount === 1) {
        await redis.expire(key, this.WINDOW_SECONDS);
      }

      const ttl = await redis.ttl(key);
      const resetAt = new Date(Date.now() + ttl * 1000);

      return {
        allowed: true,
        remaining: this.MAX_ATTEMPTS - newCount,
        resetAt,
      };
    } catch (error) {
      // Log error but don't expose Redis details to caller
      console.error('OTP rate limiter error:', error);
      throw new Error('Rate limit check failed');
    }
  }

  /**
   * Get current rate limit status without incrementing counter.
   * Useful for UI to display remaining attempts.
   */
  static async getStatus(email: string): Promise<RateLimitResult> {
    const key = `${this.KEY_PREFIX}:${email.toLowerCase()}`;
    
    try {
      const currentCount = await redis.get(key);
      const count = currentCount ? parseInt(currentCount, 10) : 0;
      const ttl = await redis.ttl(key);
      const resetAt = ttl > 0 
        ? new Date(Date.now() + ttl * 1000) 
        : new Date(Date.now() + this.WINDOW_SECONDS * 1000);

      return {
        allowed: count < this.MAX_ATTEMPTS,
        remaining: Math.max(0, this.MAX_ATTEMPTS - count),
        resetAt,
        retryAfterSeconds: count >= this.MAX_ATTEMPTS && ttl > 0 ? ttl : undefined,
      };
    } catch (error) {
      console.error('OTP rate limit status check error:', error);
      throw new Error('Rate limit status check failed');
    }
  }

  /**
   * Reset rate limit counter for a specific email.
   * Use only for testing or support override scenarios.
   */
  static async reset(email: string): Promise<void> {
    const key = `${this.KEY_PREFIX}:${email.toLowerCase()}`;
    await redis.del(key);
  }
}
```

### Step 2 — Add Unit Tests

Create `backend/src/services/__tests__/otpRateLimiter.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OtpResendRateLimiter } from '../otpRateLimiter';
import { redis } from '../../db/redis';

// Mock redis
vi.mock('../../db/redis', () => ({
  redis: {
    get: vi.fn(),
    incr: vi.fn(),
    expire: vi.fn(),
    ttl: vi.fn(),
    del: vi.fn(),
  },
}));

describe('OtpResendRateLimiter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('checkAndIncrement', () => {
    it('should allow first request and set expiry', async () => {
      vi.mocked(redis.get).mockResolvedValue(null);
      vi.mocked(redis.incr).mockResolvedValue(1);
      vi.mocked(redis.ttl).mockResolvedValue(900);

      const result = await OtpResendRateLimiter.checkAndIncrement('test@example.com');

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(2);
      expect(redis.expire).toHaveBeenCalledWith('otp_resend:test@example.com', 900);
    });

    it('should allow second and third requests', async () => {
      vi.mocked(redis.get).mockResolvedValue('2');
      vi.mocked(redis.incr).mockResolvedValue(3);
      vi.mocked(redis.ttl).mockResolvedValue(600);

      const result = await OtpResendRateLimiter.checkAndIncrement('test@example.com');

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(0);
    });

    it('should reject fourth request with retry-after', async () => {
      vi.mocked(redis.get).mockResolvedValue('3');
      vi.mocked(redis.ttl).mockResolvedValue(300);

      const result = await OtpResendRateLimiter.checkAndIncrement('test@example.com');

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.retryAfterSeconds).toBe(300);
    });

    it('should normalize email to lowercase', async () => {
      vi.mocked(redis.get).mockResolvedValue(null);
      vi.mocked(redis.incr).mockResolvedValue(1);
      vi.mocked(redis.ttl).mockResolvedValue(900);

      await OtpResendRateLimiter.checkAndIncrement('Test@Example.COM');

      expect(redis.get).toHaveBeenCalledWith('otp_resend:test@example.com');
    });
  });

  describe('getStatus', () => {
    it('should return status without incrementing', async () => {
      vi.mocked(redis.get).mockResolvedValue('2');
      vi.mocked(redis.ttl).mockResolvedValue(450);

      const result = await OtpResendRateLimiter.getStatus('test@example.com');

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(1);
      expect(redis.incr).not.toHaveBeenCalled();
    });
  });

  describe('reset', () => {
    it('should delete rate limit key', async () => {
      await OtpResendRateLimiter.reset('test@example.com');

      expect(redis.del).toHaveBeenCalledWith('otp_resend:test@example.com');
    });
  });
});
```

### Step 3 — Verify Redis Connection

Ensure Redis client is configured in `backend/src/db/redis.ts` with error handling:

```typescript
import { Redis } from '@upstash/redis';
import { env } from '../config/env';

if (!env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN) {
  throw new Error('UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be set');
}

export const redis = new Redis({
  url: env.UPSTASH_REDIS_REST_URL,
  token: env.UPSTASH_REDIS_REST_TOKEN,
});
```

### Step 4 — Add Environment Variables

Add to `backend/.env.example`:

```env
# Upstash Redis (Rate Limiting)
UPSTASH_REDIS_REST_URL=https://your-redis.upstash.io
UPSTASH_REDIS_REST_TOKEN=your_token_here
```

Verify variables are loaded in `backend/src/config/env.ts`.

---

## Validation

| Check | Method | Expected Result |
|-------|--------|-----------------|
| First request succeeds | Call `checkAndIncrement` with new email | `allowed: true`, `remaining: 2` |
| Third request succeeds | Call 3 times | `allowed: true`, `remaining: 0` |
| Fourth request blocked | Call 4th time | `allowed: false`, `retryAfterSeconds > 0` |
| Counter resets after TTL | Wait 15 min or call `reset()` | Next request shows `remaining: 2` |
| Email case-insensitive | Use `Test@Example.com` and `test@example.com` | Both use same counter |
| Concurrent requests safe | Simulate race condition | No counter corruption |

---

## Dependencies

- EP-TECH / US-003 (Upstash Redis configured)
- `@upstash/redis` npm package installed

## Security Constraints

- **OWASP A05 (Security Misconfiguration)**: Redis credentials must never be committed to git; use environment variables only
- **OWASP A04 (Insecure Design)**: Counter must be atomic to prevent race conditions allowing more than 3 requests

---

## Definition of Done

- [ ] `OtpResendRateLimiter` service created with `checkAndIncrement` and `getStatus` methods
- [ ] Redis key pattern uses `otp_resend:<email>` with 900s TTL
- [ ] Email addresses normalized to lowercase before key generation
- [ ] Unit tests cover first/third/fourth request scenarios and email normalization
- [ ] Redis connection verified with environment variables
- [ ] Service throws errors gracefully without exposing Redis internals

## Traceability

- **US**: US-002 — OTP Resend Rate Limiting with Lockout Window
- **Epic**: EP-001 — Candidate Onboarding and Identity
- **AC**: Scenarios 1, 2, 3, 4
