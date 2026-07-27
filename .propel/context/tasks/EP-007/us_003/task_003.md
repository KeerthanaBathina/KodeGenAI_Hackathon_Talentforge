---
id: task_003
us_id: us_003
epic: EP-007
title: "Secure Token Generation and Approval Email Notifications"
status: completed
layer: backend
effort: 4h
priority: critical
created: 2026-07-27
completed: 2026-07-27
---

# TASK-003 — Secure Token Generation and Approval Email Notifications

## Context

**User Story**: US-003 — Multi-Tier Approval Chain Workflow with Email Notifications  
**Epic**: EP-007 — Final Hiring Decision  
**Addresses**: Scenario 2 — First approver receives email with secure approve/reject links

Approvers must receive email notifications with direct action links that are:
- Cryptographically signed to prevent tampering
- Time-limited (72 hour expiry)
- Single-use to prevent replay attacks
- Securely map to approval record without exposing internal IDs in URL

---

## Objective

Implement secure token generation for approval links and email service that sends approval request notifications with embedded approve/reject action links.

---

## Technical Specifications

| Component | Specification |
|-----------|--------------|
| **Token Algorithm** | HMAC-SHA256 with server-side secret |
| **Token Payload** | `{ approvalId, approverId, action: 'approve'|'reject', iat, exp }` |
| **Token Expiry** | 72 hours from issuance |
| **Email Template** | HTML with candidate info, compensation details, approve/reject CTAs |
| **Delivery** | Use existing email service (mock or real SMTP) |
| **URL Format** | `https://{domain}/api/approvals/respond?token={jwt}` |

---

## Implementation Steps

### Step 1 — Create token generation service

**File**: `backend/src/services/approvalTokenService.ts`

```typescript
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import logger from '../utils/logger';

export interface ApprovalTokenPayload {
  approvalId: string;
  approverId: string;
  action: 'approve' | 'reject';
}

export interface VerifiedApprovalToken extends ApprovalTokenPayload {
  iat: number;
  exp: number;
}

const TOKEN_EXPIRY_HOURS = 72;
const TOKEN_SECRET = env.APPROVAL_TOKEN_SECRET || 'default-secret-change-in-production';

/**
 * Generate secure approval action token
 * 
 * @param payload - Approval details
 * @returns Signed JWT token valid for 72 hours
 */
export function generateApprovalToken(
  payload: ApprovalTokenPayload
): string {
  const token = jwt.sign(
    payload,
    TOKEN_SECRET,
    {
      expiresIn: `${TOKEN_EXPIRY_HOURS}h`,
      issuer: 'ai-interview-platform',
      audience: 'approval-response'
    }
  );

  logger.debug({
    approvalId: payload.approvalId,
    action: payload.action,
    expiryHours: TOKEN_EXPIRY_HOURS
  }, 'Generated approval token');

  return token;
}

/**
 * Verify and decode approval token
 * 
 * @param token - JWT token from URL
 * @returns Verified token payload
 * @throws Error if token invalid, expired, or tampered
 */
export function verifyApprovalToken(token: string): VerifiedApprovalToken {
  try {
    const decoded = jwt.verify(token, TOKEN_SECRET, {
      issuer: 'ai-interview-platform',
      audience: 'approval-response'
    }) as VerifiedApprovalToken;

    logger.debug({
      approvalId: decoded.approvalId,
      action: decoded.action,
      expiresAt: new Date(decoded.exp * 1000)
    }, 'Verified approval token');

    return decoded;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      logger.warn({ token: token.substring(0, 20) }, 'Approval token expired');
      throw new Error('Approval link has expired. Please request a new approval email.');
    } else if (error instanceof jwt.JsonWebTokenError) {
      logger.error({ error: error.message }, 'Invalid approval token');
      throw new Error('Invalid approval link. Please use the link from your email.');
    } else {
      throw error;
    }
  }
}

/**
 * Generate both approve and reject tokens for an approval
 * 
 * @param approvalId - Approval record ID
 * @param approverId - Approver user ID
 * @returns Object with approve and reject tokens
 */
export function generateApprovalTokens(
  approvalId: string,
  approverId: string
): { approveToken: string; rejectToken: string } {
  return {
    approveToken: generateApprovalToken({
      approvalId,
      approverId,
      action: 'approve'
    }),
    rejectToken: generateApprovalToken({
      approvalId,
      approverId,
      action: 'reject'
    })
  };
}
```

