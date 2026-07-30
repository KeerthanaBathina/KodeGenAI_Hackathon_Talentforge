---
id: task_002
us_id: us_004
epic: EP-001
title: "Implement Password Reset Token Service"
status: done
layer: backend
effort: 4h
priority: critical
created: 2026-07-24
completed: 2026-07-24
---

# TASK-002 — Implement Password Reset Token Service

## Context

**User Story**: US-004 — Forgot Password with Time-Limited Reset Link  
**Epic**: EP-001 — Candidate Onboarding and Identity  
**Addresses Acceptance Criteria**: All scenarios (token generation, expiry validation, single-use enforcement)

The password reset service handles the complete lifecycle of reset tokens: generation, validation, consumption, and expiry checking. It must enforce single-use semantics and prevent token reuse after successful password changes.

---

## Objective

Create a service that:
- Generates cryptographically secure reset tokens
- Stores tokens with 60-minute expiry
- Validates tokens (expiry + usage status)
- Marks tokens as used after successful password reset
- Provides error codes for different failure scenarios

---

## Technical Specifications

| Function | Input | Output | Side Effects |
|----------|-------|--------|--------------|
| `generateResetToken` | email, ipAddress, userAgent | token string | Creates DB record, sends email |
| `validateResetToken` | token | { valid, candidateId, error } | None (read-only) |
| `consumeResetToken` | token, newPassword | { success, error } | Updates `used_at`, hashes password |
| `revokeTokensForUser` | candidateId | count | Invalidates all user's active tokens |

**Error Codes**:
- `TOKEN_EXPIRED` — Token past 60-minute window
- `TOKEN_USED` — Token already consumed
- `TOKEN_NOT_FOUND` — Invalid or non-existent token
- `USER_NOT_FOUND` — Associated user deleted
- `WEAK_PASSWORD` — New password fails validation

---

## Implementation Steps

### Step 1 — Create Password Reset Service

Create `backend/src/services/passwordResetService.ts`:

