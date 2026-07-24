---
id: task_004
us_id: us_003
epic: EP-001
title: "Build Login API Endpoint with Email/Password Authentication"
status: done
layer: backend
effort: 2h
priority: critical
created: 2026-07-24
completed: 2026-07-24
---

# TASK-004 — Build Login API Endpoint with Email/Password Authentication

## Context

**User Story**: US-003 — Login with Role-Based Routing, Account Lockout, and SSO  
**Epic**: EP-001 — Candidate Onboarding and Identity  
**Addresses Acceptance Criteria**: Scenario 1 (successful login with routing), Scenario 4 (JWT in cookie)

The login endpoint integrates the login service (TASK-002) and JWT service (TASK-003) to provide a complete authentication flow that returns the appropriate dashboard URL based on user role.

---

## Objective

Create POST `/api/auth/login` endpoint that:
- Accepts email and password
- Calls authentication service
- Issues JWT in httpOnly cookie
- Returns user data and role-based redirect URL
- Handles all error scenarios (invalid credentials, lockout, server errors)

---

## Implementation Steps

### Step 1 — Create Login Route Handler

Add to `backend/src/routes/auth.ts`:

```typescript
import { authenticateUser, LoginError } from '../services/loginService';
import { JwtService } from '../services/jwtService';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

router.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      message: 'Invalid request payload',
      errors: parsed.error.flatten().fieldErrors,
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
      recruiter: '/recruiter/requisitions',
      admin: '/admin/dashboard',
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
```

### Step 2 — Add Logout Endpoint

```typescript
router.post('/logout', (req, res) => {
  res.clearCookie('auth_token', {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  });

  res.status(200).json({
    success: true,
    message: 'Logged out successfully',
  });
});
```

### Step 3 — Add Integration Tests

Create `backend/src/routes/__tests__/auth.login.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../app';
import { prisma } from '../../db/prisma';
import bcrypt from 'bcrypt';

describe('POST /api/auth/login', () => {
  let testUser: any;

  beforeEach(async () => {
    const passwordHash = await bcrypt.hash('ValidPass123!', 10);
    testUser = await prisma.candidate.create({
      data: {
        email: 'test-login@example.com',
        passwordHash,
        status: 'active',
        failedLoginAttempts: 0,
      },
    });
  });

  afterEach(async () => {
    await prisma.candidate.delete({ where: { id: testUser.id } });
  });

  it('should login with valid credentials and set auth cookie', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'test-login@example.com',
        password: 'ValidPass123!',
      })
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data.user.email).toBe('test-login@example.com');
    expect(response.body.data.redirectTo).toBeTruthy();
    expect(response.headers['set-cookie']).toBeDefined();
    expect(response.headers['set-cookie'][0]).toContain('auth_token');
    expect(response.headers['set-cookie'][0]).toContain('HttpOnly');
  });

  it('should return 401 for invalid password', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'test-login@example.com',
        password: 'WrongPassword',
      })
      .expect(401);

    expect(response.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('should return 423 for locked account', async () => {
    // Lock the account
    await prisma.candidate.update({
      where: { id: testUser.id },
      data: {
        failedLoginAttempts: 5,
        lockedUntil: new Date(Date.now() + 30 * 60 * 1000),
      },
    });

    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'test-login@example.com',
        password: 'ValidPass123!',
      })
      .expect(423);

    expect(response.body.error.code).toBe('ACCOUNT_LOCKED');
    expect(response.body.error.lockedUntil).toBeDefined();
  });

  it('should redirect candidate to /candidate/applications', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'test-login@example.com',
        password: 'ValidPass123!',
      })
      .expect(200);

    expect(response.body.data.redirectTo).toBe('/candidate/applications');
  });
});
```

---

## Definition of Done

- [ ] POST `/api/auth/login` endpoint created
- [ ] Accepts email and password, validates with Zod
- [ ] Calls `authenticateUser` service
- [ ] Issues JWT in httpOnly cookie on success
- [ ] Returns role-based redirect URL
- [ ] Returns HTTP 401 for invalid credentials
- [ ] Returns HTTP 423 for locked accounts
- [ ] POST `/api/auth/logout` endpoint clears auth cookie
- [ ] Integration tests cover success, invalid, and lockout scenarios

## Traceability

- **US**: US-003 — Login with Role-Based Routing, Account Lockout, and SSO
- **Epic**: EP-001 — Candidate Onboarding and Identity
- **AC**: Scenarios 1, 2, 4
