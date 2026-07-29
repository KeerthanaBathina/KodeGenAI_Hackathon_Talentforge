/**
 * Integration Tests for Admin User Management API
 * 
 * Tests REST API endpoints for internal staff user management
 */

import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { UserRole } from '@prisma/client';
import { app } from '../../app';
import prisma from '../../db/prisma';
import { JwtService } from '../../services/jwtService';

describe('Admin User Management API', () => {
    let adminToken: string;
    let recruiterToken: string;
    let adminUserId: string;
    let recruiterUserId: string;

    beforeAll(async () => {
        // Clean up test data
        await prisma.userCredential.deleteMany({
            where: {
                user: {
                    email: {
                        contains: '@test-api.com'
                    }
                }
            }
        });
        await prisma.user.deleteMany({
            where: {
                email: {
                    contains: '@test-api.com'
                }
            }
        });

        // Create admin user
        const adminUser = await prisma.user.create({
            data: {
                email: 'admin@test-api.com',
                fullName: 'Test Admin',
                role: UserRole.admin,
                timezone: 'UTC',
                active: true
            }
        });
        adminUserId = adminUser.id;

        // Create recruiter user (non-admin)
        const recruiterUser = await prisma.user.create({
            data: {
                email: 'recruiter@test-api.com',
                fullName: 'Test Recruiter',
                role: UserRole.recruiter,
                timezone: 'UTC',
                active: true
            }
        });
        recruiterUserId = recruiterUser.id;

        // Generate tokens
        const jwtService = new JwtService();
        adminToken = jwtService.signAccessToken(adminUserId, UserRole.admin);
        recruiterToken = jwtService.signAccessToken(recruiterUserId, UserRole.recruiter);
    });

    afterAll(async () => {
        // Clean up test data
        await prisma.userCredential.deleteMany({
            where: {
                user: {
                    email: {
                        contains: '@test-api.com'
                    }
                }
            }
        });
        await prisma.user.deleteMany({
            where: {
                email: {
                    contains: '@test-api.com'
                }
            }
        });
        await prisma.$disconnect();
    });

    describe('POST /api/admin/users', () => {
        it('should create a new user with admin token', async () => {
            const response = await request(app)
                .post('/api/admin/users')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    email: 'newuser@test-api.com',
                    fullName: 'New User',
                    role: 'hr_reviewer',
                    timezone: 'America/New_York'
                });

            expect(response.status).toBe(201);
            expect(response.body.user).toBeDefined();
            expect(response.body.user.email).toBe('newuser@test-api.com');
            expect(response.body.user.fullName).toBe('New User');
            expect(response.body.user.role).toBe('hr_reviewer');
            expect(response.body.user.timezone).toBe('America/New_York');
            expect(response.body.user.active).toBe(true);
            expect(response.body.temporaryPassword).toBeDefined();
            expect(response.body.temporaryPassword.length).toBeGreaterThan(0);
        });

        it('should reject request without authentication', async () => {
            const response = await request(app)
                .post('/api/admin/users')
                .send({
                    email: 'noauth@test-api.com',
                    fullName: 'No Auth',
                    role: 'recruiter'
                });

            expect(response.status).toBe(401);
        });

        it('should reject request with non-admin token', async () => {
            const response = await request(app)
                .post('/api/admin/users')
                .set('Authorization', `Bearer ${recruiterToken}`)
                .send({
                    email: 'nonauth@test-api.com',
                    fullName: 'Non Admin',
                    role: 'recruiter'
                });

            expect(response.status).toBe(403);
        });

        it('should reject missing required fields', async () => {
            const response = await request(app)
                .post('/api/admin/users')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    email: 'incomplete@test-api.com'
                    // Missing fullName and role
                });

            expect(response.status).toBe(400);
            expect(response.body.error.code).toBe('VALIDATION_ERROR');
        });

        it('should reject duplicate email', async () => {
            const userPayload = {
                email: 'duplicate@test-api.com',
                fullName: 'Duplicate User',
                role: 'recruiter'
            };

            // Create first user
            await request(app)
                .post('/api/admin/users')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(userPayload);

            // Attempt to create duplicate
            const response = await request(app)
                .post('/api/admin/users')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(userPayload);

            expect(response.status).toBe(409);
            expect(response.body.error.code).toBe('DUPLICATE_EMAIL');
        });

        it('should reject invalid role', async () => {
            const response = await request(app)
                .post('/api/admin/users')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    email: 'invalidrole@test-api.com',
                    fullName: 'Invalid Role',
                    role: 'invalid_role'
                });

            expect(response.status).toBe(400);
            expect(response.body.error.code).toBe('INVALID_ROLE');
        });
    });

    describe('GET /api/admin/users', () => {
        beforeEach(async () => {
            // Create test users
            await request(app)
                .post('/api/admin/users')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    email: 'listuser1@test-api.com',
                    fullName: 'List User One',
                    role: 'recruiter'
                });

            await request(app)
                .post('/api/admin/users')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    email: 'listuser2@test-api.com',
                    fullName: 'List User Two',
                    role: 'hr_reviewer'
                });
        });

        it('should list all users with admin token', async () => {
            const response = await request(app)
                .get('/api/admin/users')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
            expect(response.body.users).toBeDefined();
            expect(Array.isArray(response.body.users)).toBe(true);
            expect(response.body.users.length).toBeGreaterThanOrEqual(2);
        });

        it('should filter users by role', async () => {
            const response = await request(app)
                .get('/api/admin/users?role=recruiter')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
            expect(response.body.users.length).toBeGreaterThan(0);
            response.body.users.forEach((user: any) => {
                expect(user.role).toBe('recruiter');
            });
        });

        it('should filter users by active status', async () => {
            const response = await request(app)
                .get('/api/admin/users?active=true')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
            expect(response.body.users.length).toBeGreaterThan(0);
            response.body.users.forEach((user: any) => {
                expect(user.active).toBe(true);
            });
        });

        it('should search users by email', async () => {
            const response = await request(app)
                .get('/api/admin/users?search=listuser1')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
            expect(response.body.users.length).toBeGreaterThan(0);
            expect(response.body.users[0].email).toContain('listuser1');
        });

        it('should reject request without authentication', async () => {
            const response = await request(app)
                .get('/api/admin/users');

            expect(response.status).toBe(401);
        });

        it('should reject request with non-admin token', async () => {
            const response = await request(app)
                .get('/api/admin/users')
                .set('Authorization', `Bearer ${recruiterToken}`);

            expect(response.status).toBe(403);
        });
    });

    describe('GET /api/admin/users/:id', () => {
        it('should get user by ID with admin token', async () => {
            // Create test user
            const createResponse = await request(app)
                .post('/api/admin/users')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    email: 'getbyid@test-api.com',
                    fullName: 'Get By ID User',
                    role: 'recruiter'
                });

            const userId = createResponse.body.user.id;

            const response = await request(app)
                .get(`/api/admin/users/${userId}`)
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
            expect(response.body.user).toBeDefined();
            expect(response.body.user.id).toBe(userId);
            expect(response.body.user.email).toBe('getbyid@test-api.com');
        });

        it('should return 404 for non-existent user', async () => {
            const response = await request(app)
                .get('/api/admin/users/00000000-0000-0000-0000-000000000000')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(404);
            expect(response.body.error.code).toBe('USER_NOT_FOUND');
        });

        it('should reject request without authentication', async () => {
            const response = await request(app)
                .get(`/api/admin/users/${adminUserId}`);

            expect(response.status).toBe(401);
        });

        it('should reject request with non-admin token', async () => {
            const response = await request(app)
                .get(`/api/admin/users/${adminUserId}`)
                .set('Authorization', `Bearer ${recruiterToken}`);

            expect(response.status).toBe(403);
        });
    });

    describe('PATCH /api/admin/users/:id/role', () => {
        it('should update user role with admin token', async () => {
            // Create test user
            const createResponse = await request(app)
                .post('/api/admin/users')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    email: 'updaterole@test-api.com',
                    fullName: 'Update Role User',
                    role: 'recruiter'
                });

            const userId = createResponse.body.user.id;

            const response = await request(app)
                .patch(`/api/admin/users/${userId}/role`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ role: 'hr_reviewer' });

            expect(response.status).toBe(200);
            expect(response.body.user.role).toBe('hr_reviewer');
        });

        it('should prevent admin from changing their own role', async () => {
            const response = await request(app)
                .patch(`/api/admin/users/${adminUserId}/role`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ role: 'recruiter' });

            expect(response.status).toBe(403);
            expect(response.body.error.code).toBe('SELF_MODIFICATION_FORBIDDEN');
        });

        it('should reject missing role field', async () => {
            const response = await request(app)
                .patch(`/api/admin/users/${recruiterUserId}/role`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({});

            expect(response.status).toBe(400);
            expect(response.body.error.code).toBe('VALIDATION_ERROR');
        });

        it('should reject invalid role', async () => {
            const response = await request(app)
                .patch(`/api/admin/users/${recruiterUserId}/role`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ role: 'invalid_role' });

            expect(response.status).toBe(400);
            expect(response.body.error.code).toBe('INVALID_ROLE');
        });

        it('should return 404 for non-existent user', async () => {
            const response = await request(app)
                .patch('/api/admin/users/00000000-0000-0000-0000-000000000000/role')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ role: 'recruiter' });

            expect(response.status).toBe(404);
        });
    });

    describe('PATCH /api/admin/users/:id/deactivate', () => {
        it('should deactivate user with admin token', async () => {
            // Create test user
            const createResponse = await request(app)
                .post('/api/admin/users')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    email: 'deactivate@test-api.com',
                    fullName: 'Deactivate User',
                    role: 'recruiter'
                });

            const userId = createResponse.body.user.id;

            const response = await request(app)
                .patch(`/api/admin/users/${userId}/deactivate`)
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
            expect(response.body.user.active).toBe(false);
        });

        it('should prevent admin from deactivating their own account', async () => {
            const response = await request(app)
                .patch(`/api/admin/users/${adminUserId}/deactivate`)
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(403);
            expect(response.body.error.code).toBe('SELF_MODIFICATION_FORBIDDEN');
            expect(response.body.error.message).toContain('cannot deactivate their own account');
        });

        it('should return 404 for non-existent user', async () => {
            const response = await request(app)
                .patch('/api/admin/users/00000000-0000-0000-0000-000000000000/deactivate')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(404);
        });
    });

    describe('PATCH /api/admin/users/:id/reactivate', () => {
        it('should reactivate deactivated user with admin token', async () => {
            // Create and deactivate test user
            const createResponse = await request(app)
                .post('/api/admin/users')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    email: 'reactivate@test-api.com',
                    fullName: 'Reactivate User',
                    role: 'recruiter'
                });

            const userId = createResponse.body.user.id;

            // Deactivate
            await request(app)
                .patch(`/api/admin/users/${userId}/deactivate`)
                .set('Authorization', `Bearer ${adminToken}`);

            // Reactivate
            const response = await request(app)
                .patch(`/api/admin/users/${userId}/reactivate`)
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
            expect(response.body.user.active).toBe(true);
        });

        it('should return 404 for non-existent user', async () => {
            const response = await request(app)
                .patch('/api/admin/users/00000000-0000-0000-0000-000000000000/reactivate')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(404);
        });
    });
});
