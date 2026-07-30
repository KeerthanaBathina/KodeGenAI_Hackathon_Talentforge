import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import logger from '../utils/logger';

export interface OfferTokenPayload {
  offerId: string;
  candidateId: string;
  action: 'view' | 'respond';
}

const TOKEN_SECRET = env.OFFER_TOKEN_SECRET || 'default-secret-change-in-production';
const TOKEN_EXPIRY = '30d'; // 30 days to match PDF URL expiry

/**
 * Generate secure access token for offer viewing and response
 * 
 * @param payload - Offer and candidate IDs, action type
 * @returns JWT token
 */
export function generateOfferToken(payload: OfferTokenPayload): string {
  const token = jwt.sign(payload, TOKEN_SECRET, {
    expiresIn: TOKEN_EXPIRY,
    issuer: 'ai-interview-platform',
    audience: 'offer-response'
  });

  logger.debug({ offerId: payload.offerId, action: payload.action }, 'Offer token generated');

  return token;
}

/**
 * Verify and decode offer access token
 * 
 * @param token - JWT token string
 * @returns Decoded payload
 * @throws Error if token is invalid or expired
 */
export function verifyOfferToken(token: string): OfferTokenPayload {
  try {
    const decoded = jwt.verify(token, TOKEN_SECRET, {
      issuer: 'ai-interview-platform',
      audience: 'offer-response'
    }) as OfferTokenPayload;

    return decoded;
  } catch (error: any) {
    if (error.name === 'TokenExpiredError') {
      throw new Error('Offer access token has expired');
    }
    if (error.name === 'JsonWebTokenError') {
      throw new Error('Invalid offer access token');
    }
    throw error;
  }
}
