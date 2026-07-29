/**
 * User Management Service
 * 
 * Handles CRUD operations for internal staff users (admin, recruiter, hr_reviewer, etc.)
 * Provides role-based user creation, updates, and deactivation with audit logging.
 * 
 * @module services/userManagementService
 */

import crypto from 'node:crypto';
import bcrypt from 'bcrypt';
import { UserRole } from '@prisma/client';
import prisma from '../db/prisma';
import { auditEvent } from './auditService';
import logger from '../utils/logger';
import { sendOnboardingEmail } from './emailService';

// ============================================================================
// Types
// ============================================================================

export interface CreateUserInput {
    email: string;
    fullName: string;
    role: UserRole;
    timezone?: string;
    actorId?: string;  // Optional: admin who created the user
}

export interface UserFilters {
    role?: UserRole;
    active?: boolean;
    search?: string;
}

export interface CreateUserResult {
    user: {
        id: string;
        email: string;
        fullName: string;
        role: UserRole;
        timezone: string;
        active: boolean;
        createdAt: Date;
    };
    temporaryPassword: string;
}

export interface AuditTrailOptions {
    startDate?: Date;
    endDate?: Date;
    actions?: string[];
    limit?: number;
}

export interface AuditTrailEntry {
    id: string;
    eventType: string;
    entityType: string;
    entityId: string;
    actorId?: string;
    payload: Record<string, any>;
    createdAt: Date;
    actor?: {
        id: string;
        email: string;
        fullName?: string;
    };
}

export class UserManagementError extends Error {
    constructor(
        public readonly code: 
            | 'DUPLICATE_EMAIL' 
            | 'USER_NOT_FOUND' 
            | 'INVALID_ROLE' 
            | 'SELF_MODIFICATION_FORBIDDEN'
            | 'USER_INACTIVE',
        message: string
    ) {
        super(message);
        this.name = 'UserManagementError';
    }
}

// ============================================================================
// Constants
// ============================================================================

const BCRYPT_SALT_ROUNDS = 12;
const TEMP_PASSWORD_LENGTH = 32;

// ============================================================================
// Helper Functions
// ============================================================================

function normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
}

function generateTemporaryPassword(): string {
    return crypto.randomBytes(TEMP_PASSWORD_LENGTH).toString('base64url');
}

async function hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
}

function validateEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

// ============================================================================
// Service Functions
// ============================================================================

/**
 * Create a new user with a temporary password
 * 
 * @param data - User creation data including email, fullName, role, and optional actorId
 * @returns User object and temporary password (only returned once)
 * @throws UserManagementError if email already exists or validation fails
 */
export async function createUser(data: CreateUserInput): Promise<CreateUserResult> {
    const { email, fullName, role, timezone = 'UTC', actorId } = data;

    // Validate inputs
    const normalizedEmail = normalizeEmail(email);
    
    if (!validateEmail(normalizedEmail)) {
        throw new UserManagementError(
            'DUPLICATE_EMAIL',
            'Invalid email format'
        );
    }

    if (fullName.trim().length < 2) {
        throw new UserManagementError(
            'INVALID_ROLE',
            'Full name must be at least 2 characters'
        );
    }

    if (!Object.values(UserRole).includes(role)) {
        throw new UserManagementError(
            'INVALID_ROLE',
            `Invalid role. Must be one of: ${Object.values(UserRole).join(', ')}`
        );
    }

    // Check for duplicate email
    const existingUser = await prisma.user.findUnique({
        where: { email: normalizedEmail },
        select: { id: true }
    });

    if (existingUser) {
        throw new UserManagementError(
            'DUPLICATE_EMAIL',
            'A user with this email already exists'
        );
    }

    // Generate temporary password
    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await hashPassword(temporaryPassword);

    // Create user with credential
    const user = await prisma.user.create({
        data: {
            email: normalizedEmail,
            fullName: fullName.trim(),
            role,
            timezone,
            active: true,
            credential: {
                create: {
                    passwordHash
                }
            }
        },
        select: {
            id: true,
            email: true,
            fullName: true,
            role: true,
            timezone: true,
            active: true,
            createdAt: true
        }
    });

    // Audit log
    await auditEvent({
        eventType: 'user_created',
        entityType: 'user',
        entityId: user.id,
        actorId,  // Admin who created this user
        payload: {
            email: user.email,
            role: user.role,
            fullName: user.fullName
        }
    });

    logger.info({ userId: user.id, email: user.email, role: user.role }, 'User created successfully');

    // Send onboarding email asynchronously (non-blocking)
    sendOnboardingEmail({
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        temporaryPassword
    }).catch((error) => {
        logger.error(
            { 
                userId: user.id, 
                email: user.email,
                error: error instanceof Error ? error.message : String(error)
            },
            'Failed to send onboarding email'
        );
    });

    logger.info({ userId: user.id, email: user.email }, 'Onboarding email queued for delivery');

    return {
        user,
        temporaryPassword
    };
}

