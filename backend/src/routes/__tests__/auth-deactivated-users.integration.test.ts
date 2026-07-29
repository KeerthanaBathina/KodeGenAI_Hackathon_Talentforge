/**
 * Integration Tests for Login with Deactivated Users
 * 
 * Tests that deactivated users cannot log in
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { UserRole } from '@prisma/client';
import bcrypt from 'bcrypt';
import { app } from '../../app';
import prisma from '../../db/prisma';

describe('Login Integration - Deactivated Users', () => {
    const testPassword = 'TestPassword123!';
    let hashedPassword: string;
    let activeUser: any;
    let deactivatedUser: any;

    beforeAll(async () => {
        // Hash test password
        hashedPassword = await bcrypt.hash(testPassword, 12);

        // Clean up test data
        await prisma.userCredential.deleteMany({
            where: {
                user: {
                    email: {
                        contains: '@login-integration-test.com'
                    }
                }
            }
        });
        await prisma.user.deleteMany({
            where: {
                email: {
                    contains: '@login-integration-test.com'
                }
            }
        });

        // Create active user with credentials
        activeUser = await prisma.user.create({
            data: {
                email: 'active-login@login-integration-test.com',
                fullName: 'Active Login User',
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

        // Create deactivated user with credentials
        deactivatedUser = await prisma.user.create({
            data: {
                email: 'deactivated-login@login-integration-test.com',
                fullName: 'Deactivated Login User',
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
                        contains: '@login-integration-test.com'
                    }
                }
            }
        });
        await prisma.user.deleteMany({
            where: {
                email: {
                    contains: '@login-integration-test.com'
                }
            }
        });
        await prisma.$disconnect();
    });

    describe('POST /api/auth/login', () => {
        it('should allow active user to login', async () => {
            const response = await request(app)
                .post('/api/auth/login')
                .send({
                    email: 'active-login@login-integration-test.com',
                    password: testPassword
                });

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.message).toBe('Login successful');
            expect(response.body.data.user).toBeDefined();
            expect(response.body.data.user.email).toBe('active-login@login-integration-test.com');
            expect(response.body.data.user.role).toBe(UserRole.recruiter);
            expect(response.body.data.user.active).toBe(true);
            expect(response.body.data.redirectTo).toBeDefined();
        });

        it('should reject deactivated user with specific error message', async () => {
            const response = await request(app)
                .post('/api/auth/login')
                .send({
                    email: 'deactivated-login@login-integration-test.com',
                    password: testPassword
                });

            expect(response.status).toBe(401);
            expect(response.body.error).toBeDefined();
            expect(response.body.error.code).toBe('ACCOUNT_DEACTIVATED');
            expect(response.body.error.message).toBe('Your account has been deactivated — contact your administrator');
        });

        it('should not create session cookie for deactivated user', async () => {
            const response = await request(app)
                .post('/api/auth/login')
                .send({
                    email: 'deactivated-login@login-integration-test.com',
                    password: testPassword
                });

            expect(response.status).toBe(401);
            expect(response.headers['set-cookie']).toBeUndefined();
        });

        it('should return role in login response for active user', async () => {
            const response = await request(app)
                .post('/api/auth/login')
                .send({
                    email: 'active-login@login-integration-test.com',
                    password: testPassword
                });

            expect(response.status).toBe(200);
            expect(response.body.data.user.role).toBe(UserRole.recruiter);
        });

        it('should return redirectTo based on user role', async () => {
            const response = await request(app)
                .post('/api/auth/login')
                .send({
                    email: 'active-login@login-integration-test.com',
                    password: testPassword
                });

            expect(response.status).toBe(200);
            expect(response.body.data.redirectTo).toBe('/recruiter/requisitions');
        });

        it('should handle admin login with proper redirect', async () => {
            // Create admin user
            const adminPassword = 'AdminPassword123!';
            const adminHashedPassword = await bcrypt.hash(adminPassword, 12);
            
            const adminUser = await prisma.user.create({
                data: {
                    email: 'admin-login@login-integration-test.com',
                    fullName: 'Admin Login User',
                    role: UserRole.admin,
                    timezone: 'UTC',
                    active: true,
                    credential: {
                        create: {
                            passwordHash: adminHashedPassword
                        }
                    }
                }
            });

            const response = await request(app)
                .post('/api/auth/login')
                .send({
                    email: 'admin-login@login-integration-test.com',
                    password: adminPassword
                });

            expect(response.status).toBe(200);
            expect(response.body.data.user.role).toBe(UserRole.admin);
            expect(response.body.data.redirectTo).toBe('/admin/dashboard');
        });
    });

    describe('Authenticated requests with deactivated user', () => {
        it('should fail authenticated request after user is deactivated', async () => {
            // Login as active user
            const loginResponse = await request(app)
                .post('/api/auth/login')
                .send({
                    email: 'active-login@login-integration-test.com',
                    password: testPassword
                });

            expect(loginResponse.status).toBe(200);

            // Extract cookie
            const cookies = loginResponse.headers['set-cookie'];
            expect(cookies).toBeDefined();

            // Make authenticated request - should succeed
            const firstRequest = await request(app)
                .get('/api/admin/users')
                .set('Cookie', cookies);

            // May fail with 403 if not admin, but should not be 401 (deactivated)
            expect(firstRequest.status).not.toBe(401);

            // Deactivate user
            await prisma.user.update({
                where: { id: activeUser.id },
                data: { active: false }
            });

            // Make another authenticated request - should now fail with deactivated error
            const secondRequest = await request(app)
                .get('/api/admin/users')
                .set('Cookie', cookies);

            expect(secondRequest.status).toBe(401);
            expect(secondRequest.body.error.code).toBe('ACCOUNT_DEACTIVATED');
            expect(secondRequest.body.error.message).toBe('Your account has been deactivated — contact your administrator');

            // Reactivate user for other tests
            await prisma.user.update({
                where: { id: activeUser.id },
                data: { active: true }
            });
        });
    });

    describe('Role change on next login', () => {
        it('should use new role after role change and re-login', async () => {
            // Login with original role
            const firstLogin = await request(app)
                .post('/api/auth/login')
                .send({
                    email: 'active-login@login-integration-test.com',
                    password: testPassword
                });

            expect(firstLogin.status).toBe(200);
            expect(firstLogin.body.data.user.role).toBe(UserRole.recruiter);

            // Change role
            await prisma.user.update({
                where: { id: activeUser.id },
                data: { role: UserRole.hr_reviewer }
            });

            // Login again
            const secondLogin = await request(app)
                .post('/api/auth/login')
                .send({
                    email: 'active-login@login-integration-test.com',
                    password: testPassword
                });

            expect(secondLogin.status).toBe(200);
            expect(secondLogin.body.data.user.role).toBe(UserRole.hr_reviewer);
            expect(secondLogin.body.data.redirectTo).toBe('/hr/dashboard');

            // Restore original role
            await prisma.user.update({
                where: { id: activeUser.id },
                data: { role: UserRole.recruiter }
            });
        });
    });

    describe('Error message consistency', () => {
        it('should return exact error message for deactivated account', async () => {
            const response = await request(app)
                .post('/api/auth/login')
                .send({
                    email: 'deactivated-login@login-integration-test.com',
                    password: testPassword
                });

            expect(response.body.error.message).toBe('Your account has been deactivated — contact your administrator');
        });

        it('should not reveal account existence for invalid credentials', async () => {
            const response = await request(app)
                .post('/api/auth/login')
                .send({
                    email: 'nonexistent@login-integration-test.com',
                    password: testPassword
                });

            expect(response.status).toBe(401);
            expect(response.body.error.message).toBe('Invalid email or password');
        });
    });
});
