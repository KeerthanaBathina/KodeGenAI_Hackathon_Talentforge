import prisma from '../db/prisma';
import bcrypt from 'bcrypt';
import { sendAccountLockoutEmail } from './emailService';
import { auditEvent } from './auditService';
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

function normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
}

export async function authenticateUser(input: LoginInput): Promise<LoginResult> {
    const { email, password, ipAddress, userAgent } = input;
    const normalizedEmail = normalizeEmail(email);

    // 1. Find candidate by email
    const candidate = await prisma.candidate.findUnique({
        where: { email: normalizedEmail },
        select: {
            id: true,
            email: true,
            status: true,
            candidatePublicId: true,
            failedLoginAttempts: true,
            lockedUntil: true,
            lastLoginAttemptAt: true,
            credential: {
                select: {
                    passwordHash: true,
                },
            },
        },
    });

    // Update last login attempt timestamp
    if (candidate) {
        await prisma.candidate.update({
            where: { id: candidate.id },
            data: { lastLoginAttemptAt: new Date() },
        });
    }

    // 2. Check if account exists
    if (!candidate || !candidate.credential) {
        await auditEvent({
            eventType: 'login_failed',
            entityType: 'candidate',
            entityId: '00000000-0000-0000-0000-000000000000',
            payload: { email: normalizedEmail, reason: 'account_not_found' },
            ipAddress: ipAddress || null,
            userAgent: userAgent || null,
        });

        logger.warn({ email: normalizedEmail }, 'Login attempt for non-existent account');

        // Return generic error to prevent user enumeration
        throw new LoginError('Invalid email or password', 'INVALID_CREDENTIALS');
    }

    // 3. Check if account is locked
    if (candidate.lockedUntil && candidate.lockedUntil > new Date()) {
        await auditEvent({
            eventType: 'login_blocked',
            entityType: 'candidate',
            entityId: candidate.id,
            payload: {
                email: normalizedEmail,
                reason: 'account_locked',
                lockedUntil: candidate.lockedUntil.toISOString(),
            },
            ipAddress: ipAddress || null,
            userAgent: userAgent || null,
        });

        logger.warn({ candidateId: candidate.id, lockedUntil: candidate.lockedUntil }, 'Login attempt on locked account');

        throw new LoginError(
            `Account temporarily locked. Try again after ${candidate.lockedUntil.toLocaleTimeString()}.`,
            'ACCOUNT_LOCKED',
            candidate.lockedUntil
        );
    }

    // 4. Verify password
    const isPasswordValid = await bcrypt.compare(password, candidate.credential.passwordHash);

    if (!isPasswordValid) {
        // Increment failure counter
        const newFailureCount = candidate.failedLoginAttempts + 1;
        const shouldLock = newFailureCount >= LOCKOUT_THRESHOLD;
        const lockedUntil = shouldLock ? new Date(Date.now() + LOCKOUT_DURATION_MS) : null;

        await prisma.candidate.update({
            where: { id: candidate.id },
            data: {
                failedLoginAttempts: newFailureCount,
                lockedUntil,
            },
        });

        if (shouldLock) {
            // Send lockout notification email
            try {
                await sendAccountLockoutEmail({
                    email: candidate.email,
                    lockedUntil: lockedUntil!,
                });
            } catch (emailError) {
                logger.error({ error: emailError, candidateId: candidate.id }, 'Failed to send lockout email');
                // Don't fail the login attempt if email fails
            }

            await auditEvent({
                eventType: 'account_locked',
                entityType: 'candidate',
                entityId: candidate.id,
                payload: {
                    email: normalizedEmail,
                    reason: 'failed_login_threshold',
                    attempts: newFailureCount,
                    lockedUntil: lockedUntil!.toISOString(),
                },
                ipAddress: ipAddress || null,
                userAgent: userAgent || null,
            });

            logger.warn({ candidateId: candidate.id, attempts: newFailureCount }, 'Account locked due to failed login attempts');

            throw new LoginError(
                `Account locked due to too many failed attempts. Try again after ${lockedUntil!.toLocaleTimeString()}.`,
                'ACCOUNT_LOCKED',
                lockedUntil!
            );
        }

        await auditEvent({
            eventType: 'login_failed',
            entityType: 'candidate',
            entityId: candidate.id,
            payload: {
                email: normalizedEmail,
                reason: 'invalid_password',
                attemptCount: newFailureCount,
            },
            ipAddress: ipAddress || null,
            userAgent: userAgent || null,
        });

        logger.warn({ candidateId: candidate.id, attempts: newFailureCount }, 'Failed login attempt');

        throw new LoginError('Invalid email or password', 'INVALID_CREDENTIALS');
    }

    // 5. Successful authentication - reset lockout fields
    await prisma.candidate.update({
        where: { id: candidate.id },
        data: {
            failedLoginAttempts: 0,
            lockedUntil: null,
            lastSuccessfulLoginAt: new Date(),
        },
    });

    await auditEvent({
        eventType: 'login_success',
        entityType: 'candidate',
        entityId: candidate.id,
        payload: { email: normalizedEmail },
        ipAddress: ipAddress || null,
        userAgent: userAgent || null,
    });

    logger.info({ candidateId: candidate.id }, 'Successful login');

    return {
        success: true,
        user: {
            id: candidate.id,
            email: candidate.email,
            role: 'candidate', // TODO: Get from User model if implementing multi-role
            candidateId: candidate.candidatePublicId || undefined,
        },
    };
}