```typescript
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import prisma from '../db/prisma';
import { sendPasswordResetEmail } from './emailService';
import { auditService } from './auditService';
import { validatePasswordStrength } from '../utils/passwordValidator';
import logger from '../utils/logger';

const RESET_TOKEN_EXPIRY_MS = 60 * 60 * 1000; // 60 minutes
const BCRYPT_SALT_ROUNDS = 10;

export class PasswordResetError extends Error {
  constructor(
    message: string,
    public code: 'TOKEN_EXPIRED' | 'TOKEN_USED' | 'TOKEN_NOT_FOUND' | 'USER_NOT_FOUND' | 'WEAK_PASSWORD'
  ) {
    super(message);
    this.name = 'PasswordResetError';
  }
}

/**
 * Generate a secure password reset token for a candidate.
 * Returns generic success message to prevent user enumeration.
 * 
 * @param email - Candidate email (case-insensitive)
 * @param ipAddress - Request IP for audit logging
 * @param userAgent - Request user agent for audit logging
 * @returns Generic success message (same for found/not found)
 */
export async function generateResetToken(
  email: string,
  ipAddress?: string,
  userAgent?: string
): Promise<{ success: boolean; message: string }> {
  const normalizedEmail = email.toLowerCase();

  try {
    // Find candidate by email
    const candidate = await prisma.candidate.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, email: true, fullName: true },
    });

    // Non-enumeration: return same message for found/not found
    const genericMessage = 'If this email is registered, you will receive a password reset link';

    if (!candidate) {
      logger.info({ email: normalizedEmail }, 'Password reset requested for unknown email');
      
      // Audit: reset requested for unknown email
      await auditService.logEvent({
        eventType: 'password_reset_requested_unknown',
        actorId: null,
        actorRole: null,
        resourceType: 'candidate',
        resourceId: null,
        metadata: { email: normalizedEmail },
        ipAddress,
        userAgent,
      });

      return { success: true, message: genericMessage };
    }

    // Generate secure token (32 bytes = 256 bits)
    const tokenBytes = crypto.randomBytes(32);
    const token = tokenBytes.toString('base64url'); // URL-safe base64

    // Calculate expiry timestamp
    const expiresAt = new Date(Date.now() + RESET_TOKEN_EXPIRY_MS);

    // Invalidate any existing active tokens for this user
    await prisma.passwordResetToken.updateMany({
      where: {
        candidateId: candidate.id,
        expiresAt: { gt: new Date() },
        usedAt: null,
      },
      data: {
        usedAt: new Date(), // Mark as used to prevent reuse
      },
    });

    // Create new reset token
    await prisma.passwordResetToken.create({
      data: {
        candidateId: candidate.id,
        token,
        expiresAt,
        ipAddress,
        userAgent,
      },
    });

    // Send reset email
    const resetLink = `${process.env.FRONTEND_URL}/reset-password?token=${token}`;
    await sendPasswordResetEmail({
      to: candidate.email,
      name: candidate.fullName || candidate.email.split('@')[0],
      resetLink,
      expiryMinutes: 60,
    });

    // Audit: reset token generated
    await auditService.logEvent({
      eventType: 'password_reset_requested',
      actorId: candidate.id,
      actorRole: 'candidate',
      resourceType: 'candidate',
      resourceId: candidate.id,
      metadata: { expiresAt: expiresAt.toISOString() },
      ipAddress,
      userAgent,
    });

    logger.info({ candidateId: candidate.id, expiresAt }, 'Password reset token generated');

    return { success: true, message: genericMessage };
  } catch (error) {
    logger.error({ error, email: normalizedEmail }, 'Failed to generate reset token');
    throw error;
  }
}

/**
 * Validate a password reset token without consuming it.
 * 
 * @param token - Reset token from URL parameter
 * @returns Validation result with candidate ID if valid
 */
export async function validateResetToken(
  token: string
): Promise<{ valid: boolean; candidateId?: string; error?: string }> {
  try {
    const resetToken = await prisma.passwordResetToken.findUnique({
      where: { token },
      include: {
        candidate: {
          select: { id: true, email: true },
        },
      },
    });

    if (!resetToken) {
      return { valid: false, error: 'TOKEN_NOT_FOUND' };
    }

    if (resetToken.usedAt) {
      return { valid: false, error: 'TOKEN_USED' };
    }

    if (resetToken.expiresAt < new Date()) {
      return { valid: false, error: 'TOKEN_EXPIRED' };
    }

    return { valid: true, candidateId: resetToken.candidateId };
  } catch (error) {
    logger.error({ error, token: token.substring(0, 10) + '...' }, 'Token validation failed');
    throw error;
  }
}

/**
 * Consume a reset token and update the candidate's password.
 * Token is marked as used after successful password update.
 * 
 * @param token - Reset token from URL
 * @param newPassword - New password (must meet strength requirements)
 * @param ipAddress - Request IP for audit
 * @param userAgent - Request user agent for audit
 * @returns Success result or error
 */
export async function consumeResetToken(
  token: string,
  newPassword: string,
  ipAddress?: string,
  userAgent?: string
): Promise<{ success: boolean; message: string }> {
  // Validate password strength
  const passwordValidation = validatePasswordStrength(newPassword);
  if (!passwordValidation.valid) {
    throw new PasswordResetError(passwordValidation.error!, 'WEAK_PASSWORD');
  }

  // Validate token
  const validation = await validateResetToken(token);
  if (!validation.valid) {
    throw new PasswordResetError(
      validation.error === 'TOKEN_EXPIRED'
        ? 'This link has expired. Please request a new password reset link.'
        : validation.error === 'TOKEN_USED'
        ? 'This link has already been used. Please request a new password reset link if needed.'
        : 'Invalid or expired reset link.',
      validation.error as any
    );
  }

  try {
    // Hash new password
    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_SALT_ROUNDS);

    // Update password and mark token as used in a transaction
    await prisma.$transaction(async (tx) => {
      // Update candidate password
      await tx.candidateCredential.update({
        where: { candidateId: validation.candidateId },
        data: { passwordHash },
      });

      // Mark token as used
      await tx.passwordResetToken.update({
        where: { token },
        data: { usedAt: new Date() },
      });

      // Reset any failed login attempts
      await tx.candidate.update({
        where: { id: validation.candidateId },
        data: {
          failedLoginAttempts: 0,
          lockedUntil: null,
        },
      });
    });

    // Audit: password reset completed
    await auditService.logEvent({
      eventType: 'password_reset_completed',
      actorId: validation.candidateId,
      actorRole: 'candidate',
      resourceType: 'candidate',
      resourceId: validation.candidateId,
      metadata: {},
      ipAddress,
      userAgent,
    });

    logger.info({ candidateId: validation.candidateId }, 'Password reset completed');

    return {
      success: true,
      message: 'Password reset successful. You can now log in with your new password.',
    };
  } catch (error) {
    logger.error({ error, candidateId: validation.candidateId }, 'Password reset failed');
    throw error;
  }
}

/**
 * Revoke all active reset tokens for a candidate.
 * Used when user changes password via account settings.
 * 
 * @param candidateId - Candidate UUID
 * @returns Count of revoked tokens
 */
export async function revokeTokensForUser(candidateId: string): Promise<number> {
  const result = await prisma.passwordResetToken.updateMany({
    where: {
      candidateId,
      expiresAt: { gt: new Date() },
      usedAt: null,
    },
    data: {
      usedAt: new Date(),
    },
  });

  logger.info({ candidateId, count: result.count }, 'Revoked active reset tokens');
  return result.count;
}
```