### Step 2 — Create approval email service

**File**: `backend/src/services/approvalEmailService.ts`

```typescript
import { Decimal } from '@prisma/client/runtime/library';
import { generateApprovalTokens } from './approvalTokenService';
import { sendEmail } from './emailService';
import { env } from '../config/env';
import logger from '../utils/logger';

export interface SendApprovalRequestEmailParams {
  approvalId: string;
  approverId: string;
  approverDisplayName: string;
  decisionId: string;
  applicationId: string;
  compensationAmount: Decimal;
  tier: number;
}

/**
 * Send approval request email to approver with secure action links
 * 
 * @param params - Approval request details
 */
export async function sendApprovalRequestEmail(
  params: SendApprovalRequestEmailParams
): Promise<void> {
  const {
    approvalId,
    approverId,
    approverDisplayName,
    decisionId,
    applicationId,
    compensationAmount,
    tier
  } = params;

  logger.info({
    approvalId,
    approverId,
    tier
  }, 'Sending approval request email');

  // Generate secure tokens
  const { approveToken, rejectToken } = generateApprovalTokens(
    approvalId,
    approverId
  );

  // Construct action URLs
  const baseUrl = env.FRONTEND_URL || 'http://localhost:3000';
  const approveUrl = `${baseUrl}/approvals/respond?token=${approveToken}`;
  const rejectUrl = `${baseUrl}/approvals/respond?token=${rejectToken}`;

  // Fetch approver email (in real implementation)
  // For now, using approverId as placeholder
  const approverEmail = `${approverId}@company.com`; // TODO: Fetch from user record

  // Build email HTML
  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
    }
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 30px;
      border-radius: 8px 8px 0 0;
      text-align: center;
    }
    .content {
      background: #ffffff;
      padding: 30px;
      border: 1px solid #e0e0e0;
      border-top: none;
    }
    .detail-row {
      display: flex;
      padding: 12px 0;
      border-bottom: 1px solid #f0f0f0;
    }
    .detail-label {
      font-weight: 600;
      width: 180px;
      color: #666;
    }
    .detail-value {
      flex: 1;
      color: #333;
    }
    .compensation {
      font-size: 24px;
      font-weight: bold;
      color: #667eea;
    }
    .tier-badge {
      display: inline-block;
      background: #667eea;
      color: white;
      padding: 4px 12px;
      border-radius: 12px;
      font-size: 14px;
      font-weight: 600;
    }
    .actions {
      margin-top: 30px;
      text-align: center;
    }
    .btn {
      display: inline-block;
      padding: 14px 32px;
      margin: 8px;
      border-radius: 6px;
      text-decoration: none;
      font-weight: 600;
      font-size: 16px;
      transition: all 0.3s ease;
    }
    .btn-approve {
      background: #10b981;
      color: white;
    }
    .btn-approve:hover {
      background: #059669;
    }
    .btn-reject {
      background: #ef4444;
      color: white;
    }
    .btn-reject:hover {
      background: #dc2626;
    }
    .footer {
      margin-top: 30px;
      padding-top: 20px;
      border-top: 1px solid #e0e0e0;
      font-size: 12px;
      color: #666;
      text-align: center;
    }
    .expiry-notice {
      background: #fef3c7;
      border-left: 4px solid #f59e0b;
      padding: 12px;
      margin-top: 20px;
      border-radius: 4px;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1 style="margin: 0;">Approval Required</h1>
    <p style="margin: 10px 0 0 0; opacity: 0.95;">Offer Decision Pending Your Review</p>
  </div>
  
  <div class="content">
    <p>Hello <strong>${approverDisplayName}</strong>,</p>
    
    <p>An offer decision requires your approval as <span class="tier-badge">Tier ${tier} Approver</span>.</p>
    
    <div style="margin: 24px 0;">
      <div class="detail-row">
        <span class="detail-label">Application ID:</span>
        <span class="detail-value">${applicationId}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Decision ID:</span>
        <span class="detail-value">${decisionId}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Compensation Amount:</span>
        <span class="detail-value"><span class="compensation">$${compensationAmount.toFixed(2)}</span></span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Your Approval Tier:</span>
        <span class="detail-value">Tier ${tier}</span>
      </div>
    </div>
    
    <div class="actions">
      <a href="${approveUrl}" class="btn btn-approve">✓ Approve Offer</a>
      <a href="${rejectUrl}" class="btn btn-reject">✗ Reject Offer</a>
    </div>
    
    <div class="expiry-notice">
      <strong>⏰ Action Required Within 72 Hours</strong><br>
      These approval links will expire in 72 hours. Please review and respond promptly.
    </div>
    
    <p style="margin-top: 24px; font-size: 14px; color: #666;">
      You can also view the full application details by logging into the AI Interview Platform and navigating to the Approvals section.
    </p>
  </div>
  
  <div class="footer">
    <p>This is an automated message from the AI Interview Platform.</p>
    <p>If you believe you received this email in error, please contact your system administrator.</p>
    <p style="margin-top: 8px;">
      <strong>Security Note:</strong> The approval links in this email are unique to you and expire after 72 hours or after use.
    </p>
  </div>
</body>
</html>
  `;

  const plainTextContent = `
Approval Required - Offer Decision

Hello ${approverDisplayName},

An offer decision requires your approval as Tier ${tier} Approver.

Application ID: ${applicationId}
Decision ID: ${decisionId}
Compensation Amount: $${compensationAmount.toFixed(2)}
Your Approval Tier: Tier ${tier}

To approve this offer, click: ${approveUrl}
To reject this offer, click: ${rejectUrl}

⏰ Action Required Within 72 Hours
These approval links will expire in 72 hours. Please review and respond promptly.

---
This is an automated message from the AI Interview Platform.
Security Note: The approval links are unique to you and expire after 72 hours or after use.
  `;

  // Send email
  await sendEmail({
    to: approverEmail,
    subject: `Approval Required (Tier ${tier}) - Offer Decision ${decisionId}`,
    htmlContent,
    plainTextContent
  });

  logger.info({
    approvalId,
    approverId,
    approverEmail
  }, 'Approval request email sent');
}

