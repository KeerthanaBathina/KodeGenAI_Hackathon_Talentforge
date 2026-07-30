/**
 * Integration Tests for Assessment Score Webhook Endpoint
 * 
 * Tests complete webhook flow from HTTP request through HMAC validation,
 * payload validation, idempotency checking, score storage, and audit events.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../app';
import prisma from '../../db/prisma';
import { computeHmacSignature } from '../../utils/hmac';

const app = createApp();

describe('Assessment Score Webhook Endpoint Integration Tests', () => {
    let providerId: string;
    let hmacSecret: string;
    let sessionToken1: string;
    let sessionToken2: string;
    let applicationId1: string;
    let applicationId2: string;

    beforeAll(async () => {
        // Create test provider
        const provider = await prisma.assessmentProvider.create({
            data: {
                name: 'TestProvider',
                apiEndpoint: 'https://test.example.com',
                authMode: 'hmac',
                hmacSecret: 'webhook-integration-test-secret',
                timeoutSeconds: 30,
                active: true,
            },
        });
        providerId = provider.id;
        hmacSecret = provider.hmacSecret!;

        // Create test candidates
        const candidate1 = await prisma.candidate.create({
            data: {
                email: `webhook-endpoint-test-1-${Date.now()}@example.com`,
                password: 'hashed',
                firstName: 'Test',
                lastName: 'Candidate1',
                role: 'candidate',
            },
        });

        const candidate2 = await prisma.candidate.create({
            data: {
                email: `webhook-endpoint-test-2-${Date.now()}@example.com`,
                password: 'hashed',
                firstName: 'Test',
                lastName: 'Candidate2',
                role: 'candidate',
            },
        });

        // Create test requisition
        const requisition = await prisma.requisition.create({
            data: {
                title: 'Test Position',
                department: 'Engineering',
                jobFamilyId: '00000000-0000-0000-0000-000000000001',
                status: 'open',
            },
        });

        // Create applications
        const application1 = await prisma.application.create({
            data: {
                candidateId: candidate1.id,
                requisitionId: requisition.id,
                status: 'assessment_pending',
            },
        });
        applicationId1 = application1.id;

        const application2 = await prisma.application.create({
            data: {
                candidateId: candidate2.id,
                requisitionId: requisition.id,
                status: 'assessment_pending',
            },
        });
        applicationId2 = application2.id;

        // Create assessment sessions
        const session1 = await prisma.assessmentSession.create({
            data: {
                applicationId: application1.id,
                providerId: provider.id,
                sessionToken: `sess_webhook_endpoint_${Date.now()}_1`,
                testUrl: 'https://test.example.com/test1',
                status: 'in_progress',
                launchedAt: new Date(),
            },
        });
        sessionToken1 = session1.sessionToken;

        const session2 = await prisma.assessmentSession.create({
            data: {
                applicationId: application2.id,
                providerId: provider.id,
                sessionToken: `sess_webhook_endpoint_${Date.now()}_2`,
                testUrl: 'https://test.example.com/test2',
                status: 'in_progress',
                launchedAt: new Date(),
            },
        });
        sessionToken2 = session2.sessionToken;
    });

    afterAll(async () => {
        // Cleanup
        await prisma.auditEvent.deleteMany({
            where: { entityType: 'webhook' },
        });
        await prisma.assessmentSession.deleteMany({
            where: { providerId },
        });
        await prisma.application.deleteMany({
            where: {
                OR: [
                    { id: applicationId1 },
                    { id: applicationId2 },
                ],
            },
        });
        await prisma.assessmentProvider.deleteMany({
            where: { id: providerId },
        });
        await prisma.requisition.deleteMany({});
        await prisma.candidate.deleteMany({
            where: {
                email: {
                    contains: 'webhook-endpoint-test',
                },
            },
        });
    });

    beforeEach(async () => {
        // Reset session status before each test
        await prisma.assessmentSession.updateMany({
            where: {
                sessionToken: {
                    in: [sessionToken1, sessionToken2],
                },
            },
            data: {
                status: 'in_progress',
                score: null,
                completedAt: null,
                metadata: {},
            },
        });

        // Clean up audit events
        await prisma.auditEvent.deleteMany({
            where: { entityType: 'webhook' },
        });
    });

    describe('Successful webhook processing', () => {
        it('should process valid webhook with correct HMAC signature', async () => {
            const payload = {
                sessionToken: sessionToken1,
                score: 85,
                completedAt: '2026-07-27T12:00:00Z',
                metadata: {
                    testType: 'coding',
                    duration: 3600,
                },
            };

            const rawBody = JSON.stringify(payload);
            const signature = computeHmacSignature(rawBody, hmacSecret);

            const response = await request(app)
                .post('/api/webhooks/assessment-score')
                .set('Content-Type', 'application/json')
                .set('X-Signature-HMAC-SHA256', signature)
                .send(rawBody);

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.duplicate).toBe(false);
            expect(response.body.sessionId).toBeTruthy();
            expect(response.body.applicationId).toBe(applicationId1);

            // Verify database state
            const session = await prisma.assessmentSession.findUnique({
                where: { sessionToken: sessionToken1 },
            });

            expect(session).toBeTruthy();
            expect(session!.status).toBe('completed');
            expect(session!.score).toBe(85);
            expect(session!.completedAt).toBeTruthy();

            // Verify audit event created
            const auditEvent = await prisma.auditEvent.findFirst({
                where: {
                    eventType: 'webhook_received',
                    entityType: 'webhook',
                },
                orderBy: { timestamp: 'desc' },
            });

            expect(auditEvent).toBeTruthy();
        });

        it('should return duplicate flag on second delivery', async () => {
            const payload = {
                sessionToken: sessionToken2,
                score: 90,
                completedAt: '2026-07-27T13:00:00Z',
            };

            const rawBody = JSON.stringify(payload);
            const signature = computeHmacSignature(rawBody, hmacSecret);

            // First delivery
            const response1 = await request(app)
                .post('/api/webhooks/assessment-score')
                .set('Content-Type', 'application/json')
                .set('X-Signature-HMAC-SHA256', signature)
                .send(rawBody);

            expect(response1.status).toBe(200);
            expect(response1.body.duplicate).toBe(false);

            // Second delivery (duplicate)
            const response2 = await request(app)
                .post('/api/webhooks/assessment-score')
                .set('Content-Type', 'application/json')
                .set('X-Signature-HMAC-SHA256', signature)
                .send(rawBody);

            expect(response2.status).toBe(200);
            expect(response2.body.duplicate).toBe(true);
            expect(response2.body.message).toContain('already processed');

            // Verify database unchanged
            const session = await prisma.assessmentSession.findUnique({
                where: { sessionToken: sessionToken2 },
            });

            expect(session!.score).toBe(90); // Original score preserved
        });
    });

    describe('Authentication errors', () => {
        it('should reject webhook with missing HMAC signature', async () => {
            const payload = {
                sessionToken: sessionToken1,
                score: 85,
                completedAt: '2026-07-27T12:00:00Z',
            };

            const response = await request(app)
                .post('/api/webhooks/assessment-score')
                .set('Content-Type', 'application/json')
                .send(payload);

            expect(response.status).toBe(401);
            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('MISSING_SIGNATURE');
        });

        it('should reject webhook with invalid HMAC signature', async () => {
            const payload = {
                sessionToken: sessionToken1,
                score: 85,
                completedAt: '2026-07-27T12:00:00Z',
            };

            const rawBody = JSON.stringify(payload);
            const validSignature = computeHmacSignature(rawBody, hmacSecret);
            const invalidSignature = validSignature.replace(/a/g, 'b');

            const response = await request(app)
                .post('/api/webhooks/assessment-score')
                .set('Content-Type', 'application/json')
                .set('X-Signature-HMAC-SHA256', invalidSignature)
                .send(rawBody);

            expect(response.status).toBe(401);
            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('INVALID_SIGNATURE');
        });
    });

    describe('Validation errors', () => {
        it('should reject webhook with missing sessionToken', async () => {
            const payload = {
                score: 85,
                completedAt: '2026-07-27T12:00:00Z',
            };

            const rawBody = JSON.stringify(payload);
            const signature = computeHmacSignature(rawBody, hmacSecret);

            const response = await request(app)
                .post('/api/webhooks/assessment-score')
                .set('Content-Type', 'application/json')
                .set('X-Signature-HMAC-SHA256', signature)
                .send(rawBody);

            expect(response.status).toBe(400);
            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('VALIDATION_ERROR');
            expect(response.body.error.details).toBeTruthy();
        });

        it('should reject webhook with invalid score', async () => {
            const payload = {
                sessionToken: sessionToken1,
                score: 150, // Exceeds max
                completedAt: '2026-07-27T12:00:00Z',
            };

            const rawBody = JSON.stringify(payload);
            const signature = computeHmacSignature(rawBody, hmacSecret);

            const response = await request(app)
                .post('/api/webhooks/assessment-score')
                .set('Content-Type', 'application/json')
                .set('X-Signature-HMAC-SHA256', signature)
                .send(rawBody);

            expect(response.status).toBe(400);
            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('VALIDATION_ERROR');
        });

        it('should reject webhook with invalid datetime format', async () => {
            const payload = {
                sessionToken: sessionToken1,
                score: 85,
                completedAt: 'invalid-date',
            };

            const rawBody = JSON.stringify(payload);
            const signature = computeHmacSignature(rawBody, hmacSecret);

            const response = await request(app)
                .post('/api/webhooks/assessment-score')
                .set('Content-Type', 'application/json')
                .set('X-Signature-HMAC-SHA256', signature)
                .send(rawBody);

            expect(response.status).toBe(400);
            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('VALIDATION_ERROR');
        });
    });

    describe('Not found errors', () => {
        it('should return 404 for nonexistent session token', async () => {
            const payload = {
                sessionToken: 'sess_nonexistent_12345',
                score: 85,
                completedAt: '2026-07-27T12:00:00Z',
            };

            const rawBody = JSON.stringify(payload);
            const signature = computeHmacSignature(rawBody, hmacSecret);

            const response = await request(app)
                .post('/api/webhooks/assessment-score')
                .set('Content-Type', 'application/json')
                .set('X-Signature-HMAC-SHA256', signature)
                .send(rawBody);

            expect(response.status).toBe(404);
            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('SESSION_NOT_FOUND');
        });
    });

    describe('Audit trail', () => {
        it('should create audit event on successful webhook processing', async () => {
            const payload = {
                sessionToken: sessionToken1,
                score: 85,
                completedAt: '2026-07-27T12:00:00Z',
            };

            const rawBody = JSON.stringify(payload);
            const signature = computeHmacSignature(rawBody, hmacSecret);

            await request(app)
                .post('/api/webhooks/assessment-score')
                .set('Content-Type', 'application/json')
                .set('X-Signature-HMAC-SHA256', signature)
                .send(rawBody);

            const auditEvent = await prisma.auditEvent.findFirst({
                where: {
                    eventType: 'webhook_received',
                    entityType: 'webhook',
                },
                orderBy: { timestamp: 'desc' },
            });

            expect(auditEvent).toBeTruthy();
            expect(auditEvent!.payloadJson).toMatchObject({
                payload: expect.objectContaining({
                    sessionToken: sessionToken1,
                    score: 85,
                }),
            });
        });

        it('should create audit event on duplicate webhook', async () => {
            const payload = {
                sessionToken: sessionToken2,
                score: 90,
                completedAt: '2026-07-27T13:00:00Z',
            };

            const rawBody = JSON.stringify(payload);
            const signature = computeHmacSignature(rawBody, hmacSecret);

            // First delivery
            await request(app)
                .post('/api/webhooks/assessment-score')
                .set('Content-Type', 'application/json')
                .set('X-Signature-HMAC-SHA256', signature)
                .send(rawBody);

            // Second delivery (duplicate)
            await request(app)
                .post('/api/webhooks/assessment-score')
                .set('Content-Type', 'application/json')
                .set('X-Signature-HMAC-SHA256', signature)
                .send(rawBody);

            const duplicateAuditEvent = await prisma.auditEvent.findFirst({
                where: {
                    eventType: 'webhook_duplicate',
                    entityType: 'webhook',
                },
                orderBy: { timestamp: 'desc' },
            });

            expect(duplicateAuditEvent).toBeTruthy();
        });

        it('should create audit event on validation failure', async () => {
            const payload = {
                sessionToken: sessionToken1,
                score: -10, // Invalid
                completedAt: '2026-07-27T12:00:00Z',
            };

            const rawBody = JSON.stringify(payload);
            const signature = computeHmacSignature(rawBody, hmacSecret);

            await request(app)
                .post('/api/webhooks/assessment-score')
                .set('Content-Type', 'application/json')
                .set('X-Signature-HMAC-SHA256', signature)
                .send(rawBody);

            const auditEvent = await prisma.auditEvent.findFirst({
                where: {
                    eventType: 'webhook_validation_failed',
                    entityType: 'webhook',
                },
                orderBy: { timestamp: 'desc' },
            });

            expect(auditEvent).toBeTruthy();
        });
    });
});
