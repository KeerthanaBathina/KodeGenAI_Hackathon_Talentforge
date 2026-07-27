/**
 * Unit Tests for Assessment Score Service
 * 
 * Tests atomic score updates with transaction isolation and race condition handling.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    processWebhookScore,
    validateSessionForScoring,
    SessionNotFoundError,
} from '../assessmentScoreService';
import prisma from '../../db/prisma';
import * as idempotencyService from '../webhookIdempotencyService';
import { AssessmentScoreWebhook } from '../../schemas/webhookSchemas';

// Mock dependencies
vi.mock('../../db/prisma', () => ({
    default: {
        assessmentSession: {
            findUnique: vi.fn(),
            update: vi.fn(),
        },
        $transaction: vi.fn(),
    },
}));

vi.mock('../webhookIdempotencyService', () => ({
    checkWebhookIdempotency: vi.fn(),
}));

vi.mock('../../utils/logger', () => ({
    default: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    },
}));

describe('Assessment Score Service', () => {
    const mockSessionToken = 'sess_test_12345';
    const mockSessionId = '550e8400-e29b-41d4-a716-446655440000';
    const mockApplicationId = '550e8400-e29b-41d4-a716-446655440001';
    const mockProviderId = '550e8400-e29b-41d4-a716-446655440002';

    const mockWebhookPayload: AssessmentScoreWebhook = {
        sessionToken: mockSessionToken,
        score: 85,
        completedAt: '2026-07-27T12:00:00Z',
        metadata: {
            testType: 'coding',
            duration: 3600,
        },
    };

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
        metadata: { existingKey: 'existingValue' },
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

    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('processWebhookScore', () => {
        it('should return duplicate result without processing when webhook is duplicate', async () => {
            const completedSession = {
                ...mockSession,
                status: 'completed' as const,
                score: 85,
                completedAt: new Date('2026-07-27T12:00:00Z'),
            };

            vi.mocked(idempotencyService.checkWebhookIdempotency).mockResolvedValue({
                isDuplicate: true,
                session: completedSession,
            });

            const result = await processWebhookScore(mockWebhookPayload);

            expect(result.duplicate).toBe(true);
            expect(result.sessionId).toBe(mockSessionId);
            expect(result.applicationId).toBe(mockApplicationId);
            expect(result.score).toBe(85);
            expect(prisma.$transaction).not.toHaveBeenCalled();
        });

        it('should throw SessionNotFoundError when session does not exist', async () => {
            vi.mocked(idempotencyService.checkWebhookIdempotency).mockResolvedValue({
                isDuplicate: false,
                session: null,
            });

            await expect(processWebhookScore(mockWebhookPayload)).rejects.toThrow(
                SessionNotFoundError
            );
            await expect(processWebhookScore(mockWebhookPayload)).rejects.toThrow(
                `Assessment session not found: ${mockSessionToken}`
            );
        });

        it('should process score and update session within transaction', async () => {
            vi.mocked(idempotencyService.checkWebhookIdempotency).mockResolvedValue({
                isDuplicate: false,
                session: mockSession,
            });

            const mockUpdatedSession = {
                id: mockSessionId,
                applicationId: mockApplicationId,
                score: 85,
                completedAt: new Date('2026-07-27T12:00:00Z'),
            };

            const mockTransaction = vi.fn(async (callback) => {
                const tx = {
                    assessmentSession: {
                        findUnique: vi.fn().mockResolvedValue({
                            status: 'in_progress',
                            metadata: { existingKey: 'existingValue' },
                        }),
                        update: vi.fn().mockResolvedValue(mockUpdatedSession),
                    },
                };
                // Call the callback and ensure it returns the expected structure
                const txResult = await callback(tx);
                return txResult;
            });

            vi.mocked(prisma.$transaction).mockImplementation(mockTransaction as any);

            const result = await processWebhookScore(mockWebhookPayload);

            expect(result.duplicate).toBe(false);
            expect(result.sessionId).toBe(mockSessionId);
            expect(result.applicationId).toBe(mockApplicationId);
            expect(result.score).toBe(85);
            expect(result.completedAt).toBeInstanceOf(Date);
        });

        it('should detect race condition and return duplicate within transaction', async () => {
            vi.mocked(idempotencyService.checkWebhookIdempotency).mockResolvedValue({
                isDuplicate: false,
                session: mockSession,
            });

            const mockTransaction = vi.fn(async (callback) => {
                const tx = {
                    assessmentSession: {
                        findUnique: vi.fn().mockResolvedValue({
                            status: 'completed', // Changed by concurrent request
                            metadata: {},
                        }),
                        update: vi.fn(),
                    },
                };
                return callback(tx);
            });

            vi.mocked(prisma.$transaction).mockImplementation(mockTransaction as any);

            const result = await processWebhookScore(mockWebhookPayload);

            expect(result.duplicate).toBe(true);
        });

        it('should merge webhook metadata with existing metadata', async () => {
            vi.mocked(idempotencyService.checkWebhookIdempotency).mockResolvedValue({
                isDuplicate: false,
                session: mockSession,
            });

            const mockUpdate = vi.fn().mockResolvedValue({
                id: mockSessionId,
                applicationId: mockApplicationId,
                score: 85,
                completedAt: new Date('2026-07-27T12:00:00Z'),
            });

            const mockTransaction = vi.fn(async (callback) => {
                const tx = {
                    assessmentSession: {
                        findUnique: vi.fn().mockResolvedValue({
                            status: 'in_progress',
                            metadata: { existingKey: 'existingValue' },
                        }),
                        update: mockUpdate,
                    },
                };
                return callback(tx);
            });

            vi.mocked(prisma.$transaction).mockImplementation(mockTransaction as any);

            await processWebhookScore(mockWebhookPayload);

            expect(mockUpdate).toHaveBeenCalledWith({
                where: { id: mockSessionId },
                data: {
                    score: 85,
                    completedAt: expect.any(Date),
                    status: 'completed',
                    metadata: expect.objectContaining({
                        existingKey: 'existingValue',
                        webhookMetadata: mockWebhookPayload.metadata,
                        webhookReceivedAt: expect.any(String),
                    }),
                },
                select: {
                    id: true,
                    applicationId: true,
                    score: true,
                    completedAt: true,
                },
            });
        });

        it('should handle transaction errors', async () => {
            vi.mocked(idempotencyService.checkWebhookIdempotency).mockResolvedValue({
                isDuplicate: false,
                session: mockSession,
            });

            const dbError = new Error('Transaction failed');
            vi.mocked(prisma.$transaction).mockRejectedValue(dbError);

            await expect(processWebhookScore(mockWebhookPayload)).rejects.toThrow(
                'Transaction failed'
            );
        });
    });

    describe('validateSessionForScoring', () => {
        it('should return true for in_progress session', async () => {
            vi.mocked(prisma.assessmentSession.findUnique).mockResolvedValue({
                status: 'in_progress',
            } as any);

            const result = await validateSessionForScoring(mockSessionToken);

            expect(result).toBe(true);
        });

        it('should return true for launched session', async () => {
            vi.mocked(prisma.assessmentSession.findUnique).mockResolvedValue({
                status: 'launched',
            } as any);

            const result = await validateSessionForScoring(mockSessionToken);

            expect(result).toBe(true);
        });

        it('should return false for completed session', async () => {
            vi.mocked(prisma.assessmentSession.findUnique).mockResolvedValue({
                status: 'completed',
            } as any);

            const result = await validateSessionForScoring(mockSessionToken);

            expect(result).toBe(false);
        });

        it('should return false when session does not exist', async () => {
            vi.mocked(prisma.assessmentSession.findUnique).mockResolvedValue(null);

            const result = await validateSessionForScoring(mockSessionToken);

            expect(result).toBe(false);
        });

        it('should return false for launch_failed session', async () => {
            vi.mocked(prisma.assessmentSession.findUnique).mockResolvedValue({
                status: 'launch_failed',
            } as any);

            const result = await validateSessionForScoring(mockSessionToken);

            expect(result).toBe(false);
        });

        it('should return false on database error', async () => {
            vi.mocked(prisma.assessmentSession.findUnique).mockRejectedValue(
                new Error('Database error')
            );

            const result = await validateSessionForScoring(mockSessionToken);

            expect(result).toBe(false);
        });
    });
});
