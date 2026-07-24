/**
 * Password Reset Service
 * 
 * Handles the complete lifecycle of password reset tokens:
 * - Generation with 60-minute expiry
 * - Validation (expiry + usage status)
 * - Consumption (password update + token invalidation)
 * - Token revocation
 * 
 * @module services/passwordResetService
 */

import crypto from 'crypto';
import bcrypt from 'bcrypt';
import prisma from '../db/prisma';
import { sendPasswordResetEmail } from './emailService';
import { auditService } from './auditService';
import { validatePasswordStrength } from '../utils/passwordValidator';
import { env } from '../config/env';
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
            select: { id: true, email: true, profile: { select: { fullName: true } } },
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
        const resetLink = `${env.FRONTEND_URL}/reset-password?token=${token}`;
        const name = candidate.profile?.fullName || candidate.email.split('@')[0];

        await sendPasswordResetEmail({
            to: candidate.email,
            name,
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
