/**
 * Integration Tests for Session Timer API Endpoints
 * 
 * Tests complete flow of session timer operations including:
 * - GET /api/sessions/:sessionId/timer
 * - POST /api/sessions/:sessionId/heartbeat
 * - Authentication, validation, rate limiting, and error handling
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../../app';
import prisma from '../../db/prisma';
import { redis } from '../../db/redis';
import { startSessionTimer } from '../../services/sessionTimerService';

const app = createApp();

describe('Session Timer API Endpoints Integration Tests', () => {
    let providerId: string;
    let sessionId1: string;
    let sessionToken1: string;
    let sessionId2: string;
    let sessionToken2: string;
    let applicationId1: string;
    let applicationId2: string;

    beforeAll(async () => {
        // Create test provider
        const provider = await prisma.assessmentProvider.create({
            data: {
                name: 'TestTimerProvider',
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
                email: `timer-test-1-${Date.now()}@example.com`,
                password: 'hashed',
                firstName: 'Timer',
                lastName: 'Test1',
                role: 'candidate',
            },
        });

        const candidate2 = await prisma.candidate.create({
            data: {
                email: `timer-test-2-${Date.now()}@example.com`,
                password: 'hashed',
                firstName: 'Timer',
                lastName: 'Test2',
                role: 'candidate',
            },
        });

        // Create test requisition
        const requisition = await prisma.requisition.create({
            data: {
                title: 'Test Timer Position',
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
                sessionToken: `sess_timer_test_${Date.now()}_1`,
                testUrl: 'https://test.example.com/test1',
                status: 'in_progress',
                launchedAt: new Date(),
            },
        });
        sessionId1 = session1.id;
        sessionToken1 = session1.sessionToken;

        const session2 = await prisma.assessmentSession.create({
            data: {
                applicationId: application2.id,
                providerId: provider.id,
                sessionToken: `sess_timer_test_${Date.now()}_2`,
                testUrl: 'https://test.example.com/test2',
                status: 'in_progress',
                launchedAt: new Date(),
            },
        });
        sessionId2 = session2.id;
        sessionToken2 = session2.sessionToken;
    });

    afterAll(async () => {
        // Cleanup test data
        await prisma.assessmentSession.deleteMany({
            where: {
                OR: [
                    { id: sessionId1 },
                    { id: sessionId2 }
                ]
            }
        });

        await prisma.application.deleteMany({
            where: {
                OR: [
                    { id: applicationId1 },
                    { id: applicationId2 }
                ]
            }
        });

        await prisma.candidate.deleteMany({
            where: {
                email: {
                    contains: 'timer-test'
                }
            }
        });

        await prisma.assessmentProvider.deleteMany({
            where: { id: providerId }
        });

        // Cleanup Redis
        await redis.del(`session:timer:${sessionId1}`);
        await redis.del(`session:timer:${sessionId2}`);
    });

    beforeEach(async () => {
        // Clear any existing timers
        await redis.del(`session:timer:${sessionId1}`);
        await redis.del(`session:timer:${sessionId2}`);
    });

    describe('GET /api/sessions/:sessionId/timer', () => {
        it('should return timer state for active session', async () => {
            // Start timer
            await startSessionTimer(sessionId1, 60);

            const response = await request(app)
                .get(`/api/sessions/${sessionId1}/timer`)
                .set('Authorization', `Bearer ${sessionToken1}`)
                .expect(200);

            expect(response.body).toMatchObject({
                success: true,
                data: {
                    sessionId: sessionId1,
                    status: 'active'
                }
            });

            expect(response.body.data.remainingMinutes).toBeGreaterThan(59);
            expect(response.body.data.remainingMinutes).toBeLessThanOrEqual(60);
            expect(response.body.data.lastHeartbeat).toBeTruthy();
        });

        it('should return 404 when timer does not exist', async () => {
            const response = await request(app)
                .get(`/api/sessions/${sessionId1}/timer`)
                .set('Authorization', `Bearer ${sessionToken1}`)
                .expect(404);

            expect(response.body).toMatchObject({
                success: false,
                error: {
                    code: 'TIMER_NOT_FOUND',
                    message: 'Session timer not found'
                }
            });
        });

        it('should return 401 when session token is missing', async () => {
            await startSessionTimer(sessionId1, 60);

            const response = await request(app)
                .get(`/api/sessions/${sessionId1}/timer`)
                .expect(401);

            expect(response.body).toMatchObject({
                success: false,
                error: {
                    code: 'UNAUTHORIZED',
                    message: 'Session token required'
                }
            });
        });

        it('should return 401 when session token is invalid', async () => {
            await startSessionTimer(sessionId1, 60);

            const response = await request(app)
                .get(`/api/sessions/${sessionId1}/timer`)
                .set('Authorization', 'Bearer invalid-token')
                .expect(401);

            expect(response.body).toMatchObject({
                success: false,
                error: {
                    code: 'INVALID_TOKEN',
                    message: 'Invalid session token'
                }
            });
        });

        it('should return 404 when session does not exist', async () => {
            const fakeSessionId = '00000000-0000-0000-0000-000000000099';

            const response = await request(app)
                .get(`/api/sessions/${fakeSessionId}/timer`)
                .set('Authorization', 'Bearer fake-token')
                .expect(404);

            expect(response.body).toMatchObject({
                success: false,
                error: {
                    code: 'SESSION_NOT_FOUND',
                    message: 'Assessment session not found'
                }
            });
        });

        it('should return 400 when session ID format is invalid', async () => {
            const response = await request(app)
                .get('/api/sessions/not-a-uuid/timer')
                .set('Authorization', `Bearer ${sessionToken1}`)
                .expect(400);

            expect(response.body).toMatchObject({
                success: false,
                error: {
                    code: 'INVALID_SESSION_ID',
                    message: 'Invalid session ID format'
                }
            });
        });

        it('should accept token from query parameter', async () => {
            await startSessionTimer(sessionId1, 60);

            const response = await request(app)
                .get(`/api/sessions/${sessionId1}/timer?token=${sessionToken1}`)
                .expect(200);

            expect(response.body.success).toBe(true);
        });
    });

    describe('POST /api/sessions/:sessionId/heartbeat', () => {
        it('should update heartbeat and return updated timer state', async () => {
            // Start timer
            await startSessionTimer(sessionId1, 60);

            // Wait a bit
            await new Promise(resolve => setTimeout(resolve, 1000));

            const response = await request(app)
                .post(`/api/sessions/${sessionId1}/heartbeat`)
                .set('Authorization', `Bearer ${sessionToken1}`)
                .expect(200);

            expect(response.body).toMatchObject({
                success: true,
                data: {
                    sessionId: sessionId1,
                    status: 'active'
                }
            });

            expect(response.body.data.lastHeartbeat).toBeTruthy();
            expect(response.body.data.remainingMinutes).toBeGreaterThan(0);
        });

        it('should return 404 when timer does not exist', async () => {
            const response = await request(app)
                .post(`/api/sessions/${sessionId1}/heartbeat`)
                .set('Authorization', `Bearer ${sessionToken1}`)
                .expect(404);

            expect(response.body).toMatchObject({
                success: false,
                error: {
                    code: 'TIMER_NOT_FOUND',
                    message: 'Session timer not found'
                }
            });
        });

        it('should return 401 when session token is missing', async () => {
            await startSessionTimer(sessionId1, 60);

            const response = await request(app)
                .post(`/api/sessions/${sessionId1}/heartbeat`)
                .expect(401);

            expect(response.body).toMatchObject({
                success: false,
                error: {
                    code: 'UNAUTHORIZED',
                    message: 'Session token required'
                }
            });
        });

        it('should return 429 when rate limit exceeded', async () => {
            await startSessionTimer(sessionId1, 60);

            // First heartbeat should succeed
            await request(app)
                .post(`/api/sessions/${sessionId1}/heartbeat`)
                .set('Authorization', `Bearer ${sessionToken1}`)
                .expect(200);

            // Immediate second heartbeat should be rate limited
            const response = await request(app)
                .post(`/api/sessions/${sessionId1}/heartbeat`)
                .set('Authorization', `Bearer ${sessionToken1}`)
                .expect(429);

            expect(response.body).toMatchObject({
                success: false,
                error: {
                    code: 'RATE_LIMIT_EXCEEDED',
                    message: expect.stringContaining('rate limit')
                }
            });

            expect(response.body.error.retryAfter).toBeGreaterThan(0);
        });

        it('should allow heartbeat after rate limit window expires', async () => {
            await startSessionTimer(sessionId2, 60);

            // First heartbeat
            await request(app)
                .post(`/api/sessions/${sessionId2}/heartbeat`)
                .set('Authorization', `Bearer ${sessionToken2}`)
                .expect(200);

            // Wait for rate limit window (10 seconds)
            await new Promise(resolve => setTimeout(resolve, 10100));

            // Second heartbeat should succeed
            const response = await request(app)
                .post(`/api/sessions/${sessionId2}/heartbeat`)
                .set('Authorization', `Bearer ${sessionToken2}`)
                .expect(200);

            expect(response.body.success).toBe(true);
        }, 15000); // Increase test timeout to 15 seconds

        it('should return 400 when session ID format is invalid', async () => {
            const response = await request(app)
                .post('/api/sessions/not-a-uuid/heartbeat')
                .set('Authorization', `Bearer ${sessionToken1}`)
                .expect(400);

            expect(response.body).toMatchObject({
                success: false,
                error: {
                    code: 'INVALID_SESSION_ID',
                    message: 'Invalid session ID format'
                }
            });
        });
    });

    describe('Cross-session isolation', () => {
        it('should not allow session token from different session', async () => {
            await startSessionTimer(sessionId1, 60);

            // Try to access session1 with session2's token
            const response = await request(app)
                .get(`/api/sessions/${sessionId1}/timer`)
                .set('Authorization', `Bearer ${sessionToken2}`)
                .expect(401);

            expect(response.body).toMatchObject({
                success: false,
                error: {
                    code: 'INVALID_TOKEN',
                    message: 'Invalid session token'
                }
            });
        });

        it('should maintain separate rate limits per session', async () => {
            await startSessionTimer(sessionId1, 60);
            await startSessionTimer(sessionId2, 60);

            // Exhaust rate limit for session1
            await request(app)
                .post(`/api/sessions/${sessionId1}/heartbeat`)
                .set('Authorization', `Bearer ${sessionToken1}`)
                .expect(200);

            // Session1 should be rate limited
            await request(app)
                .post(`/api/sessions/${sessionId1}/heartbeat`)
                .set('Authorization', `Bearer ${sessionToken1}`)
                .expect(429);

            // Session2 should still work
            const response = await request(app)
                .post(`/api/sessions/${sessionId2}/heartbeat`)
                .set('Authorization', `Bearer ${sessionToken2}`)
                .expect(200);

            expect(response.body.success).toBe(true);
        });
    });

    describe('Correlation ID tracking', () => {
        it('should include correlation ID in successful response', async () => {
            await startSessionTimer(sessionId1, 60);

            const response = await request(app)
                .get(`/api/sessions/${sessionId1}/timer`)
                .set('Authorization', `Bearer ${sessionToken1}`)
                .expect(200);

            expect(response.body.correlationId).toBeTruthy();
            expect(typeof response.body.correlationId).toBe('string');
        });

        it('should include correlation ID in error response', async () => {
            const response = await request(app)
                .get(`/api/sessions/${sessionId1}/timer`)
                .set('Authorization', `Bearer ${sessionToken1}`)
                .expect(404);

            expect(response.body.error.correlationId).toBeTruthy();
        });
    });
});
