/**
 * Integration Tests for Webhook Signature Validation Middleware
 * 
 * Tests HMAC signature validation in the context of HTTP requests,
 * database lookups, and audit event creation.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express, { Request, Response } from 'express';
import prisma from '../../db/prisma';
import { validateWebhookSignature } from '../validateWebhookSignature';
import { computeHmacSignature } from '../../utils/hmac';

// Test app with webhook signature middleware
function createTestApp() {
    const app = express();

    // Middleware to preserve raw body
    app.use('/webhooks/*', express.raw({ type: 'application/json' }), (req: any, res, next) => {
        req.rawBody = req.body;
        next();
    });

    // Apply signature validation middleware
    app.post('/webhooks/test', validateWebhookSignature, (req: Request, res: Response) => {
        res.json({
            success: true,
            message: 'Signature validated',
            context: (req as any).webhookContext,
        });
    });

    return app;
}

describe('Webhook Signature Validation Middleware Integration Tests', () => {
    const app = createTestApp();
    
    let providerId: string;
    let sessionToken: string;
    let hmacSecret: string;

    beforeAll(async () => {
        // Create test provider
        const provider = await prisma.assessmentProvider.create({
            data: {
                name: 'TestProvider',
                apiEndpoint: 'https://test.example.com',
                authMode: 'hmac',
                hmacSecret: 'test-webhook-secret-12345',
                timeoutSeconds: 30,
                active: true,
            },
        });

        providerId = provider.id;
        hmacSecret = provider.hmacSecret!;

        // Create test candidate and requisition for session
        const candidate = await prisma.candidate.create({
            data: {
                email: `webhook-test-${Date.now()}@example.com`,
                password: 'hashed',
                firstName: 'Test',
                lastName: 'Candidate',
                role: 'candidate',
            },
        });

        const requisition = await prisma.requisition.create({
            data: {
                title: 'Test Position',
                department: 'Engineering',
                jobFamilyId: '00000000-0000-0000-0000-000000000001',
                status: 'open',
            },
        });

        const application = await prisma.application.create({
            data: {
                candidateId: candidate.id,
                requisitionId: requisition.id,
                status: 'shortlisted',
            },
        });

        // Create assessment session
        const session = await prisma.assessmentSession.create({
            data: {
                applicationId: application.id,
                providerId: provider.id,
                sessionToken: `sess_webhook_test_${Date.now()}`,
                testUrl: 'https://test.example.com/test',
                status: 'in_progress',
                launchedAt: new Date(),
            },
        });

        sessionToken = session.sessionToken;
    });

    afterAll(async () => {
        // Cleanup
        await prisma.auditEvent.deleteMany({
            where: { entityType: 'webhook' },
        });
        await prisma.assessmentSession.deleteMany({
            where: { providerId },
        });
        await prisma.application.deleteMany({});
        await prisma.assessmentProvider.deleteMany({
            where: { id: providerId },
        });
        await prisma.requisition.deleteMany({});
        await prisma.candidate.deleteMany({
            where: { email: { contains: 'webhook-test' } },
        });
    });

    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('Valid Signature Acceptance', () => {
        it('should accept request with valid HMAC signature', async () => {
            const payload = {
                sessionToken,
                score: 85,
                completedAt: '2026-07-27T12:00:00Z',
            };

            const rawBody = JSON.stringify(payload);
            const signature = computeHmacSignature(rawBody, hmacSecret);

            const response = await request(app)
                .post('/webhooks/test')
                .set('Content-Type', 'application/json')
                .set('X-Signature-HMAC-SHA256', signature)
                .send(rawBody);

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.context).toMatchObject({
                providerId,
                providerName: 'TestProvider',
                validated: true,
            });
        });

        it('should accept signature with uppercase hex', async () => {
            const payload = {
                sessionToken,
                score: 90,
                completedAt: '2026-07-27T13:00:00Z',
            };

            const rawBody = JSON.stringify(payload);
            const signature = computeHmacSignature(rawBody, hmacSecret).toUpperCase();

            const response = await request(app)
                .post('/webhooks/test')
                .set('Content-Type', 'application/json')
                .set('X-Signature-HMAC-SHA256', signature)
                .send(rawBody);

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
        });

        it('should handle case-insensitive signature header name', async () => {
            const payload = {
                sessionToken,
                score: 75,
                completedAt: '2026-07-27T14:00:00Z',
            };

            const rawBody = JSON.stringify(payload);
            const signature = computeHmacSignature(rawBody, hmacSecret);

            const response = await request(app)
                .post('/webhooks/test')
                .set('Content-Type', 'application/json')
                .set('x-SIGNATURE-hmac-SHA256', signature) // Mixed case
                .send(rawBody);

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
        });
    });

    describe('Invalid Signature Rejection', () => {
        it('should reject request with missing signature header', async () => {
            const payload = {
                sessionToken,
                score: 85,
                completedAt: '2026-07-27T12:00:00Z',
            };

            const response = await request(app)
                .post('/webhooks/test')
                .set('Content-Type', 'application/json')
                .send(payload);

            expect(response.status).toBe(401);
            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('MISSING_SIGNATURE');
        });

        it('should reject request with incorrect signature', async () => {
            const payload = {
                sessionToken,
                score: 85,
                completedAt: '2026-07-27T12:00:00Z',
            };

            const rawBody = JSON.stringify(payload);
            const validSignature = computeHmacSignature(rawBody, hmacSecret);
            const tamperedSignature = validSignature.replace(/a/g, 'b');

            const response = await request(app)
                .post('/webhooks/test')
                .set('Content-Type', 'application/json')
                .set('X-Signature-HMAC-SHA256', tamperedSignature)
                .send(rawBody);

            expect(response.status).toBe(401);
            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('INVALID_SIGNATURE');
        });

        it('should reject request with tampered payload', async () => {
            const payload = {
                sessionToken,
                score: 85,
                completedAt: '2026-07-27T12:00:00Z',
            };

            const rawBody = JSON.stringify(payload);
            const signature = computeHmacSignature(rawBody, hmacSecret);

            // Tamper with payload after computing signature
            const tamperedPayload = {
                ...payload,
                score: 100, // Changed score
            };

            const response = await request(app)
                .post('/webhooks/test')
                .set('Content-Type', 'application/json')
                .set('X-Signature-HMAC-SHA256', signature)
                .send(tamperedPayload);

            expect(response.status).toBe(401);
            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('INVALID_SIGNATURE');
        });

        it('should reject request with invalid signature format', async () => {
            const payload = {
                sessionToken,
                score: 85,
                completedAt: '2026-07-27T12:00:00Z',
            };

            const response = await request(app)
                .post('/webhooks/test')
                .set('Content-Type', 'application/json')
                .set('X-Signature-HMAC-SHA256', 'invalid-short-signature')
                .send(payload);

            expect(response.status).toBe(401);
            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('INVALID_FORMAT');
        });

        it('should reject request with non-hex signature', async () => {
            const payload = {
                sessionToken,
                score: 85,
                completedAt: '2026-07-27T12:00:00Z',
            };

            const invalidSignature = 'z'.repeat(64); // Non-hex characters

            const response = await request(app)
                .post('/webhooks/test')
                .set('Content-Type', 'application/json')
                .set('X-Signature-HMAC-SHA256', invalidSignature)
                .send(payload);

            expect(response.status).toBe(401);
            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('INVALID_FORMAT');
        });
    });

    describe('Session Token Validation', () => {
        it('should reject request with missing session token', async () => {
            const payload = {
                score: 85,
                completedAt: '2026-07-27T12:00:00Z',
                // Missing sessionToken
            };

            const rawBody = JSON.stringify(payload);
            const signature = computeHmacSignature(rawBody, hmacSecret);

            const response = await request(app)
                .post('/webhooks/test')
                .set('Content-Type', 'application/json')
                .set('X-Signature-HMAC-SHA256', signature)
                .send(rawBody);

            expect(response.status).toBe(400);
            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('INVALID_FORMAT');
            expect(response.body.error.message).toContain('sessionToken');
        });

        it('should reject request with nonexistent session token', async () => {
            const payload = {
                sessionToken: 'sess_nonexistent_12345',
                score: 85,
                completedAt: '2026-07-27T12:00:00Z',
            };

            const rawBody = JSON.stringify(payload);
            const signature = computeHmacSignature(rawBody, hmacSecret);

            const response = await request(app)
                .post('/webhooks/test')
                .set('Content-Type', 'application/json')
                .set('X-Signature-HMAC-SHA256', signature)
                .send(rawBody);

            expect(response.status).toBe(404);
            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('PROVIDER_NOT_FOUND');
        });
    });

    describe('Audit Event Creation', () => {
        it('should create audit event for missing signature', async () => {
            const payload = {
                sessionToken,
                score: 85,
                completedAt: '2026-07-27T12:00:00Z',
            };

            await request(app)
                .post('/webhooks/test')
                .set('Content-Type', 'application/json')
                .send(payload);

            // Check audit event was created
            const auditEvent = await prisma.auditEvent.findFirst({
                where: {
                    eventType: 'webhook_signature_missing',
                    entityType: 'webhook',
                },
                orderBy: { timestamp: 'desc' },
            });

            expect(auditEvent).toBeTruthy();
        });

        it('should create audit event for invalid signature', async () => {
            const payload = {
                sessionToken,
                score: 85,
                completedAt: '2026-07-27T12:00:00Z',
            };

            const rawBody = JSON.stringify(payload);
            const validSignature = computeHmacSignature(rawBody, hmacSecret);
            const tamperedSignature = validSignature.replace(/a/g, 'b');

            await request(app)
                .post('/webhooks/test')
                .set('Content-Type', 'application/json')
                .set('X-Signature-HMAC-SHA256', tamperedSignature)
                .send(rawBody);

            // Check audit event was created
            const auditEvent = await prisma.auditEvent.findFirst({
                where: {
                    eventType: 'webhook_signature_invalid',
                    entityType: 'webhook',
                },
                orderBy: { timestamp: 'desc' },
            });

            expect(auditEvent).toBeTruthy();
            expect(auditEvent?.payloadJson).toMatchObject({
                providerId,
                sessionToken,
            });
        });
    });
});
