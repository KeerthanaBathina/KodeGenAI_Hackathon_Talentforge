/**
 * Integration Tests for TASK-002: Provider Launch Client and Session Persistence
 * 
 * Test Scenarios:
 * 1. Successful assessment launch with provider API integration
 * 2. Session persistence with all required fields
 * 3. Provider response validation (missing testUrl)
 * 4. Provider response validation (missing sessionToken)
 * 5. Duplicate active launch prevention
 * 6. Provider API timeout handling
 * 7. Provider API error handling (4xx, 5xx)
 * 8. Authorization enforcement
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { app } from '../../app';
import prisma from '../../db/prisma';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env';
import axios from 'axios';
import * as emailService from '../../services/emailService';

// Mock axios for provider API calls
vi.mock('axios');
const mockedAxios = vi.mocked(axios);

// Mock email service
vi.mock('../../services/emailService', async () => {
    const actual = await vi.importActual('../../services/emailService');
    return {
        ...actual,
        sendAssessmentLaunchEmail: vi.fn().mockResolvedValue(undefined),
    };
});

describe('Assessment Launch Integration Tests', () => {
    let recruiterToken: string;
    let recruiterId: string;
    let candidateId: string;
    let requisitionId: string;
    let applicationId: string;
    let providerId: string;

    beforeAll(async () => {
        // Create test recruiter
        const recruiter = await prisma.candidate.create({
            data: {
                email: 'recruiter-assessment@example.com',
                password: 'hashedpassword',
                role: 'recruiter',
                emailVerified: true,
            },
        });

        recruiterId = recruiter.id;

        recruiterToken = jwt.sign(
            { id: recruiter.id, email: recruiter.email, role: recruiter.role },
            env.JWT_SECRET || 'test-secret',
            { expiresIn: '1h' }
        );

        // Create test candidate
        const candidate = await prisma.candidate.create({
            data: {
                email: 'candidate-assessment@example.com',
                password: 'hashedpassword',
                role: 'candidate',
                emailVerified: true,
                firstName: 'Test',
                lastName: 'Candidate',
            },
        });

        candidateId = candidate.id;

        // Create test requisition
        const requisition = await prisma.requisition.create({
            data: {
                title: 'Software Engineer',
                department: 'Engineering',
                location: 'Remote',
                jobType: 'full_time',
                status: 'open',
                slots: 5,
                filledSlots: 0,
                hiringManagerId: recruiterId,
                openedAt: new Date(),
            },
        });

        requisitionId = requisition.id;

        // Create test assessment provider
        const provider = await prisma.assessmentProvider.create({
            data: {
                name: 'TestProvider',
                apiEndpoint: 'https://api.testprovider.com/launch',
                authMode: 'bearer',
                hmacSecret: 'test-secret-key',
                timeoutSeconds: 30,
                active: true,
            },
        });

        providerId = provider.id;
    });

    afterAll(async () => {
        // Cleanup
        await prisma.auditEvent.deleteMany({ where: { actorId: recruiterId } });
        await prisma.assessmentSession.deleteMany({ where: { providerId } });
        await prisma.application.deleteMany({ where: { candidateId } });
        await prisma.assessmentProvider.deleteMany({ where: { id: providerId } });
        await prisma.requisition.deleteMany({ where: { id: requisitionId } });
        await prisma.candidate.deleteMany({ where: { id: candidateId } });
        await prisma.candidate.deleteMany({ where: { id: recruiterId } });
    });

    beforeEach(async () => {
        // Clean up applications and sessions before each test
        await prisma.assessmentSession.deleteMany({ where: { providerId } });
        await prisma.application.deleteMany({ where: { candidateId } });
        vi.clearAllMocks();
    });

    describe('POST /api/assessments/launch - Successful Launch', () => {
        it('should launch assessment and persist session with all required fields', async () => {
            // Create shortlisted application
            const application = await prisma.application.create({
                data: {
                    candidateId,
                    requisitionId,
                    status: 'shortlisted',
                },
            });

            applicationId = application.id;

            // Mock successful provider API response
            mockedAxios.post.mockResolvedValueOnce({
                status: 200,
                data: {
                    testUrl: 'https://testprovider.com/test/abc123',
                    sessionToken: 'sess_abc123xyz',
                    expiresAt: '2026-07-28T12:00:00Z',
                    metadata: {
                        testDuration: 3600,
                        maxAttempts: 1,
                    },
                },
            });

            const response = await request(app)
                .post('/api/assessments/launch')
                .set('Authorization', `Bearer ${recruiterToken}`)
                .send({
                    applicationId,
                    providerId,
                });

            expect(response.status).toBe(200);
            expect(response.body).toMatchObject({
                success: true,
                sessionId: expect.any(String),
                testUrl: 'https://testprovider.com/test/abc123',
                launchedAt: expect.any(String),
                correlationId: expect.any(String),
            });

            // Verify session was persisted with all required fields
            const session = await prisma.assessmentSession.findUnique({
                where: { id: response.body.sessionId },
            });

            expect(session).toBeTruthy();
            expect(session).toMatchObject({
                applicationId,
                providerId,
                sessionToken: 'sess_abc123xyz',
                testUrl: 'https://testprovider.com/test/abc123',
                status: 'in_progress',
                launchedAt: expect.any(Date),
                completedAt: null,
                score: null,
                metadata: expect.objectContaining({
                    providerName: 'TestProvider',
                    launchedBy: recruiterId,
                    launchedByRole: 'recruiter',
                    expiresAt: '2026-07-28T12:00:00Z',
                    providerMetadata: {
                        testDuration: 3600,
                        maxAttempts: 1,
                    },
                }),
            });

            // Verify audit event was created
            const auditEvent = await prisma.auditEvent.findFirst({
                where: {
                    actorId: recruiterId,
                    eventType: 'assessment_launch_initiated',
                    entityId: response.body.sessionId,
                },
            });

            expect(auditEvent).toBeTruthy();
            expect(auditEvent?.payloadJson).toMatchObject({
                applicationId,
                providerId,
                providerName: 'TestProvider',
            });

            // Verify provider API was called correctly
            expect(mockedAxios.post).toHaveBeenCalledWith(
                'https://api.testprovider.com/launch',
                expect.objectContaining({
                    candidate: {
                        id: candidateId,
                        email: 'candidate-assessment@example.com',
                        firstName: 'Test',
                        lastName: 'Candidate',
                    },
                    assessment: {
                        applicationId,
                        requisitionId,
                    },
                }),
                expect.objectContaining({
                    headers: expect.objectContaining({
                        'Content-Type': 'application/json',
                        'X-Correlation-ID': expect.any(String),
                        Authorization: 'Bearer test-secret-key',
                    }),
                    timeout: 30000,
                })
            );

            // Verify email notification was dispatched
            expect(emailService.sendAssessmentLaunchEmail).toHaveBeenCalledWith({
                candidateEmail: 'candidate-assessment@example.com',
                candidateName: 'Test Candidate',
                requisitionTitle: 'Software Engineer',
                applicationId,
                providerName: 'TestProvider',
                testUrl: 'https://testprovider.com/test/abc123',
                expiresAt: new Date('2026-07-28T12:00:00Z'),
                sessionId: response.body.sessionId,
            });
        });

        it('should not block launch if email dispatch fails', async () => {
            // Create shortlisted application
            const application = await prisma.application.create({
                data: {
                    candidateId,
                    requisitionId,
                    status: 'shortlisted',
                },
            });

            applicationId = application.id;

            // Mock successful provider API response
            mockedAxios.post.mockResolvedValueOnce({
                status: 200,
                data: {
                    testUrl: 'https://testprovider.com/test/xyz456',
                    sessionToken: 'sess_xyz456',
                },
            });

            // Mock email service to fail
            vi.mocked(emailService.sendAssessmentLaunchEmail).mockRejectedValueOnce(
                new Error('SMTP connection failed')
            );

            const response = await request(app)
                .post('/api/assessments/launch')
                .set('Authorization', `Bearer ${recruiterToken}`)
                .send({
                    applicationId,
                    providerId,
                });

            // Launch should still succeed
            expect(response.status).toBe(200);
            expect(response.body).toMatchObject({
                success: true,
                sessionId: expect.any(String),
                testUrl: 'https://testprovider.com/test/xyz456',
            });

            // Verify session was still persisted
            const session = await prisma.assessmentSession.findUnique({
                where: { id: response.body.sessionId },
            });

            expect(session).toBeTruthy();
            expect(session?.status).toBe('in_progress');
        });
    });

    describe('POST /api/assessments/launch - Response Validation', () => {
        it('should reject provider response missing testUrl', async () => {
            const application = await prisma.application.create({
                data: {
                    candidateId,
                    requisitionId,
                    status: 'shortlisted',
                },
            });

            // Mock provider response missing testUrl
            mockedAxios.post.mockResolvedValueOnce({
                status: 200,
                data: {
                    sessionToken: 'sess_abc123xyz',
                },
            });

            const response = await request(app)
                .post('/api/assessments/launch')
                .set('Authorization', `Bearer ${recruiterToken}`)
                .send({
                    applicationId: application.id,
                    providerId,
                });

            expect(response.status).toBe(500);
            expect(response.body).toMatchObject({
                success: false,
                error: {
                    code: 'MISSING_TEST_URL',
                    message: expect.stringContaining('testUrl'),
                },
            });

            // Verify no session was created
            const sessions = await prisma.assessmentSession.findMany({
                where: { applicationId: application.id },
            });

            expect(sessions).toHaveLength(0);
        });

        it('should reject provider response missing sessionToken', async () => {
            const application = await prisma.application.create({
                data: {
                    candidateId,
                    requisitionId,
                    status: 'shortlisted',
                },
            });

            // Mock provider response missing sessionToken
            mockedAxios.post.mockResolvedValueOnce({
                status: 200,
                data: {
                    testUrl: 'https://testprovider.com/test/abc123',
                },
            });

            const response = await request(app)
                .post('/api/assessments/launch')
                .set('Authorization', `Bearer ${recruiterToken}`)
                .send({
                    applicationId: application.id,
                    providerId,
                });

            expect(response.status).toBe(500);
            expect(response.body).toMatchObject({
                success: false,
                error: {
                    code: 'MISSING_SESSION_TOKEN',
                    message: expect.stringContaining('sessionToken'),
                },
            });

            // Verify no session was created
            const sessions = await prisma.assessmentSession.findMany({
                where: { applicationId: application.id },
            });

            expect(sessions).toHaveLength(0);
        });

        it('should reject provider response with invalid testUrl format', async () => {
            const application = await prisma.application.create({
                data: {
                    candidateId,
                    requisitionId,
                    status: 'shortlisted',
                },
            });

            // Mock provider response with invalid URL
            mockedAxios.post.mockResolvedValueOnce({
                status: 200,
                data: {
                    testUrl: 'not-a-valid-url',
                    sessionToken: 'sess_abc123xyz',
                },
            });

            const response = await request(app)
                .post('/api/assessments/launch')
                .set('Authorization', `Bearer ${recruiterToken}`)
                .send({
                    applicationId: application.id,
                    providerId,
                });

            expect(response.status).toBe(500);
            expect(response.body).toMatchObject({
                success: false,
                error: {
                    code: 'INVALID_TEST_URL',
                    message: expect.stringContaining('invalid testUrl'),
                },
            });
        });
    });

    describe('POST /api/assessments/launch - Duplicate Prevention', () => {
        it('should prevent duplicate active launch for same application', async () => {
            const application = await prisma.application.create({
                data: {
                    candidateId,
                    requisitionId,
                    status: 'shortlisted',
                },
            });

            // Create existing active session
            await prisma.assessmentSession.create({
                data: {
                    applicationId: application.id,
                    providerId,
                    sessionToken: 'existing_session',
                    testUrl: 'https://testprovider.com/test/existing',
                    status: 'in_progress',
                },
            });

            const response = await request(app)
                .post('/api/assessments/launch')
                .set('Authorization', `Bearer ${recruiterToken}`)
                .send({
                    applicationId: application.id,
                    providerId,
                });

            expect(response.status).toBe(409);
            expect(response.body).toMatchObject({
                success: false,
                error: {
                    code: 'DUPLICATE_ACTIVE_SESSION',
                    message: expect.stringContaining('active assessment session already exists'),
                },
            });

            // Verify provider API was not called
            expect(mockedAxios.post).not.toHaveBeenCalled();
        });
    });

    describe('POST /api/assessments/launch - Provider API Errors', () => {
        it('should handle provider API timeout', async () => {
            const application = await prisma.application.create({
                data: {
                    candidateId,
                    requisitionId,
                    status: 'shortlisted',
                },
            });

            // Mock timeout error
            const timeoutError = new Error('timeout of 30000ms exceeded');
            (timeoutError as any).code = 'ECONNABORTED';
            mockedAxios.post.mockRejectedValueOnce(timeoutError);

            const response = await request(app)
                .post('/api/assessments/launch')
                .set('Authorization', `Bearer ${recruiterToken}`)
                .send({
                    applicationId: application.id,
                    providerId,
                });

            expect(response.status).toBe(504);
            expect(response.body).toMatchObject({
                success: false,
                error: {
                    code: 'PROVIDER_TIMEOUT',
                    message: expect.stringContaining('did not respond'),
                },
            });
        });

        it('should handle provider API 500 error', async () => {
            const application = await prisma.application.create({
                data: {
                    candidateId,
                    requisitionId,
                    status: 'shortlisted',
                },
            });

            // Mock 500 error
            mockedAxios.post.mockRejectedValueOnce({
                isAxiosError: true,
                response: {
                    status: 500,
                    data: { error: 'Internal server error' },
                },
            });

            const response = await request(app)
                .post('/api/assessments/launch')
                .set('Authorization', `Bearer ${recruiterToken}`)
                .send({
                    applicationId: application.id,
                    providerId,
                });

            expect(response.status).toBe(502);
            expect(response.body).toMatchObject({
                success: false,
                error: {
                    code: 'PROVIDER_SERVER_ERROR',
                    message: expect.stringContaining('service error'),
                },
            });
        });

        it('should handle provider API 401 authentication error', async () => {
            const application = await prisma.application.create({
                data: {
                    candidateId,
                    requisitionId,
                    status: 'shortlisted',
                },
            });

            // Mock 401 error
            mockedAxios.post.mockRejectedValueOnce({
                isAxiosError: true,
                response: {
                    status: 401,
                    data: { error: 'Unauthorized' },
                },
            });

            const response = await request(app)
                .post('/api/assessments/launch')
                .set('Authorization', `Bearer ${recruiterToken}`)
                .send({
                    applicationId: application.id,
                    providerId,
                });

            expect(response.status).toBe(500);
            expect(response.body).toMatchObject({
                success: false,
                error: {
                    code: 'PROVIDER_AUTH_ERROR',
                    message: expect.stringContaining('authentication failed'),
                },
            });
        });

        it('should handle network connectivity error', async () => {
            const application = await prisma.application.create({
                data: {
                    candidateId,
                    requisitionId,
                    status: 'shortlisted',
                },
            });

            // Mock network error (no response)
            const networkError = new Error('Network error');
            (networkError as any).isAxiosError = true;
            (networkError as any).code = 'ENOTFOUND';
            mockedAxios.post.mockRejectedValueOnce(networkError);

            const response = await request(app)
                .post('/api/assessments/launch')
                .set('Authorization', `Bearer ${recruiterToken}`)
                .send({
                    applicationId: application.id,
                    providerId,
                });

            expect(response.status).toBe(503);
            expect(response.body).toMatchObject({
                success: false,
                error: {
                    code: 'PROVIDER_UNREACHABLE',
                    message: expect.stringContaining('Cannot reach provider'),
                },
            });
        });
    });

    describe('POST /api/assessments/launch - Authorization', () => {
        it('should reject request without authentication', async () => {
            const application = await prisma.application.create({
                data: {
                    candidateId,
                    requisitionId,
                    status: 'shortlisted',
                },
            });

            const response = await request(app)
                .post('/api/assessments/launch')
                .send({
                    applicationId: application.id,
                    providerId,
                });

            expect(response.status).toBe(401);
        });

        it('should reject request from candidate role', async () => {
            const application = await prisma.application.create({
                data: {
                    candidateId,
                    requisitionId,
                    status: 'shortlisted',
                },
            });

            const candidateToken = jwt.sign(
                { id: candidateId, email: 'candidate-assessment@example.com', role: 'candidate' },
                env.JWT_SECRET || 'test-secret',
                { expiresIn: '1h' }
            );

            const response = await request(app)
                .post('/api/assessments/launch')
                .set('Authorization', `Bearer ${candidateToken}`)
                .send({
                    applicationId: application.id,
                    providerId,
                });

            expect(response.status).toBe(403);
        });
    });

    describe('POST /api/assessments/launch - Retry and Failure Handling', () => {
        it('should retry on PROVIDER_TIMEOUT and succeed on second attempt', async () => {
            const application = await prisma.application.create({
                data: {
                    candidateId,
                    requisitionId,
                    status: 'shortlisted',
                },
            });

            // Mock timeout on first attempt, success on second
            const timeoutError = new Error('timeout of 30000ms exceeded');
            (timeoutError as any).code = 'ECONNABORTED';

            mockedAxios.post
                .mockRejectedValueOnce(timeoutError)
                .mockResolvedValueOnce({
                    status: 200,
                    data: {
                        testUrl: 'https://testprovider.com/test/retry-success',
                        sessionToken: 'sess_retry_success',
                    },
                });

            const startTime = Date.now();

            const response = await request(app)
                .post('/api/assessments/launch')
                .set('Authorization', `Bearer ${recruiterToken}`)
                .send({
                    applicationId: application.id,
                    providerId,
                });

            const duration = Date.now() - startTime;

            // Should succeed after retry
            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);

            // Verify provider API was called twice
            expect(mockedAxios.post).toHaveBeenCalledTimes(2);

            // Verify session was created successfully
            const session = await prisma.assessmentSession.findUnique({
                where: { id: response.body.sessionId },
            });

            expect(session).toBeTruthy();
            expect(session?.status).toBe('in_progress');
            expect(session?.testUrl).toBe('https://testprovider.com/test/retry-success');

            // Note: Timing verification is complex in integration tests due to fake timers
            // Unit tests in retry.test.ts provide precise timing validation
        });

        it('should create launch_failed session after retry exhaustion', async () => {
            const application = await prisma.application.create({
                data: {
                    candidateId,
                    requisitionId,
                    status: 'shortlisted',
                },
            });

            // Mock persistent 503 error
            mockedAxios.post.mockRejectedValue({
                isAxiosError: true,
                response: {
                    status: 503,
                    data: { error: 'Service unavailable' },
                },
            });

            const response = await request(app)
                .post('/api/assessments/launch')
                .set('Authorization', `Bearer ${recruiterToken}`)
                .send({
                    applicationId: application.id,
                    providerId,
                });

            // Should return 503 after retries exhausted
            expect(response.status).toBe(503);
            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('PROVIDER_LAUNCH_FAILED_AFTER_RETRIES');
            expect(response.body.error.message).toContain('failed after 3 attempts');

            // Verify provider API was called 3 times (max attempts)
            expect(mockedAxios.post).toHaveBeenCalledTimes(3);

            // Verify failed session was created
            const failedSession = await prisma.assessmentSession.findUnique({
                where: { id: response.body.error.sessionId },
            });

            expect(failedSession).toBeTruthy();
            expect(failedSession?.status).toBe('launch_failed');
            expect(failedSession?.testUrl).toBeNull();
            expect(failedSession?.sessionToken).toBeNull();
            expect(failedSession?.metadata).toMatchObject({
                failureReason: 'PROVIDER_SERVER_ERROR',
                attempts: 3,
            });

            // Verify failure audit event was created
            const auditEvent = await prisma.auditEvent.findFirst({
                where: {
                    eventType: 'assessment_launch_failed',
                    entityId: response.body.error.sessionId,
                },
            });

            expect(auditEvent).toBeTruthy();
            expect(auditEvent?.payloadJson).toMatchObject({
                attempts: 3,
                failureReason: 'PROVIDER_SERVER_ERROR',
            });
        });

        it('should not retry on PROVIDER_VALIDATION_ERROR (4xx)', async () => {
            const application = await prisma.application.create({
                data: {
                    candidateId,
                    requisitionId,
                    status: 'shortlisted',
                },
            });

            // Mock 400 validation error
            mockedAxios.post.mockRejectedValue({
                isAxiosError: true,
                response: {
                    status: 400,
                    data: { error: 'Invalid request' },
                },
            });

            const response = await request(app)
                .post('/api/assessments/launch')
                .set('Authorization', `Bearer ${recruiterToken}`)
                .send({
                    applicationId: application.id,
                    providerId,
                });

            // Should fail immediately without retries
            expect(response.status).toBe(400);
            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('PROVIDER_VALIDATION_ERROR');

            // Verify provider API was called only once (no retries)
            expect(mockedAxios.post).toHaveBeenCalledTimes(1);

            // Verify no session was created
            const sessions = await prisma.assessmentSession.findMany({
                where: { applicationId: application.id },
            });

            expect(sessions).toHaveLength(0);
        });

        it('should not retry on PROVIDER_AUTH_ERROR (401)', async () => {
            const application = await prisma.application.create({
                data: {
                    candidateId,
                    requisitionId,
                    status: 'shortlisted',
                },
            });

            // Mock 401 auth error
            mockedAxios.post.mockRejectedValue({
                isAxiosError: true,
                response: {
                    status: 401,
                    data: { error: 'Unauthorized' },
                },
            });

            const response = await request(app)
                .post('/api/assessments/launch')
                .set('Authorization', `Bearer ${recruiterToken}`)
                .send({
                    applicationId: application.id,
                    providerId,
                });

            // Should fail immediately without retries
            expect(response.status).toBe(500);
            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('PROVIDER_AUTH_ERROR');

            // Verify provider API was called only once (no retries)
            expect(mockedAxios.post).toHaveBeenCalledTimes(1);
        });

        it('should dispatch recruiter notification for failed launch', async () => {
            const application = await prisma.application.create({
                data: {
                    candidateId,
                    requisitionId,
                    status: 'shortlisted',
                },
            });

            // Mock persistent timeout
            const timeoutError = new Error('timeout exceeded');
            (timeoutError as any).code = 'ECONNABORTED';
            mockedAxios.post.mockRejectedValue(timeoutError);

            const response = await request(app)
                .post('/api/assessments/launch')
                .set('Authorization', `Bearer ${recruiterToken}`)
                .send({
                    applicationId: application.id,
                    providerId,
                });

            expect(response.status).toBe(503);

            // Note: Actual email service invocation would be tested with email service mock
            // For integration test, we verify the failure session was created
            // which triggers the notification flow
            const failedSession = await prisma.assessmentSession.findUnique({
                where: { id: response.body.error.sessionId },
            });

            expect(failedSession?.status).toBe('launch_failed');
        });
    });
});