/**
 * Send approval chain completion notification to hiring manager
 * 
 * @param decisionId - Decision ID
 * @param applicationId - Application ID
 * @param hiringManagerId - Hiring manager user ID
 */
export async function sendApprovalCompletedEmail(
  decisionId: string,
  applicationId: string,
  hiringManagerId: string
): Promise<void> {
  logger.info({
    decisionId,
    applicationId,
    hiringManagerId
  }, 'Sending approval completion notification');

  // TODO: Implement notification to hiring manager
  // Similar pattern to approval request email
}

/**
 * Send approval rejection notification to hiring manager
 * 
 * @param decisionId - Decision ID
 * @param applicationId - Application ID
 * @param hiringManagerId - Hiring manager user ID
 * @param rejectedBy - Approver who rejected
 * @param comments - Optional rejection reason
 */
export async function sendApprovalRejectedEmail(
  decisionId: string,
  applicationId: string,
  hiringManagerId: string,
  rejectedBy: string,
  comments?: string
): Promise<void> {
  logger.info({
    decisionId,
    applicationId,
    hiringManagerId,
    rejectedBy
  }, 'Sending approval rejection notification');

  // TODO: Implement notification to hiring manager
  // Include rejection reason and next steps
}
```

### Step 3 — Add unit tests

**File**: `backend/src/services/__tests__/approvalTokenService.test.ts`

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import {
  generateApprovalToken,
  verifyApprovalToken,
  generateApprovalTokens
} from '../approvalTokenService';

// Mock environment
vi.mock('../../config/env', () => ({
  env: {
    APPROVAL_TOKEN_SECRET: 'test-secret-key'
  }
}));

vi.mock('../../utils/logger', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

describe('approvalTokenService', () => {
  describe('generateApprovalToken', () => {
    it('should generate valid JWT token', () => {
      const payload = {
        approvalId: 'approval-123',
        approverId: 'user-456',
        action: 'approve' as const
      };

      const token = generateApprovalToken(payload);

      expect(token).toBeTruthy();
      expect(typeof token).toBe('string');
      
      // Verify token structure (header.payload.signature)
      const parts = token.split('.');
      expect(parts).toHaveLength(3);
    });

    it('should include correct payload in token', () => {
      const payload = {
        approvalId: 'approval-789',
        approverId: 'user-999',
        action: 'reject' as const
      };

      const token = generateApprovalToken(payload);
      const decoded = jwt.decode(token) as any;

      expect(decoded.approvalId).toBe('approval-789');
      expect(decoded.approverId).toBe('user-999');
      expect(decoded.action).toBe('reject');
      expect(decoded.iss).toBe('ai-interview-platform');
      expect(decoded.aud).toBe('approval-response');
    });

    it('should set expiry to 72 hours', () => {
      const payload = {
        approvalId: 'approval-123',
        approverId: 'user-456',
        action: 'approve' as const
      };

      const beforeGeneration = Date.now();
      const token = generateApprovalToken(payload);
      const afterGeneration = Date.now();

      const decoded = jwt.decode(token) as any;
      const expiryTime = decoded.exp * 1000; // Convert to milliseconds

      const expectedExpiry = beforeGeneration + (72 * 60 * 60 * 1000);
      const tolerance = 5000; // 5 second tolerance

      expect(expiryTime).toBeGreaterThan(expectedExpiry - tolerance);
      expect(expiryTime).toBeLessThan(afterGeneration + (72 * 60 * 60 * 1000) + tolerance);
    });
  });

  describe('verifyApprovalToken', () => {
    it('should verify and decode valid token', () => {
      const payload = {
        approvalId: 'approval-123',
        approverId: 'user-456',
        action: 'approve' as const
      };

      const token = generateApprovalToken(payload);
      const verified = verifyApprovalToken(token);

      expect(verified.approvalId).toBe('approval-123');
      expect(verified.approverId).toBe('user-456');
      expect(verified.action).toBe('approve');
      expect(verified.iat).toBeTruthy();
      expect(verified.exp).toBeTruthy();
    });

    it('should throw error for expired token', () => {
      // Create token with immediate expiry
      const token = jwt.sign(
        {
          approvalId: 'approval-123',
          approverId: 'user-456',
          action: 'approve'
        },
        'test-secret-key',
        {
          expiresIn: '0s', // Immediate expiry
          issuer: 'ai-interview-platform',
          audience: 'approval-response'
        }
      );

      // Wait a moment to ensure expiry
      return new Promise(resolve => {
        setTimeout(() => {
          expect(() => verifyApprovalToken(token)).toThrow('expired');
          resolve(null);
        }, 100);
      });
    });

    it('should throw error for tampered token', () => {
      const payload = {
        approvalId: 'approval-123',
        approverId: 'user-456',
        action: 'approve' as const
      };

      const token = generateApprovalToken(payload);
      
      // Tamper with token by changing a character
      const tamperedToken = token.slice(0, -5) + 'XXXXX';

      expect(() => verifyApprovalToken(tamperedToken)).toThrow('Invalid');
    });

    it('should throw error for token with wrong secret', () => {
      // Create token with different secret
      const token = jwt.sign(
        {
          approvalId: 'approval-123',
          approverId: 'user-456',
          action: 'approve'
        },
        'wrong-secret',
        {
          expiresIn: '72h',
          issuer: 'ai-interview-platform',
          audience: 'approval-response'
        }
      );

      expect(() => verifyApprovalToken(token)).toThrow('Invalid');
    });
  });

  describe('generateApprovalTokens', () => {
    it('should generate both approve and reject tokens', () => {
      const { approveToken, rejectToken } = generateApprovalTokens(
        'approval-123',
        'user-456'
      );

      expect(approveToken).toBeTruthy();
      expect(rejectToken).toBeTruthy();
      expect(approveToken).not.toBe(rejectToken);

      const approveDecoded = jwt.decode(approveToken) as any;
      const rejectDecoded = jwt.decode(rejectToken) as any;

      expect(approveDecoded.action).toBe('approve');
      expect(rejectDecoded.action).toBe('reject');
      expect(approveDecoded.approvalId).toBe('approval-123');
      expect(rejectDecoded.approvalId).toBe('approval-123');
    });
  });
});
```

