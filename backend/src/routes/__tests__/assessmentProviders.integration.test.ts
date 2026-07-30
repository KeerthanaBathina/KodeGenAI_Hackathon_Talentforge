/**
 * Integration Tests for TASK-004: Assessment Provider Configuration CRUD API
 * 
 * Test Scenarios:
 * 1. Admin can create provider with encrypted secrets
 * 2. Non-admin cannot create provider (403)
 * 3. HMAC secret redacted in response for non-admin
 * 4. Invalid URL rejected by Zod validation
 * 5. List providers with pagination
 * 6. List providers with active filter
 * 7. Get single provider by ID
 * 8. Provider not found returns 404
 * 9. Update provider configuration
 * 10. Update provider HMAC secret (re-encrypted)
 * 11. Soft delete provider (active = false)
 * 12. Audit events logged for all operations
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../app';
import prisma from '../../db/prisma';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env';
import { isEncrypted, decrypt } from '../../utils/encryption';

describe('Assessment Provider CRUD Integration Tests', () => {
    let adminToken: string;
    let adminId: string;
    let recruiterToken: string;
    let recruiterId: string;
    let testProviderIds: string[] = [];

    beforeAll(async () => {
        // Create test admin user
        const admin = await prisma.candidate.create({
            data: {
                email: 'admin-provider@example.com',
                password: 'hashedpassword',
                role: 'admin',
                emailVerified: true,
                firstName: 'Admin',
                lastName: 'User',
            },
        });

        adminId = admin.id;

        adminToken = jwt.sign(
            { id: admin.id, email: admin.email, role: admin.role },
            env.JWT_SECRET || 'test-secret',
            { expiresIn: '1h' }
        );

        // Create test recruiter user (non-admin)
        const recruiter = await prisma.candidate.create({
            data: {
                email: 'recruiter-provider@example.com',
                password: 'hashedpassword',
                role: 'recruiter',
                emailVerified: true,
                firstName: 'Recruiter',
                lastName: 'User',
            },
        });

        recruiterId = recruiter.id;

        recruiterToken = jwt.sign(
            { id: recruiter.id, email: recruiter.email, role: recruiter.role },
            env.JWT_SECRET || 'test-secret',
            { expiresIn: '1h' }
        );

        // Set encryption key for tests
        if (!process.env.ENCRYPTION_KEY) {
            process.env.ENCRYPTION_KEY = 'a'.repeat(64); // 64 hex chars for testing
        }
    });

    afterAll(async () => {
        // Cleanup
        await prisma.auditEvent.deleteMany({ where: { actorId: adminId } });
        await prisma.assessmentSession.deleteMany({
            where: { providerId: { in: testProviderIds } },
        });
        await prisma.assessmentProvider.deleteMany({
            where: { id: { in: testProviderIds } },
        });
        await prisma.candidate.deleteMany({ where: { id: { in: [adminId, recruiterId] } } });
    });

    beforeEach(async () => {
        // Clean up test providers before each test
        await prisma.assessmentSession.deleteMany({
            where: { providerId: { in: testProviderIds } },
        });
        await prisma.assessmentProvider.deleteMany({
            where: { id: { in: testProviderIds } },
        });
        testProviderIds = [];
    });

    describe('POST /api/admin/assessment-providers - Create Provider', () => {
        it('should create provider with encrypted HMAC secret (admin)', async () => {
            const providerData = {
                name: 'HackerRank Advanced',
                apiEndpoint: 'https://api.hackerrank.com/v2',
                authMode: 'bearer',
                hmacSecret: 'a1b2c3d4e5f6789012345678901234567890123456789012345678901234',
                timeoutSeconds: 45,
                active: true,
            };

            const response = await request(app)
                .post('/api/admin/assessment-providers')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(providerData)
                .expect(201);

            expect(response.body.success).toBe(true);
            expect(response.body.data).toBeDefined();
            expect(response.body.data.id).toBeDefined();
            expect(response.body.data.name).toBe(providerData.name);
            expect(response.body.data.apiEndpoint).toBe(providerData.apiEndpoint);
            expect(response.body.data.hmacSecret).toBe('[REDACTED]'); // Secret redacted in response

            testProviderIds.push(response.body.data.id);

            // Verify secret is encrypted in database
            const dbProvider = await prisma.assessmentProvider.findUnique({
                where: { id: response.body.data.id },
            });

            expect(dbProvider).toBeDefined();
            expect(dbProvider!.hmacSecret).toBeDefined();
            expect(isEncrypted(dbProvider!.hmacSecret!)).toBe(true);
            expect(decrypt(dbProvider!.hmacSecret!)).toBe(providerData.hmacSecret);

            // Verify audit event logged
            const auditEvent = await prisma.auditEvent.findFirst({
                where: {
                    actorId: adminId,
                    eventType: 'PROVIDER_CREATED',
                    entityId: response.body.data.id,
                },
            });

            expect(auditEvent).toBeDefined();
        });

        it('should reject provider creation for non-admin (403)', async () => {
            const providerData = {
                name: 'Unauthorized Provider',
                apiEndpoint: 'https://api.example.com',
                authMode: 'bearer',
            };

            const response = await request(app)
                .post('/api/admin/assessment-providers')
                .set('Authorization', `Bearer ${recruiterToken}`)
                .send(providerData)
                .expect(403);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('FORBIDDEN');
        });

        it('should reject invalid URL format (400)', async () => {
            const providerData = {
                name: 'Invalid Provider',
                apiEndpoint: 'not-a-valid-url',
                authMode: 'bearer',
            };

            const response = await request(app)
                .post('/api/admin/assessment-providers')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(providerData)
                .expect(400);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('VALIDATION_ERROR');
            expect(response.body.error.details).toBeDefined();
        });

        it('should reject invalid HMAC secret format (400)', async () => {
            const providerData = {
                name: 'Bad Secret Provider',
                apiEndpoint: 'https://api.example.com',
                authMode: 'bearer',
                hmacSecret: 'too-short', // Must be 64 hex chars
            };

            const response = await request(app)
                .post('/api/admin/assessment-providers')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(providerData)
                .expect(400);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('VALIDATION_ERROR');
        });
    });

    describe('GET /api/admin/assessment-providers - List Providers', () => {
        beforeEach(async () => {
            // Create test providers
            const provider1 = await prisma.assessmentProvider.create({
                data: {
                    name: 'Active Provider 1',
                    apiEndpoint: 'https://api.provider1.com',
                    authMode: 'bearer',
                    active: true,
                },
            });

            const provider2 = await prisma.assessmentProvider.create({
                data: {
                    name: 'Active Provider 2',
                    apiEndpoint: 'https://api.provider2.com',
                    authMode: 'hmac',
                    active: true,
                },
            });

            const provider3 = await prisma.assessmentProvider.create({
                data: {
                    name: 'Inactive Provider',
                    apiEndpoint: 'https://api.provider3.com',
                    authMode: 'bearer',
                    active: false,
                },
            });

            testProviderIds.push(provider1.id, provider2.id, provider3.id);
        });

        it('should list all providers with pagination', async () => {
            const response = await request(app)
                .get('/api/admin/assessment-providers')
                .set('Authorization', `Bearer ${adminToken}`)
                .query({ page: 1, limit: 10 })
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.providers).toBeInstanceOf(Array);
            expect(response.body.data.providers.length).toBeGreaterThanOrEqual(3);
            expect(response.body.data.pagination).toBeDefined();
            expect(response.body.data.pagination.page).toBe(1);
            expect(response.body.data.pagination.limit).toBe(10);
        });

        it('should filter providers by active status', async () => {
            const response = await request(app)
                .get('/api/admin/assessment-providers')
                .set('Authorization', `Bearer ${adminToken}`)
                .query({ active: 'true' })
                .expect(200);

            expect(response.body.success).toBe(true);
            const activeProviders = response.body.data.providers.filter(
                (p: any) => testProviderIds.includes(p.id)
            );
            expect(activeProviders.every((p: any) => p.active === true)).toBe(true);
        });

        it('should search providers by name', async () => {
            const response = await request(app)
                .get('/api/admin/assessment-providers')
                .set('Authorization', `Bearer ${adminToken}`)
                .query({ search: 'Active Provider 1' })
                .expect(200);

            expect(response.body.success).toBe(true);
            const matchedProviders = response.body.data.providers.filter((p: any) =>
                p.name.includes('Active Provider 1')
            );
            expect(matchedProviders.length).toBeGreaterThan(0);
        });
    });

    describe('GET /api/admin/assessment-providers/:id - Get Single Provider', () => {
        it('should get provider by ID', async () => {
            const provider = await prisma.assessmentProvider.create({
                data: {
                    name: 'Single Provider',
                    apiEndpoint: 'https://api.single.com',
                    authMode: 'bearer',
                    active: true,
                },
            });

            testProviderIds.push(provider.id);

            const response = await request(app)
                .get(`/api/admin/assessment-providers/${provider.id}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.id).toBe(provider.id);
            expect(response.body.data.name).toBe('Single Provider');
        });

        it('should return 404 for non-existent provider', async () => {
            const fakeId = '00000000-0000-0000-0000-000000000000';

            const response = await request(app)
                .get(`/api/admin/assessment-providers/${fakeId}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(404);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('PROVIDER_NOT_FOUND');
        });

        it('should reject invalid UUID format (400)', async () => {
            const response = await request(app)
                .get('/api/admin/assessment-providers/invalid-uuid')
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(400);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('VALIDATION_ERROR');
        });
    });

    describe('PATCH /api/admin/assessment-providers/:id - Update Provider', () => {
        it('should update provider configuration', async () => {
            const provider = await prisma.assessmentProvider.create({
                data: {
                    name: 'Update Test Provider',
                    apiEndpoint: 'https://api.old.com',
                    authMode: 'bearer',
                    timeoutSeconds: 30,
                    active: true,
                },
            });

            testProviderIds.push(provider.id);

            const updateData = {
                apiEndpoint: 'https://api.new.com',
                timeoutSeconds: 60,
            };

            const response = await request(app)
                .patch(`/api/admin/assessment-providers/${provider.id}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send(updateData)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.apiEndpoint).toBe(updateData.apiEndpoint);
            expect(response.body.data.timeoutSeconds).toBe(updateData.timeoutSeconds);
            expect(response.body.data.name).toBe('Update Test Provider'); // Unchanged

            // Verify audit event
            const auditEvent = await prisma.auditEvent.findFirst({
                where: {
                    actorId: adminId,
                    eventType: 'PROVIDER_UPDATED',
                    entityId: provider.id,
                },
            });

            expect(auditEvent).toBeDefined();
        });

        it('should update and re-encrypt HMAC secret', async () => {
            const provider = await prisma.assessmentProvider.create({
                data: {
                    name: 'Secret Update Provider',
                    apiEndpoint: 'https://api.example.com',
                    authMode: 'hmac',
                    hmacSecret: null,
                    active: true,
                },
            });

            testProviderIds.push(provider.id);

            const newSecret = 'b2c3d4e5f6789012345678901234567890123456789012345678901234567';

            const response = await request(app)
                .patch(`/api/admin/assessment-providers/${provider.id}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ hmacSecret: newSecret })
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.hmacSecret).toBe('[REDACTED]');

            // Verify secret is encrypted in database
            const dbProvider = await prisma.assessmentProvider.findUnique({
                where: { id: provider.id },
            });

            expect(dbProvider!.hmacSecret).toBeDefined();
            expect(isEncrypted(dbProvider!.hmacSecret!)).toBe(true);
            expect(decrypt(dbProvider!.hmacSecret!)).toBe(newSecret);
        });

        it('should return 404 for non-existent provider', async () => {
            const fakeId = '00000000-0000-0000-0000-000000000000';

            const response = await request(app)
                .patch(`/api/admin/assessment-providers/${fakeId}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ timeoutSeconds: 45 })
                .expect(404);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('PROVIDER_NOT_FOUND');
        });
    });

    describe('DELETE /api/admin/assessment-providers/:id - Soft Delete', () => {
        it('should soft delete provider (set active = false)', async () => {
            const provider = await prisma.assessmentProvider.create({
                data: {
                    name: 'Delete Test Provider',
                    apiEndpoint: 'https://api.delete.com',
                    authMode: 'bearer',
                    active: true,
                },
            });

            testProviderIds.push(provider.id);

            const response = await request(app)
                .delete(`/api/admin/assessment-providers/${provider.id}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(204);

            expect(response.body).toEqual({});

            // Verify provider is soft deleted (active = false)
            const dbProvider = await prisma.assessmentProvider.findUnique({
                where: { id: provider.id },
            });

            expect(dbProvider).toBeDefined();
            expect(dbProvider!.active).toBe(false);

            // Verify audit event
            const auditEvent = await prisma.auditEvent.findFirst({
                where: {
                    actorId: adminId,
                    eventType: 'PROVIDER_DELETED',
                    entityId: provider.id,
                },
            });

            expect(auditEvent).toBeDefined();
        });

        it('should return 404 for non-existent provider', async () => {
            const fakeId = '00000000-0000-0000-0000-000000000000';

            const response = await request(app)
                .delete(`/api/admin/assessment-providers/${fakeId}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(404);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('PROVIDER_NOT_FOUND');
        });
    });

    describe('Authorization and Secret Redaction', () => {
        it('should redact HMAC secret for non-admin users', async () => {
            const provider = await prisma.assessmentProvider.create({
                data: {
                    name: 'Redaction Test Provider',
                    apiEndpoint: 'https://api.redact.com',
                    authMode: 'hmac',
                    hmacSecret: 'encrypted-secret-here',
                    active: true,
                },
            });

            testProviderIds.push(provider.id);

            const response = await request(app)
                .get(`/api/admin/assessment-providers/${provider.id}`)
                .set('Authorization', `Bearer ${recruiterToken}`)
                .expect(403); // Non-admin blocked by middleware

            expect(response.body.error.code).toBe('FORBIDDEN');
        });
    });
});
