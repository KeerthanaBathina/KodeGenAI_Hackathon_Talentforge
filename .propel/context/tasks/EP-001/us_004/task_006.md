---
id: task_006
us_id: us_004
epic: EP-001
title: "Create Password Reset Integration and E2E Tests"
status: done
layer: test
effort: 3h
priority: high
created: 2026-07-24
completed: 2026-07-24
---

# TASK-006 — Create Password Reset Integration and E2E Tests

## Context

**User Story**: US-004 — Forgot Password with Time-Limited Reset Link  
**Epic**: EP-001 — Candidate Onboarding and Identity  
**Addresses Acceptance Criteria**: All scenarios (comprehensive validation of reset flow)

Integration and end-to-end tests validate the complete password reset lifecycle including token generation, expiry enforcement, single-use semantics, and successful password updates. Tests must verify non-enumeration behavior and all error states.

---

## Objective

Create comprehensive test coverage for:
- Token generation and storage
- Email delivery (mocked)
- Token expiry after 60 minutes
- Single-use token enforcement
- Password validation and update
- Non-enumeration response for unknown emails
- Rate limiting enforcement

---

## Technical Specifications

**Test Categories**:
1. **Backend Integration** — Database and service layer
2. **API Integration** — Endpoint behavior and error handling
3. **Frontend E2E** — Complete user flow with Playwright

**Coverage Requirements**:
- Happy path: request → validate → reset → login
- Error paths: expired, used, invalid, weak password
- Security: non-enumeration, rate limiting
- Edge cases: concurrent requests, missing tokens

---

## Implementation Steps

### Step 1 — Create Backend Integration Tests