### Step 2 — Create Password Validator Utility

Create `backend/src/utils/passwordValidator.ts`:

```typescript
export interface PasswordValidation {
  valid: boolean;
  error?: string;
}

/**
 * Validate password strength requirements.
 * Same validation as registration.
 * 
 * Requirements:
 * - At least 8 characters
 * - At least one uppercase letter
 * - At least one lowercase letter
 * - At least one digit
 * 
 * @param password - Password to validate
 * @returns Validation result
 */
export function validatePasswordStrength(password: string): PasswordValidation {
  if (password.length < 8) {
    return {
      valid: false,
      error: 'Password must be at least 8 characters long',
    };
  }

  if (!/[A-Z]/.test(password)) {
    return {
      valid: false,
      error: 'Password must contain at least one uppercase letter',
    };
  }

  if (!/[a-z]/.test(password)) {
    return {
      valid: false,
      error: 'Password must contain at least one lowercase letter',
    };
  }

  if (!/\d/.test(password)) {
    return {
      valid: false,
      error: 'Password must contain at least one number',
    };
  }

  return { valid: true };
}
```

### Step 3 — Update Email Service

Add to `backend/src/services/emailService.ts`:

```typescript
export interface SendPasswordResetEmailInput {
  to: string;
  name: string;
  resetLink: string;
  expiryMinutes: number;
}

export async function sendPasswordResetEmail(input: SendPasswordResetEmailInput): Promise<void> {
  const { to, name, resetLink, expiryMinutes } = input;

  if (env.EMAIL_PROVIDER === 'mock') {
    logger.info(
      { to, resetLink, expiryMinutes },
      `[MOCK EMAIL] Password reset link for ${name}`
    );
    console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📧 PASSWORD RESET EMAIL (Mock)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
To: ${to}
Subject: Reset Your Password

Hi ${name},

We received a request to reset your password. Click the link below to create a new password:

${resetLink}

This link will expire in ${expiryMinutes} minutes.

If you didn't request this, you can safely ignore this email.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    `);
    return;
  }

  // Real SMTP implementation here
  throw new Error('SMTP email provider not yet implemented');
}
```

---

## Acceptance Criteria

- [x] `generateResetToken()` creates 256-bit secure token
- [x] Non-enumeration: same response for found/unknown emails
- [x] Token expires after 60 minutes
- [x] `validateResetToken()` checks expiry and usage status
- [x] `consumeResetToken()` marks token as used
- [x] Password updated with bcrypt hashing
- [x] Failed login attempts reset on password change
- [x] All operations logged to audit_events

---

## Testing

```typescript
describe('PasswordResetService', () => {
  it('should generate token with 60-minute expiry', async () => {
    const result = await generateResetToken('test@example.com');
    expect(result.success).toBe(true);
    
    const token = await prisma.passwordResetToken.findFirst({
      where: { candidate: { email: 'test@example.com' } },
      orderBy: { createdAt: 'desc' },
    });
    
    expect(token).toBeDefined();
    expect(token!.expiresAt.getTime() - Date.now()).toBeCloseTo(3600000, -5);
  });

  it('should reject expired token', async () => {
    const expiredToken = await prisma.passwordResetToken.create({
      data: {
        candidateId: 'user-123',
        token: 'expired-token',
        expiresAt: new Date(Date.now() - 1000),
      },
    });

    const validation = await validateResetToken('expired-token');
    expect(validation.valid).toBe(false);
    expect(validation.error).toBe('TOKEN_EXPIRED');
  });

  it('should mark token as used after consumption', async () => {
    const { token } = await setupResetToken();
    await consumeResetToken(token, 'NewPass123!');

    const updatedToken = await prisma.passwordResetToken.findUnique({
      where: { token },
    });

    expect(updatedToken!.usedAt).toBeDefined();
  });
});
```

---

## Dependencies

- TASK-001 (password_reset_tokens table)
- bcrypt for password hashing
- crypto module for secure token generation
- emailService for sending reset links

---

## Notes

- Token format: base64url (URL-safe, no padding)
- Consider adding rate limiting to prevent abuse (3 requests per hour per email)
- Cleanup expired tokens via daily cron job
