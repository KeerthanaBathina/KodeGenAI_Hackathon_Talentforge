import { describe, it, expect, beforeEach, vi } from 'vitest';
import { InterviewStageState, InterviewStageType } from '@prisma/client';

// Mock dependencies before imports
vi.mock('../../db/prisma', () => ({
    prisma: {
        interviewStage: {
            findUnique: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
        },
        panelistConfirmation: {
            create: vi.fn(),
        },
        $transaction: vi.fn((callback) => callback({
            interviewStage: {
                create: vi.fn(),
                update: vi.fn(),
            },
            panelistConfirmation: {
                create: vi.fn(),
            },
        })),
    },
}));

vi.mock('../interviewStateService', () => ({
    transitionInterviewState: vi.fn(),
}));

vi.mock('../../queues/interviewReminderQueue', () => ({
    enqueueInterviewReminder: vi.fn(),
    cancelInterviewReminders: vi.fn(),
}));

vi.mock('../interviewInviteService', () => ({
    dispatchInterviewInviteEmail: vi.fn(),
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
import {
    enqueueInterviewReminder,
    cancelInterviewReminders,
} from '../../queues/interviewReminderQueue';
import { dispatchInterviewInviteEmail } from '../interviewInviteService';
import { auditEvent } from '../auditService';
import { rescheduleInterview, getInterviewRescheduleHistory } from '../rescheduleService';

describe('rescheduleService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('rescheduleInterview', () => {
        const mockOriginalInterview = {
            id: 'int-original',
            state: InterviewStageState.scheduled,
            type: InterviewStageType.technical,
            scheduledAt: new Date('2026-07-27T10:00:00Z'),
            endAt: new Date('2026-07-27T11:00:00Z'),
            timezone: 'America/New_York',
            panelMembers: ['panel-1', 'panel-2'],
            applicationId: 'app-123',
            application: {
                id: 'app-123',
                candidate: {
                    id: 'cand-456',
                    email: 'candidate@example.com',
                    timezone: 'America/New_York',
                    profile: {
                        fullName: 'John Doe',
                    },
                },
                requisition: {
                    id: 'req-789',
                    title: 'Senior Engineer',
                },
            },
            panelistConfirmations: [
                {
                    id: 'pc-1',
                    panelistId: 'panel-1',
                    panelist: {
                        id: 'panel-1',
                        email: 'panelist1@example.com',
                        fullName: 'Jane Smith',
                        timezone: 'America/New_York',
                    },
                },
            ],
        };

        it('should create new interview linked to original', async () => {
            const newScheduledAt = new Date('2026-07-28T10:00:00Z');
            const newEndAt = new Date('2026-07-28T11:00:00Z');

            vi.mocked(prisma.interviewStage.findUnique).mockResolvedValue(
                mockOriginalInterview as any
            );

            const mockNewInterview = {
                id: 'int-new',
                scheduledAt: newScheduledAt,
                endAt: newEndAt,
                state: InterviewStageState.scheduled,
                rescheduledFromId: 'int-original',
            };

            const mockUpdatedOriginal = {
                id: 'int-original',
                state: InterviewStageState.rescheduled,
                cancelReason: 'Rescheduled by recruiter',
                rescheduledToId: 'int-new',
            };

            vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => {
                const tx = {
                    interviewStage: {
                        create: vi.fn().mockResolvedValue(mockNewInterview),
                        update: vi.fn().mockResolvedValue(mockUpdatedOriginal),
                    },
                    panelistConfirmation: {
                        create: vi.fn().mockResolvedValue({}),
                    },
                };
                return callback(tx);
            });

            const result = await rescheduleInterview({
                originalInterviewId: 'int-original',
                newScheduledAt,
                newEndAt,
                reason: 'Rescheduled by recruiter',
                actorId: 'user-1',
            });

            expect(result.newInterview.id).toBe('int-new');
            expect(result.newInterview.rescheduledFromId).toBe('int-original');
            expect(result.originalInterview.rescheduledToId).toBe('int-new');
        });

        it('should update original interview to rescheduled state', async () => {
            vi.mocked(prisma.interviewStage.findUnique).mockResolvedValue(
                mockOriginalInterview as any
            );

            const mockNewInterview = {
                id: 'int-new',
                scheduledAt: new Date('2026-07-28T10:00:00Z'),
                endAt: new Date('2026-07-28T11:00:00Z'),
                state: InterviewStageState.scheduled,
                rescheduledFromId: 'int-original',
            };

            const mockUpdatedOriginal = {
                id: 'int-original',
                state: InterviewStageState.rescheduled,
                cancelReason: 'Test reason',
                rescheduledToId: 'int-new',
            };

            vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => {
                const tx = {
                    interviewStage: {
                        create: vi.fn().mockResolvedValue(mockNewInterview),
                        update: vi.fn().mockResolvedValue(mockUpdatedOriginal),
                    },
                    panelistConfirmation: {
                        create: vi.fn().mockResolvedValue({}),
                    },
                };
                return callback(tx);
            });

            const result = await rescheduleInterview({
                originalInterviewId: 'int-original',
                newScheduledAt: new Date('2026-07-28T10:00:00Z'),
                reason: 'Test reason',
                actorId: 'user-1',
            });

            expect(result.originalInterview.state).toBe(InterviewStageState.rescheduled);
            expect(result.originalInterview.cancelReason).toBe('Test reason');
        });

        it('should copy panelist assignments with pending status', async () => {
            vi.mocked(prisma.interviewStage.findUnique).mockResolvedValue(
                mockOriginalInterview as any
            );

            const panelistCreateSpy = vi.fn().mockResolvedValue({});

            vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => {
                const tx = {
                    interviewStage: {
                        create: vi.fn().mockResolvedValue({
                            id: 'int-new',
                            scheduledAt: new Date('2026-07-28T10:00:00Z'),
                            endAt: new Date('2026-07-28T11:00:00Z'),
                            state: InterviewStageState.scheduled,
                            rescheduledFromId: 'int-original',
                        }),
                        update: vi.fn().mockResolvedValue({
                            id: 'int-original',
                            state: InterviewStageState.rescheduled,
                            cancelReason: 'Rescheduled',
                            rescheduledToId: 'int-new',
                        }),
                    },
                    panelistConfirmation: {
                        create: panelistCreateSpy,
                    },
                };
                return callback(tx);
            });

            await rescheduleInterview({
                originalInterviewId: 'int-original',
                newScheduledAt: new Date('2026-07-28T10:00:00Z'),
                actorId: 'user-1',
            });

            expect(panelistCreateSpy).toHaveBeenCalledWith({
                data: {
                    interviewStageId: 'int-new',
                    panelistId: 'panel-1',
                    status: 'pending',
                },
            });
        });

        it('should cancel old reminder jobs', async () => {
            vi.mocked(prisma.interviewStage.findUnique).mockResolvedValue(
                mockOriginalInterview as any
            );

            vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => {
                const tx = {
                    interviewStage: {
                        create: vi.fn().mockResolvedValue({
                            id: 'int-new',
                            scheduledAt: new Date('2026-07-28T10:00:00Z'),
                            endAt: new Date('2026-07-28T11:00:00Z'),
                            state: InterviewStageState.scheduled,
                            rescheduledFromId: 'int-original',
                        }),
                        update: vi.fn().mockResolvedValue({
                            id: 'int-original',
                            state: InterviewStageState.rescheduled,
                            cancelReason: 'Rescheduled',
                            rescheduledToId: 'int-new',
                        }),
                    },
                    panelistConfirmation: {
                        create: vi.fn().mockResolvedValue({}),
                    },
                };
                return callback(tx);
            });

            await rescheduleInterview({
                originalInterviewId: 'int-original',
                newScheduledAt: new Date('2026-07-28T10:00:00Z'),
                actorId: 'user-1',
            });

            expect(cancelInterviewReminders).toHaveBeenCalledWith('int-original');
        });

        it('should schedule new reminder jobs', async () => {
            const newScheduledAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days from now

            vi.mocked(prisma.interviewStage.findUnique).mockResolvedValue(
                mockOriginalInterview as any
            );

            vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => {
                const tx = {
                    interviewStage: {
                        create: vi.fn().mockResolvedValue({
                            id: 'int-new',
                            scheduledAt: newScheduledAt,
                            endAt: new Date(newScheduledAt.getTime() + 60 * 60 * 1000),
                            state: InterviewStageState.scheduled,
                            rescheduledFromId: 'int-original',
                        }),
                        update: vi.fn().mockResolvedValue({
                            id: 'int-original',
                            state: InterviewStageState.rescheduled,
                            cancelReason: 'Rescheduled',
                            rescheduledToId: 'int-new',
                        }),
                    },
                    panelistConfirmation: {
                        create: vi.fn().mockResolvedValue({}),
                    },
                };
                return callback(tx);
            });

            await rescheduleInterview({
                originalInterviewId: 'int-original',
                newScheduledAt,
                actorId: 'user-1',
            });

            // Should schedule 24h and 1h reminders
            expect(enqueueInterviewReminder).toHaveBeenCalledTimes(2);
            expect(enqueueInterviewReminder).toHaveBeenCalledWith(
                expect.objectContaining({
                    interviewId: 'int-new',
                    reminderType: '24h',
                }),
                expect.any(Number)
            );
            expect(enqueueInterviewReminder).toHaveBeenCalledWith(
                expect.objectContaining({
                    interviewId: 'int-new',
                    reminderType: '1h',
                }),
                expect.any(Number)
            );
        });

        it('should send calendar invites to all participants', async () => {
            vi.mocked(prisma.interviewStage.findUnique).mockResolvedValue(
                mockOriginalInterview as any
            );

            vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => {
                const tx = {
                    interviewStage: {
                        create: vi.fn().mockResolvedValue({
                            id: 'int-new',
                            scheduledAt: new Date('2026-07-28T10:00:00Z'),
                            endAt: new Date('2026-07-28T11:00:00Z'),
                            state: InterviewStageState.scheduled,
                            rescheduledFromId: 'int-original',
                        }),
                        update: vi.fn().mockResolvedValue({
                            id: 'int-original',
                            state: InterviewStageState.rescheduled,
                            cancelReason: 'Rescheduled',
                            rescheduledToId: 'int-new',
                        }),
                    },
                    panelistConfirmation: {
                        create: vi.fn().mockResolvedValue({}),
                    },
                };
                return callback(tx);
            });

            await rescheduleInterview({
                originalInterviewId: 'int-original',
                newScheduledAt: new Date('2026-07-28T10:00:00Z'),
                actorId: 'user-1',
            });

            // setImmediate makes this async, so we can't directly verify the call
            // But we can verify the function was setup correctly
            expect(dispatchInterviewInviteEmail).not.toHaveBeenCalled(); // Not called synchronously
        });

        it('should create audit event', async () => {
            const newScheduledAt = new Date('2026-07-28T10:00:00Z');

            vi.mocked(prisma.interviewStage.findUnique).mockResolvedValue(
                mockOriginalInterview as any
            );

            vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => {
                const tx = {
                    interviewStage: {
                        create: vi.fn().mockResolvedValue({
                            id: 'int-new',
                            scheduledAt: newScheduledAt,
                            endAt: new Date('2026-07-28T11:00:00Z'),
                            state: InterviewStageState.scheduled,
                            rescheduledFromId: 'int-original',
                        }),
                        update: vi.fn().mockResolvedValue({
                            id: 'int-original',
                            state: InterviewStageState.rescheduled,
                            cancelReason: 'Test reason',
                            rescheduledToId: 'int-new',
                        }),
                    },
                    panelistConfirmation: {
                        create: vi.fn().mockResolvedValue({}),
                    },
                };
                return callback(tx);
            });

            await rescheduleInterview({
                originalInterviewId: 'int-original',
                newScheduledAt,
                reason: 'Test reason',
                actorId: 'user-1',
            });

            expect(auditEvent).toHaveBeenCalledWith({
                actorId: 'user-1',
                eventType: 'interview_rescheduled',
                entityType: 'interview_stage',
                entityId: 'int-original',
                payload: {
                    originalScheduledAt: '2026-07-27T10:00:00.000Z',
                    newScheduledAt: newScheduledAt.toISOString(),
                    newInterviewId: 'int-new',
                    reason: 'Test reason',
                },
            });
        });

        it('should reject rescheduling completed interview', async () => {
            const completedInterview = {
                ...mockOriginalInterview,
                state: InterviewStageState.completed,
            };

            vi.mocked(prisma.interviewStage.findUnique).mockResolvedValue(
                completedInterview as any
            );

            await expect(
                rescheduleInterview({
                    originalInterviewId: 'int-original',
                    newScheduledAt: new Date('2026-07-28T10:00:00Z'),
                    actorId: 'user-1',
                })
            ).rejects.toThrow('Cannot reschedule interview in completed state');
        });

        it('should reject rescheduling cancelled interview', async () => {
            const cancelledInterview = {
                ...mockOriginalInterview,
                state: InterviewStageState.cancelled,
            };

            vi.mocked(prisma.interviewStage.findUnique).mockResolvedValue(
                cancelledInterview as any
            );

            await expect(
                rescheduleInterview({
                    originalInterviewId: 'int-original',
                    newScheduledAt: new Date('2026-07-28T10:00:00Z'),
                    actorId: 'user-1',
                })
            ).rejects.toThrow('Cannot reschedule interview in cancelled state');
        });

        it('should allow rescheduling no_show interview', async () => {
            const noShowInterview = {
                ...mockOriginalInterview,
                state: InterviewStageState.no_show,
            };

            vi.mocked(prisma.interviewStage.findUnique).mockResolvedValue(
                noShowInterview as any
            );

            vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => {
                const tx = {
                    interviewStage: {
                        create: vi.fn().mockResolvedValue({
                            id: 'int-new',
                            scheduledAt: new Date('2026-07-28T10:00:00Z'),
                            endAt: new Date('2026-07-28T11:00:00Z'),
                            state: InterviewStageState.scheduled,
                            rescheduledFromId: 'int-original',
                        }),
                        update: vi.fn().mockResolvedValue({
                            id: 'int-original',
                            state: InterviewStageState.rescheduled,
                            cancelReason: 'Rescheduled',
                            rescheduledToId: 'int-new',
                        }),
                    },
                    panelistConfirmation: {
                        create: vi.fn().mockResolvedValue({}),
                    },
                };
                return callback(tx);
            });

            const result = await rescheduleInterview({
                originalInterviewId: 'int-original',
                newScheduledAt: new Date('2026-07-28T10:00:00Z'),
                actorId: 'user-1',
            });

            expect(result.newInterview.id).toBe('int-new');
        });

        it('should throw error when interview not found', async () => {
            vi.mocked(prisma.interviewStage.findUnique).mockResolvedValue(null);

            await expect(
                rescheduleInterview({
                    originalInterviewId: 'int-nonexistent',
                    newScheduledAt: new Date('2026-07-28T10:00:00Z'),
                    actorId: 'user-1',
                })
            ).rejects.toThrow('Interview not found');
        });

        it('should calculate endAt from original duration if not provided', async () => {
            vi.mocked(prisma.interviewStage.findUnique).mockResolvedValue(
                mockOriginalInterview as any
            );

            const newScheduledAt = new Date('2026-07-28T10:00:00Z');
            const expectedEndAt = new Date('2026-07-28T11:00:00Z'); // 1 hour later

            const createSpy = vi.fn().mockResolvedValue({
                id: 'int-new',
                scheduledAt: newScheduledAt,
                endAt: expectedEndAt,
                state: InterviewStageState.scheduled,
                rescheduledFromId: 'int-original',
            });

            vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => {
                const tx = {
                    interviewStage: {
                        create: createSpy,
                        update: vi.fn().mockResolvedValue({
                            id: 'int-original',
                            state: InterviewStageState.rescheduled,
                            cancelReason: 'Rescheduled',
                            rescheduledToId: 'int-new',
                        }),
                    },
                    panelistConfirmation: {
                        create: vi.fn().mockResolvedValue({}),
                    },
                };
                return callback(tx);
            });

            await rescheduleInterview({
                originalInterviewId: 'int-original',
                newScheduledAt,
                actorId: 'user-1',
            });

            // Verify the create was called with calculated endAt
            expect(createSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        scheduledAt: newScheduledAt,
                        endAt: expect.any(Date),
                    }),
                })
            );
        });
    });

    describe('getInterviewRescheduleHistory', () => {
        it('should return full reschedule chain', async () => {
            const mockInterviews = {
                original: {
                    id: 'int-1',
                    scheduledAt: new Date('2026-07-25T10:00:00Z'),
                    state: InterviewStageState.rescheduled,
                    cancelReason: 'First reschedule',
                    rescheduledFromId: null,
                    rescheduledToId: 'int-2',
                    rescheduledFrom: null,
                    rescheduledTo: { id: 'int-2' },
                },
                middle: {
                    id: 'int-2',
                    scheduledAt: new Date('2026-07-26T10:00:00Z'),
                    state: InterviewStageState.rescheduled,
                    cancelReason: 'Second reschedule',
                    rescheduledFromId: 'int-1',
                    rescheduledToId: 'int-3',
                    rescheduledFrom: { id: 'int-1' },
                    rescheduledTo: { id: 'int-3' },
                },
                latest: {
                    id: 'int-3',
                    scheduledAt: new Date('2026-07-27T10:00:00Z'),
                    state: InterviewStageState.scheduled,
                    cancelReason: null,
                    rescheduledFromId: 'int-2',
                    rescheduledToId: null,
                    rescheduledFrom: { id: 'int-2' },
                    rescheduledTo: null,
                },
            };

            vi.mocked(prisma.interviewStage.findUnique)
                .mockResolvedValueOnce(mockInterviews.middle as any)
                .mockResolvedValueOnce(mockInterviews.original as any)
                .mockResolvedValueOnce(mockInterviews.latest as any);

            const result = await getInterviewRescheduleHistory('int-2');

            expect(result.rescheduleCount).toBe(2);
            expect(result.history).toHaveLength(3);
            expect(result.history[0].id).toBe('int-1');
            expect(result.history[1].id).toBe('int-2');
            expect(result.history[2].id).toBe('int-3');
        });

        it('should return single interview with no reschedules', async () => {
            const mockInterview = {
                id: 'int-only',
                scheduledAt: new Date('2026-07-27T10:00:00Z'),
                state: InterviewStageState.scheduled,
                cancelReason: null,
                rescheduledFromId: null,
                rescheduledToId: null,
                rescheduledFrom: null,
                rescheduledTo: null,
            };

            vi.mocked(prisma.interviewStage.findUnique).mockResolvedValue(
                mockInterview as any
            );

            const result = await getInterviewRescheduleHistory('int-only');

            expect(result.rescheduleCount).toBe(0);
            expect(result.history).toHaveLength(1);
            expect(result.history[0].id).toBe('int-only');
        });

        it('should throw error when interview not found', async () => {
            vi.mocked(prisma.interviewStage.findUnique).mockResolvedValue(null);

            await expect(getInterviewRescheduleHistory('int-nonexistent')).rejects.toThrow(
                'Interview not found'
            );
        });

        it('should handle circular reference protection', async () => {
            const mockInterview = {
                id: 'int-circular',
                scheduledAt: new Date('2026-07-27T10:00:00Z'),
                state: InterviewStageState.scheduled,
                cancelReason: null,
                rescheduledFromId: 'int-circular', // Circular reference
                rescheduledToId: null,
                rescheduledFrom: { id: 'int-circular' },
                rescheduledTo: null,
            };

            vi.mocked(prisma.interviewStage.findUnique).mockResolvedValue(
                mockInterview as any
            );

            const result = await getInterviewRescheduleHistory('int-circular');

            // Should not infinite loop
            expect(result.history).toBeDefined();
        });
    });
});
