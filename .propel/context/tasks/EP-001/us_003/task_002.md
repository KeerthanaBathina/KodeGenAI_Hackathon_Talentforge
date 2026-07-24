---
id: task_002
us_id: us_003
epic: EP-001
title: "Implement Login Service with Account Lockout Logic"
status: done
layer: backend
effort: 4h
priority: critical
created: 2026-07-24
completed: 2026-07-24
---

# TASK-002 — Implement Login Service with Account Lockout Logic

## Context

**User Story**: US-003 — Login with Role-Based Routing, Account Lockout, and SSO  
**Epic**: EP-001 — Candidate Onboarding and Identity  
**Addresses Acceptance Criteria**: Scenario 1 (successful login), Scenario 2 (account lockout), Scenario 4 (JWT claims)

The login service must authenticate users via email/password, enforce account lockout after 5 consecutive failures, unlock accounts automatically after 30 minutes, and trigger lockout notification emails.

---

## Objective

Create a robust login service that:
- Validates email/password credentials using bcrypt
- Tracks failed login attempts and triggers lockout at threshold
- Returns HTTP 423 (Locked) when account is locked
- Resets failure counter on successful authentication
- Logs all authentication attempts to audit_events
- Sends email notification when account is locked

---

## Technical Specifications

| Component | Specification | Rationale |
|-----------|--------------|-----------|
| Lockout Threshold | 5 consecutive failures | NIST-recommended minimum |
| Lockout Duration | 30 minutes | Balance security vs. UX friction |
| HTTP Status Codes | 200 (success), 401 (invalid creds), 423 (locked) | Standard auth status semantics |
| Password Comparison | bcrypt constant-time compare | Timing-attack resistant |
| Audit Logging | Every login attempt logged | Forensic analysis, compliance |
| Email Notification | Sent within 60s of lockout | Security alert to account owner |

**Login Flow**:
```
1. Check if account exists
2. Check if locked (locked_until > now())
3. If locked → HTTP 423
4. Verify password with bcrypt
5. If invalid:
   - Increment failed_login_attempts
   - If attempts >= 5: set locked_until, send email, log 'account_locked'
   - Log 'login_failed'
   - Return HTTP 401
6. If valid:
   - Reset failed_login_attempts = 0
   - Clear locked_until
   - Update last_successful_login_at
   - Log 'login_success'
   - Return user data + JWT (see TASK-003)
```

---

## Implementation Steps

### Step 1 — Create Login Service

Create `backend/src/services/loginService.ts`:

```typescript
import { prisma } from '../db/prisma';
import bcrypt from 'bcrypt';
import { sendAccountLockoutEmail } from '../email/templates/accountLockout';
import { createAuditEvent } from './auditService';
import logger from '../utils/logger';

export interface LoginInput {
  email: string;
  password: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface LoginResult {
  success: boolean;
  user?: {
    id: string;
    email: string;
    role: string;
    candidateId?: string;
  };
  reason?: 'invalid_credentials' | 'account_locked' | 'account_not_found';
  lockedUntil?: Date;
}

export class LoginError extends Error {
  constructor(
    message: string,
    public code: 'INVALID_CREDENTIALS' | 'ACCOUNT_LOCKED' | 'ACCOUNT_NOT_FOUND',
    public lockedUntil?: Date
  ) {
    super(message);
    this.name = 'LoginError';
  }
}

const LOCKOUT_THRESHOLD = 5;
const LOCKOUT_DURATION_MS = 30 * 60 * 1000; // 30 minutes

export async function authenticateUser(input: LoginInput): Promise<LoginResult> {
  const { email, password, ipAddress, userAgent } = input;
  const normalizedEmail = email.toLowerCase().trim();

  // 1. Find user by email
  const user = await prisma.candidate.findUnique({
    where: { email: normalizedEmail },
    select: {
      id: true,
      email: true,
      passwordHash: true,
      status: true,
      candidatePublicId: true,
      failedLoginAttempts: true,
      lockedUntil: true,
      lastLoginAttemptAt: true,
    },
  });

  // Update last login attempt timestamp
  if (user) {
    await prisma.candidate.update({
      where: { id: user.id },
      data: { lastLoginAttemptAt: new Date() },
    });
  }

  // 2. Check if account exists
  if (!user) {
    await createAuditEvent({
      eventType: 'login_failed',
      userId: null,
      ipAddress,
      userAgent,
      metadata: { email: normalizedEmail, reason: 'account_not_found' },
    });

    logger.warn({ email: normalizedEmail }, 'Login attempt for non-existent account');
    
    // Return generic error to prevent user enumeration
    throw new LoginError('Invalid email or password', 'INVALID_CREDENTIALS');
  }

  // 3. Check if account is locked
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    await createAuditEvent({
      eventType: 'login_blocked',
      userId: user.id,
      ipAddress,
      userAgent,
      metadata: { 
        email: normalizedEmail, 
        reason: 'account_locked',
        lockedUntil: user.lockedUntil.toISOString(),
      },
    });

    logger.warn({ userId: user.id, lockedUntil: user.lockedUntil }, 'Login attempt on locked account');
    
    throw new LoginError(
      `Account temporarily locked. Try again after ${user.lockedUntil.toLocaleTimeString()}.`,
      'ACCOUNT_LOCKED',
      user.lockedUntil
    );
  }

  // 4. Verify password
  const isPasswordValid = await bcrypt.compare(password, user.passwordHash || '');

  if (!isPasswordValid) {
    // Increment failure counter
    const newFailureCount = user.failedLoginAttempts + 1;
    const shouldLock = newFailureCount >= LOCKOUT_THRESHOLD;
    const lockedUntil = shouldLock ? new Date(Date.now() + LOCKOUT_DURATION_MS) : null;

    await prisma.candidate.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: newFailureCount,
        lockedUntil,
      },
    });

    if (shouldLock) {
      // Send lockout notification email
      try {
        await sendAccountLockoutEmail({
          email: user.email,
          lockedUntil: lockedUntil!,
        });
      } catch (emailError) {
        logger.error({ error: emailError, userId: user.id }, 'Failed to send lockout email');
        // Don't fail the login attempt if email fails
      }

      await createAuditEvent({
        eventType: 'account_locked',
        userId: user.id,
        ipAddress,
        userAgent,
        metadata: {
          email: normalizedEmail,
          reason: 'failed_login_threshold',
          attempts: newFailureCount,
          lockedUntil: lockedUntil!.toISOString(),
        },
      });

      logger.warn({ userId: user.id, attempts: newFailureCount }, 'Account locked due to failed login attempts');

      throw new LoginError(
        `Account locked due to too many failed attempts. Try again after ${lockedUntil!.toLocaleTimeString()}.`,
        'ACCOUNT_LOCKED',
        lockedUntil!
      );
    }

    await createAuditEvent({
      eventType: 'login_failed',
      userId: user.id,
      ipAddress,
      userAgent,
      metadata: {
        email: normalizedEmail,
        reason: 'invalid_password',
        attemptCount: newFailureCount,
      },
    });

    logger.warn({ userId: user.id, attempts: newFailureCount }, 'Failed login attempt');

    throw new LoginError('Invalid email or password', 'INVALID_CREDENTIALS');
  }

  // 5. Successful authentication - reset lockout fields
  await prisma.candidate.update({
    where: { id: user.id },
    data: {
      failedLoginAttempts: 0,
      lockedUntil: null,
      lastSuccessfulLoginAt: new Date(),
    },
  });

  await createAuditEvent({
    eventType: 'login_success',
    userId: user.id,
    ipAddress,
    userAgent,
    metadata: { email: normalizedEmail },
  });

  logger.info({ userId: user.id }, 'Successful login');

  return {
    success: true,
    user: {
      id: user.id,
      email: user.email,
      role: 'candidate', // TODO: Get from User model if implementing multi-role
      candidateId: user.candidatePublicId || undefined,
    },
  };
}

/**
 * Unlock account if lockout period has expired.
 * Can be called periodically or on-demand for early unlock (e.g., by admin).
 */
export async function unlockAccountIfExpired(userId: string): Promise<boolean> {
  const user = await prisma.candidate.findUnique({
    where: { id: userId },
    select: { lockedUntil: true },
  });

  if (!user || !user.lockedUntil || user.lockedUntil <= new Date()) {
    return false; // Already unlocked or not locked
  }

  // Check if lockout has expired
  if (user.lockedUntil <= new Date()) {
    await prisma.candidate.update({
      where: { id: userId },
      data: {
        lockedUntil: null,
        failedLoginAttempts: 0,
      },
    });

    await createAuditEvent({
      eventType: 'account_unlocked',
      userId,
      metadata: { reason: 'auto_unlock_expired' },
    });

    logger.info({ userId }, 'Account auto-unlocked after lockout expiry');
    return true;
  }

  return false;
}
```

