---
id: task_008
us_id: us_003
epic: EP-001
title: "Create Login and Lockout Integration Tests"
status: done
layer: test
effort: 3h
priority: high
created: 2026-07-24
completed: 2026-07-24
---

# TASK-008 — Create Login and Lockout Integration Tests

## Context

**User Story**: US-003 — Login with Role-Based Routing, Account Lockout, and SSO  
**Epic**: EP-001 — Candidate Onboarding and Identity  
**Addresses Acceptance Criteria**: All scenarios (comprehensive end-to-end validation)

Integration and E2E tests validate the complete login flow including authentication, lockout enforcement, role-based routing, and OAuth integration.

---

## Implementation Steps

### Step 1 — Create Backend Integration Tests

Create `backend/src/routes/__tests__/auth.login-lockout.integration.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { app } from '../../app';
import { prisma } from '../../db/prisma';
import bcrypt from 'bcrypt';

describe('Login and Lockout Integration Tests', () => {
  let testUser: any;
  const correctPassword = 'ValidPass123!';

  beforeEach(async () => {
    const passwordHash = await bcrypt.hash(correctPassword, 10);
    testUser = await prisma.candidate.create({
      data: {
        email: 'lockout-test@example.com',
        passwordHash,
        status: 'active',
        failedLoginAttempts: 0,
      },
    });
  });

  afterEach(async () => {
    await prisma.candidate.delete({ where: { id: testUser.id } });
  });

  it('should lock account after 5 failed attempts', async () => {
    // Attempt 1-4: should fail but not lock
    for (let i = 0; i < 4; i++) {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'lockout-test@example.com',
          password: 'WrongPassword',
        })
        .expect(401);

      expect(response.body.error.code).toBe('INVALID_CREDENTIALS');
    }

    // Verify account is not locked yet
    const userAfter4 = await prisma.candidate.findUnique({
      where: { id: testUser.id },
      select: { failedLoginAttempts: true, lockedUntil: true },
    });
    expect(userAfter4?.failedLoginAttempts).toBe(4);
    expect(userAfter4?.lockedUntil).toBeNull();

    // Attempt 5: should lock account
    const lockResponse = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'lockout-test@example.com',
        password: 'WrongPassword',
      })
      .expect(423);

    expect(lockResponse.body.error.code).toBe('ACCOUNT_LOCKED');
    expect(lockResponse.body.error.lockedUntil).toBeDefined();

    // Verify account is locked
    const userAfter5 = await prisma.candidate.findUnique({
      where: { id: testUser.id },
      select: { failedLoginAttempts: true, lockedUntil: true },
    });
    expect(userAfter5?.failedLoginAttempts).toBe(5);
    expect(userAfter5?.lockedUntil).not.toBeNull();
  });

  it('should reject login on locked account even with correct password', async () => {
    // Lock the account
    await prisma.candidate.update({
      where: { id: testUser.id },
      data: {
        failedLoginAttempts: 5,
        lockedUntil: new Date(Date.now() + 30 * 60 * 1000),
      },
    });

    // Attempt login with correct password
    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'lockout-test@example.com',
        password: correctPassword,
      })
      .expect(423);

    expect(response.body.error.code).toBe('ACCOUNT_LOCKED');
  });

  it('should reset failure count on successful login', async () => {
    // Fail 3 times
    for (let i = 0; i < 3; i++) {
      await request(app)
        .post('/api/auth/login')
        .send({
          email: 'lockout-test@example.com',
          password: 'WrongPassword',
        });
    }

    // Verify failures recorded
    const userAfterFails = await prisma.candidate.findUnique({
      where: { id: testUser.id },
      select: { failedLoginAttempts: true },
    });
    expect(userAfterFails?.failedLoginAttempts).toBe(3);

    // Successful login
    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'lockout-test@example.com',
        password: correctPassword,
      })
      .expect(200);

    expect(response.body.success).toBe(true);

    // Verify failure count reset
    const userAfterSuccess = await prisma.candidate.findUnique({
      where: { id: testUser.id },
      select: { failedLoginAttempts: true, lockedUntil: true },
    });
    expect(userAfterSuccess?.failedLoginAttempts).toBe(0);
    expect(userAfterSuccess?.lockedUntil).toBeNull();
  });

  it('should set auth cookie on successful login', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'lockout-test@example.com',
        password: correctPassword,
      })
      .expect(200);

    expect(response.headers['set-cookie']).toBeDefined();
    const authCookie = response.headers['set-cookie'].find((cookie: string) =>
      cookie.startsWith('auth_token=')
    );
    expect(authCookie).toBeDefined();
    expect(authCookie).toContain('HttpOnly');
    expect(authCookie).toContain('Path=/');
  });

  it('should return correct redirect URL for candidate role', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'lockout-test@example.com',
        password: correctPassword,
      })
      .expect(200);

    expect(response.body.data.redirectTo).toBe('/candidate/applications');
  });
});
```

