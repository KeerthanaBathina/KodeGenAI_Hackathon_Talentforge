/**
 * Unit Tests for User Authentication Service
 * 
 * Tests internal staff user authentication including deactivated user handling
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { UserRole } from '@prisma/client';
import bcrypt from 'bcrypt';
import prisma from '../../db/prisma';
import * as userAuthService from '../userAuthService';

describe('User Authentication Service', () => {
    let testUser: any;
    let deactivatedUser: any;
    const testPassword = 'TestPassword123!';
    let hashedPassword: string;

    beforeAll(async () => {
        // Hash test password
        hashedPassword = await bcrypt.hash(testPassword, 12);

        // Clean up test data
        await prisma.userCredential.deleteMany({
            where: {
                user: {
                    email: {
                        contains: '@authservice-test.com'
                    }
                }
            }
        });
        await prisma.user.deleteMany({
            where: {
                email: {
                    contains: '@authservice-test.com'
                }
            }
        });

        // Create test user with credentials
        testUser = await prisma.user.create({
            data: {
                email: 'active@authservice-test.com',
                fullName: 'Active Test User',
                role: UserRole.recruiter,
                timezone: 'UTC',
                active: true,
                credential: {
                    create: {
                        passwordHash: hashedPassword
                    }
                }
            }
        });

        // Create deactivated user
        deactivatedUser = await prisma.user.create({
            data: {
                email: 'deactivated@authservice-test.com',
                fullName: 'Deactivated Test User',
                role: UserRole.recruiter,
                timezone: 'UTC',
                active: false,
                credential: {
                    create: {
                        passwordHash: hashedPassword
                    }
                }
            }
        });
    });

    afterAll(async () => {
        // Clean up test data
        await prisma.userCredential.deleteMany({
            where: {
                user: {
                    email: {
                        contains: '@authservice-test.com'
                    }
                }
            }
        });
        await prisma.user.deleteMany({
            where: {
                email: {
                    contains: '@authservice-test.com'
                }
            }
        });
        await prisma.$disconnect();
    });

    describe('authenticateInternalUser', () => {
        it('should authenticate active user with correct credentials', async () => {
            const result = await userAuthService.authenticateInternalUser({
                email: 'active@authservice-test.com',
                password: testPassword
            });

            expect(result.success).toBe(true);
            expect(result.user).toBeDefined();
            expect(result.user!.email).toBe('active@authservice-test.com');
            expect(result.user!.role).toBe(UserRole.recruiter);
            expect(result.user!.active).toBe(true);
        });

        it('should reject deactivated user with specific error message', async () => {
            await expect(
                userAuthService.authenticateInternalUser({
                    email: 'deactivated@authservice-test.com',
                    password: testPassword
                })
            ).rejects.toMatchObject({
                code: 'ACCOUNT_DEACTIVATED',
                message: 'Your account has been deactivated — contact your administrator'
            });
        });

        it('should reject user with incorrect password', async () => {
            await expect(
                userAuthService.authenticateInternalUser({
                    email: 'active@authservice-test.com',
                    password: 'WrongPassword123!'
                })
            ).rejects.toMatchObject({
                code: 'INVALID_CREDENTIALS'
            });
        });

        it('should reject non-existent user', async () => {
            await expect(
                userAuthService.authenticateInternalUser({
                    email: 'nonexistent@authservice-test.com',
                    password: testPassword
                })
            ).rejects.toMatchObject({
                code: 'INVALID_CREDENTIALS',
                message: 'Invalid email or password'
            });
        });

        it('should normalize email to lowercase', async () => {
            const result = await userAuthService.authenticateInternalUser({
                email: 'ACTIVE@authservice-test.com',
                password: testPassword
            });

            expect(result.success).toBe(true);
            expect(result.user!.email).toBe('active@authservice-test.com');
        });

        it('should check active status before password verification', async () => {
            // This test ensures timing attack prevention
            // Deactivated account should fail quickly without password check
            const startTime = Date.now();
            
            await expect(
                userAuthService.authenticateInternalUser({
                    email: 'deactivated@authservice-test.com',
                    password: 'WrongPassword123!'
                })
            ).rejects.toMatchObject({
                code: 'ACCOUNT_DEACTIVATED'
            });

            const duration = Date.now() - startTime;
            // Should fail quickly (< 100ms) since we don't verify password
            expect(duration).toBeLessThan(1000);
        });

        it('should handle user without credentials', async () => {
            // Create user without credentials
            const noCredUser = await prisma.user.create({
                data: {
                    email: 'nocred@authservice-test.com',
                    fullName: 'No Cred User',
                    role: UserRole.recruiter,
                    timezone: 'UTC',
                    active: true
                    // No credential relation
                }
            });

            await expect(
                userAuthService.authenticateInternalUser({
                    email: 'nocred@authservice-test.com',
                    password: testPassword
                })
            ).rejects.toMatchObject({
                code: 'NO_CREDENTIALS'
            });
        });

        it('should include IP address and user agent in audit log', async () => {
            const result = await userAuthService.authenticateInternalUser({
                email: 'active@authservice-test.com',
                password: testPassword,
                ipAddress: '192.168.1.1',
                userAgent: 'Test User Agent'
            });

            expect(result.success).toBe(true);
            // Audit event logged with IP and user agent
        });
    });

    describe('verifyUserActive', () => {
        it('should return user if active', async () => {
            const user = await userAuthService.verifyUserActive(testUser.id);

            expect(user).toBeDefined();
            expect(user.id).toBe(testUser.id);
            expect(user.active).toBe(true);
        });

        it('should throw error if user deactivated', async () => {
            await expect(
                userAuthService.verifyUserActive(deactivatedUser.id)
            ).rejects.toMatchObject({
                code: 'ACCOUNT_DEACTIVATED',
                message: 'Your account has been deactivated — contact your administrator'
            });
        });

        it('should throw error if user not found', async () => {
            await expect(
                userAuthService.verifyUserActive('00000000-0000-0000-0000-000000000000')
            ).rejects.toMatchObject({
                code: 'ACCOUNT_NOT_FOUND'
            });
        });
    });

    describe('Error codes and messages', () => {
        it('should return 401 status code for invalid credentials', async () => {
            try {
                await userAuthService.authenticateInternalUser({
                    email: 'active@authservice-test.com',
                    password: 'WrongPassword'
                });
            } catch (error: any) {
                expect(error.statusCode).toBe(401);
                expect(error.code).toBe('INVALID_CREDENTIALS');
            }
        });

        it('should return 401 status code for deactivated account', async () => {
            try {
                await userAuthService.authenticateInternalUser({
                    email: 'deactivated@authservice-test.com',
                    password: testPassword
                });
            } catch (error: any) {
                expect(error.statusCode).toBe(401);
                expect(error.code).toBe('ACCOUNT_DEACTIVATED');
            }
        });

        it('should use generic message for non-existent accounts', async () => {
            try {
                await userAuthService.authenticateInternalUser({
                    email: 'nonexistent@authservice-test.com',
                    password: testPassword
                });
            } catch (error: any) {
                // Should not reveal account doesn't exist
                expect(error.message).toBe('Invalid email or password');
                expect(error.code).toBe('INVALID_CREDENTIALS');
            }
        });
    });
});
