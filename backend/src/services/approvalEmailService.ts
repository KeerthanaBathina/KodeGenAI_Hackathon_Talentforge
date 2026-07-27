import { Decimal } from '@prisma/client/runtime/library';
import { generateApprovalTokens } from './approvalTokenService';
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

  // Send email via mock provider
  if (env.EMAIL_PROVIDER === 'mock') {
    logger.info(
      { approverEmail, approvalId, tier },
      '[MOCK EMAIL] Approval request sent'
    );
    console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📧 APPROVAL REQUEST EMAIL (Mock)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
To: ${approverEmail}
Subject: Approval Required (Tier ${tier}) - Offer Decision ${decisionId}

${plainTextContent}

Approve URL: ${approveUrl}
Reject URL: ${rejectUrl}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    `);
    return;
  }

  // Real SMTP implementation would go here
  throw new Error('SMTP email provider not yet implemented for approval emails');
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