### Step 2 — Create Account Lockout Email Template

Create `backend/src/email/templates/accountLockout.ts`:

```typescript
import { sendEmail } from '../sendEmail';

interface AccountLockoutEmailParams {
  email: string;
  lockedUntil: Date;
}

export async function sendAccountLockoutEmail(params: AccountLockoutEmailParams) {
  const { email, lockedUntil } = params;
  
  const unlockTime = lockedUntil.toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  await sendEmail({
    to: email,
    subject: 'Security Alert: Account Temporarily Locked',
    html: `
      <h2>Account Locked</h2>
      <p>Your account has been temporarily locked due to multiple failed login attempts.</p>
      <p><strong>Unlock Time:</strong> ${unlockTime}</p>
      <p>If you did not attempt to log in, please secure your account immediately by resetting your password.</p>
      <p>If you need immediate access, please contact support.</p>
    `,
    text: `
      Account Locked
      
      Your account has been temporarily locked due to multiple failed login attempts.
      
      Unlock Time: ${unlockTime}
      
      If you did not attempt to log in, please secure your account immediately by resetting your password.
      
      If you need immediate access, please contact support.
    `,
  });
}
```

### Step 3 — Add Unit Tests

Create `backend/src/services/__tests__/loginService.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { authenticateUser, LoginError } from '../loginService';
import { prisma } from '../../db/prisma';
import bcrypt from 'bcrypt';

vi.mock('../../db/prisma');
vi.mock('../auditService');
vi.mock('../../email/templates/accountLockout');

describe('authenticateUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should authenticate valid credentials', async () => {
    const passwordHash = await bcrypt.hash('password123', 10);
    
    vi.mocked(prisma.candidate.findUnique).mockResolvedValue({
      id: 'user-1',
      email: 'test@example.com',
      passwordHash,
      failedLoginAttempts: 0,
      lockedUntil: null,
    } as any);

    vi.mocked(prisma.candidate.update).mockResolvedValue({} as any);

    const result = await authenticateUser({
      email: 'test@example.com',
      password: 'password123',
    });

    expect(result.success).toBe(true);
    expect(result.user?.email).toBe('test@example.com');
  });

  it('should reject invalid password and increment failure count', async () => {
    const passwordHash = await bcrypt.hash('correctpassword', 10);
    
    vi.mocked(prisma.candidate.findUnique).mockResolvedValue({
      id: 'user-1',
      email: 'test@example.com',
      passwordHash,
      failedLoginAttempts: 2,
      lockedUntil: null,
    } as any);

    vi.mocked(prisma.candidate.update).mockResolvedValue({} as any);

    await expect(
      authenticateUser({
        email: 'test@example.com',
        password: 'wrongpassword',
      })
    ).rejects.toThrow(LoginError);

    expect(prisma.candidate.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: expect.objectContaining({
        failedLoginAttempts: 3,
      }),
    });
  });

  it('should lock account on 5th failed attempt', async () => {
    const passwordHash = await bcrypt.hash('correctpassword', 10);
    
    vi.mocked(prisma.candidate.findUnique).mockResolvedValue({
      id: 'user-1',
      email: 'test@example.com',
      passwordHash,
      failedLoginAttempts: 4,
      lockedUntil: null,
    } as any);

    vi.mocked(prisma.candidate.update).mockResolvedValue({} as any);

    await expect(
      authenticateUser({
        email: 'test@example.com',
        password: 'wrongpassword',
      })
    ).rejects.toThrow('Account locked');

    expect(prisma.candidate.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: expect.objectContaining({
        failedLoginAttempts: 5,
        lockedUntil: expect.any(Date),
      }),
    });
  });

  it('should reject login attempt on locked account', async () => {
    const lockedUntil = new Date(Date.now() + 30 * 60 * 1000);
    
    vi.mocked(prisma.candidate.findUnique).mockResolvedValue({
      id: 'user-1',
      email: 'test@example.com',
      failedLoginAttempts: 5,
      lockedUntil,
    } as any);

    vi.mocked(prisma.candidate.update).mockResolvedValue({} as any);

    await expect(
      authenticateUser({
        email: 'test@example.com',
        password: 'anypassword',
      })
    ).rejects.toThrow('Account temporarily locked');
  });

  it('should reset failure count on successful login', async () => {
    const passwordHash = await bcrypt.hash('password123', 10);
    
    vi.mocked(prisma.candidate.findUnique).mockResolvedValue({
      id: 'user-1',
      email: 'test@example.com',
      passwordHash,
      failedLoginAttempts: 3,
      lockedUntil: null,
    } as any);

    vi.mocked(prisma.candidate.update).mockResolvedValue({} as any);

    await authenticateUser({
      email: 'test@example.com',
      password: 'password123',
    });

    expect(prisma.candidate.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: expect.objectContaining({
        failedLoginAttempts: 0,
        lockedUntil: null,
      }),
    });
  });
});
```