/**
 * Get user by ID
 * 
 * @param id - User UUID
 * @returns User object or null if not found
 */
export async function getUserById(id: string) {
    return prisma.user.findUnique({
        where: { id },
        select: {
            id: true,
            email: true,
            fullName: true,
            role: true,
            timezone: true,
            active: true,
            createdAt: true,
            updatedAt: true
        }
    });
}

/**
 * Get user by email
 * 
 * @param email - User email
 * @returns User object or null if not found
 */
export async function getUserByEmail(email: string) {
    const normalizedEmail = normalizeEmail(email);
    
    return prisma.user.findUnique({
        where: { email: normalizedEmail },
        select: {
            id: true,
            email: true,
            fullName: true,
            role: true,
            timezone: true,
            active: true,
            createdAt: true,
            updatedAt: true
        }
    });
}

/**
 * Get all users with optional filtering
 * 
 * @param filters - Optional filters for role, active status, and search
 * @returns Array of user objects
 */
export async function getAllUsers(filters?: UserFilters) {
    const where: any = {};

    if (filters?.role) {
        where.role = filters.role;
    }

    if (filters?.active !== undefined) {
        where.active = filters.active;
    }

    if (filters?.search) {
        const searchTerm = filters.search.toLowerCase();
        where.OR = [
            { email: { contains: searchTerm, mode: 'insensitive' } },
            { fullName: { contains: searchTerm, mode: 'insensitive' } }
        ];
    }

    return prisma.user.findMany({
        where,
        select: {
            id: true,
            email: true,
            fullName: true,
            role: true,
            timezone: true,
            active: true,
            createdAt: true,
            updatedAt: true
        },
        orderBy: [
            { active: 'desc' },
            { createdAt: 'desc' }
        ]
    });
}

/**
 * Update user role
 * 
 * @param userId - User UUID
 * @param newRole - New role to assign
 * @param actorId - ID of the user performing the update
 * @returns Updated user object
 * @throws UserManagementError if user not found or self-modification attempted
 */
export async function updateUserRole(userId: string, newRole: UserRole, actorId: string) {
    // Prevent self role change
    if (userId === actorId) {
        throw new UserManagementError(
            'SELF_MODIFICATION_FORBIDDEN',
            'You cannot change your own role'
        );
    }

    // Validate role
    if (!Object.values(UserRole).includes(newRole)) {
        throw new UserManagementError(
            'INVALID_ROLE',
            `Invalid role. Must be one of: ${Object.values(UserRole).join(', ')}`
        );
    }

    // Check user exists
    const existingUser = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, role: true, email: true }
    });

    if (!existingUser) {
        throw new UserManagementError(
            'USER_NOT_FOUND',
            'User not found'
        );
    }

    // Update role
    const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: { role: newRole },
        select: {
            id: true,
            email: true,
            fullName: true,
            role: true,
            timezone: true,
            active: true,
            createdAt: true,
            updatedAt: true
        }
    });

    // Audit log
    await auditEvent({
        eventType: 'user_role_updated',
        entityType: 'user',
        entityId: userId,
        actorId,
        payload: {
            oldRole: existingUser.role,
            newRole,
            email: existingUser.email
        }
    });

    logger.info(
        { userId, actorId, oldRole: existingUser.role, newRole },
        'User role updated'
    );

    return updatedUser;
}