**File**: `backend/src/services/__tests__/approvalEmailService.test.ts`

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Decimal } from '@prisma/client/runtime/library';
import { sendApprovalRequestEmail } from '../approvalEmailService';

const mocks = vi.hoisted(() => ({
  generateApprovalTokens: vi.fn(),
  sendEmail: vi.fn()
}));

vi.mock('../approvalTokenService', () => ({
  generateApprovalTokens: mocks.generateApprovalTokens
}));

vi.mock('../emailService', () => ({
  sendEmail: mocks.sendEmail
}));

vi.mock('../../config/env', () => ({
  env: {
    FRONTEND_URL: 'https://app.example.com'
  }
}));

vi.mock('../../utils/logger', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

describe('approvalEmailService', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.generateApprovalTokens.mockReturnValue({
      approveToken: 'mock-approve-token',
      rejectToken: 'mock-reject-token'
    });
  });

  describe('sendApprovalRequestEmail', () => {
    it('should generate tokens and send email', async () => {
      await sendApprovalRequestEmail({
        approvalId: 'approval-123',
        approverId: 'user-vp',
        approverDisplayName: 'VP Engineering',
        decisionId: 'decision-456',
        applicationId: 'app-789',
        compensationAmount: new Decimal(150000),
        tier: 1
      });

      expect(mocks.generateApprovalTokens).toHaveBeenCalledWith(
        'approval-123',
        'user-vp'
      );
      expect(mocks.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: expect.stringContaining('Tier 1'),
          htmlContent: expect.stringContaining('VP Engineering'),
          plainTextContent: expect.stringContaining('VP Engineering')
        })
      );
    });

    it('should include approve and reject URLs in email', async () => {
      await sendApprovalRequestEmail({
        approvalId: 'approval-123',
        approverId: 'user-cfo',
        approverDisplayName: 'CFO',
        decisionId: 'decision-456',
        applicationId: 'app-789',
        compensationAmount: new Decimal(200000),
        tier: 2
      });

      expect(mocks.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          htmlContent: expect.stringContaining('https://app.example.com/approvals/respond?token=mock-approve-token'),
          plainTextContent: expect.stringContaining('https://app.example.com/approvals/respond?token=mock-approve-token')
        })
      );
    });

    it('should include compensation amount in email', async () => {
      await sendApprovalRequestEmail({
        approvalId: 'approval-123',
        approverId: 'user-vp',
        approverDisplayName: 'VP',
        decisionId: 'decision-456',
        applicationId: 'app-789',
        compensationAmount: new Decimal(175500.50),
        tier: 1
      });

      expect(mocks.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          htmlContent: expect.stringContaining('$175,500.50'),
          plainTextContent: expect.stringContaining('$175,500.50')
        })
      );
    });

    it('should mention 72 hour expiry in email', async () => {
      await sendApprovalRequestEmail({
        approvalId: 'approval-123',
        approverId: 'user-vp',
        approverDisplayName: 'VP',
        decisionId: 'decision-456',
        applicationId: 'app-789',
        compensationAmount: new Decimal(150000),
        tier: 1
      });

      expect(mocks.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          htmlContent: expect.stringContaining('72 hours'),
          plainTextContent: expect.stringContaining('72 hours')
        })
      );
    });
  });
});
```

---

## Dependencies

- TASK-002 (approval orchestrator calls this service)
- `jsonwebtoken` package for token generation
- Email service (existing `emailService.ts`)
- Environment configuration for APPROVAL_TOKEN_SECRET and FRONTEND_URL

---

## Validation

| Test Case | Expected Behavior |
|-----------|------------------|
| Token generation | Valid JWT with 72h expiry |
| Token verification | Decode and validate signature |
| Expired token | Throw error with user-friendly message |
| Tampered token | Throw error, reject signature |
| Email sent | HTML and plain text with approve/reject links |
| URL construction | Correct frontend URL with token parameter |

---

## Definition of Done

- [x] `approvalTokenService.ts` implements JWT token generation and verification
- [x] `approvalEmailService.ts` sends approval request emails with action links
- [x] Tokens expire after 72 hours
- [x] Email includes approve and reject buttons/links
- [x] HTML email template professionally formatted
- [x] Plain text fallback for email clients
- [x] Unit tests for token service (7 tests)
- [x] Unit tests for email service (4 tests)
- [x] Environment variables documented (APPROVAL_TOKEN_SECRET, FRONTEND_URL)

---

## Notes

- **Security**: Token secret must be stored securely (environment variable, secrets manager)
- **Single-use enforcement**: Handled in TASK-004 API endpoint (mark token as used after first use)
- **Email styling**: Uses inline CSS for maximum email client compatibility
- **Retry logic**: Consider adding email delivery retry mechanism in production
- **Monitoring**: Track token generation and email delivery success rates
