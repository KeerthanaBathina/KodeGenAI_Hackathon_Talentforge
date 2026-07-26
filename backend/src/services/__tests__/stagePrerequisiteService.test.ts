import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    canScheduleStage,
    getAvailableStages,
    getStageSequence,
    getApplicationStageStatus,
} from '../stagePrerequisiteService';
import { prisma } from '../../db/prisma';

vi.mock('../../db/prisma', () => ({
    prisma: {
        application: {
            findUnique: vi.fn(),
        },
    },
}));

describe('stagePrerequisiteService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('getStageSequence', () => {
        it('should return fresher sequence with aptitude first', () => {
            const sequence = getStageSequence('fresher');
            expect(sequence).toHaveLength(3);
            expect(sequence[0].stage).toBe('aptitude');
            expect(sequence[0].prerequisiteStages).toEqual([]);
            expect(sequence[1].stage).toBe('technical');
            expect(sequence[1].prerequisiteStages).toEqual(['aptitude']);
            expect(sequence[2].stage).toBe('cultural');
            expect(sequence[2].prerequisiteStages).toEqual(['aptitude', 'technical']);
        });

        it('should return experienced sequence without aptitude', () => {
            const sequence = getStageSequence('experienced');
            expect(sequence).toHaveLength(3);
            expect(sequence[0].stage).toBe('technical');
            expect(sequence[0].prerequisiteStages).toEqual([]);
            expect(sequence.some((s) => s.stage === 'aptitude')).toBe(false);
        });

        it('should include system_design for experienced path', () => {
            const sequence = getStageSequence('experienced');
            expect(sequence[1].stage).toBe('system_design');
            expect(sequence[1].prerequisiteStages).toEqual(['technical']);
        });

        it('should have cultural as final stage for both paths', () => {
            const fresherSequence = getStageSequence('fresher');
            const experiencedSequence = getStageSequence('experienced');
            
            expect(fresherSequence[fresherSequence.length - 1].stage).toBe('cultural');
            expect(experiencedSequence[experiencedSequence.length - 1].stage).toBe('cultural');
        });
    });

    describe('canScheduleStage', () => {
        it('should allow scheduling aptitude for fresher with no prerequisites', async () => {
            vi.mocked(prisma.application.findUnique).mockResolvedValue({
                id: 'app-123',
                path: 'fresher',
                interviewStages: [],
            } as any);

            const result = await canScheduleStage('app-123', 'aptitude');
            expect(result.canSchedule).toBe(true);
            expect(result.missingStages).toEqual([]);
            expect(result.reason).toBeUndefined();
        });

        it('should block technical for fresher without completed aptitude', async () => {
            vi.mocked(prisma.application.findUnique).mockResolvedValue({
                id: 'app-123',
                path: 'fresher',
                interviewStages: [],
            } as any);

            const result = await canScheduleStage('app-123', 'technical');
            expect(result.canSchedule).toBe(false);
            expect(result.missingStages).toContain('aptitude');
            expect(result.reason).toContain('aptitude');
            expect(result.reason).toContain('must be completed');
        });

        it('should allow technical for fresher after aptitude completion', async () => {
            vi.mocked(prisma.application.findUnique).mockResolvedValue({
                id: 'app-123',
                path: 'fresher',
                interviewStages: [
                    { type: 'aptitude', state: 'completed' },
                ],
            } as any);

            const result = await canScheduleStage('app-123', 'technical');
            expect(result.canSchedule).toBe(true);
            expect(result.missingStages).toEqual([]);
        });

        it('should allow technical for experienced without aptitude', async () => {
            vi.mocked(prisma.application.findUnique).mockResolvedValue({
                id: 'app-123',
                path: 'experienced',
                interviewStages: [],
            } as any);

            const result = await canScheduleStage('app-123', 'technical');
            expect(result.canSchedule).toBe(true);
            expect(result.missingStages).toEqual([]);
        });

        it('should block aptitude for experienced path', async () => {
            vi.mocked(prisma.application.findUnique).mockResolvedValue({
                id: 'app-123',
                path: 'experienced',
                interviewStages: [],
            } as any);

            const result = await canScheduleStage('app-123', 'aptitude');
            expect(result.canSchedule).toBe(false);
            expect(result.reason).toContain('not part of experienced path');
        });

        it('should block cultural for fresher without both prerequisites', async () => {
            vi.mocked(prisma.application.findUnique).mockResolvedValue({
                id: 'app-123',
                path: 'fresher',
                interviewStages: [
                    { type: 'aptitude', state: 'completed' },
                ],
            } as any);

            const result = await canScheduleStage('app-123', 'cultural');
            expect(result.canSchedule).toBe(false);
            expect(result.missingStages).toContain('technical');
        });

        it('should allow cultural for fresher after all prerequisites', async () => {
            vi.mocked(prisma.application.findUnique).mockResolvedValue({
                id: 'app-123',
                path: 'fresher',
                interviewStages: [
                    { type: 'aptitude', state: 'completed' },
                    { type: 'technical', state: 'completed' },
                ],
            } as any);

            const result = await canScheduleStage('app-123', 'cultural');
            expect(result.canSchedule).toBe(true);
            expect(result.missingStages).toEqual([]);
        });

        it('should block system_design for experienced without technical', async () => {
            vi.mocked(prisma.application.findUnique).mockResolvedValue({
                id: 'app-123',
                path: 'experienced',
                interviewStages: [],
            } as any);

            const result = await canScheduleStage('app-123', 'system_design');
            expect(result.canSchedule).toBe(false);
            expect(result.missingStages).toContain('technical');
        });

        it('should throw error when application not found', async () => {
            vi.mocked(prisma.application.findUnique).mockResolvedValue(null);

            await expect(canScheduleStage('app-nonexistent', 'technical')).rejects.toThrow(
                'Application app-nonexistent not found'
            );
        });
    });

    describe('getAvailableStages', () => {
        it('should return only aptitude for new fresher candidate', async () => {
            vi.mocked(prisma.application.findUnique).mockResolvedValue({
                path: 'fresher',
                interviewStages: [],
            } as any);

            const available = await getAvailableStages('app-123');
            expect(available).toEqual(['aptitude']);
        });

        it('should return technical after aptitude completion', async () => {
            vi.mocked(prisma.application.findUnique).mockResolvedValue({
                path: 'fresher',
                interviewStages: [
                    { type: 'aptitude', state: 'completed' },
                ],
            } as any);

            const available = await getAvailableStages('app-123');
            expect(available).toEqual(['technical']);
        });

        it('should return cultural after all prerequisites complete', async () => {
            vi.mocked(prisma.application.findUnique).mockResolvedValue({
                path: 'fresher',
                interviewStages: [
                    { type: 'aptitude', state: 'completed' },
                    { type: 'technical', state: 'completed' },
                ],
            } as any);

            const available = await getAvailableStages('app-123');
            expect(available).toEqual(['cultural']);
        });

        it('should exclude scheduled but not completed stages', async () => {
            vi.mocked(prisma.application.findUnique).mockResolvedValue({
                path: 'fresher',
                interviewStages: [
                    { type: 'aptitude', state: 'scheduled' },
                ],
            } as any);

            const available = await getAvailableStages('app-123');
            expect(available).toEqual([]);
        });

        it('should return technical for new experienced candidate', async () => {
            vi.mocked(prisma.application.findUnique).mockResolvedValue({
                path: 'experienced',
                interviewStages: [],
            } as any);

            const available = await getAvailableStages('app-123');
            expect(available).toEqual(['technical']);
        });

        it('should return system_design after technical completion for experienced', async () => {
            vi.mocked(prisma.application.findUnique).mockResolvedValue({
                path: 'experienced',
                interviewStages: [
                    { type: 'technical', state: 'completed' },
                ],
            } as any);

            const available = await getAvailableStages('app-123');
            expect(available).toEqual(['system_design']);
        });

        it('should return empty array when all stages completed', async () => {
            vi.mocked(prisma.application.findUnique).mockResolvedValue({
                path: 'fresher',
                interviewStages: [
                    { type: 'aptitude', state: 'completed' },
                    { type: 'technical', state: 'completed' },
                    { type: 'cultural', state: 'completed' },
                ],
            } as any);

            const available = await getAvailableStages('app-123');
            expect(available).toEqual([]);
        });

        it('should throw error when application not found', async () => {
            vi.mocked(prisma.application.findUnique).mockResolvedValue(null);

            await expect(getAvailableStages('app-nonexistent')).rejects.toThrow(
                'Application app-nonexistent not found'
            );
        });
    });

    describe('getApplicationStageStatus', () => {
        it('should mark aptitude as completed and technical as available', async () => {
            vi.mocked(prisma.application.findUnique).mockResolvedValue({
                path: 'fresher',
                interviewStages: [
                    { type: 'aptitude', state: 'completed' },
                ],
            } as any);

            const statuses = await getApplicationStageStatus('app-123');
            expect(statuses[0].stage).toBe('aptitude');
            expect(statuses[0].status).toBe('completed');
            expect(statuses[1].stage).toBe('technical');
            expect(statuses[1].status).toBe('available');
            expect(statuses[2].stage).toBe('cultural');
            expect(statuses[2].status).toBe('locked');
        });

        it('should show missing prerequisites for locked stages', async () => {
            vi.mocked(prisma.application.findUnique).mockResolvedValue({
                path: 'fresher',
                interviewStages: [],
            } as any);

            const statuses = await getApplicationStageStatus('app-123');
            expect(statuses[0].missingPrerequisites).toEqual([]);
            expect(statuses[1].missingPrerequisites).toContain('aptitude');
            expect(statuses[2].missingPrerequisites).toContain('aptitude');
            expect(statuses[2].missingPrerequisites).toContain('technical');
        });

        it('should mark all stages available when prerequisites met', async () => {
            vi.mocked(prisma.application.findUnique).mockResolvedValue({
                path: 'fresher',
                interviewStages: [
                    { type: 'aptitude', state: 'completed' },
                    { type: 'technical', state: 'completed' },
                ],
            } as any);

            const statuses = await getApplicationStageStatus('app-123');
            expect(statuses[0].status).toBe('completed');
            expect(statuses[1].status).toBe('completed');
            expect(statuses[2].status).toBe('available');
        });

        it('should handle experienced path correctly', async () => {
            vi.mocked(prisma.application.findUnique).mockResolvedValue({
                path: 'experienced',
                interviewStages: [],
            } as any);

            const statuses = await getApplicationStageStatus('app-123');
            expect(statuses).toHaveLength(3);
            expect(statuses[0].stage).toBe('technical');
            expect(statuses[0].status).toBe('available');
            expect(statuses[1].stage).toBe('system_design');
            expect(statuses[1].status).toBe('locked');
            expect(statuses[2].stage).toBe('cultural');
            expect(statuses[2].status).toBe('locked');
        });

        it('should mark scheduled stages as available', async () => {
            vi.mocked(prisma.application.findUnique).mockResolvedValue({
                path: 'fresher',
                interviewStages: [
                    { type: 'aptitude', state: 'scheduled' },
                ],
            } as any);

            const statuses = await getApplicationStageStatus('app-123');
            expect(statuses[0].status).toBe('available'); // scheduled but not completed
        });

        it('should throw error when application not found', async () => {
            vi.mocked(prisma.application.findUnique).mockResolvedValue(null);

            await expect(getApplicationStageStatus('app-nonexistent')).rejects.toThrow(
                'Application app-nonexistent not found'
            );
        });
    });
});
