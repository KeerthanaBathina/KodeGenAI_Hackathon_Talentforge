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
      logger.error({ error: (error as Error).message }, 'Invalid approval token');
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
