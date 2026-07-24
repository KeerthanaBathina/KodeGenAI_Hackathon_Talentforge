import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    checkApplicationEligibility,
    getActiveApplication,
    getCoolingPeriodStatus,
} from '../applicationStatusService';
import prisma from '../../db/prisma';

// Mock Prisma client
vi.mock('../../db/prisma', () => ({
    default: {
        application: {
            findFirst: vi.fn(),
        },
    },
}));

// Mock logger
vi.mock('../../utils/logger', () => ({
    default: {
        debug: vi.fn(),
        info: vi.fn(),
        error: vi.fn(),
    },
}));

describe('applicationStatusService', () => {
    const mockCandidateId = '123e4567-e89b-12d3-a456-426614174000';
    const mockRequisitionId = '123e4567-e89b-12d3-a456-426614174001';

    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('getActiveApplication', () => {
        it('should return active draft application', async () => {
            const mockApplication = {
                id: '123e4567-e89b-12d3-a456-426614174002',
                candidateId: mockCandidateId,
                requisitionId: mockRequisitionId,
                status: 'draft',
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            (prisma.application.findFirst as any).mockResolvedValue(mockApplication);

            const result = await getActiveApplication({
                candidateId: mockCandidateId,
                requisitionId: mockRequisitionId,
            });

            expect(result).toEqual(mockApplication);
            expect(prisma.application.findFirst).toHaveBeenCalledWith({
                where: {
                    candidateId: mockCandidateId,
                    requisitionId: mockRequisitionId,
                    status: {
                        in: [
                            'draft',
                            'submitted',
                            'screening',
                            'pending_review',
                            'shortlisted',
                            'interviewing',
                            'offer_pending',
                            'offered',
                        ],
                    },
                },
                orderBy: {
                    createdAt: 'desc',
                },
            });
        });

        it('should return null when no active application exists', async () => {
            (prisma.application.findFirst as any).mockResolvedValue(null);

            const result = await getActiveApplication({
                candidateId: mockCandidateId,
                requisitionId: mockRequisitionId,
            });

            expect(result).toBeNull();
        });

        it('should return submitted application', async () => {
            const mockApplication = {
                id: '123e4567-e89b-12d3-a456-426614174002',
                candidateId: mockCandidateId,
                requisitionId: mockRequisitionId,
                status: 'submitted',
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            (prisma.application.findFirst as any).mockResolvedValue(mockApplication);

            const result = await getActiveApplication({
                candidateId: mockCandidateId,
                requisitionId: mockRequisitionId,
            });

            expect(result).toEqual(mockApplication);
        });

        it('should return interviewing application', async () => {
            const mockApplication = {
                id: '123e4567-e89b-12d3-a456-426614174002',
                candidateId: mockCandidateId,
                requisitionId: mockRequisitionId,
                status: 'interviewing',
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            (prisma.application.findFirst as any).mockResolvedValue(mockApplication);

            const result = await getActiveApplication({
                candidateId: mockCandidateId,
                requisitionId: mockRequisitionId,
            });

            expect(result).toEqual(mockApplication);
        });
    });

    describe('getCoolingPeriodStatus', () => {
        it('should return in cooling period when rejected 30 days ago', async () => {
            const rejectedDate = new Date();
            rejectedDate.setDate(rejectedDate.getDate() - 30); // 30 days ago

            const mockRejectedApp = {
                id: '123e4567-e89b-12d3-a456-426614174002',
                candidateId: mockCandidateId,
                requisitionId: mockRequisitionId,
                status: 'rejected',
                updatedAt: rejectedDate,
            };

            (prisma.application.findFirst as any).mockResolvedValue(mockRejectedApp);

            const result = await getCoolingPeriodStatus({
                candidateId: mockCandidateId,
                requisitionId: mockRequisitionId,
            });

            expect(result.inCoolingPeriod).toBe(true);
            expect(result.daysRemaining).toBe(60); // 90 - 30 = 60
            expect(result.rejectedAt).toEqual(rejectedDate);
        });

        it('should return in cooling period when rejected 89 days ago', async () => {
            const rejectedDate = new Date();
            rejectedDate.setDate(rejectedDate.getDate() - 89); // 89 days ago

            const mockRejectedApp = {
                id: '123e4567-e89b-12d3-a456-426614174002',
                candidateId: mockCandidateId,
                requisitionId: mockRequisitionId,
                status: 'rejected',
                updatedAt: rejectedDate,
            };

            (prisma.application.findFirst as any).mockResolvedValue(mockRejectedApp);

            const result = await getCoolingPeriodStatus({
                candidateId: mockCandidateId,
                requisitionId: mockRequisitionId,
            });

            expect(result.inCoolingPeriod).toBe(true);
            expect(result.daysRemaining).toBe(1); // 90 - 89 = 1
            expect(result.rejectedAt).toEqual(rejectedDate);
        });

        it('should return NOT in cooling period when rejected 91 days ago', async () => {
            const rejectedDate = new Date();
            rejectedDate.setDate(rejectedDate.getDate() - 91); // 91 days ago

            const mockRejectedApp = {
                id: '123e4567-e89b-12d3-a456-426614174002',
                candidateId: mockCandidateId,
                requisitionId: mockRequisitionId,
                status: 'rejected',
                updatedAt: rejectedDate,
            };

            (prisma.application.findFirst as any).mockResolvedValue(mockRejectedApp);

            const result = await getCoolingPeriodStatus({
                candidateId: mockCandidateId,
                requisitionId: mockRequisitionId,
            });

            expect(result.inCoolingPeriod).toBe(false);
            expect(result.daysRemaining).toBe(0);
            expect(result.rejectedAt).toEqual(rejectedDate);
        });

        it('should return NOT in cooling period when no rejection found', async () => {
            (prisma.application.findFirst as any).mockResolvedValue(null);

            const result = await getCoolingPeriodStatus({
                candidateId: mockCandidateId,
                requisitionId: mockRequisitionId,
            });

            expect(result.inCoolingPeriod).toBe(false);
            expect(result.daysRemaining).toBe(0);
            expect(result.rejectedAt).toBeNull();
        });

        it('should use most recent rejection date when multiple rejections exist', async () => {
            const recentRejection = new Date();
            recentRejection.setDate(recentRejection.getDate() - 10); // 10 days ago

            const mockRejectedApp = {
                id: '123e4567-e89b-12d3-a456-426614174002',
                candidateId: mockCandidateId,
                requisitionId: mockRequisitionId,
                status: 'rejected',
                updatedAt: recentRejection,
            };

            (prisma.application.findFirst as any).mockResolvedValue(mockRejectedApp);

            const result = await getCoolingPeriodStatus({
                candidateId: mockCandidateId,
                requisitionId: mockRequisitionId,
            });

            expect(result.inCoolingPeriod).toBe(true);
            expect(result.daysRemaining).toBe(80); // 90 - 10 = 80
            expect(prisma.application.findFirst).toHaveBeenCalledWith({
                where: {
                    candidateId: mockCandidateId,
                    requisitionId: mockRequisitionId,
                    status: 'rejected',
                },
                orderBy: {
                    updatedAt: 'desc', // Most recent
                },
            });
        });
    });

    describe('checkApplicationEligibility', () => {
        it('should return NOT eligible when active application exists', async () => {
            const mockActiveApp = {
                id: '123e4567-e89b-12d3-a456-426614174002',
                candidateId: mockCandidateId,
                requisitionId: mockRequisitionId,
                status: 'submitted',
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            (prisma.application.findFirst as any).mockResolvedValue(mockActiveApp);

            const result = await checkApplicationEligibility({
                candidateId: mockCandidateId,
                requisitionId: mockRequisitionId,
            });

            expect(result.canApply).toBe(false);
            expect(result.reason).toBe('active_application');
            expect(result.existingApplicationId).toBe(mockActiveApp.id);
        });

        it('should return NOT eligible when in cooling period', async () => {
            const rejectedDate = new Date();
            rejectedDate.setDate(rejectedDate.getDate() - 45); // 45 days ago

            const mockRejectedApp = {
                id: '123e4567-e89b-12d3-a456-426614174002',
                candidateId: mockCandidateId,
                requisitionId: mockRequisitionId,
                status: 'rejected',
                updatedAt: rejectedDate,
            };

            // First call for active application (returns null)
            // Second call for rejected application (returns mockRejectedApp)
            (prisma.application.findFirst as any)
                .mockResolvedValueOnce(null)
                .mockResolvedValueOnce(mockRejectedApp);

            const result = await checkApplicationEligibility({
                candidateId: mockCandidateId,
                requisitionId: mockRequisitionId,
            });

            expect(result.canApply).toBe(false);
            expect(result.reason).toBe('cooling_period');
            expect(result.daysRemaining).toBe(45); // 90 - 45 = 45
            expect(result.rejectedAt).toEqual(rejectedDate);
        });

        it('should return eligible when no active app and no cooling period', async () => {
            (prisma.application.findFirst as any).mockResolvedValue(null);

            const result = await checkApplicationEligibility({
                candidateId: mockCandidateId,
                requisitionId: mockRequisitionId,
            });

            expect(result.canApply).toBe(true);
            expect(result.reason).toBe('eligible');
            expect(result.existingApplicationId).toBeUndefined();
            expect(result.daysRemaining).toBeUndefined();
        });

        it('should return eligible when cooling period expired', async () => {
            const rejectedDate = new Date();
            rejectedDate.setDate(rejectedDate.getDate() - 100); // 100 days ago

            const mockRejectedApp = {
                id: '123e4567-e89b-12d3-a456-426614174002',
                candidateId: mockCandidateId,
                requisitionId: mockRequisitionId,
                status: 'rejected',
                updatedAt: rejectedDate,
            };

            (prisma.application.findFirst as any)
                .mockResolvedValueOnce(null)
                .mockResolvedValueOnce(mockRejectedApp);

            const result = await checkApplicationEligibility({
                candidateId: mockCandidateId,
                requisitionId: mockRequisitionId,
            });

            expect(result.canApply).toBe(true);
            expect(result.reason).toBe('eligible');
        });

        it('should fail open (return eligible) on database error', async () => {
            (prisma.application.findFirst as any).mockRejectedValue(new Error('Database error'));

            const result = await checkApplicationEligibility({
                candidateId: mockCandidateId,
                requisitionId: mockRequisitionId,
            });

            expect(result.canApply).toBe(true);
            expect(result.reason).toBe('eligible');
        });
    });
});
