/**
 * Unit Tests for User Management Service
 * 
 * Tests CRUD operations for internal staff user management
 */

import { describe, it, expect, beforeEach, vi, beforeAll, afterAll } from 'vitest';
import { UserRole } from '@prisma/client';
import prisma from '../../db/prisma';
import * as userManagementService from '../userManagementService';
import bcrypt from 'bcrypt';

describe('User Management Service', () => {
    // Test data
    const testUser = {
        email: 'test.admin@example.com',
        fullName: 'Test Admin',
        role: UserRole.admin as UserRole,
        timezone: 'America/New_York'
    };

    beforeAll(async () => {
        // Clean up test data before all tests
        await prisma.userCredential.deleteMany({
            where: {
                user: {
                    email: {
                        contains: '@example.com'
                    }
                }
            }
        });
        await prisma.user.deleteMany({
            where: {
                email: {
                    contains: '@example.com'
                }
            }
        });
    });

    afterAll(async () => {
        // Clean up test data after all tests
        await prisma.userCredential.deleteMany({
            where: {
                user: {
                    email: {
                        contains: '@example.com'
                    }
                }
            }
        });
        await prisma.user.deleteMany({
            where: {
                email: {
                    contains: '@example.com'
                }
            }
        });
        await prisma.$disconnect();
    });

    describe('createUser', () => {
        it('should create a new user with hashed password', async () => {
            const result = await userManagementService.createUser(testUser);

            expect(result.user).toBeDefined();
            expect(result.user.email).toBe(testUser.email.toLowerCase());
            expect(result.user.fullName).toBe(testUser.fullName);
            expect(result.user.role).toBe(testUser.role);
            expect(result.user.timezone).toBe(testUser.timezone);
            expect(result.user.active).toBe(true);
            expect(result.temporaryPassword).toBeDefined();
            expect(result.temporaryPassword.length).toBeGreaterThan(0);

            // Verify password was hashed
            const credential = await prisma.userCredential.findUnique({
                where: { userId: result.user.id }
            });

            expect(credential).toBeDefined();
            expect(credential!.passwordHash).toBeDefined();
            expect(credential!.passwordHash).not.toBe(result.temporaryPassword);

            // Verify password hash is valid bcrypt hash
            const isValidHash = await bcrypt.compare(
                result.temporaryPassword,
                credential!.passwordHash
            );
            expect(isValidHash).toBe(true);
        });

        it('should normalize email to lowercase', async () => {
            const upperCaseEmail = {
                ...testUser,
                email: 'TEST.NORMALIZE@EXAMPLE.COM'
            };

            const result = await userManagementService.createUser(upperCaseEmail);

            expect(result.user.email).toBe('test.normalize@example.com');
        });

        it('should default timezone to UTC if not provided', async () => {
            const noTimezone = {
                email: 'test.timezone@example.com',
                fullName: 'Test Timezone',
                role: UserRole.recruiter as UserRole
            };

            const result = await userManagementService.createUser(noTimezone);

            expect(result.user.timezone).toBe('UTC');
        });

        it('should reject duplicate email', async () => {
            const duplicateUser = {
                ...testUser,
                email: 'test.duplicate@example.com'
            };

            // Create first user
            await userManagementService.createUser(duplicateUser);

            // Attempt to create duplicate
            await expect(
                userManagementService.createUser(duplicateUser)
            ).rejects.toThrow(userManagementService.UserManagementError);

            await expect(
                userManagementService.createUser(duplicateUser)
            ).rejects.toMatchObject({
                code: 'DUPLICATE_EMAIL'
            });
        });

        it('should reject invalid email format', async () => {
            const invalidEmail = {
                ...testUser,
                email: 'invalid-email'
            };

            await expect(
                userManagementService.createUser(invalidEmail)
            ).rejects.toThrow(userManagementService.UserManagementError);
        });

        it('should reject invalid role', async () => {
            const invalidRole = {
                ...testUser,
                role: 'invalid_role' as UserRole
            };

            await expect(
                userManagementService.createUser(invalidRole)
            ).rejects.toThrow(userManagementService.UserManagementError);

            await expect(
                userManagementService.createUser(invalidRole)
            ).rejects.toMatchObject({
                code: 'INVALID_ROLE'
            });
        });

        it('should reject fullName less than 2 characters', async () => {
            const shortName = {
                ...testUser,
                fullName: 'A',
                email: 'test.shortname@example.com'
            };

            await expect(
                userManagementService.createUser(shortName)
            ).rejects.toThrow(userManagementService.UserManagementError);
        });
    });

    describe('getUserById', () => {
        it('should return user by ID', async () => {
            const created = await userManagementService.createUser({
                email: 'test.getbyid@example.com',
                fullName: 'Test GetById',
                role: UserRole.recruiter
            });

            const found = await userManagementService.getUserById(created.user.id);

            expect(found).toBeDefined();
            expect(found!.id).toBe(created.user.id);
            expect(found!.email).toBe(created.user.email);
        });

        it('should return null for non-existent ID', async () => {
            const found = await userManagementService.getUserById(
                '00000000-0000-0000-0000-000000000000'
            );

            expect(found).toBeNull();
        });
    });

    describe('getUserByEmail', () => {
        it('should return user by email', async () => {
            const created = await userManagementService.createUser({
                email: 'test.getbyemail@example.com',
                fullName: 'Test GetByEmail',
                role: UserRole.hr_reviewer
            });

            const found = await userManagementService.getUserByEmail(created.user.email);

            expect(found).toBeDefined();
            expect(found!.email).toBe(created.user.email);
        });

        it('should be case-insensitive', async () => {
            const created = await userManagementService.createUser({
                email: 'test.caseinsensitive@example.com',
                fullName: 'Test CaseInsensitive',
                role: UserRole.hr_reviewer
            });

            const found = await userManagementService.getUserByEmail(
                'TEST.CASEINSENSITIVE@EXAMPLE.COM'
            );

            expect(found).toBeDefined();
            expect(found!.email).toBe(created.user.email);
        });

        it('should return null for non-existent email', async () => {
            const found = await userManagementService.getUserByEmail(
                'nonexistent@example.com'
            );

            expect(found).toBeNull();
        });
    });

    describe('getAllUsers', () => {
        beforeEach(async () => {
            // Create test users
            await userManagementService.createUser({
                email: 'admin1@example.com',
                fullName: 'Admin One',
                role: UserRole.admin
            });
            await userManagementService.createUser({
                email: 'recruiter1@example.com',
                fullName: 'Recruiter One',
                role: UserRole.recruiter
            });
        });

        it('should return all users', async () => {
            const users = await userManagementService.getAllUsers();

            expect(users.length).toBeGreaterThanOrEqual(2);
        });

        it('should filter by role', async () => {
            const admins = await userManagementService.getAllUsers({
                role: UserRole.admin
            });

            expect(admins.length).toBeGreaterThan(0);
            admins.forEach(user => {
                expect(user.role).toBe(UserRole.admin);
            });
        });

        it('should filter by active status', async () => {
            const activeUsers = await userManagementService.getAllUsers({
                active: true
            });

            expect(activeUsers.length).toBeGreaterThan(0);
            activeUsers.forEach(user => {
                expect(user.active).toBe(true);
            });
        });

        it('should search by email', async () => {
            const results = await userManagementService.getAllUsers({
                search: 'recruiter1'
            });

            expect(results.length).toBeGreaterThan(0);
            expect(results[0].email).toContain('recruiter1');
        });

        it('should search by name', async () => {
            const results = await userManagementService.getAllUsers({
                search: 'Admin One'
            });

            expect(results.length).toBeGreaterThan(0);
            expect(results[0].fullName).toContain('Admin One');
        });
    });

    describe('updateUserRole', () => {
        it('should update user role', async () => {
            const user = await userManagementService.createUser({
                email: 'test.updaterole@example.com',
                fullName: 'Test UpdateRole',
                role: UserRole.recruiter
            });

            const actor = await userManagementService.createUser({
                email: 'actor.updaterole@example.com',
                fullName: 'Actor UpdateRole',
                role: UserRole.admin
            });

            const updated = await userManagementService.updateUserRole(
                user.user.id,
                UserRole.hr_reviewer,
                actor.user.id
            );

            expect(updated.role).toBe(UserRole.hr_reviewer);
        });

        it('should prevent self role change', async () => {
            const user = await userManagementService.createUser({
                email: 'test.selfrolechange@example.com',
                fullName: 'Test SelfRoleChange',
                role: UserRole.admin
            });

            await expect(
                userManagementService.updateUserRole(
                    user.user.id,
                    UserRole.recruiter,
                    user.user.id
                )
            ).rejects.toThrow(userManagementService.UserManagementError);

            await expect(
                userManagementService.updateUserRole(
                    user.user.id,
                    UserRole.recruiter,
                    user.user.id
                )
            ).rejects.toMatchObject({
                code: 'SELF_MODIFICATION_FORBIDDEN'
            });
        });

        it('should reject invalid role', async () => {
            const user = await userManagementService.createUser({
                email: 'test.invalidroleupdate@example.com',
                fullName: 'Test InvalidRoleUpdate',
                role: UserRole.recruiter
            });

            const actor = await userManagementService.createUser({
                email: 'actor.invalidroleupdate@example.com',
                fullName: 'Actor InvalidRoleUpdate',
                role: UserRole.admin
            });

            await expect(
                userManagementService.updateUserRole(
                    user.user.id,
                    'invalid_role' as UserRole,
                    actor.user.id
                )
            ).rejects.toThrow(userManagementService.UserManagementError);
        });

        it('should reject non-existent user', async () => {
            const actor = await userManagementService.createUser({
                email: 'actor.nonexistentuser@example.com',
                fullName: 'Actor NonExistentUser',
                role: UserRole.admin
            });

            await expect(
                userManagementService.updateUserRole(
                    '00000000-0000-0000-0000-000000000000',
                    UserRole.recruiter,
                    actor.user.id
                )
            ).rejects.toThrow(userManagementService.UserManagementError);

            await expect(
                userManagementService.updateUserRole(
                    '00000000-0000-0000-0000-000000000000',
                    UserRole.recruiter,
                    actor.user.id
                )
            ).rejects.toMatchObject({
                code: 'USER_NOT_FOUND'
            });
        });
    });

    describe('deactivateUser', () => {
        it('should deactivate user', async () => {
            const user = await userManagementService.createUser({
                email: 'test.deactivate@example.com',
                fullName: 'Test Deactivate',
                role: UserRole.recruiter
            });

            const actor = await userManagementService.createUser({
                email: 'actor.deactivate@example.com',
                fullName: 'Actor Deactivate',
                role: UserRole.admin
            });

            const deactivated = await userManagementService.deactivateUser(
                user.user.id,
                actor.user.id
            );

            expect(deactivated.active).toBe(false);
        });

        it('should prevent self-deactivation', async () => {
            const user = await userManagementService.createUser({
                email: 'test.selfdeactivate@example.com',
                fullName: 'Test SelfDeactivate',
                role: UserRole.admin
            });

            await expect(
                userManagementService.deactivateUser(user.user.id, user.user.id)
            ).rejects.toThrow(userManagementService.UserManagementError);

            await expect(
                userManagementService.deactivateUser(user.user.id, user.user.id)
            ).rejects.toMatchObject({
                code: 'SELF_MODIFICATION_FORBIDDEN',
                message: 'Administrators cannot deactivate their own account'
            });
        });

        it('should reject already deactivated user', async () => {
            const user = await userManagementService.createUser({
                email: 'test.alreadydeactivated@example.com',
                fullName: 'Test AlreadyDeactivated',
                role: UserRole.recruiter
            });

            const actor = await userManagementService.createUser({
                email: 'actor.alreadydeactivated@example.com',
                fullName: 'Actor AlreadyDeactivated',
                role: UserRole.admin
            });

            // Deactivate once
            await userManagementService.deactivateUser(user.user.id, actor.user.id);

            // Attempt to deactivate again
            await expect(
                userManagementService.deactivateUser(user.user.id, actor.user.id)
            ).rejects.toThrow(userManagementService.UserManagementError);

            await expect(
                userManagementService.deactivateUser(user.user.id, actor.user.id)
            ).rejects.toMatchObject({
                code: 'USER_INACTIVE'
            });
        });
    });

    describe('reactivateUser', () => {
        it('should reactivate deactivated user', async () => {
            const user = await userManagementService.createUser({
                email: 'test.reactivate@example.com',
                fullName: 'Test Reactivate',
                role: UserRole.recruiter
            });

            const actor = await userManagementService.createUser({
                email: 'actor.reactivate@example.com',
                fullName: 'Actor Reactivate',
                role: UserRole.admin
            });

            // Deactivate first
            await userManagementService.deactivateUser(user.user.id, actor.user.id);

            // Then reactivate
            const reactivated = await userManagementService.reactivateUser(
                user.user.id,
                actor.user.id
            );

            expect(reactivated!.active).toBe(true);
        });

        it('should handle already active user gracefully', async () => {
            const user = await userManagementService.createUser({
                email: 'test.alreadyactive@example.com',
                fullName: 'Test AlreadyActive',
                role: UserRole.recruiter
            });

            const actor = await userManagementService.createUser({
                email: 'actor.alreadyactive@example.com',
                fullName: 'Actor AlreadyActive',
                role: UserRole.admin
            });

            const result = await userManagementService.reactivateUser(
                user.user.id,
                actor.user.id
            );

            expect(result!.active).toBe(true);
        });
    });

    describe('Audit Logging', () => {
        it('should log user_created event when user is created', async () => {
            const actorId = 'actor-uuid-12345';
            const result = await userManagementService.createUser({
                email: 'audit.created@example.com',
                fullName: 'Audit Created',
                role: UserRole.recruiter,
                actorId
            });

            // Check audit event was created
            const auditEvents = await prisma.auditEvent.findMany({
                where: {
                    entityId: result.user.id,
                    eventType: 'user_created'
                }
            });

            expect(auditEvents).toHaveLength(1);
            expect(auditEvents[0].entityType).toBe('user');
            expect(auditEvents[0].actorId).toBe(actorId);
            expect(auditEvents[0].payload).toMatchObject({
                email: 'audit.created@example.com',
                role: UserRole.recruiter
            });
        });

        it('should log user_role_updated event when role is changed', async () => {
            const user = await userManagementService.createUser({
                email: 'audit.role@example.com',
                fullName: 'Audit Role',
                role: UserRole.recruiter
            });

            const actorId = 'actor-role-change';
            await userManagementService.updateUserRole(
                user.user.id,
                UserRole.hr_reviewer,
                actorId
            );

            const auditEvents = await prisma.auditEvent.findMany({
                where: {
                    entityId: user.user.id,
                    eventType: 'user_role_updated'
                }
            });

            expect(auditEvents).toHaveLength(1);
            expect(auditEvents[0].actorId).toBe(actorId);
            expect(auditEvents[0].payload).toMatchObject({
                oldRole: UserRole.recruiter,
                newRole: UserRole.hr_reviewer
            });
        });

        it('should log user_deactivated event when user is deactivated', async () => {
            const user = await userManagementService.createUser({
                email: 'audit.deactivated@example.com',
                fullName: 'Audit Deactivated',
                role: UserRole.recruiter
            });

            const actorId = 'actor-deactivate';
            await userManagementService.deactivateUser(user.user.id, actorId);

            const auditEvents = await prisma.auditEvent.findMany({
                where: {
                    entityId: user.user.id,
                    eventType: 'user_deactivated'
                }
            });

            expect(auditEvents).toHaveLength(1);
            expect(auditEvents[0].actorId).toBe(actorId);
            expect(auditEvents[0].payload).toMatchObject({
                email: 'audit.deactivated@example.com'
            });
        });

        it('should log user_reactivated event when user is reactivated', async () => {
            const user = await userManagementService.createUser({
                email: 'audit.reactivated@example.com',
                fullName: 'Audit Reactivated',
                role: UserRole.recruiter
            });

            const actorId = 'actor-reactivate';
            await userManagementService.deactivateUser(user.user.id, actorId);
            await userManagementService.reactivateUser(user.user.id, actorId);

            const auditEvents = await prisma.auditEvent.findMany({
                where: {
                    entityId: user.user.id,
                    eventType: 'user_reactivated'
                }
            });

            expect(auditEvents).toHaveLength(1);
            expect(auditEvents[0].actorId).toBe(actorId);
        });

        it('should log user_deactivation_blocked when self-deactivation is attempted', async () => {
            const user = await userManagementService.createUser({
                email: 'audit.self.deactivate@example.com',
                fullName: 'Audit Self Deactivate',
                role: UserRole.admin
            });

            // Attempt self-deactivation
            await expect(
                userManagementService.deactivateUser(user.user.id, user.user.id)
            ).rejects.toThrow('SELF_MODIFICATION_FORBIDDEN');

            // Check that blocking event was logged
            const auditEvents = await prisma.auditEvent.findMany({
                where: {
                    entityId: user.user.id,
                    eventType: 'user_deactivation_blocked'
                }
            });

            expect(auditEvents).toHaveLength(1);
            expect(auditEvents[0].payload).toMatchObject({
                reason: 'Self-deactivation attempt'
            });
        });

        it('should return audit trail for a user', async () => {
            const user = await userManagementService.createUser({
                email: 'audit.trail@example.com',
                fullName: 'Audit Trail',
                role: UserRole.recruiter,
                actorId: 'actor1'
            });

            // Perform some actions
            await userManagementService.updateUserRole(
                user.user.id,
                UserRole.hr_reviewer,
                'actor2'
            );

            // Get audit trail
            const trail = await userManagementService.getUserAuditTrail(user.user.id);

            expect(trail.length).toBeGreaterThanOrEqual(2);
            expect(trail.some(e => e.eventType === 'user_created')).toBe(true);
            expect(trail.some(e => e.eventType === 'user_role_updated')).toBe(true);
        });

        it('should filter audit trail by actions', async () => {
            const user = await userManagementService.createUser({
                email: 'audit.filter@example.com',
                fullName: 'Audit Filter',
                role: UserRole.recruiter
            });

            await userManagementService.updateUserRole(
                user.user.id,
                UserRole.hr_reviewer,
                'actor1'
            );

            // Get only role change events
            const trail = await userManagementService.getUserAuditTrail(
                user.user.id,
                { actions: ['user_role_updated'] }
            );

            expect(trail.every(e => e.eventType === 'user_role_updated')).toBe(true);
        });

        it('should limit audit trail results', async () => {
            const user = await userManagementService.createUser({
                email: 'audit.limit@example.com',
                fullName: 'Audit Limit',
                role: UserRole.recruiter
            });

            // Get limited results
            const trail = await userManagementService.getUserAuditTrail(
                user.user.id,
                { limit: 1 }
            );

            expect(trail.length).toBeLessThanOrEqual(1);
        });
    });
});

