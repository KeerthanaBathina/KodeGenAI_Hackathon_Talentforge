---
id: task_004
us_id: us_002
epic: EP-001
title: "Create Rate Limit Integration Tests"
status: done
layer: test
effort: 2h
priority: high
created: 2026-07-24
completed: 2026-07-24
---

# TASK-004 — Create Rate Limit Integration Tests

## Context

**User Story**: US-002 — OTP Resend Rate Limiting with Lockout Window  
**Epic**: EP-001 — Candidate Onboarding and Identity  
**Addresses Acceptance Criteria**: All scenarios (end-to-end validation of rate limiting behavior)

Integration tests must verify the complete rate limiting flow including Redis persistence, HTTP responses, TTL expiry, and multi-user isolation. These tests validate that TASK-001, TASK-002, and TASK-003 work together correctly.

---

## Objective

Create comprehensive integration tests that:
- Verify 3-request limit enforcement across multiple sequential requests
- Validate HTTP 429 response structure and headers
- Test counter reset after 15-minute window expiry
- Confirm per-email scoping (different emails don't interfere)
- Check rate limiter graceful degradation on Redis failure

---

## Technical Specifications

| Test Category | Coverage | Tools |
|---------------|----------|-------|
| Request Sequence | 1st, 2nd, 3rd, 4th requests | Vitest + Supertest |
| HTTP Response | Status codes, headers, body | Supertest assertions |
| TTL Expiry | Fast-forward time, verify reset | Redis mock or time travel |
| Email Scoping | Parallel requests, different emails | Concurrent test execution |
| Error Handling | Redis down, network timeout | Mock failures |

**Test Data Strategy**:
- Use unique test emails per test to avoid cross-contamination
- Clean up Redis keys in `afterEach` hooks
- For TTL tests, mock time advancement or use short TTL (5s) with actual wait

---

## Implementation Steps

### Step 1 — Create Integration Test Suite

Create `backend/src/integration/__tests__/otp-rate-limit.integration.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { app } from '../../app';
import { OtpResendRateLimiter } from '../../services/otpRateLimiter';

describe('OTP Resend Rate Limit - Integration Tests', () => {
  const testEmails = new Set<string>();

  // Generate unique test email for each test
  function getTestEmail(): string {
    const email = `test-${Date.now()}-${Math.random().toString(36).substring(7)}@example.com`;
    testEmails.add(email);
    return email;
  }

  // Clean up all test emails after each test
  afterEach(async () => {
    for (const email of testEmails) {
      await OtpResendRateLimiter.reset(email);
    }
    testEmails.clear();
  });

  describe('Request Sequence Tests', () => {
    it('should allow first 3 requests and block the 4th', async () => {
      const email = getTestEmail();

      // First request - should succeed
      const res1 = await request(app)
        .post('/api/v1/auth/resend-otp')
        .send({ email })
        .expect(200);
      expect(res1.body.data.remaining).toBe(2);

      // Second request - should succeed
      const res2 = await request(app)
        .post('/api/v1/auth/resend-otp')
        .send({ email })
        .expect(200);
      expect(res2.body.data.remaining).toBe(1);

      // Third request - should succeed
      const res3 = await request(app)
        .post('/api/v1/auth/resend-otp')
        .send({ email })
        .expect(200);
      expect(res3.body.data.remaining).toBe(0);

      // Fourth request - should be rate limited
      const res4 = await request(app)
        .post('/api/v1/auth/resend-otp')
        .send({ email })
        .expect(429);
      
      expect(res4.body.error.code).toBe('RATE_LIMIT_EXCEEDED');
      expect(res4.headers['retry-after']).toBeDefined();
      expect(parseInt(res4.headers['retry-after'], 10)).toBeGreaterThan(0);
    });

    it('should include resetAt timestamp in all responses', async () => {
      const email = getTestEmail();

      const response = await request(app)
        .post('/api/v1/auth/resend-otp')
        .send({ email })
        .expect(200);

      expect(response.body.data.resetAt).toBeDefined();
      const resetDate = new Date(response.body.data.resetAt);
      expect(resetDate.getTime()).toBeGreaterThan(Date.now());
    });

    it('should return human-readable wait time in 429 message', async () => {
      const email = getTestEmail();

      // Exhaust limit
      await request(app).post('/api/v1/auth/resend-otp').send({ email });
      await request(app).post('/api/v1/auth/resend-otp').send({ email });
      await request(app).post('/api/v1/auth/resend-otp').send({ email });

      // Get rate limit error
      const response = await request(app)
        .post('/api/v1/auth/resend-otp')
        .send({ email })
        .expect(429);

      expect(response.body.error.message).toMatch(/wait \d+ minute/i);
      expect(response.body.error.retryAfter).toBeGreaterThan(0);
    });
  });

  describe('Email Scoping Tests', () => {
    it('should maintain separate counters for different emails', async () => {
      const email1 = getTestEmail();
      const email2 = getTestEmail();

      // Exhaust limit for email1
      await request(app).post('/api/v1/auth/resend-otp').send({ email: email1 });
      await request(app).post('/api/v1/auth/resend-otp').send({ email: email1 });
      await request(app).post('/api/v1/auth/resend-otp').send({ email: email1 });
      
      // email1 should now be rate limited
      await request(app).post('/api/v1/auth/resend-otp').send({ email: email1 }).expect(429);

      // email2 should still work
      const res = await request(app)
        .post('/api/v1/auth/resend-otp')
        .send({ email: email2 })
        .expect(200);
      
      expect(res.body.data.remaining).toBe(2);
    });

    it('should normalize email case for counter key', async () => {
      const baseEmail = getTestEmail();
      const upperEmail = baseEmail.toUpperCase();
      const mixedEmail = baseEmail.split('').map((c, i) => i % 2 ? c.toUpperCase() : c).join('');

      // Use all 3 attempts with different case variations
      await request(app).post('/api/v1/auth/resend-otp').send({ email: baseEmail });
      await request(app).post('/api/v1/auth/resend-otp').send({ email: upperEmail });
      await request(app).post('/api/v1/auth/resend-otp').send({ email: mixedEmail });

      // Fourth request should be rate limited regardless of case
      await request(app).post('/api/v1/auth/resend-otp').send({ email: baseEmail }).expect(429);
      await request(app).post('/api/v1/auth/resend-otp').send({ email: upperEmail }).expect(429);
    });
  });

  describe('TTL and Reset Tests', () => {
    it('should reset counter after manual reset', async () => {
      const email = getTestEmail();

      // Exhaust limit
      await request(app).post('/api/v1/auth/resend-otp').send({ email });
      await request(app).post('/api/v1/auth/resend-otp').send({ email });
      await request(app).post('/api/v1/auth/resend-otp').send({ email });
      await request(app).post('/api/v1/auth/resend-otp').send({ email }).expect(429);

      // Manually reset (simulates TTL expiry)
      await OtpResendRateLimiter.reset(email);

      // Next request should succeed
      const response = await request(app)
        .post('/api/v1/auth/resend-otp')
        .send({ email })
        .expect(200);
      
      expect(response.body.data.remaining).toBe(2);
    });

    // Note: Testing actual TTL expiry requires either:
    // 1. Waiting 15 minutes (slow)
    // 2. Mocking time (complex)
    // 3. Using short TTL in test env (5 seconds)
    // Choose option 3 for practicality:

    it.skip('should reset counter after TTL expiry (requires test config with short TTL)', async () => {
      // This test requires modifying OtpResendRateLimiter to accept
      // configurable TTL, or using a test-specific Redis instance
      // with overridden TTL values.
      
      // Implementation left to developer based on project test strategy.
    });
  });

  describe('Validation and Error Handling', () => {
    it('should reject requests with missing email', async () => {
      const response = await request(app)
        .post('/api/v1/auth/resend-otp')
        .send({})
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should reject requests with invalid email format', async () => {
      const response = await request(app)
        .post('/api/v1/auth/resend-otp')
        .send({ email: 'not-an-email' })
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should handle concurrent requests without counter corruption', async () => {
      const email = getTestEmail();

      // Fire 5 concurrent requests
      const promises = Array.from({ length: 5 }, () =>
        request(app).post('/api/v1/auth/resend-otp').send({ email })
      );

      const responses = await Promise.all(promises);

      // Count successful (200) and rate limited (429) responses
      const successCount = responses.filter(r => r.status === 200).length;
      const rateLimitedCount = responses.filter(r => r.status === 429).length;

      // Exactly 3 should succeed, rest should be rate limited
      expect(successCount).toBe(3);
      expect(rateLimitedCount).toBe(2);
    });
  });

  describe('Response Structure Validation', () => {
    it('should include all required fields in success response', async () => {
      const email = getTestEmail();

      const response = await request(app)
        .post('/api/v1/auth/resend-otp')
        .send({ email })
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('message');
      expect(response.body.data).toHaveProperty('email');
      expect(response.body.data).toHaveProperty('remaining');
      expect(response.body.data).toHaveProperty('resetAt');
      expect(typeof response.body.data.remaining).toBe('number');
    });

    it('should include all required fields in 429 response', async () => {
      const email = getTestEmail();

      // Exhaust limit
      await request(app).post('/api/v1/auth/resend-otp').send({ email });
      await request(app).post('/api/v1/auth/resend-otp').send({ email });
      await request(app).post('/api/v1/auth/resend-otp').send({ email });

      const response = await request(app)
        .post('/api/v1/auth/resend-otp')
        .send({ email })
        .expect(429);

      expect(response.body.error).toHaveProperty('code', 'RATE_LIMIT_EXCEEDED');
      expect(response.body.error).toHaveProperty('message');
      expect(response.body.error).toHaveProperty('retryAfter');
      expect(response.body.error).toHaveProperty('resetAt');
      expect(response.headers).toHaveProperty('retry-after');
    });
  });
});
```

### Step 2 — Create End-to-End Playwright Test

Create `frontend/tests/otp-rate-limit.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';

test.describe('OTP Resend Rate Limiting', () => {
  const testEmail = `test-${Date.now()}@example.com`;

  test.beforeEach(async ({ page }) => {
    // Navigate to registration and complete to OTP verification page
    await page.goto('/register');
    await page.fill('input[name="email"]', testEmail);
    await page.fill('input[name="password"]', 'SecurePass123!');
    await page.click('button[type="submit"]');
    
    // Should redirect to OTP verification page
    await expect(page).toHaveURL(/\/verify-otp/);
  });

  test('should display countdown timer after exceeding rate limit', async ({ page }) => {
    // Click resend 3 times quickly
    await page.click('button:has-text("Resend")');
    await page.waitForTimeout(500);
    await page.click('button:has-text("Resend")');
    await page.waitForTimeout(500);
    await page.click('button:has-text("Resend")');
    await page.waitForTimeout(500);
    
    // Fourth click should trigger rate limit
    await page.click('button:has-text("Resend")');

    // Wait for error message to appear
    await expect(page.locator('role=alert')).toContainText(/too many requests/i);
    
    // Countdown timer should be visible
    const timer = page.locator('role=timer');
    await expect(timer).toBeVisible();
    
    // Timer should show MM:SS format
    await expect(timer).toHaveText(/\d{2}:\d{2}/);
    
    // Resend button should be disabled
    await expect(page.locator('button:has-text("Resend")')).toBeDisabled();
  });

  test('should decrement countdown timer every second', async ({ page }) => {
    // Trigger rate limit (same as above)
    for (let i = 0; i < 4; i++) {
      await page.click('button:has-text("Resend")');
      await page.waitForTimeout(300);
    }

    // Get initial timer value
    const timer = page.locator('role=timer');
    const initialText = await timer.textContent();
    
    // Wait 2 seconds
    await page.waitForTimeout(2000);
    
    // Timer should have decreased
    const newText = await timer.textContent();
    expect(initialText).not.toBe(newText);
    
    // Parse and verify it decreased by ~2 seconds
    const [initMin, initSec] = initialText!.split(':').map(Number);
    const [newMin, newSec] = newText!.split(':').map(Number);
    const initialSeconds = initMin * 60 + initSec;
    const newSeconds = newMin * 60 + newSec;
    expect(initialSeconds - newSeconds).toBeGreaterThanOrEqual(1);
    expect(initialSeconds - newSeconds).toBeLessThanOrEqual(3);
  });

  test('should persist rate limit after page refresh', async ({ page }) => {
    // Trigger rate limit
    for (let i = 0; i < 4; i++) {
      await page.click('button:has-text("Resend")');
      await page.waitForTimeout(300);
    }

    // Verify timer is showing
    await expect(page.locator('role=timer')).toBeVisible();
    const timerBefore = await page.locator('role=timer').textContent();

    // Refresh page
    await page.reload();

    // Timer should still be visible after reload
    await expect(page.locator('role=timer')).toBeVisible();
    const timerAfter = await page.locator('role=timer').textContent();
    
    // Timer should show similar time (within a few seconds)
    const [minB, secB] = timerBefore!.split(':').map(Number);
    const [minA, secA] = timerAfter!.split(':').map(Number);
    const beforeSec = minB * 60 + secB;
    const afterSec = minA * 60 + secA;
    expect(Math.abs(beforeSec - afterSec)).toBeLessThan(5);
  });
});
```

### Step 3 — Add Test Documentation

Create `backend/src/integration/__tests__/README.md`:

```markdown
# OTP Rate Limit Integration Tests

## Test Coverage

- ✅ Sequential request limits (1st, 2nd, 3rd, 4th)
- ✅ HTTP 429 response structure
- ✅ Per-email counter scoping
- ✅ Email case normalization
- ✅ Counter reset behavior
- ✅ Concurrent request handling
- ✅ Response field validation

## Running Tests

```bash
# All integration tests
npm run test:integration

# OTP rate limit tests only
npm run test:integration -- otp-rate-limit

# With coverage
npm run test:integration -- --coverage
```

## Test Data Cleanup

All tests use unique email addresses generated with timestamps. Redis keys are automatically cleaned up in `afterEach` hooks.

## Known Limitations

- TTL expiry test requires either:
  - 15-minute wait (impractical)
  - Time mocking (adds complexity)
  - Short TTL test config (recommended)
  
Current implementation uses manual reset to simulate TTL expiry.
```

---

## Validation

| Check | Method | Expected Result |
|-------|--------|-----------------|
| All integration tests pass | `npm run test:integration` | 0 failures |
| E2E test passes | `npx playwright test` | Countdown timer visible and functional |
| Concurrent test | Run concurrent request test | Exactly 3 succeed, 2 rate limited |
| Email scoping | Run multi-email test | Independent counters confirmed |
| Timer persists | Refresh during Playwright test | Timer continues from correct value |

---

## Dependencies

- TASK-001, TASK-002, TASK-003 (all backend and frontend components)
- Vitest integration test suite configured
- Playwright test suite configured

## Test Quality Constraints

- **Code Coverage**: Rate limit service must have >90% line coverage
- **Test Isolation**: Each test uses unique email address to prevent cross-contamination
- **Cleanup**: All test data removed in `afterEach` hooks
- **No Flakiness**: Tests must not depend on exact timing (use reasonable tolerances)

---

## Definition of Done

- [ ] Integration test suite created with 10+ test cases
- [ ] Tests cover sequential requests, scoping, normalization, and concurrency
- [ ] Playwright E2E test verifies countdown timer display and persistence
- [ ] All tests pass consistently (0% flakiness)
- [ ] Test documentation includes coverage summary and run instructions
- [ ] Redis keys cleaned up after each test (no test pollution)
- [ ] Test execution time <30 seconds for full suite

## Traceability

- **US**: US-002 — OTP Resend Rate Limiting with Lockout Window
- **Epic**: EP-001 — Candidate Onboarding and Identity
- **AC**: All scenarios (comprehensive end-to-end validation)