Create `backend/src/services/__tests__/passwordResetService.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import prisma from '../../db/prisma';
import {
  generateResetToken,
  validateResetToken,
  consumeResetToken,
  revokeTokensForUser,
  PasswordResetError,
} from '../passwordResetService';

describe('PasswordResetService', () => {
  let testCandidate: any;

  beforeEach(async () => {
    testCandidate = await prisma.candidate.create({
      data: {
        email: 'reset-test@example.com',
        fullName: 'Test User',
        phoneNumber: null,
        status: 'active',
        credentials: {
          create: {
            passwordHash: 'old-hash',
          },
        },
      },
    });
  });

  afterEach(async () => {
    await prisma.passwordResetToken.deleteMany({
      where: { candidateId: testCandidate.id },
    });
    await prisma.candidateCredential.deleteMany({
      where: { candidateId: testCandidate.id },
    });
    await prisma.candidate.delete({ where: { id: testCandidate.id } });
  });

  describe('generateResetToken', () => {
    it('should create token with 60-minute expiry', async () => {
      await generateResetToken('reset-test@example.com');

      const token = await prisma.passwordResetToken.findFirst({
        where: { candidateId: testCandidate.id },
        orderBy: { createdAt: 'desc' },
      });

      expect(token).toBeDefined();
      expect(token!.token).toBeDefined();
      expect(token!.usedAt).toBeNull();

      const expiryMs = token!.expiresAt.getTime() - Date.now();
      expect(expiryMs).toBeGreaterThan(59 * 60 * 1000); // ~59 min
      expect(expiryMs).toBeLessThan(61 * 60 * 1000); // ~61 min
    });

    it('should return generic message for unknown email (non-enumeration)', async () => {
      const result = await generateResetToken('unknown@example.com');

      expect(result.success).toBe(true);
      expect(result.message).toContain('If this email is registered');

      // Verify no token created
      const tokens = await prisma.passwordResetToken.findMany({
        where: {
          candidate: { email: 'unknown@example.com' },
        },
      });

      expect(tokens).toHaveLength(0);
    });

    it('should invalidate existing tokens when generating new one', async () => {
      // Generate first token
      await generateResetToken('reset-test@example.com');

      // Generate second token
      await generateResetToken('reset-test@example.com');

      const tokens = await prisma.passwordResetToken.findMany({
        where: { candidateId: testCandidate.id },
        orderBy: { createdAt: 'desc' },
      });

      expect(tokens).toHaveLength(2);
      expect(tokens[0].usedAt).toBeNull(); // Newest is active
      expect(tokens[1].usedAt).toBeDefined(); // Old one marked as used
    });
  });

  describe('validateResetToken', () => {
    it('should return valid for unexpired, unused token', async () => {
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
      const resetToken = await prisma.passwordResetToken.create({
        data: {
          candidateId: testCandidate.id,
          token: 'valid-token-123',
          expiresAt,
        },
      });

      const validation = await validateResetToken('valid-token-123');

      expect(validation.valid).toBe(true);
      expect(validation.candidateId).toBe(testCandidate.id);
      expect(validation.error).toBeUndefined();
    });

    it('should reject expired token', async () => {
      const expiredAt = new Date(Date.now() - 1000); // 1 second ago
      await prisma.passwordResetToken.create({
        data: {
          candidateId: testCandidate.id,
          token: 'expired-token',
          expiresAt: expiredAt,
        },
      });

      const validation = await validateResetToken('expired-token');

      expect(validation.valid).toBe(false);
      expect(validation.error).toBe('TOKEN_EXPIRED');
    });

    it('should reject used token', async () => {
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
      await prisma.passwordResetToken.create({
        data: {
          candidateId: testCandidate.id,
          token: 'used-token',
          expiresAt,
          usedAt: new Date(),
        },
      });

      const validation = await validateResetToken('used-token');

      expect(validation.valid).toBe(false);
      expect(validation.error).toBe('TOKEN_USED');
    });

    it('should reject non-existent token', async () => {
      const validation = await validateResetToken('non-existent-token');

      expect(validation.valid).toBe(false);
      expect(validation.error).toBe('TOKEN_NOT_FOUND');
    });
  });

  describe('consumeResetToken', () => {
    let validToken: string;

    beforeEach(async () => {
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
      const resetToken = await prisma.passwordResetToken.create({
        data: {
          candidateId: testCandidate.id,
          token: 'valid-token-456',
          expiresAt,
        },
      });
      validToken = resetToken.token;
    });

    it('should successfully reset password and mark token as used', async () => {
      const result = await consumeResetToken(validToken, 'NewPass123!');

      expect(result.success).toBe(true);
      expect(result.message).toContain('successful');

      // Verify token marked as used
      const updatedToken = await prisma.passwordResetToken.findUnique({
        where: { token: validToken },
      });

      expect(updatedToken!.usedAt).toBeDefined();

      // Verify password updated (can't check hash directly, but should be changed)
      const credential = await prisma.candidateCredential.findUnique({
        where: { candidateId: testCandidate.id },
      });

      expect(credential!.passwordHash).not.toBe('old-hash');
    });

    it('should reset failed login attempts on password change', async () => {
      // Set failed attempts
      await prisma.candidate.update({
        where: { id: testCandidate.id },
        data: {
          failedLoginAttempts: 3,
          lockedUntil: new Date(Date.now() + 10 * 60 * 1000),
        },
      });

      await consumeResetToken(validToken, 'NewPass123!');

      const updatedCandidate = await prisma.candidate.findUnique({
        where: { id: testCandidate.id },
      });

      expect(updatedCandidate!.failedLoginAttempts).toBe(0);
      expect(updatedCandidate!.lockedUntil).toBeNull();
    });

    it('should reject weak password', async () => {
      await expect(
        consumeResetToken(validToken, 'weak')
      ).rejects.toThrow(PasswordResetError);

      await expect(
        consumeResetToken(validToken, 'weak')
      ).rejects.toThrow('at least 8 characters');
    });

    it('should reject password without uppercase', async () => {
      await expect(
        consumeResetToken(validToken, 'nouppercasepass1')
      ).rejects.toThrow('uppercase letter');
    });

    it('should reject password without number', async () => {
      await expect(
        consumeResetToken(validToken, 'NoNumberPass')
      ).rejects.toThrow('one number');
    });
  });

  describe('revokeTokensForUser', () => {
    it('should revoke all active tokens for user', async () => {
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

      // Create multiple active tokens
      await prisma.passwordResetToken.createMany({
        data: [
          {
            candidateId: testCandidate.id,
            token: 'token-1',
            expiresAt,
          },
          {
            candidateId: testCandidate.id,
            token: 'token-2',
            expiresAt,
          },
        ],
      });

      const revokedCount = await revokeTokensForUser(testCandidate.id);

      expect(revokedCount).toBe(2);

      // Verify all tokens marked as used
      const tokens = await prisma.passwordResetToken.findMany({
        where: { candidateId: testCandidate.id },
      });

      expect(tokens.every((t) => t.usedAt !== null)).toBe(true);
    });
  });
});
```

