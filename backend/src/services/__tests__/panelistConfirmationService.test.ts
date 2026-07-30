import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generatePanelistConfirmationToken, validatePanelistConfirmationToken, markTokenAsUsed } from '../panelistConfirmationService';

const prismaMocks = vi.hoisted(() => ({
    panelistConfirmationFindFirst: vi.fn(),
    panelistConfirmationUpdateMany: vi.fn(),
}));

vi.mock('../../db/prisma', () => ({
    prisma: {
        panelistConfirmation: {
            findFirst: prismaMocks.panelistConfirmationFindFirst,
            updateMany: prismaMocks.panelistConfirmationUpdateMany,
        },
    },
}));

vi.mock('../../config/env', () => ({
    env: {
        JWT_SECRET: 'test-secret-key-at-least-32-characters-long',
    },
}));

describe('panelistConfirmationService', () => {
    const interviewStageId = 'interview-1';
    const panelistId = 'panelist-1';

    beforeEach(() => {
        vi.clearAllMocks();
        prismaMocks.panelistConfirmationUpdateMany.mockResolvedValue({ count: 1 });
    });

    describe('generatePanelistConfirmationToken', () => {
        it('generates a valid JWT token with 48-hour expiry', async () => {
            const token = await generatePanelistConfirmationToken(
                interviewStageId,
                panelistId,
                'confirm'
            );

            expect(token).toBeTruthy();
            expect(typeof token).toBe('string');
            expect(prismaMocks.panelistConfirmationUpdateMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: {
                        interviewStageId,
                        panelistId,
                    },
                    data: expect.objectContaining({
                        tokenHash: expect.any(String),
                        confirmationSentAt: expect.any(Date),
                    }),
                })
            );
        });

        it('stores token hash for single-use validation', async () => {
            const token = await generatePanelistConfirmationToken(
                interviewStageId,
                panelistId,
                'decline'
            );

            expect(prismaMocks.panelistConfirmationUpdateMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        tokenHash: expect.any(String),
                    }),
                })
            );
        });
    });

    describe('validatePanelistConfirmationToken', () => {
        it('validates a valid token and returns payload', async () => {
            const token = await generatePanelistConfirmationToken(
                interviewStageId,
                panelistId,
                'confirm'
            );

            prismaMocks.panelistConfirmationFindFirst.mockResolvedValue({
                id: 'conf-1',
                interviewStageId,
                panelistId,
                tokenHash: expect.any(String),
                status: 'pending',
            });

            const payload = await validatePanelistConfirmationToken(token);

            expect(payload.interviewStageId).toBe(interviewStageId);
            expect(payload.panelistId).toBe(panelistId);
            expect(payload.action).toBe('confirm');
        });

        it('throws error for already used token', async () => {
            const token = await generatePanelistConfirmationToken(
                interviewStageId,
                panelistId,
                'confirm'
            );

            prismaMocks.panelistConfirmationFindFirst.mockResolvedValue(null);

            await expect(validatePanelistConfirmationToken(token)).rejects.toThrow(
                'Token has already been used or is invalid'
            );
        });

        it('throws error for expired token', async () => {
            // Create a token that's already expired (mock time travel)
            vi.useFakeTimers();
            const token = await generatePanelistConfirmationToken(
                interviewStageId,
                panelistId,
                'confirm'
            );

            // Move time forward by 49 hours
            vi.advanceTimersByTime(49 * 60 * 60 * 1000);

            prismaMocks.panelistConfirmationFindFirst.mockResolvedValue({
                id: 'conf-1',
                tokenHash: expect.any(String),
            });

            await expect(validatePanelistConfirmationToken(token)).rejects.toThrow(
                'Confirmation link has expired'
            );

            vi.useRealTimers();
        });
    });

    describe('markTokenAsUsed', () => {
        it('clears token hash to prevent reuse', async () => {
            await markTokenAsUsed(interviewStageId, panelistId);

            expect(prismaMocks.panelistConfirmationUpdateMany).toHaveBeenCalledWith({
                where: {
                    interviewStageId,
                    panelistId,
                },
                data: {
                    tokenHash: null,
                },
            });
        });
    });
});
