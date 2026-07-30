import { describe, it, expect, vi, beforeEach } from 'vitest';
import { performScreening } from '../screeningService';
import prisma from '../../db/prisma';
import { getActiveThresholds } from '../thresholdService';

vi.mock('../../db/prisma');
vi.mock('../thresholdService');
vi.mock('../auditService');
vi.mock('../rejectionService');

describe('ScreeningService Integration', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should perform complete screening flow with shortlist recommendation', async () => {
        const mockApplication = {
            id: 'app-1',
            candidateId: 'candidate-1',
            requisitionId: 'req-1',
            resume: {
                id: 'resume-1',
                parsedData: {
                    skills: ['Python', 'React', 'PostgreSQL'],
                    experience_years: 5,
                    education: [{ degree: 'Bachelor', field: 'CS', institution: 'MIT' }],
                    employers: [],
                },
            },
            requisition: {
                requiredSkills: ['Python', 'React'],
                preferredSkills: ['PostgreSQL'],
                minExperienceYears: 3,
                educationLevel: 'bachelors',
            },
            candidate: {
                profile: {},
            },
        };

        const mockThresholds = {
            shortlistThreshold: 75,
            borderlineMin: 40,
            borderlineMax: 74,
            rejectThreshold: 39,
            version: 1,
        };

        vi.mocked(prisma.application.findUnique).mockResolvedValue(mockApplication as any);
        vi.mocked(prisma.screening.create).mockResolvedValue({
            id: 'screening-1',
            applicationId: 'app-1',
            score: 93,
            recommendation: 'shortlist',
        } as any);
        vi.mocked(prisma.application.update).mockResolvedValue({} as any);
        vi.mocked(getActiveThresholds).mockResolvedValue(mockThresholds as any);

        const result = await performScreening('app-1');

        expect(result.score).toBeGreaterThan(70);
        expect(result.recommendation).toBe('shortlist');
        expect(prisma.application.update).toHaveBeenCalledWith({
            where: { id: 'app-1' },
            data: { status: 'shortlisted' },
        });
    });

    it('should perform screening with reject recommendation', async () => {
        const mockApplication = {
            id: 'app-2',
            candidateId: 'candidate-2',
            requisitionId: 'req-1',
            resume: {
                id: 'resume-2',
                parsedData: {
                    skills: ['Java'],
                    experience_years: 1,
                    education: [],
                    employers: [],
                },
            },
            requisition: {
                requiredSkills: ['Python', 'React', 'PostgreSQL'],
                preferredSkills: ['Docker'],
                minExperienceYears: 5,
                educationLevel: 'masters',
            },
            candidate: {
                profile: {},
            },
        };

        const mockThresholds = {
            shortlistThreshold: 75,
            borderlineMin: 40,
            borderlineMax: 74,
            rejectThreshold: 39,
            version: 1,
        };

        vi.mocked(prisma.application.findUnique).mockResolvedValue(mockApplication as any);
        vi.mocked(prisma.screening.create).mockResolvedValue({
            id: 'screening-2',
            applicationId: 'app-2',
            score: 20,
            recommendation: 'reject',
        } as any);
        vi.mocked(prisma.application.update).mockResolvedValue({} as any);
        vi.mocked(getActiveThresholds).mockResolvedValue(mockThresholds as any);

        const result = await performScreening('app-2');

        expect(result.score).toBeLessThan(40);
        expect(result.recommendation).toBe('reject');
        expect(prisma.application.update).toHaveBeenCalledWith({
            where: { id: 'app-2' },
            data: { status: 'rejected' },
        });
    });

    it('should perform screening with manual_review recommendation', async () => {
        const mockApplication = {
            id: 'app-3',
            candidateId: 'candidate-3',
            requisitionId: 'req-1',
            resume: {
                id: 'resume-3',
                parsedData: {
                    skills: ['Python'],
                    experience_years: 3,
                    education: [{ degree: 'Bachelor', field: 'CS', institution: 'MIT' }],
                    employers: [],
                },
            },
            requisition: {
                requiredSkills: ['Python', 'React'],
                preferredSkills: [],
                minExperienceYears: 3,
                educationLevel: 'bachelors',
            },
            candidate: {
                profile: {},
            },
        };

        const mockThresholds = {
            shortlistThreshold: 75,
            borderlineMin: 40,
            borderlineMax: 74,
            rejectThreshold: 39,
            version: 1,
        };

        vi.mocked(prisma.application.findUnique).mockResolvedValue(mockApplication as any);
        vi.mocked(prisma.screening.create).mockResolvedValue({
            id: 'screening-3',
            applicationId: 'app-3',
            score: 58,
            recommendation: 'manual_review',
        } as any);
        vi.mocked(prisma.application.update).mockResolvedValue({} as any);
        vi.mocked(getActiveThresholds).mockResolvedValue(mockThresholds as any);

        const result = await performScreening('app-3');

        expect(result.score).toBeGreaterThanOrEqual(40);
        expect(result.score).toBeLessThan(75);
        expect(result.recommendation).toBe('manual_review');
        expect(prisma.application.update).toHaveBeenCalledWith({
            where: { id: 'app-3' },
            data: { status: 'pending_review' },
        });
    });

    it('should throw error if application not found', async () => {
        vi.mocked(prisma.application.findUnique).mockResolvedValue(null);

        await expect(performScreening('app-999')).rejects.toThrow('Application not found');
    });

    it('should throw error if resume not found', async () => {
        vi.mocked(prisma.application.findUnique).mockResolvedValue({
            id: 'app-1',
            resume: null,
        } as any);

        await expect(performScreening('app-1')).rejects.toThrow('Resume not found for application');
    });

    it('should throw error if resume not parsed', async () => {
        vi.mocked(prisma.application.findUnique).mockResolvedValue({
            id: 'app-1',
            resume: {
                id: 'resume-1',
                parsedData: null,
            },
        } as any);

        await expect(performScreening('app-1')).rejects.toThrow('Resume not parsed yet');
    });

    it('should store threshold version for auditability', async () => {
        const mockApplication = {
            id: 'app-1',
            candidateId: 'candidate-1',
            requisitionId: 'req-1',
            resume: {
                id: 'resume-1',
                parsedData: {
                    skills: ['Python'],
                    experience_years: 3,
                    education: [],
                    employers: [],
                },
            },
            requisition: {
                requiredSkills: ['Python'],
                preferredSkills: [],
                minExperienceYears: 0,
                educationLevel: null,
            },
            candidate: {
                profile: {},
            },
        };

        const mockThresholds = {
            shortlistThreshold: 75,
            borderlineMin: 40,
            borderlineMax: 74,
            rejectThreshold: 39,
            version: 5,
        };

        vi.mocked(prisma.application.findUnique).mockResolvedValue(mockApplication as any);
        vi.mocked(prisma.screening.create).mockResolvedValue({
            id: 'screening-1',
            thresholdVersion: 5,
        } as any);
        vi.mocked(prisma.application.update).mockResolvedValue({} as any);
        vi.mocked(getActiveThresholds).mockResolvedValue(mockThresholds as any);

        const result = await performScreening('app-1');

        expect(result.thresholdVersion).toBe(5);
        expect(prisma.screening.create).toHaveBeenCalledWith({
            data: expect.objectContaining({
                thresholdVersion: 5,
            }),
        });
    });
});
