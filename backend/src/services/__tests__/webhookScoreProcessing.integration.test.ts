/**
 * Integration Tests for Webhook Score Processing
 * 
 * Tests complete webhook processing flow from payload validation
 * through idempotency checking to atomic score updates.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import prisma from '../../../db/prisma';
import { processWebhookScore, SessionNotFoundError } from '../assessmentScoreService';
import { AssessmentScoreWebhook } from '../../../schemas/webhookSchemas';

describe('Webhook Score Processing Integration Tests', () => {
    let providerId: string;
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
                hmacSecret: 'test-secret',
                timeoutSeconds: 30,
                active: true,
            },
        });
        providerId = provider.id;

        // Create test candidates
        const candidate1 = await prisma.candidate.create({
            data: {
                email: `webhook-score-test-1-${Date.now()}@example.com`,
                password: 'hashed',
                firstName: 'Test',
                lastName: 'Candidate1',
                role: 'candidate',
            },
        });

        const candidate2 = await prisma.candidate.create({
            data: {
                email: `webhook-score-test-2-${Date.now()}@example.com`,
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
                sessionToken: `sess_integration_test_${Date.now()}_1`,
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
                sessionToken: `sess_integration_test_${Date.now()}_2`,
                testUrl: 'https://test.example.com/test2',
                status: 'in_progress',
                launchedAt: new Date(),
            },
        });
        sessionToken2 = session2.sessionToken;
    });

    afterAll(async () => {
        // Cleanup
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
                    contains: 'webhook-score-test',
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
    });

    describe('First-time webhook processing', () => {
        it('should process webhook and update session on first delivery', async () => {
            const payload: AssessmentScoreWebhook = {
                sessionToken: sessionToken1,
                score: 85,
                completedAt: '2026-07-27T12:00:00Z',
                metadata: {
                    testType: 'coding',
                    duration: 3600,
                },
            };

            const result = await processWebhookScore(payload);

            expect(result.duplicate).toBe(false);
            expect(result.sessionId).toBeTruthy();
            expect(result.applicationId).toBe(applicationId1);
            expect(result.score).toBe(85);
            expect(result.completedAt).toBeInstanceOf(Date);

            // Verify database state
            const session = await prisma.assessmentSession.findUnique({
                where: { sessionToken: sessionToken1 },
            });

            expect(session).toBeTruthy();
            expect(session!.status).toBe('completed');
            expect(session!.score).toBe(85);
            expect(session!.completedAt).toBeTruthy();
            expect(session!.metadata).toMatchObject({
                webhookMetadata: payload.metadata,
            });
        });

        it('should merge webhook metadata with existing metadata', async () => {
            // Set existing metadata
            await prisma.assessmentSession.update({
                where: { sessionToken: sessionToken1 },
                data: {
                    metadata: {
                        existingKey: 'existingValue',
                        launchMethod: 'api',
                    },
                },
            });

            const payload: AssessmentScoreWebhook = {
                sessionToken: sessionToken1,
                score: 90,
                completedAt: '2026-07-27T13:00:00Z',
                metadata: {
                    testType: 'behavioral',
                    categories: ['communication', 'leadership'],
                },
            };

            await processWebhookScore(payload);

            const session = await prisma.assessmentSession.findUnique({
                where: { sessionToken: sessionToken1 },
                select: { metadata: true },
            });

            const metadata = session!.metadata as Record<string, unknown>;
            expect(metadata.existingKey).toBe('existingValue');
            expect(metadata.launchMethod).toBe('api');
            expect(metadata.webhookMetadata).toEqual(payload.metadata);
            expect(metadata.webhookReceivedAt).toBeTruthy();
        });
    });

    describe('Duplicate webhook handling', () => {
        it('should detect and return duplicate on second webhook delivery', async () => {
            const payload: AssessmentScoreWebhook = {
                sessionToken: sessionToken2,
                score: 75,
                completedAt: '2026-07-27T14:00:00Z',
            };

            // First delivery
            const result1 = await processWebhookScore(payload);
            expect(result1.duplicate).toBe(false);
            expect(result1.score).toBe(75);

            // Second delivery (duplicate)
            const result2 = await processWebhookScore(payload);
            expect(result2.duplicate).toBe(true);
            expect(result2.score).toBe(75); // Returns existing score

            // Verify only one score update occurred
            const session = await prisma.assessmentSession.findUnique({
                where: { sessionToken: sessionToken2 },
            });

            expect(session!.score).toBe(75);
            expect(session!.status).toBe('completed');
        });

        it('should not modify data on duplicate webhook', async () => {
            const firstPayload: AssessmentScoreWebhook = {
                sessionToken: sessionToken1,
                score: 85,
                completedAt: '2026-07-27T12:00:00Z',
                metadata: {
                    firstDelivery: true,
                },
            };

            // First delivery
            await processWebhookScore(firstPayload);

            const sessionAfterFirst = await prisma.assessmentSession.findUnique({
                where: { sessionToken: sessionToken1 },
            });
            const firstCompletedAt = sessionAfterFirst!.completedAt;
            const firstMetadata = sessionAfterFirst!.metadata;

            // Wait a moment
            await new Promise((resolve) => setTimeout(resolve, 10));

            // Duplicate delivery with different data
            const duplicatePayload: AssessmentScoreWebhook = {
                sessionToken: sessionToken1,
                score: 95, // Different score
                completedAt: new Date().toISOString(), // Different timestamp
                metadata: {
                    duplicateDelivery: true,
                },
            };

            await processWebhookScore(duplicatePayload);

            // Verify data unchanged
            const sessionAfterDuplicate = await prisma.assessmentSession.findUnique({
                where: { sessionToken: sessionToken1 },
            });

            expect(sessionAfterDuplicate!.score).toBe(85); // Original score preserved
            expect(sessionAfterDuplicate!.completedAt).toEqual(firstCompletedAt); // Original timestamp preserved
            expect(sessionAfterDuplicate!.metadata).toEqual(firstMetadata); // Original metadata preserved
        });
    });

    describe('Concurrent webhook handling (race conditions)', () => {
        it('should handle concurrent webhook deliveries atomically', async () => {
            const payload: AssessmentScoreWebhook = {
                sessionToken: sessionToken1,
                score: 80,
                completedAt: '2026-07-27T15:00:00Z',
            };

            // Simulate concurrent webhook deliveries
            const results = await Promise.all([
                processWebhookScore(payload),
                processWebhookScore(payload),
                processWebhookScore(payload),
            ]);

            // One should succeed, others should detect duplicate
            const successCount = results.filter((r) => !r.duplicate).length;
            const duplicateCount = results.filter((r) => r.duplicate).length;

            expect(successCount).toBe(1);
            expect(duplicateCount).toBe(2);

            // Verify final database state
            const session = await prisma.assessmentSession.findUnique({
                where: { sessionToken: sessionToken1 },
            });

            expect(session!.status).toBe('completed');
            expect(session!.score).toBe(80);
        });
    });

    describe('Error handling', () => {
        it('should throw SessionNotFoundError for nonexistent session token', async () => {
            const payload: AssessmentScoreWebhook = {
                sessionToken: 'sess_nonexistent_12345',
                score: 85,
                completedAt: '2026-07-27T12:00:00Z',
            };

            await expect(processWebhookScore(payload)).rejects.toThrow(SessionNotFoundError);
            await expect(processWebhookScore(payload)).rejects.toThrow(
                'Assessment session not found: sess_nonexistent_12345'
            );
        });

        it('should handle score at boundary (0)', async () => {
            const payload: AssessmentScoreWebhook = {
                sessionToken: sessionToken1,
                score: 0,
                completedAt: '2026-07-27T12:00:00Z',
            };

            const result = await processWebhookScore(payload);

            expect(result.duplicate).toBe(false);
            expect(result.score).toBe(0);

            const session = await prisma.assessmentSession.findUnique({
                where: { sessionToken: sessionToken1 },
            });

            expect(session!.score).toBe(0);
        });

        it('should handle score at boundary (100)', async () => {
            const payload: AssessmentScoreWebhook = {
                sessionToken: sessionToken2,
                score: 100,
                completedAt: '2026-07-27T12:00:00Z',
            };

            const result = await processWebhookScore(payload);

            expect(result.duplicate).toBe(false);
            expect(result.score).toBe(100);

            const session = await prisma.assessmentSession.findUnique({
                where: { sessionToken: sessionToken2 },
            });

            expect(session!.score).toBe(100);
        });
    });
});
