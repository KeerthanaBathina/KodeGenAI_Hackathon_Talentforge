import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    withdrawApplication,
    canWithdrawApplication,
    WithdrawalError,
} from '../applicationWithdrawalService';
import prisma from '../../db/prisma';
import * as auditService from '../auditService';
import * as emailService from '../emailService';

// Mock dependencies
vi.mock('../../db/prisma', () => ({
    default: {
        application: {
            findUnique: vi.fn(),
            update: vi.fn(),
        },
    },
}));

vi.mock('../auditService', () => ({
    auditEvent: vi.fn(),
}));

vi.mock('../emailService', () => ({
    sendApplicationWithdrawnEmail: vi.fn(),
}));

vi.mock('../../utils/logger', () => ({
    default: {
        debug: vi.fn(),
        info: vi.fn(),
        error: vi.fn(),
    },
}));

describe('applicationWithdrawalService', () => {
    const mockCandidateId = '123e4567-e89b-12d3-a456-426614174000';
    const mockApplicationId = '123e4567-e89b-12d3-a456-426614174001';
    const mockRequisitionId = '123e4567-e89b-12d3-a456-426614174002';

    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('withdrawApplication', () => {
        const mockApplication = {
            id: mockApplicationId,
            candidateId: mockCandidateId,
            requisitionId: mockRequisitionId,
            status: 'submitted',
            createdAt: new Date(),
            updatedAt: new Date(),
            submittedAt: new Date(),
            draftData: null,
            draftSavedAt: null,
            candidate: {
                email: 'test@example.com',
                profile: {
                    fullName: 'John Doe',
                },
            },
            requisition: {
                title: 'Software Engineer',
            },
        };

        it('should withdraw submitted application successfully', async () => {
            (prisma.application.findUnique as any).mockResolvedValue(mockApplication);
            (prisma.application.update as any).mockResolvedValue({
                ...mockApplication,
                status: 'withdrawn',
            });

            const result = await withdrawApplication({
                applicationId: mockApplicationId,
                candidateId: mockCandidateId,
            });

            expect(result.status).toBe('withdrawn');
            expect(prisma.application.update).toHaveBeenCalledWith({
                where: { id: mockApplicationId },
                data: {
                    status: 'withdrawn',
                    updatedAt: expect.any(Date),
                },
                include: {
                    requisition: true,
                    candidate: {
                        include: {
                            profile: true,
                        },
                    },
                },
            });
        });

        it('should log audit event on withdrawal', async () => {
            (prisma.application.findUnique as any).mockResolvedValue(mockApplication);
            (prisma.application.update as any).mockResolvedValue({
                ...mockApplication,
                status: 'withdrawn',
            });

            await withdrawApplication({
                applicationId: mockApplicationId,
                candidateId: mockCandidateId,
            });

            expect(auditService.auditEvent).toHaveBeenCalledWith({
                entityType: 'application',
                entityId: mockApplicationId,
                action: 'application.withdrawn',
                actorId: mockCandidateId,
                metadata: {
                    requisitionId: mockRequisitionId,
                    withdrawnAt: expect.any(Date),
                    previousStatus: 'submitted',
                },
            });
        });

        it('should throw APPLICATION_NOT_FOUND when application does not exist', async () => {
            (prisma.application.findUnique as any).mockResolvedValue(null);

            await expect(
                withdrawApplication({
                    applicationId: mockApplicationId,
                    candidateId: mockCandidateId,
                })
            ).rejects.toThrow(WithdrawalError);

            await expect(
                withdrawApplication({
                    applicationId: mockApplicationId,
                    candidateId: mockCandidateId,
                })
            ).rejects.toThrow('Application not found');
        });

        it('should throw UNAUTHORIZED when candidateId does not match', async () => {
            (prisma.application.findUnique as any).mockResolvedValue(mockApplication);

            await expect(
                withdrawApplication({
                    applicationId: mockApplicationId,
                    candidateId: 'different-candidate-id',
                })
            ).rejects.toThrow(WithdrawalError);

            await expect(
                withdrawApplication({
                    applicationId: mockApplicationId,
                    candidateId: 'different-candidate-id',
                })
            ).rejects.toMatchObject({
                code: 'UNAUTHORIZED',
            });
        });

        it('should throw WITHDRAWAL_NOT_ALLOWED when status is not submitted', async () => {
            const screeningApplication = {
                ...mockApplication,
                status: 'screening',
            };

            (prisma.application.findUnique as any).mockResolvedValue(screeningApplication);

            await expect(
                withdrawApplication({
                    applicationId: mockApplicationId,
                    candidateId: mockCandidateId,
                })
            ).rejects.toThrow(WithdrawalError);

            await expect(
                withdrawApplication({
                    applicationId: mockApplicationId,
                    candidateId: mockCandidateId,
                })
            ).rejects.toMatchObject({
                code: 'WITHDRAWAL_NOT_ALLOWED',
                message: expect.stringContaining('screening'),
            });
        });

        it('should not allow withdrawal when status is pending_review', async () => {
            (prisma.application.findUnique as any).mockResolvedValue({
                ...mockApplication,
                status: 'pending_review',
            });

            await expect(
                withdrawApplication({
                    applicationId: mockApplicationId,
                    candidateId: mockCandidateId,
                })
            ).rejects.toMatchObject({
                code: 'WITHDRAWAL_NOT_ALLOWED',
            });
        });

        it('should not allow withdrawal when status is interviewing', async () => {
            (prisma.application.findUnique as any).mockResolvedValue({
                ...mockApplication,
                status: 'interviewing',
            });

            await expect(
                withdrawApplication({
                    applicationId: mockApplicationId,
                    candidateId: mockCandidateId,
                })
            ).rejects.toMatchObject({
                code: 'WITHDRAWAL_NOT_ALLOWED',
            });
        });

        it('should not allow withdrawal when status is offered', async () => {
            (prisma.application.findUnique as any).mockResolvedValue({
                ...mockApplication,
                status: 'offered',
            });

            await expect(
                withdrawApplication({
                    applicationId: mockApplicationId,
                    candidateId: mockCandidateId,
                })
            ).rejects.toMatchObject({
                code: 'WITHDRAWAL_NOT_ALLOWED',
            });
        });
    });

    describe('canWithdrawApplication', () => {
        it('should return true when status is submitted and candidate owns application', async () => {
            (prisma.application.findUnique as any).mockResolvedValue({
                id: mockApplicationId,
                candidateId: mockCandidateId,
                status: 'submitted',
            });

            const result = await canWithdrawApplication({
                applicationId: mockApplicationId,
                candidateId: mockCandidateId,
            });

            expect(result).toEqual({ canWithdraw: true });
        });

        it('should return false when application not found', async () => {
            (prisma.application.findUnique as any).mockResolvedValue(null);

            const result = await canWithdrawApplication({
                applicationId: mockApplicationId,
                candidateId: mockCandidateId,
            });

            expect(result).toEqual({
                canWithdraw: false,
                reason: 'Application not found',
            });
        });

        it('should return false when candidate does not own application', async () => {
            (prisma.application.findUnique as any).mockResolvedValue({
                id: mockApplicationId,
                candidateId: 'different-candidate',
                status: 'submitted',
            });

            const result = await canWithdrawApplication({
                applicationId: mockApplicationId,
                candidateId: mockCandidateId,
            });

            expect(result).toEqual({
                canWithdraw: false,
                reason: 'Not authorized',
            });
        });

        it('should return false when status is not submitted', async () => {
            (prisma.application.findUnique as any).mockResolvedValue({
                id: mockApplicationId,
                candidateId: mockCandidateId,
                status: 'screening',
            });

            const result = await canWithdrawApplication({
                applicationId: mockApplicationId,
                candidateId: mockCandidateId,
            });

            expect(result).toEqual({
                canWithdraw: false,
                reason: 'Application is screening and cannot be withdrawn',
            });
        });

        it('should return false when status is rejected', async () => {
            (prisma.application.findUnique as any).mockResolvedValue({
                id: mockApplicationId,
                candidateId: mockCandidateId,
                status: 'rejected',
            });

            const result = await canWithdrawApplication({
                applicationId: mockApplicationId,
                candidateId: mockCandidateId,
            });

            expect(result.canWithdraw).toBe(false);
            expect(result.reason).toContain('rejected');
        });

        it('should return false when status is withdrawn', async () => {
            (prisma.application.findUnique as any).mockResolvedValue({
                id: mockApplicationId,
                candidateId: mockCandidateId,
                status: 'withdrawn',
            });

            const result = await canWithdrawApplication({
                applicationId: mockApplicationId,
                candidateId: mockCandidateId,
            });

            expect(result.canWithdraw).toBe(false);
            expect(result.reason).toContain('withdrawn');
        });
    });
});