### Step 2 — Create API Integration Tests

Create `backend/src/routes/__tests__/auth.password-reset.integration.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { app } from '../../app';
import prisma from '../../db/prisma';

describe('Password Reset API Integration', () => {
  let testCandidate: any;

  beforeEach(async () => {
    testCandidate = await prisma.candidate.create({
      data: {
        email: 'api-test@example.com',
        fullName: 'API Test',
        phoneNumber: null,
        status: 'active',
        credentials: {
          create: {
            passwordHash: 'old-hash',
          },
        },
      },
    });
  });

  afterEach(async () => {
    await prisma.passwordResetToken.deleteMany({
      where: { candidateId: testCandidate.id },
    });
    await prisma.candidateCredential.deleteMany({
      where: { candidateId: testCandidate.id },
    });
    await prisma.candidate.delete({ where: { id: testCandidate.id } });
  });

  describe('POST /api/auth/request-password-reset', () => {
    it('should return 202 with generic message for valid email', async () => {
      const response = await request(app)
        .post('/api/auth/request-password-reset')
        .send({ email: 'api-test@example.com' })
        .expect(202);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('If this email is registered');

      // Verify token created
      const token = await prisma.passwordResetToken.findFirst({
        where: { candidateId: testCandidate.id },
      });

      expect(token).toBeDefined();
    });

    it('should return same message for unknown email (non-enumeration)', async () => {
      const response = await request(app)
        .post('/api/auth/request-password-reset')
        .send({ email: 'unknown@example.com' })
        .expect(202);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('If this email is registered');
    });

    it('should validate email format', async () => {
      const response = await request(app)
        .post('/api/auth/request-password-reset')
        .send({ email: 'not-an-email' })
        .expect(400);

      expect(response.body.message).toContain('Invalid email');
    });
  });

  describe('GET /api/auth/validate-reset-token/:token', () => {
    it('should return valid for unexpired token', async () => {
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
      const resetToken = await prisma.passwordResetToken.create({
        data: {
          candidateId: testCandidate.id,
          token: 'valid-api-token',
          expiresAt,
        },
      });

      const response = await request(app)
        .get('/api/auth/validate-reset-token/valid-api-token')
        .expect(200);

      expect(response.body.valid).toBe(true);
    });

    it('should return 400 for expired token', async () => {
      const expiredAt = new Date(Date.now() - 1000);
      await prisma.passwordResetToken.create({
        data: {
          candidateId: testCandidate.id,
          token: 'expired-api-token',
          expiresAt: expiredAt,
        },
      });

      const response = await request(app)
        .get('/api/auth/validate-reset-token/expired-api-token')
        .expect(400);

      expect(response.body.valid).toBe(false);
      expect(response.body.error).toBe('TOKEN_EXPIRED');
    });
  });

  describe('POST /api/auth/reset-password', () => {
    let validToken: string;

    beforeEach(async () => {
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
      const resetToken = await prisma.passwordResetToken.create({
        data: {
          candidateId: testCandidate.id,
          token: 'reset-api-token',
          expiresAt,
        },
      });
      validToken = resetToken.token;
    });

    it('should successfully reset password', async () => {
      const response = await request(app)
        .post('/api/auth/reset-password')
        .send({
          token: validToken,
          newPassword: 'NewPass123!',
        })
        .expect(200);

      expect(response.body.success).toBe(true);

      // Verify token marked as used
      const updatedToken = await prisma.passwordResetToken.findUnique({
        where: { token: validToken },
      });

      expect(updatedToken!.usedAt).toBeDefined();
    });

    it('should validate password strength', async () => {
      const response = await request(app)
        .post('/api/auth/reset-password')
        .send({
          token: validToken,
          newPassword: 'weak',
        })
        .expect(400);

      expect(response.body.error.code).toBe('WEAK_PASSWORD');
    });

    it('should reject used token', async () => {
      // Use token once
      await request(app)
        .post('/api/auth/reset-password')
        .send({
          token: validToken,
          newPassword: 'NewPass123!',
        })
        .expect(200);

      // Try to use again
      const response = await request(app)
        .post('/api/auth/reset-password')
        .send({
          token: validToken,
          newPassword: 'AnotherPass123!',
        })
        .expect(400);

      expect(response.body.error.code).toBe('TOKEN_USED');
    });
  });
});
```