/**
 * Deactivate a user (set active = false)
 * 
 * @param userId - User UUID
 * @param actorId - ID of the user performing the deactivation
 * @returns Updated user object
 * @throws UserManagementError if user not found or self-deactivation attempted
 */
export async function deactivateUser(userId: string, actorId: string) {
    // Prevent self-deactivation
    if (userId === actorId) {
        // Log attempted self-deactivation
        const admin = await prisma.user.findUnique({
            where: { id: actorId },
            select: { id: true, email: true, role: true }
        });

        await auditEvent({
            eventType: 'user_deactivation_blocked',
            entityType: 'user',
            entityId: actorId,  // Self reference
            actorId,
            payload: {
                reason: 'Self-deactivation attempt',
                email: admin?.email
            }
        });

        logger.warn({ userId: actorId, email: admin?.email }, 'Self-deactivation attempt blocked');

        throw new UserManagementError(
            'SELF_MODIFICATION_FORBIDDEN',
            'Administrators cannot deactivate their own account'
        );
    }

    // Check user exists and is active
    const existingUser = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, active: true, email: true, role: true }
    });

    if (!existingUser) {
        throw new UserManagementError(
            'USER_NOT_FOUND',
            'User not found'
        );
    }

    if (!existingUser.active) {
        throw new UserManagementError(
            'USER_INACTIVE',
            'User is already deactivated'
        );
    }

    // Deactivate user
    const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: { active: false },
        select: {
            id: true,
            email: true,
            fullName: true,
            role: true,
            timezone: true,
            active: true,
            createdAt: true,
            updatedAt: true
        }
    });

    // Audit log
    await auditEvent({
        eventType: 'user_deactivated',
        entityType: 'user',
        entityId: userId,
        actorId,
        payload: {
            email: existingUser.email,
            role: existingUser.role
        }
    });

    logger.info(
        { userId, actorId, email: existingUser.email },
        'User deactivated'
    );

    return updatedUser;
}

/**
 * Reactivate a user (set active = true)
 * 
 * @param userId - User UUID
 * @param actorId - ID of the user performing the reactivation
 * @returns Updated user object
 * @throws UserManagementError if user not found
 */
export async function reactivateUser(userId: string, actorId: string) {
    // Check user exists
    const existingUser = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, active: true, email: true, role: true }
    });

    if (!existingUser) {
        throw new UserManagementError(
            'USER_NOT_FOUND',
            'User not found'
        );
    }

    if (existingUser.active) {
        // Already active, return current state
        return prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                email: true,
                fullName: true,
                role: true,
                timezone: true,
                active: true,
                createdAt: true,
                updatedAt: true
            }
        });
    }

    // Reactivate user
    const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: { active: true },
        select: {
            id: true,
            email: true,
            fullName: true,
            role: true,
            timezone: true,
            active: true,
            createdAt: true,
            updatedAt: true
        }
    });

    // Audit log
    await auditEvent({
        eventType: 'user_reactivated',
        entityType: 'user',
        entityId: userId,
        actorId,
        payload: {
            email: existingUser.email,
            role: existingUser.role
        }
    });

    logger.info(
        { userId, actorId, email: existingUser.email },
        'User reactivated'
    );

    return updatedUser;
}

/**
 * Get audit trail for a user
 * 
 * @param userId - User UUID
 * @param options - Query options for filtering and pagination
 * @returns Array of audit trail entries for the user
 */
export async function getUserAuditTrail(
    userId: string,
    options?: AuditTrailOptions
): Promise<AuditTrailEntry[]> {
    return prisma.auditEvent.findMany({
        where: {
            entityType: 'user',
            entityId: userId,
            eventType: options?.actions ? { in: options.actions } : undefined,
            createdAt: {
                gte: options?.startDate,
                lte: options?.endDate,
            },
        },
        select: {
            id: true,
            eventType: true,
            entityType: true,
            entityId: true,
            actorId: true,
            payload: true,
            createdAt: true,
            actor: {
                select: {
                    id: true,
                    email: true,
                    fullName: true,
                }
            }
        },
        orderBy: { createdAt: 'desc' },
        take: options?.limit || 100,
    });
}