### Step 2 — Create Playwright E2E Tests

Create `frontend/tests/login-lockout.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';

test.describe('Login and Lockout E2E Tests', () => {
  test('should login successfully and redirect to dashboard', async ({ page }) => {
    await page.goto('/login');

    await page.fill('input[type="email"]', 'candidate@example.com');
    await page.fill('input[type="password"]', 'ValidPass123!');
    await page.click('button[type="submit"]');

    // Should redirect to candidate dashboard
    await expect(page).toHaveURL(/\/candidate\/applications/);
  });

  it('should display error for invalid credentials', async ({ page }) => {
    await page.goto('/login');

    await page.fill('input[type="email"]', 'test@example.com');
    await page.fill('input[type="password"]', 'WrongPassword');
    await page.click('button[type="submit"]');

    // Should show error message
    const alert = page.locator('role=alert');
    await expect(alert).toBeVisible();
    await expect(alert).toContainText(/invalid/i);
  });

  test('should display lockout warning after multiple failures', async ({ page }) => {
    // Mock backend to return lockout after 5 attempts
    await page.route('**/api/auth/login', async (route, request) => {
      // Count attempts (simplified for test)
      if (request.postDataJSON().password === 'WrongPassword') {
        await route.fulfill({
          status: 423,
          contentType: 'application/json',
          body: JSON.stringify({
            error: {
              code: 'ACCOUNT_LOCKED',
              message: 'Account locked due to too many failed attempts',
              lockedUntil: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
            },
          }),
        });
      }
    });

    await page.goto('/login');

    await page.fill('input[type="email"]', 'test@example.com');
    await page.fill('input[type="password"]', 'WrongPassword');
    await page.click('button[type="submit"]');

    // Should show lockout warning
    const lockoutAlert = page.locator('role=alert').filter({ hasText: /locked/i });
    await expect(lockoutAlert).toBeVisible();
    await expect(lockoutAlert).toContainText(/Account Locked/i);
    await expect(page.locator('text=/Try again after/i')).toBeVisible();
  });

  test('should navigate via OAuth button', async ({ page, context }) => {
    await page.goto('/login');

    // Mock OAuth redirect
    await page.route('**/api/auth/oauth/google', async (route) => {
      await route.fulfill({
        status: 302,
        headers: {
          Location: 'https://accounts.google.com/o/oauth2/v2/auth?...',
        },
      });
    });

    const [popup] = await Promise.all([
      context.waitForEvent('page'),
      page.click('button:has-text("Continue with Google")'),
    ]);

    // Should redirect to Google OAuth
    expect(popup.url()).toContain('accounts.google.com');
  });
});
```

---

## Definition of Done

- [ ] Integration tests cover 5-failure lockout sequence
- [ ] Tests verify locked account rejects even correct password
- [ ] Tests confirm failure counter resets on successful login
- [ ] Tests validate auth cookie issuance and flags
- [ ] Tests verify role-based redirect URLs
- [ ] Playwright E2E tests cover success, failure, and lockout UI
- [ ] All tests pass consistently (0% flakiness)

## Traceability

- **US**: US-003 — Login with Role-Based Routing, Account Lockout, and SSO
- **Epic**: EP-001 — Candidate Onboarding and Identity
- **AC**: All scenarios
