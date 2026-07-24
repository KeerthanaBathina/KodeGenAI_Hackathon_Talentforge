import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    getActiveThresholds,
    getRecommendation,
    clearThresholdCache,
    createThresholdVersion,
} from '../thresholdService';
import prisma from '../../db/prisma';

vi.mock('../../db/prisma');

describe('ThresholdService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        clearThresholdCache();
    });

    describe('getRecommendation', () => {
        const mockThresholds = {
            id: 'threshold-1',
            shortlistThreshold: 75,
            borderlineMin: 40,
            borderlineMax: 74,
            rejectThreshold: 39,
            version: 1,
            effectiveFrom: new Date(),
            createdAt: new Date(),
        };

        it('should recommend shortlist for score at threshold', () => {
            expect(getRecommendation(75, mockThresholds)).toBe('shortlist');
        });

        it('should recommend shortlist for score above threshold', () => {
            expect(getRecommendation(80, mockThresholds)).toBe('shortlist');
        });

        it('should recommend shortlist for perfect score', () => {
            expect(getRecommendation(100, mockThresholds)).toBe('shortlist');
        });

        it('should recommend shortlist for score one above threshold', () => {
            expect(getRecommendation(76, mockThresholds)).toBe('shortlist');
        });

        it('should recommend reject for score at threshold', () => {
            expect(getRecommendation(39, mockThresholds)).toBe('reject');
        });

        it('should recommend reject for score below threshold', () => {
            expect(getRecommendation(30, mockThresholds)).toBe('reject');
        });

        it('should recommend reject for zero score', () => {
            expect(getRecommendation(0, mockThresholds)).toBe('reject');
        });

        it('should recommend reject for score one below threshold', () => {
            expect(getRecommendation(38, mockThresholds)).toBe('reject');
        });

        it('should recommend manual_review for borderline min', () => {
            expect(getRecommendation(40, mockThresholds)).toBe('manual_review');
        });

        it('should recommend manual_review for borderline max', () => {
            expect(getRecommendation(74, mockThresholds)).toBe('manual_review');
        });

        it('should recommend manual_review for mid-borderline', () => {
            expect(getRecommendation(55, mockThresholds)).toBe('manual_review');
        });

        it('should recommend manual_review for score one above borderline min', () => {
            expect(getRecommendation(41, mockThresholds)).toBe('manual_review');
        });

        it('should recommend manual_review for score one below borderline max', () => {
            expect(getRecommendation(73, mockThresholds)).toBe('manual_review');
        });
    });

    describe('getActiveThresholds', () => {
        it('should fetch thresholds from database', async () => {
            const mockThreshold = {
                id: 'threshold-1',
                shortlistThreshold: 75,
                borderlineMin: 40,
                borderlineMax: 74,
                rejectThreshold: 39,
                version: 1,
                effectiveFrom: new Date(),
                createdAt: new Date(),
            };

            vi.mocked(prisma.screeningThreshold.findFirst).mockResolvedValue(mockThreshold as any);

            const result = await getActiveThresholds();

            expect(result).toEqual(mockThreshold);
            expect(prisma.screeningThreshold.findFirst).toHaveBeenCalledWith({
                where: {
                    effectiveFrom: {
                        lte: expect.any(Date),
                    },
                },
                orderBy: {
                    effectiveFrom: 'desc',
                },
            });
        });

        it('should cache thresholds', async () => {
            const mockThreshold = {
                id: 'threshold-1',
                shortlistThreshold: 75,
                borderlineMin: 40,
                borderlineMax: 74,
                rejectThreshold: 39,
                version: 1,
                effectiveFrom: new Date(),
                createdAt: new Date(),
            } as any;

            vi.mocked(prisma.screeningThreshold.findFirst).mockResolvedValue(mockThreshold);

            await getActiveThresholds();
            await getActiveThresholds(); // Second call should use cache

            expect(prisma.screeningThreshold.findFirst).toHaveBeenCalledTimes(1);
        });

        it('should throw error if no thresholds found', async () => {
            vi.mocked(prisma.screeningThreshold.findFirst).mockResolvedValue(null);

            await expect(getActiveThresholds()).rejects.toThrow('No active screening thresholds found');
        });
    });

    describe('createThresholdVersion', () => {
        it('should create threshold with incremented version', async () => {
            const latestThreshold = {
                version: 2,
            };

            const newThreshold = {
                id: 'threshold-3',
                shortlistThreshold: 80,
                borderlineMin: 45,
                borderlineMax: 79,
                rejectThreshold: 44,
                version: 3,
                effectiveFrom: new Date(),
                createdAt: new Date(),
            };

            vi.mocked(prisma.screeningThreshold.findFirst).mockResolvedValue(latestThreshold as any);
            vi.mocked(prisma.screeningThreshold.create).mockResolvedValue(newThreshold as any);

            const result = await createThresholdVersion({
                shortlistThreshold: 80,
                borderlineMin: 45,
                borderlineMax: 79,
                rejectThreshold: 44,
            });

            expect(result.version).toBe(3);
            expect(prisma.screeningThreshold.create).toHaveBeenCalledWith({
                data: expect.objectContaining({
                    shortlistThreshold: 80,
                    version: 3,
                }),
            });
        });

        it('should start at version 1 if no thresholds exist', async () => {
            vi.mocked(prisma.screeningThreshold.findFirst).mockResolvedValue(null);
            vi.mocked(prisma.screeningThreshold.create).mockResolvedValue({
                id: 'threshold-1',
                version: 1,
            } as any);

            const result = await createThresholdVersion({
                shortlistThreshold: 75,
                borderlineMin: 40,
                borderlineMax: 74,
                rejectThreshold: 39,
            });

            expect(result.version).toBe(1);
        });
    });
});