---

## Validation

| Check | Method | Expected Result |
|-------|--------|-----------------|
| Valid login succeeds | Call `authenticateUser` with correct credentials | Returns user data, resets failure counter |
| Invalid password tracked | Call with wrong password 3 times | Failure count increments to 3 |
| 5th failure locks account | Call with wrong password 5 times | Account locked for 30 minutes |
| Locked account rejected | Attempt login on locked account | HTTP 423, login blocked |
| Lockout email sent | Trigger lockout | Email delivered within 60s |
| Audit events logged | Check audit_events table | All attempts logged with correct event_type |

---

## Dependencies

- TASK-001 (lockout schema fields)
- Existing audit service or create new one
- Email service configured (Resend, SendGrid, etc.)

## Security Constraints

- **OWASP A07**: Constant-time password comparison prevents timing attacks
- **OWASP A04**: Lockout threshold prevents credential stuffing
- **OWASP A09**: All login attempts must be logged regardless of outcome

---

## Definition of Done

- [ ] `authenticateUser` service created with lockout enforcement
- [ ] Password verified using bcrypt with constant-time comparison
- [ ] Account locked after 5 consecutive failures for 30 minutes
- [ ] Lockout notification email sent within 60 seconds
- [ ] All login attempts logged to `audit_events` with metadata
- [ ] Unit tests cover success, failure, lockout, and locked account scenarios
- [ ] HTTP 423 returned for locked accounts

## Traceability

- **US**: US-003 — Login with Role-Based Routing, Account Lockout, and SSO
- **Epic**: EP-001 — Candidate Onboarding and Identity
- **AC**: Scenarios 1, 2, 4