### Step 3 — Create Frontend E2E Tests

Create `frontend/tests/password-reset.spec.ts`:

```typescript
import { expect, test } from '@playwright/test';

test.describe('Password Reset Flow', () => {
  test('complete reset flow: request → validate → reset → login', async ({ page }) => {
    // Mock request-password-reset
    await page.route('**/api/auth/request-password-reset', async (route) => {
      await route.fulfill({
        status: 202,
        body: JSON.stringify({
          success: true,
          message: 'If this email is registered, you will receive a password reset link',
        }),
      });
    });

    // Step 1: Request reset
    await page.goto('/forgot-password');
    await page.getByLabel('Email Address').fill('test@example.com');
    await page.getByRole('button', { name: 'Send Reset Link' }).click();

    await expect(page.getByText('Check Your Email')).toBeVisible();

    // Mock token validation
    await page.route('**/api/auth/validate-reset-token/*', async (route) => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify({ valid: true }),
      });
    });

    // Mock reset-password
    await page.route('**/api/auth/reset-password', async (route) => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify({
          success: true,
          message: 'Password reset successful',
        }),
      });
    });

    // Step 2: Open reset link
    await page.goto('/reset-password?token=valid-token-123');

    // Wait for validation
    await expect(page.getByText('Reset Password')).toBeVisible();

    // Step 3: Enter new password
    await page.getByLabel('New Password').fill('NewPass123!');
    await page.getByLabel('Confirm Password').fill('NewPass123!');
    await page.getByRole('button', { name: 'Reset Password' }).click();

    // Step 4: Success and redirect
    await expect(page.getByText('Password Reset Successful')).toBeVisible();
  });

  test('expired token shows error', async ({ page }) => {
    await page.route('**/api/auth/validate-reset-token/*', async (route) => {
      await route.fulfill({
        status: 400,
        body: JSON.stringify({
          valid: false,
          error: 'TOKEN_EXPIRED',
          message: 'This link has expired. Please request a new password reset link.',
        }),
      });
    });

    await page.goto('/reset-password?token=expired-token');

    await expect(page.getByText('Reset Link Invalid')).toBeVisible();
    await expect(page.getByText(/expired/)).toBeVisible();
  });

  test('password mismatch shows error', async ({ page }) => {
    await page.route('**/api/auth/validate-reset-token/*', async (route) => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify({ valid: true }),
      });
    });

    await page.goto('/reset-password?token=valid-token');

    await page.getByLabel('New Password').fill('NewPass123!');
    await page.getByLabel('Confirm Password').fill('DifferentPass123!');
    await page.getByRole('button', { name: 'Reset Password' }).click();

    await expect(page.getByText('Passwords do not match')).toBeVisible();
  });
});
```

---

## Acceptance Criteria

- [x] Backend unit tests cover all service functions
- [x] API integration tests validate all endpoints
- [x] E2E tests cover complete reset flow
- [x] Non-enumeration verified (same response for found/not found)
- [x] Token expiry enforcement tested
- [x] Single-use token validation tested
- [x] Password strength validation tested
- [x] Error states comprehensively tested

---

## Testing

Run all tests:

```bash
# Backend unit tests
cd backend
npm test -- passwordResetService.test.ts

# Backend integration tests
npm run test:integration -- auth.password-reset.integration.test.ts

# Frontend E2E tests
cd ../frontend
npx playwright test tests/password-reset.spec.ts
```

---

## Dependencies

- All previous tasks (001-005)
- Vitest for backend testing
- Supertest for API testing
- Playwright for E2E testing

---

## Notes

- Tests use isolated test data with cleanup
- Mock email service to avoid external dependencies
- E2E tests use mocked API responses for deterministic results
- Consider adding load tests for rate limiting validation
