import { describe, it, expect, beforeEach, vi } from 'vitest';
import { InterviewStageState, InterviewStageType } from '@prisma/client';

// Mock dependencies before imports
vi.mock('../../db/prisma', () => ({
    prisma: {
        interviewStage: {
            findUnique: vi.fn(),
            findMany: vi.fn(),
        },
        candidate: {
            findUnique: vi.fn(),
            update: vi.fn(),
        },
        $transaction: vi.fn(),
    },
}));

vi.mock('../interviewStateService', () => ({
    transitionInterviewState: vi.fn(),
}));

vi.mock('../auditService', () => ({
    auditEvent: vi.fn(),
}));

vi.mock('../../utils/logger', () => ({
    default: {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
    },
}));

import { prisma } from '../../db/prisma';
import { transitionInterviewState } from '../interviewStateService';
import { auditEvent } from '../auditService';
import { recordNoShow, getCandidateNoShowHistory } from '../noShowService';

describe('noShowService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('recordNoShow', () => {
        const mockInterview = {
            id: 'int-123',
            state: InterviewStageState.scheduled,
            type: InterviewStageType.technical,
            scheduledAt: new Date('2026-07-27T10:00:00Z'),
            cancelReason: null,
            application: {
                id: 'app-456',
                candidate: {
                    id: 'cand-789',
                    email: 'candidate@example.com',
                    noShowCount: 1,
                },
            },
        };

        it('should record no-show and increment candidate count', async () => {
            vi.mocked(prisma.interviewStage.findUnique).mockResolvedValue(mockInterview as any);
            vi.mocked(transitionInterviewState).mockResolvedValue({
                id: 'int-123',
                state: InterviewStageState.no_show,
                cancelReason: 'Candidate did not attend',
            } as any);
            vi.mocked(prisma.candidate.update).mockResolvedValue({
                id: 'cand-789',
                noShowCount: 2,
            } as any);

            const result = await recordNoShow({
                interviewStageId: 'int-123',
                reason: 'Candidate did not attend',
                actorId: 'user-1',
            });

            expect(result).toEqual({
                interview: {
                    id: 'int-123',
                    state: 'no_show',
                    cancelReason: 'Candidate did not attend',
                },
                candidate: {
                    id: 'cand-789',
                    noShowCount: 2,
                },
            });

            // Verify candidate.noShowCount incremented
            expect(prisma.candidate.update).toHaveBeenCalledWith({
                where: { id: 'cand-789' },
                data: {
                    noShowCount: {
                        increment: 1,
                    },
                },
            });
        });

        it('should transition interview to no_show state', async () => {
            vi.mocked(prisma.interviewStage.findUnique).mockResolvedValue(mockInterview as any);
            vi.mocked(transitionInterviewState).mockResolvedValue({
                id: 'int-123',
                state: InterviewStageState.no_show,
                cancelReason: 'Test reason',
            } as any);
            vi.mocked(prisma.candidate.update).mockResolvedValue({
                id: 'cand-789',
                noShowCount: 2,
            } as any);

            await recordNoShow({
                interviewStageId: 'int-123',
                reason: 'Test reason',
                actorId: 'user-1',
            });

            expect(transitionInterviewState).toHaveBeenCalledWith({
                interviewStageId: 'int-123',
                newState: 'no_show',
                reason: 'Test reason',
                actorId: 'user-1',
            });
        });

        it('should create audit event with correct payload', async () => {
            vi.mocked(prisma.interviewStage.findUnique).mockResolvedValue(mockInterview as any);
            vi.mocked(transitionInterviewState).mockResolvedValue({
                id: 'int-123',
                state: InterviewStageState.no_show,
                cancelReason: 'No reason',
            } as any);
            vi.mocked(prisma.candidate.update).mockResolvedValue({
                id: 'cand-789',
                noShowCount: 2,
            } as any);

            await recordNoShow({
                interviewStageId: 'int-123',
                reason: 'No reason',
                actorId: 'user-1',
            });

            expect(auditEvent).toHaveBeenCalledWith({
                actorId: 'user-1',
                eventType: 'interview_no_show',
                entityType: 'interview_stage',
                entityId: 'int-123',
                payload: {
                    candidateId: 'cand-789',
                    previousNoShowCount: 1,
                    newNoShowCount: 2,
                    reason: 'No reason',
                    scheduledAt: '2026-07-27T10:00:00.000Z',
                },
            });
        });

        it('should handle no-show without reason', async () => {
            vi.mocked(prisma.interviewStage.findUnique).mockResolvedValue(mockInterview as any);
            vi.mocked(transitionInterviewState).mockResolvedValue({
                id: 'int-123',
                state: InterviewStageState.no_show,
                cancelReason: null,
            } as any);
            vi.mocked(prisma.candidate.update).mockResolvedValue({
                id: 'cand-789',
                noShowCount: 2,
            } as any);

            await recordNoShow({
                interviewStageId: 'int-123',
                actorId: 'user-1',
            });

            expect(auditEvent).toHaveBeenCalledWith(
                expect.objectContaining({
                    payload: expect.objectContaining({
                        reason: null,
                    }),
                })
            );
        });

        it('should throw error when interview not found', async () => {
            vi.mocked(prisma.interviewStage.findUnique).mockResolvedValue(null);

            await expect(
                recordNoShow({
                    interviewStageId: 'int-nonexistent',
                    actorId: 'user-1',
                })
            ).rejects.toThrow('Interview not found');

            expect(transitionInterviewState).not.toHaveBeenCalled();
            expect(prisma.candidate.update).not.toHaveBeenCalled();
        });

        it('should track noShowCount correctly from 0 to 1', async () => {
            const interviewWithNoShows = {
                ...mockInterview,
                application: {
                    ...mockInterview.application,
                    candidate: {
                        ...mockInterview.application.candidate,
                        noShowCount: 0,
                    },
                },
            };

            vi.mocked(prisma.interviewStage.findUnique).mockResolvedValue(
                interviewWithNoShows as any
            );
            vi.mocked(transitionInterviewState).mockResolvedValue({
                id: 'int-123',
                state: InterviewStageState.no_show,
                cancelReason: null,
            } as any);
            vi.mocked(prisma.candidate.update).mockResolvedValue({
                id: 'cand-789',
                noShowCount: 1,
            } as any);

            const result = await recordNoShow({
                interviewStageId: 'int-123',
                actorId: 'user-1',
            });

            expect(result.candidate.noShowCount).toBe(1);
            expect(auditEvent).toHaveBeenCalledWith(
                expect.objectContaining({
                    payload: expect.objectContaining({
                        previousNoShowCount: 0,
                        newNoShowCount: 1,
                    }),
                })
            );
        });

        it('should propagate state transition errors', async () => {
            vi.mocked(prisma.interviewStage.findUnique).mockResolvedValue(mockInterview as any);
            vi.mocked(transitionInterviewState).mockRejectedValue(
                new Error('Cannot transition from completed to no_show')
            );

            await expect(
                recordNoShow({
                    interviewStageId: 'int-123',
                    actorId: 'user-1',
                })
            ).rejects.toThrow('Cannot transition from completed to no_show');

            // Should not update candidate count if transition fails
            expect(prisma.candidate.update).not.toHaveBeenCalled();
        });
    });

    describe('getCandidateNoShowHistory', () => {
        it('should return candidate with no-show count and interviews', async () => {
            const mockCandidate = {
                id: 'cand-123',
                email: 'candidate@example.com',
                noShowCount: 2,
            };

            const mockNoShowInterviews = [
                {
                    id: 'int-1',
                    scheduledAt: new Date('2026-07-20T10:00:00Z'),
                    state: InterviewStageState.no_show,
                    cancelReason: 'Did not attend',
                    application: {
                        requisition: {
                            title: 'Senior Developer',
                        },
                    },
                },
                {
                    id: 'int-2',
                    scheduledAt: new Date('2026-07-15T14:00:00Z'),
                    state: InterviewStageState.no_show,
                    cancelReason: null,
                    application: {
                        requisition: {
                            title: 'Junior Developer',
                        },
                    },
                },
            ];

            vi.mocked(prisma.candidate.findUnique).mockResolvedValue(mockCandidate as any);
            vi.mocked(prisma.interviewStage.findMany).mockResolvedValue(
                mockNoShowInterviews as any
            );

            const result = await getCandidateNoShowHistory('cand-123');

            expect(result).toEqual({
                candidate: {
                    id: 'cand-123',
                    email: 'candidate@example.com',
                    noShowCount: 2,
                },
                noShowInterviews: [
                    {
                        id: 'int-1',
                        scheduledAt: new Date('2026-07-20T10:00:00Z'),
                        positionTitle: 'Senior Developer',
                        cancelReason: 'Did not attend',
                    },
                    {
                        id: 'int-2',
                        scheduledAt: new Date('2026-07-15T14:00:00Z'),
                        positionTitle: 'Junior Developer',
                        cancelReason: null,
                    },
                ],
            });
        });

        it('should return empty list for candidate with no no-shows', async () => {
            const mockCandidate = {
                id: 'cand-456',
                email: 'clean@example.com',
                noShowCount: 0,
            };

            vi.mocked(prisma.candidate.findUnique).mockResolvedValue(mockCandidate as any);
            vi.mocked(prisma.interviewStage.findMany).mockResolvedValue([]);

            const result = await getCandidateNoShowHistory('cand-456');

            expect(result.candidate.noShowCount).toBe(0);
            expect(result.noShowInterviews).toHaveLength(0);
        });

        it('should throw error when candidate not found', async () => {
            vi.mocked(prisma.candidate.findUnique).mockResolvedValue(null);

            await expect(getCandidateNoShowHistory('cand-nonexistent')).rejects.toThrow(
                'Candidate not found'
            );
        });

        it('should order no-show interviews by scheduled date descending', async () => {
            const mockCandidate = {
                id: 'cand-789',
                email: 'test@example.com',
                noShowCount: 3,
            };

            vi.mocked(prisma.candidate.findUnique).mockResolvedValue(mockCandidate as any);
            vi.mocked(prisma.interviewStage.findMany).mockResolvedValue([]);

            await getCandidateNoShowHistory('cand-789');

            expect(prisma.interviewStage.findMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    orderBy: {
                        scheduledAt: 'desc',
                    },
                })
            );
        });

        it('should filter only no_show state interviews', async () => {
            const mockCandidate = {
                id: 'cand-999',
                email: 'filter@example.com',
                noShowCount: 1,
            };

            vi.mocked(prisma.candidate.findUnique).mockResolvedValue(mockCandidate as any);
            vi.mocked(prisma.interviewStage.findMany).mockResolvedValue([]);

            await getCandidateNoShowHistory('cand-999');

            expect(prisma.interviewStage.findMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({
                        state: 'no_show',
                    }),
                })
            );
        });
    });
});
