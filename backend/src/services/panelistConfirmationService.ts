import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { env } from '../config/env';
import { prisma } from '../db/prisma';
import logger from '../utils/logger';

export interface PanelistConfirmationTokenPayload {
    interviewStageId: string;
    panelistId: string;
    action: 'confirm' | 'decline';
    iat?: number;
    exp?: number;
}

const TOKEN_EXPIRY_HOURS = 48;

/**
 * Generate a confirmation token for a panelist
 */
export async function generatePanelistConfirmationToken(
    interviewStageId: string,
    panelistId: string,
    action: 'confirm' | 'decline'
): Promise<string> {
    const payload: PanelistConfirmationTokenPayload = {
        interviewStageId,
        panelistId,
        action,
    };

    const secret = env.JWT_SECRET;
    if (!secret) {
        throw new Error('JWT_SECRET is not configured');
    }

    const token = jwt.sign(payload, secret, {
        algorithm: 'HS256',
        expiresIn: `${TOKEN_EXPIRY_HOURS}h`,
    });

    // Store token hash for single-use validation
    const tokenHash = hashToken(token);
    
    await prisma.panelistConfirmation.updateMany({
        where: {
            interviewStageId,
            panelistId,
        },
        data: {
            tokenHash,
            confirmationSentAt: new Date(),
        },
    });

    return token;
}

/**
 * Hash a token for secure storage
 */
function hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Validate and decode a confirmation token
 */
export async function validatePanelistConfirmationToken(
    token: string
): Promise<PanelistConfirmationTokenPayload> {
    const secret = env.JWT_SECRET;
    if (!secret) {
        throw new Error('JWT_SECRET is not configured');
    }

    try {
        // Verify JWT signature and expiry
        const decoded = jwt.verify(token, secret, {
            algorithms: ['HS256'],
        }) as PanelistConfirmationTokenPayload;

        // Check single-use: token hash must match stored hash
        const tokenHash = hashToken(token);
        const confirmation = await prisma.panelistConfirmation.findFirst({
            where: {
                interviewStageId: decoded.interviewStageId,
                panelistId: decoded.panelistId,
                tokenHash,
            },
        });

        if (!confirmation) {
            throw new Error('Token has already been used or is invalid');
        }

        return decoded;
    } catch (error) {
        if (error instanceof jwt.TokenExpiredError) {
            logger.warn(
                { error: error.message },
                'Panelist confirmation token expired'
            );
            throw new Error('Confirmation link has expired');
        }
        if (error instanceof jwt.JsonWebTokenError) {
            logger.warn(
                { error: error.message },
                'Invalid panelist confirmation token'
            );
            throw new Error('Invalid confirmation link');
        }
        throw error;
    }
}

/**
 * Mark token as used by clearing the hash
 */
export async function markTokenAsUsed(
    interviewStageId: string,
    panelistId: string
): Promise<void> {
    await prisma.panelistConfirmation.updateMany({
        where: {
            interviewStageId,
            panelistId,
        },
        data: {
            tokenHash: null,
        },
    });
}
