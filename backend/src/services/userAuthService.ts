/**
 * User Authentication Service
 * 
 * Handles authentication for internal staff users (admin, recruiter, hr_reviewer, etc.)
 * Validates credentials against UserCredential table and checks active status.
 * 
 * @module services/userAuthService
 */

import bcrypt from 'bcrypt';
import prisma from '../db/prisma';
import { auditEvent } from './auditService';
import logger from '../utils/logger';

// ============================================================================
// Types
// ============================================================================

export interface UserLoginInput {
    email: string;
    password: string;
    ipAddress?: string;
    userAgent?: string;
}

export interface UserLoginResult {
    success: boolean;
    user?: {
        id: string;
        email: string;
        fullName: string;
        role: string;
        active: boolean;
    };
}

export class UserAuthError extends Error {
    constructor(
        message: string,
        public readonly code: 
            | 'INVALID_CREDENTIALS' 
            | 'ACCOUNT_DEACTIVATED' 
            | 'ACCOUNT_NOT_FOUND'
            | 'NO_CREDENTIALS',
        public readonly statusCode: number = 401
    ) {
        super(message);
        this.name = 'UserAuthError';
    }
}

// ============================================================================
// Helper Functions
// ============================================================================

function normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
}

function safeAudit(payload: Parameters<typeof auditEvent>[0]): void {
    void auditEvent(payload).catch((error) => {
        logger.error({ error, eventType: payload.eventType }, 'Internal auth audit event failed');
    });
}

// ============================================================================
// Service Functions
// ============================================================================

/**
 * Authenticate internal staff user
 * 
 * @param input - Login credentials and metadata
 * @returns Login result with user information
 * @throws UserAuthError if authentication fails
 */
export async function authenticateInternalUser(input: UserLoginInput): Promise<UserLoginResult> {
    const { email, password, ipAddress, userAgent } = input;
    const normalizedEmail = normalizeEmail(email);

    // Find user by email
    const user = await prisma.user.findUnique({
        where: { email: normalizedEmail },
        select: {
            id: true,
            email: true,
            fullName: true,
            role: true,
            active: true,
            credential: {
                select: {
                    passwordHash: true
                }
            }
        }
    });

    // Check if user exists
    if (!user) {
        safeAudit({
            eventType: 'login_failed',
            entityType: 'user',
            entityId: '00000000-0000-0000-0000-000000000000',
            payload: { 
                email: normalizedEmail, 
                reason: 'account_not_found',
                userType: 'internal_staff'
            },
            ipAddress: ipAddress || null,
            userAgent: userAgent || null
        });

        logger.warn({ email: normalizedEmail }, 'Login attempt for non-existent internal user account');

        // Preserve generic messaging while allowing the route layer to fall back to candidate auth.
        throw new UserAuthError(
            'Invalid email or password',
            'ACCOUNT_NOT_FOUND'
        );
    }

    // Check if user has credentials
    if (!user.credential) {
        safeAudit({
            eventType: 'login_failed',
            entityType: 'user',
            entityId: user.id,
            payload: { 
                email: normalizedEmail, 
                reason: 'no_credentials',
                role: user.role
            },
            ipAddress: ipAddress || null,
            userAgent: userAgent || null
        });

        logger.error({ userId: user.id, email: normalizedEmail }, 'User account has no credentials configured');

        throw new UserAuthError(
            'Invalid email or password',
            'NO_CREDENTIALS'
        );
    }

    // Check if user is active BEFORE password verification
    // This prevents timing attacks and follows security best practices
    if (!user.active) {
        safeAudit({
            eventType: 'login_blocked',
            entityType: 'user',
            entityId: user.id,
            payload: { 
                email: normalizedEmail, 
                reason: 'account_deactivated',
                role: user.role
            },
            ipAddress: ipAddress || null,
            userAgent: userAgent || null
        });

        logger.warn({ userId: user.id, email: normalizedEmail, role: user.role }, 'Login attempt for deactivated user account');

        throw new UserAuthError(
            'Your account has been deactivated — contact your administrator',
            'ACCOUNT_DEACTIVATED'
        );
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.credential.passwordHash);

    if (!isPasswordValid) {
        safeAudit({
            eventType: 'login_failed',
            entityType: 'user',
            entityId: user.id,
            payload: { 
                email: normalizedEmail, 
                reason: 'invalid_password',
                role: user.role
            },
            ipAddress: ipAddress || null,
            userAgent: userAgent || null
        });

        logger.warn({ userId: user.id, email: normalizedEmail }, 'Invalid password for internal user');

        // Generic error to prevent user enumeration
        throw new UserAuthError(
            'Invalid email or password',
            'INVALID_CREDENTIALS'
        );
    }

    // Successful login - log audit event
    safeAudit({
        eventType: 'login_success',
        entityType: 'user',
        entityId: user.id,
        payload: { 
            email: normalizedEmail,
            role: user.role,
            userType: 'internal_staff'
        },
        ipAddress: ipAddress || null,
        userAgent: userAgent || null
    });

    logger.info({ userId: user.id, email: normalizedEmail, role: user.role }, 'Internal user login successful');

    return {
        success: true,
        user: {
            id: user.id,
            email: user.email,
            fullName: user.fullName,
            role: user.role,
            active: user.active
        }
    };
}

/**
 * Verify user is still active (for middleware use)
 * 
 * @param userId - User UUID
 * @returns User object if active, throws error if not
 * @throws UserAuthError if user not found or deactivated
 */
export async function verifyUserActive(userId: string): Promise<{
    id: string;
    email: string;
    fullName: string;
    role: string;
    active: boolean;
}> {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
            id: true,
            email: true,
            fullName: true,
            role: true,
            active: true
        }
    });

    if (!user) {
        throw new UserAuthError(
            'Authentication required',
            'ACCOUNT_NOT_FOUND'
        );
    }

    if (!user.active) {
        throw new UserAuthError(
            'Your account has been deactivated — contact your administrator',
            'ACCOUNT_DEACTIVATED'
        );
    }

    return user;
}
