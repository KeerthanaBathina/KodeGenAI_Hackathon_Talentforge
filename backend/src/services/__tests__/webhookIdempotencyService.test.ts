/**
 * Unit Tests for Webhook Idempotency Service
 * 
 * Tests duplicate detection logic using session token as idempotency key.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    checkDuplicateWebhook,
    getWebhookSession,
    checkWebhookIdempotency,
} from '../webhookIdempotencyService';
import prisma from '../../db/prisma';

// Mock Prisma client
vi.mock('../../db/prisma', () => ({
    default: {
        assessmentSession: {
            findUnique: vi.fn(),
        },
    },
}));

// Mock logger
vi.mock('../../utils/logger', () => ({
    default: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    },
}));

describe('Webhook Idempotency Service', () => {
    const mockSessionToken = 'sess_test_12345';
    const mockSessionId = '550e8400-e29b-41d4-a716-446655440000';
    const mockApplicationId = '550e8400-e29b-41d4-a716-446655440001';
    const mockProviderId = '550e8400-e29b-41d4-a716-446655440002';

    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('checkDuplicateWebhook', () => {
        it('should return false when session does not exist', async () => {
            vi.mocked(prisma.assessmentSession.findUnique).mockResolvedValue(null);

            const result = await checkDuplicateWebhook(mockSessionToken);

            expect(result).toBe(false);
            expect(prisma.assessmentSession.findUnique).toHaveBeenCalledWith({
                where: { sessionToken: mockSessionToken },
                select: {
                    id: true,
                    status: true,
                    score: true,
                    completedAt: true,
                },
            });
        });

        it('should return false when session exists but not completed', async () => {
            vi.mocked(prisma.assessmentSession.findUnique).mockResolvedValue({
                id: mockSessionId,
                status: 'in_progress',
                score: null,
                completedAt: null,
            });

            const result = await checkDuplicateWebhook(mockSessionToken);

            expect(result).toBe(false);
        });

        it('should return true when session is completed', async () => {
            vi.mocked(prisma.assessmentSession.findUnique).mockResolvedValue({
                id: mockSessionId,
                status: 'completed',
                score: 85,
                completedAt: new Date('2026-07-27T12:00:00Z'),
            });

            const result = await checkDuplicateWebhook(mockSessionToken);

            expect(result).toBe(true);
        });

        it('should throw error when database query fails', async () => {
            const dbError = new Error('Database connection failed');
            vi.mocked(prisma.assessmentSession.findUnique).mockRejectedValue(dbError);

            await expect(checkDuplicateWebhook(mockSessionToken)).rejects.toThrow(
                'Database connection failed'
            );
        });
    });

    describe('getWebhookSession', () => {
        it('should return session with full context when found', async () => {
            const mockSession = {
                id: mockSessionId,
                sessionToken: mockSessionToken,
                applicationId: mockApplicationId,
                providerId: mockProviderId,
                status: 'in_progress' as const,
                score: null,
                completedAt: null,
                testUrl: 'https://test.example.com/test',
                launchedAt: new Date('2026-07-27T10:00:00Z'),
                metadata: {},
                application: {
                    id: mockApplicationId,
                    status: 'assessment_pending' as const,
                    candidate: {
                        id: '550e8400-e29b-41d4-a716-446655440003',
                        email: 'test@example.com',
                        firstName: 'Test',
                        lastName: 'Candidate',
                    },
                    requisition: {
                        id: '550e8400-e29b-41d4-a716-446655440004',
                        title: 'Senior Engineer',
                        department: 'Engineering',
                    },
                    candidateId: '550e8400-e29b-41d4-a716-446655440003',
                    requisitionId: '550e8400-e29b-41d4-a716-446655440004',
                    appliedAt: new Date(),
                    updatedAt: new Date(),
                },
                provider: {
                    id: mockProviderId,
                    name: 'TestProvider',
                },
            };

            vi.mocked(prisma.assessmentSession.findUnique).mockResolvedValue(mockSession);

            const result = await getWebhookSession(mockSessionToken);

            expect(result).toEqual(mockSession);
            expect(prisma.assessmentSession.findUnique).toHaveBeenCalledWith({
                where: { sessionToken: mockSessionToken },
                include: {
                    application: {
                        include: {
                            candidate: {
                                select: {
                                    id: true,
                                    email: true,
                                    firstName: true,
                                    lastName: true,
                                },
                            },
                            requisition: {
                                select: {
                                    id: true,
                                    title: true,
                                    department: true,
                                },
                            },
                        },
                    },
                    provider: {
                        select: {
                            id: true,
                            name: true,
                        },
                    },
                },
            });
        });

        it('should return null when session not found', async () => {
            vi.mocked(prisma.assessmentSession.findUnique).mockResolvedValue(null);

            const result = await getWebhookSession(mockSessionToken);

            expect(result).toBeNull();
        });

        it('should throw error when database query fails', async () => {
            const dbError = new Error('Database timeout');
            vi.mocked(prisma.assessmentSession.findUnique).mockRejectedValue(dbError);

            await expect(getWebhookSession(mockSessionToken)).rejects.toThrow('Database timeout');
        });
    });

    describe('checkWebhookIdempotency', () => {
        it('should return not duplicate when session does not exist', async () => {
            vi.mocked(prisma.assessmentSession.findUnique).mockResolvedValue(null);

            const result = await checkWebhookIdempotency(mockSessionToken);

            expect(result).toEqual({
                isDuplicate: false,
                session: null,
            });
        });

        it('should return not duplicate when session is in progress', async () => {
            const mockSession = {
                id: mockSessionId,
                sessionToken: mockSessionToken,
                applicationId: mockApplicationId,
                providerId: mockProviderId,
                status: 'in_progress' as const,
                score: null,
                completedAt: null,
                testUrl: 'https://test.example.com/test',
                launchedAt: new Date('2026-07-27T10:00:00Z'),
                metadata: {},
                application: {
                    id: mockApplicationId,
                    status: 'assessment_pending' as const,
                    candidateId: '550e8400-e29b-41d4-a716-446655440003',
                    requisitionId: '550e8400-e29b-41d4-a716-446655440004',
                    appliedAt: new Date(),
                    updatedAt: new Date(),
                    candidate: {
                        id: '550e8400-e29b-41d4-a716-446655440003',
                        email: 'test@example.com',
                        firstName: 'Test',
                        lastName: 'Candidate',
                    },
                    requisition: {
                        id: '550e8400-e29b-41d4-a716-446655440004',
                        title: 'Senior Engineer',
                        department: 'Engineering',
                    },
                },
                provider: {
                    id: mockProviderId,
                    name: 'TestProvider',
                },
            };

            vi.mocked(prisma.assessmentSession.findUnique).mockResolvedValue(mockSession);

            const result = await checkWebhookIdempotency(mockSessionToken);

            expect(result.isDuplicate).toBe(false);
            expect(result.session).toEqual(mockSession);
        });

        it('should return duplicate when session is completed', async () => {
            const mockSession = {
                id: mockSessionId,
                sessionToken: mockSessionToken,
                applicationId: mockApplicationId,
                providerId: mockProviderId,
                status: 'completed' as const,
                score: 85,
                completedAt: new Date('2026-07-27T12:00:00Z'),
                testUrl: 'https://test.example.com/test',
                launchedAt: new Date('2026-07-27T10:00:00Z'),
                metadata: {},
                application: {
                    id: mockApplicationId,
                    status: 'assessment_completed' as const,
                    candidateId: '550e8400-e29b-41d4-a716-446655440003',
                    requisitionId: '550e8400-e29b-41d4-a716-446655440004',
                    appliedAt: new Date(),
                    updatedAt: new Date(),
                    candidate: {
                        id: '550e8400-e29b-41d4-a716-446655440003',
                        email: 'test@example.com',
                        firstName: 'Test',
                        lastName: 'Candidate',
                    },
                    requisition: {
                        id: '550e8400-e29b-41d4-a716-446655440004',
                        title: 'Senior Engineer',
                        department: 'Engineering',
                    },
                },
                provider: {
                    id: mockProviderId,
                    name: 'TestProvider',
                },
            };

            vi.mocked(prisma.assessmentSession.findUnique).mockResolvedValue(mockSession);

            const result = await checkWebhookIdempotency(mockSessionToken);

            expect(result.isDuplicate).toBe(true);
            expect(result.session).toEqual(mockSession);
        });
    });
});
