import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    resolveProvider,
    checkDuplicateLaunch,
    ProviderResolutionError,
} from '../assessmentProviderService';
import prisma from '../../db/prisma';

// Mock Prisma client
vi.mock('../../db/prisma', () => ({
    default: {
        application: {
            findUnique: vi.fn(),
        },
        assessmentProvider: {
            findUnique: vi.fn(),
            findFirst: vi.fn(),
        },
        assessmentSession: {
            findFirst: vi.fn(),
        },
    },
}));

// Mock logger
vi.mock('../../utils/logger', () => ({
    default: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    },
}));

describe('assessmentProviderService', () => {
    const mockApplicationId = '123e4567-e89b-12d3-a456-426614174000';
    const mockProviderId = '123e4567-e89b-12d3-a456-426614174001';
    const mockRequisitionId = '123e4567-e89b-12d3-a456-426614174002';

    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('resolveProvider', () => {
        const mockApplication = {
            id: mockApplicationId,
            candidateId: '123e4567-e89b-12d3-a456-426614174003',
            requisitionId: mockRequisitionId,
            status: 'shortlisted',
            submittedAt: new Date(),
            createdAt: new Date(),
            updatedAt: new Date(),
            requisition: {
                id: mockRequisitionId,
                title: 'Senior Engineer',
                department: 'Engineering',
                jobFamilyId: '123e4567-e89b-12d3-a456-426614174004',
                status: 'open',
            },
        };

        const mockProvider = {
            id: mockProviderId,
            name: 'TestProvider',
            apiEndpoint: 'https://api.testprovider.com',
            authMode: 'api_key',
            hmacSecret: 'secret123',
            timeoutSeconds: 30,
            active: true,
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        it('should resolve provider successfully with default provider', async () => {
            (prisma.application.findUnique as any).mockResolvedValue(mockApplication);
            (prisma.assessmentProvider.findFirst as any).mockResolvedValue(mockProvider);
            (prisma.assessmentProvider.findUnique as any).mockResolvedValue(mockProvider);

            const result = await resolveProvider({
                applicationId: mockApplicationId,
            });

            expect(result).toEqual({
                provider: mockProvider,
                application: mockApplication,
            });

            expect(prisma.application.findUnique).toHaveBeenCalledWith({
                where: { id: mockApplicationId },
                include: { requisition: true },
            });

            expect(prisma.assessmentProvider.findFirst).toHaveBeenCalledWith({
                where: { active: true },
            });

            expect(prisma.assessmentProvider.findUnique).toHaveBeenCalledWith({
                where: { id: mockProviderId },
            });
        });

        it('should resolve provider with providerId override', async () => {
            (prisma.application.findUnique as any).mockResolvedValue(mockApplication);
            (prisma.assessmentProvider.findUnique as any).mockResolvedValue(mockProvider);

            const result = await resolveProvider({
                applicationId: mockApplicationId,
                providerId: mockProviderId,
            });

            expect(result.provider).toEqual(mockProvider);

            expect(prisma.assessmentProvider.findUnique).toHaveBeenCalledWith({
                where: { id: mockProviderId },
            });
        });

        it('should throw APPLICATION_NOT_FOUND when application does not exist', async () => {
            (prisma.application.findUnique as any).mockResolvedValue(null);

            await expect(
                resolveProvider({
                    applicationId: mockApplicationId,
                })
            ).rejects.toThrow(ProviderResolutionError);

            await expect(
                resolveProvider({
                    applicationId: mockApplicationId,
                })
            ).rejects.toMatchObject({
                code: 'APPLICATION_NOT_FOUND',
            });
        });

        it('should throw APPLICATION_INELIGIBLE when status is not eligible', async () => {
            const ineligibleApplication = {
                ...mockApplication,
                status: 'rejected',
            };

            (prisma.application.findUnique as any).mockResolvedValue(ineligibleApplication);

            await expect(
                resolveProvider({
                    applicationId: mockApplicationId,
                })
            ).rejects.toThrow(ProviderResolutionError);

            await expect(
                resolveProvider({
                    applicationId: mockApplicationId,
                })
            ).rejects.toMatchObject({
                code: 'APPLICATION_INELIGIBLE',
            });
        });

        it('should throw NO_PROVIDER_CONFIGURED when no active provider exists', async () => {
            (prisma.application.findUnique as any).mockResolvedValue(mockApplication);
            (prisma.assessmentProvider.findFirst as any).mockResolvedValue(null);

            await expect(
                resolveProvider({
                    applicationId: mockApplicationId,
                })
            ).rejects.toThrow(ProviderResolutionError);

            await expect(
                resolveProvider({
                    applicationId: mockApplicationId,
                })
            ).rejects.toMatchObject({
                code: 'NO_PROVIDER_CONFIGURED',
            });
        });

        it('should throw PROVIDER_NOT_FOUND when override provider does not exist', async () => {
            (prisma.application.findUnique as any).mockResolvedValue(mockApplication);
            (prisma.assessmentProvider.findUnique as any).mockResolvedValue(null);

            await expect(
                resolveProvider({
                    applicationId: mockApplicationId,
                    providerId: mockProviderId,
                })
            ).rejects.toThrow(ProviderResolutionError);

            await expect(
                resolveProvider({
                    applicationId: mockApplicationId,
                    providerId: mockProviderId,
                })
            ).rejects.toMatchObject({
                code: 'PROVIDER_NOT_FOUND',
            });
        });

        it('should throw PROVIDER_INACTIVE when provider is not active', async () => {
            const inactiveProvider = {
                ...mockProvider,
                active: false,
            };

            (prisma.application.findUnique as any).mockResolvedValue(mockApplication);
            (prisma.assessmentProvider.findUnique as any).mockResolvedValue(inactiveProvider);

            await expect(
                resolveProvider({
                    applicationId: mockApplicationId,
                    providerId: mockProviderId,
                })
            ).rejects.toThrow(ProviderResolutionError);

            await expect(
                resolveProvider({
                    applicationId: mockApplicationId,
                    providerId: mockProviderId,
                })
            ).rejects.toMatchObject({
                code: 'PROVIDER_INACTIVE',
            });
        });

        it('should throw PROVIDER_MISCONFIGURED when required config is missing', async () => {
            const misconfiguredProvider = {
                ...mockProvider,
                apiEndpoint: '',
            };

            (prisma.application.findUnique as any).mockResolvedValue(mockApplication);
            (prisma.assessmentProvider.findUnique as any).mockResolvedValue(misconfiguredProvider);

            await expect(
                resolveProvider({
                    applicationId: mockApplicationId,
                    providerId: mockProviderId,
                })
            ).rejects.toThrow(ProviderResolutionError);

            await expect(
                resolveProvider({
                    applicationId: mockApplicationId,
                    providerId: mockProviderId,
                })
            ).rejects.toMatchObject({
                code: 'PROVIDER_MISCONFIGURED',
            });
        });
    });

    describe('checkDuplicateLaunch', () => {
        it('should return true when active session exists', async () => {
            const mockSession = {
                id: '123e4567-e89b-12d3-a456-426614174005',
                applicationId: mockApplicationId,
                providerId: mockProviderId,
                sessionToken: 'sess_123',
                testUrl: 'https://test.com',
                status: 'in_progress',
                launchedAt: new Date(),
            };

            (prisma.assessmentSession.findFirst as any).mockResolvedValue(mockSession);

            const result = await checkDuplicateLaunch(mockApplicationId);

            expect(result).toBe(true);

            expect(prisma.assessmentSession.findFirst).toHaveBeenCalledWith({
                where: {
                    applicationId: mockApplicationId,
                    status: {
                        in: ['in_progress'],
                    },
                },
            });
        });

        it('should return false when no active session exists', async () => {
            (prisma.assessmentSession.findFirst as any).mockResolvedValue(null);

            const result = await checkDuplicateLaunch(mockApplicationId);

            expect(result).toBe(false);
        });
    });
});
