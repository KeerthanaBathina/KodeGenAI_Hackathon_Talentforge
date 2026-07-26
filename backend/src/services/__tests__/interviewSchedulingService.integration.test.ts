import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMocks = vi.hoisted(() => ({
    interviewStageFindMany: vi.fn(),
    interviewStageCreate: vi.fn(),
    applicationFindUnique: vi.fn(),
    userFindMany: vi.fn(),
    userFindFirst: vi.fn(),
    templateFindFirst: vi.fn(),
    communicationCreate: vi.fn(),
        communicationUpdate: vi.fn(),
}));

const reminderMocks = vi.hoisted(() => ({
    enqueueInterviewReminder: vi.fn(),
}));

const auditMocks = vi.hoisted(() => ({
    auditEvent: vi.fn(),
}));

async function flushSetImmediateQueue(): Promise<void> {
    await new Promise<void>((resolve) => {
        setImmediate(() => resolve());
    });
}

vi.mock('../../db/prisma', () => ({
    prisma: {
        application: {
            findUnique: prismaMocks.applicationFindUnique,
        },
        user: {
            findMany: prismaMocks.userFindMany,
            findFirst: prismaMocks.userFindFirst,
        },
        template: {
            findFirst: prismaMocks.templateFindFirst,
        },
        communication: {
            create: prismaMocks.communicationCreate,
            update: prismaMocks.communicationUpdate,
        },
        interviewStage: {
            findMany: prismaMocks.interviewStageFindMany,
            create: prismaMocks.interviewStageCreate,
        },
    },
}));

vi.mock('../interviewInviteService', () => ({
    dispatchInterviewInviteEmail: vi.fn().mockResolvedValue(undefined),
    buildInterviewInviteIcs: vi.fn(),
    buildInviteEmailBody: vi.fn(),
}));

vi.mock('../auditService', () => ({
    auditEvent: auditMocks.auditEvent,
}));

vi.mock('../../queues/interviewReminderQueue', () => ({
    enqueueInterviewReminder: reminderMocks.enqueueInterviewReminder,
}));

import { scheduleInterview, InterviewConflictError } from '../interviewSchedulingService';

describe('interviewSchedulingService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        prismaMocks.applicationFindUnique.mockResolvedValue({
            id: 'app-1',
            candidate: {
                email: 'candidate@example.com',
                timezone: 'Asia/Kolkata',
                profile: {
                    fullName: 'Rahul Kumar',
                },
            },
            requisition: {
                title: 'Senior Frontend Engineer',
            },
        });
        prismaMocks.userFindMany.mockResolvedValue([
            {
                id: 'panel-1',
                email: 'panel@example.com',
                fullName: 'Arun Menon',
                timezone: 'Europe/London',
            },
            {
                id: 'panel-2',
                email: 'panel2@example.com',
                fullName: 'Sneha Patel',
                timezone: 'America/New_York',
            },
        ]);
        prismaMocks.userFindFirst.mockResolvedValue({
            id: 'recruiter-1',
            email: 'recruiter@example.com',
            fullName: 'Recruiter One',
            timezone: 'UTC',
        });
        prismaMocks.templateFindFirst.mockResolvedValue({
            id: 'template-1',
        });
        prismaMocks.communicationUpdate.mockResolvedValue({ id: 'comm-1' });
        reminderMocks.enqueueInterviewReminder.mockResolvedValue('job-1');
        prismaMocks.communicationCreate.mockImplementation(({ data }: { data: { messageId?: string } }) => {
            const msg = data.messageId ?? 'comm@example.com';
            return Promise.resolve({
                id: `comm-${msg}`,
                messageId: msg,
            });
        });
    });

    it('stores scheduled interview in UTC and returns invite-ready payload', async () => {
        prismaMocks.interviewStageFindMany.mockResolvedValue([]);
        prismaMocks.interviewStageCreate.mockResolvedValue({
            id: 'stage-1',
            applicationId: 'app-1',
            type: 'technical',
            scheduledAt: new Date('2026-07-25T04:30:00.000Z'),
            endAt: new Date('2026-07-25T05:00:00.000Z'),
            timezone: 'Asia/Kolkata',
            panelMembers: ['panel-1', 'panel-2'],
        });

        const result = await scheduleInterview({
            applicationId: 'app-1',
            type: 'technical',
            startAt: '2026-07-25T04:30:00.000Z',
            endAt: '2026-07-25T05:00:00.000Z',
            timezone: 'Asia/Kolkata',
            panelMemberIds: ['panel-1', 'panel-2'],
        });

        expect(result).toMatchObject({
            id: 'stage-1',
            applicationId: 'app-1',
            type: 'technical',
            timezone: 'Asia/Kolkata',
            panelMembers: ['panel-1', 'panel-2'],
            communicationsQueued: 4,
            reminderJobsQueued: 2,
            endAt: '2026-07-25T05:00:00.000Z',
        });
        expect(prismaMocks.interviewStageCreate).toHaveBeenCalledWith({
            data: expect.objectContaining({
                applicationId: 'app-1',
                type: 'technical',
                endAt: new Date('2026-07-25T05:00:00.000Z'),
                timezone: 'Asia/Kolkata',
                panelMembers: ['panel-1', 'panel-2'],
            }),
            select: expect.any(Object),
        });
        expect(prismaMocks.communicationCreate).toHaveBeenCalledTimes(4);
        await flushSetImmediateQueue();
        expect(prismaMocks.communicationUpdate).toHaveBeenCalledTimes(4);
        expect(reminderMocks.enqueueInterviewReminder).toHaveBeenCalledTimes(2);
        expect(auditMocks.auditEvent).toHaveBeenCalledWith(
            expect.objectContaining({
                eventType: 'interview_scheduled',
                entityType: 'interview_stage',
                entityId: 'stage-1',
            })
        );
    });

    it('throws a conflict error when a panelist is already booked', async () => {
        prismaMocks.interviewStageFindMany.mockResolvedValue([
            {
                id: 'stage-2',
                type: 'hr',
                scheduledAt: new Date('2026-07-25T04:45:00.000Z'),
                endAt: new Date('2026-07-25T05:15:00.000Z'),
                timezone: 'UTC',
                panelMembers: ['panel-1'],
                application: {
                    requisition: {
                        title: 'Backend Engineer',
                    },
                },
            },
        ]);

        await expect(
            scheduleInterview({
                applicationId: 'app-2',
                type: 'technical',
                startAt: '2026-07-25T04:30:00.000Z',
                endAt: '2026-07-25T05:00:00.000Z',
                timezone: 'UTC',
                panelMemberIds: ['panel-1'],
            })
        ).rejects.toBeInstanceOf(InterviewConflictError);

        expect(prismaMocks.interviewStageCreate).not.toHaveBeenCalled();
    });
});
