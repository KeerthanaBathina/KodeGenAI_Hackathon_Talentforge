import { prisma } from '../db/prisma';
import { env } from '../config/env';
import logger from '../utils/logger';
import { auditEvent } from './auditService';
import { dispatchInterviewInviteEmail, type InterviewInvitePayload } from './interviewInviteService';
import { enqueueInterviewReminder } from '../queues/interviewReminderQueue';
import { canScheduleStage } from './stagePrerequisiteService';

export type InterviewStageTypeInput = 'aptitude' | 'coding' | 'technical' | 'hr';

export interface PanelistAvailabilitySlot {
    startAt: string;
    endAt: string;
    available: boolean;
    label: string;
}

export interface PanelistAvailabilityResponse {
    panelMemberId: string;
    panelMemberName: string;
    timezone: string;
    slots: PanelistAvailabilitySlot[];
}

export interface ScheduleInterviewInput {
    applicationId: string;
    type: InterviewStageTypeInput;
    startAt: string;
    endAt: string;
    timezone: string;
    panelMemberIds: string[];
    joinUrl?: string;
    skipPrerequisiteCheck?: boolean;
    suppressCandidateInviteEmail?: boolean;
}

export interface InterviewConflict {
    panelMemberId: string;
    panelMemberName: string;
    interviewStageId: string;
    interviewType: InterviewStageTypeInput;
    requisitionTitle: string;
    scheduledAt: string;
    timezone: string;
}

export interface ScheduleInterviewResult {
    id: string;
    applicationId: string;
    type: InterviewStageTypeInput;
    scheduledAt: string;
    endAt: string;
    timezone: string;
    panelMembers: string[];
    communicationsQueued: number;
    reminderJobsQueued: number;
}

export class InterviewConflictError extends Error {
    conflicts: InterviewConflict[];

    constructor(conflicts: InterviewConflict[]) {
        super('Panelist is unavailable for the requested slot');
        this.name = 'InterviewConflictError';
        this.conflicts = conflicts;
    }
}

export class PrerequisiteNotMetError extends Error {
    requiredStage: string;
    requestedStage: string;
    missingStages: string[];

    constructor(
        requiredStage: string,
        requestedStage: string,
        missingStages: string[]
    ) {
        super(`Prerequisites not met: ${missingStages.join(', ')} must be completed before scheduling ${requestedStage}`);
        this.name = 'PrerequisiteNotMetError';
        this.requiredStage = requiredStage;
        this.requestedStage = requestedStage;
        this.missingStages = missingStages;
    }
}

function toUtcDate(value: string): Date {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        throw new Error('Invalid interview time');
    }

    return parsed;
}

function normalizeStageType(type: InterviewStageTypeInput): InterviewStageTypeInput {
    return type;
}

async function findInterviewInviteTemplateId(): Promise<string | null> {
    const template = await prisma.template.findFirst({
        where: {
            active: true,
            type: 'interview_invite',
        },
        orderBy: {
            version: 'desc',
        },
        select: {
            id: true,
        },
    });

    return template?.id ?? null;
}

function buildAvailabilitySlotsForNextWeekday(
    weekday: number,
    startHour: number,
    endHour: number,
    timezone: string
): PanelistAvailabilitySlot[] {
    const now = new Date();
    const target = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
    const delta = (weekday - target.getUTCDay() + 7) % 7 || 7;
    target.setUTCDate(target.getUTCDate() + delta);

    const slots: PanelistAvailabilitySlot[] = [];
    for (let hour = startHour; hour < endHour; hour += 1) {
        const start = new Date(target);
        start.setUTCHours(hour, 0, 0, 0);
        const end = new Date(start);
        end.setUTCMinutes(end.getUTCMinutes() + 45);
        slots.push({
            startAt: start.toISOString(),
            endAt: end.toISOString(),
            available: true,
            label: new Intl.DateTimeFormat('en-US', {
                hour: 'numeric',
                minute: '2-digit',
                hour12: true,
                timeZone: timezone || 'UTC',
            }).format(start),
        });
    }

    return slots;
}

export async function getPanelistAvailability(
    panelMemberIds: string[]
): Promise<PanelistAvailabilityResponse[]> {
    const panelists = await prisma.user.findMany({
        where: {
            ...(panelMemberIds.length > 0 ? { id: { in: panelMemberIds } } : {}),
            role: {
                in: ['tech_interviewer', 'hr_reviewer', 'hr_manager'],
            },
            active: true,
        },
        select: {
            id: true,
            fullName: true,
            timezone: true,
            panelAvailability: {
                where: { active: true },
                select: {
                    weekday: true,
                    startHour: true,
                    endHour: true,
                    timezone: true,
                },
            },
        },
        orderBy: {
            fullName: 'asc',
        },
    });

    const scheduledStages = await prisma.interviewStage.findMany({
        where: {
            panelMembers: {
                hasSome: panelists.map((panelist) => panelist.id),
            },
            state: 'scheduled',
        },
        select: {
            scheduledAt: true,
            endAt: true,
            timezone: true,
            panelMembers: true,
        },
    });

    return panelists.map((panelist) => {
        const baseSlots = panelist.panelAvailability.length > 0
            ? panelist.panelAvailability.flatMap((window) =>
                buildAvailabilitySlotsForNextWeekday(
                    window.weekday,
                    window.startHour,
                    window.endHour,
                    window.timezone
                )
            )
            : [];

        const slots = baseSlots.map((slot) => {
            const slotStart = new Date(slot.startAt).getTime();
            const slotEnd = new Date(slot.endAt).getTime();
            const isBooked = scheduledStages.some((stage) => {
                if (!stage.scheduledAt || !stage.endAt) {
                    return false;
                }

                const stageStart = stage.scheduledAt.getTime();
                const stageEnd = stage.endAt.getTime();

                return stage.panelMembers.includes(panelist.id) && stageStart < slotEnd && stageEnd > slotStart;
            });

            return {
                ...slot,
                available: !isBooked,
            };
        });

        return {
            panelMemberId: panelist.id,
            panelMemberName: panelist.fullName,
            timezone: panelist.timezone,
            slots,
        };
    });
}

export async function scheduleInterview(input: ScheduleInterviewInput): Promise<ScheduleInterviewResult> {
    const startAtUtc = toUtcDate(input.startAt);
    const endAtUtc = toUtcDate(input.endAt);

    if (endAtUtc <= startAtUtc) {
        throw new Error('Interview end time must be after start time');
    }

    // Keep prerequisite enforcement by default; allow explicit bypass for HR manual-review scheduling.
    if (!input.skipPrerequisiteCheck) {
        const prerequisiteCheck = await canScheduleStage(input.applicationId, input.type);

        if (!prerequisiteCheck.canSchedule) {
            throw new PrerequisiteNotMetError(
                prerequisiteCheck.missingStages[0] || 'unknown',
                input.type,
                prerequisiteCheck.missingStages
            );
        }
    }

    const panelists = input.panelMemberIds.length > 0
        ? await prisma.user.findMany({
            where: { id: { in: input.panelMemberIds } },
            select: { id: true, email: true, fullName: true, timezone: true },
        })
        : [];

    const panelistNameById = new Map(panelists.map((panelist) => [panelist.id, panelist.fullName]));

    const conflicts = await prisma.interviewStage.findMany({
        where: {
            panelMembers: {
                hasSome: input.panelMemberIds,
            },
            state: 'scheduled',
            scheduledAt: {
                lt: endAtUtc,
            },
            endAt: {
                gt: startAtUtc,
            },
        },
        select: {
            id: true,
            type: true,
            scheduledAt: true,
            endAt: true,
            timezone: true,
            panelMembers: true,
            application: {
                select: {
                    requisition: {
                        select: {
                            title: true,
                        },
                    },
                },
            },
        },
    });

    const overlappingConflicts = conflicts
        .filter((stage) => stage.scheduledAt !== null)
        .flatMap((stage) =>
            stage.panelMembers
                .filter((panelMemberId) => input.panelMemberIds.includes(panelMemberId))
                .map<InterviewConflict>((panelMemberId) => ({
                    panelMemberId,
                    panelMemberName: panelistNameById.get(panelMemberId) ?? panelMemberId,
                    interviewStageId: stage.id,
                    interviewType: stage.type as InterviewStageTypeInput,
                    requisitionTitle: stage.application.requisition.title,
                    scheduledAt: stage.scheduledAt!.toISOString(),
                    timezone: stage.timezone,
                }))
        );

    if (overlappingConflicts.length > 0) {
        throw new InterviewConflictError(overlappingConflicts);
    }

    const application = await prisma.application.findUnique({
        where: { id: input.applicationId },
        include: {
            candidate: {
                include: {
                    profile: true,
                },
            },
            requisition: true,
        },
    });

    if (!application) {
        throw new Error('Application not found');
    }

    const recruiter = await prisma.user.findFirst({
        where: { role: 'recruiter', active: true },
        select: { id: true, email: true, fullName: true, timezone: true },
    });

    const stage = await prisma.interviewStage.create({
        data: {
            applicationId: input.applicationId,
            type: normalizeStageType(input.type),
            scheduledAt: startAtUtc,
            endAt: endAtUtc,
            timezone: input.timezone,
            panelMembers: input.panelMemberIds,
        },
        select: {
            id: true,
            applicationId: true,
            type: true,
            scheduledAt: true,
            endAt: true,
            timezone: true,
            panelMembers: true,
        },
    });

    const templateId = await findInterviewInviteTemplateId();
    let communicationsQueued = 0;
    let reminderJobsQueued = 0;

    if (templateId) {
        const recipients = [
            ...(input.suppressCandidateInviteEmail
                ? []
                : [{
                    email: application.candidate.email,
                    name: application.candidate.profile?.fullName || 'Candidate',
                    timezone: application.candidate.timezone,
                    role: 'candidate' as const,
                }]),
            ...panelists.map((panelist) => ({
                email: panelist.email,
                name: panelist.fullName,
                timezone: panelist.timezone,
                role: 'panelist' as const,
            })),
            ...(recruiter
                ? [{
                    email: recruiter.email,
                    name: recruiter.fullName,
                    timezone: recruiter.timezone,
                    role: 'recruiter' as const,
                }]
                : []),
        ];

        const communicationByEmail = new Map<string, string>();

        const createdCommunications = await Promise.all(
            recipients.map((recipient) =>
                prisma.communication.create({
                    data: {
                        applicationId: input.applicationId,
                        templateId,
                        channel: 'email',
                        providerName: env.EMAIL_PROVIDER,
                        messageId: `${stage.id}:${recipient.email}`,
                        status: 'queued',
                    },
                    select: {
                        id: true,
                        messageId: true,
                    },
                })
            )
        );

        createdCommunications.forEach((communication) => {
            if (!communication.messageId) {
                return;
            }

            const email = communication.messageId.split(':').slice(1).join(':');
            if (email) {
                communicationByEmail.set(email, communication.id);
            }
        });

        communicationsQueued = createdCommunications.length;

        const invitePayload: InterviewInvitePayload = {
            interviewId: stage.id,
            applicationId: input.applicationId,
            interviewType: input.type,
            startAt: startAtUtc,
            endAt: endAtUtc,
            timezone: input.timezone,
            candidateName: application.candidate.profile?.fullName || 'Candidate',
            requisitionTitle: application.requisition.title,
            joinUrl: input.joinUrl,
            recipients,
        };

        setImmediate(async () => {
            for (const recipient of recipients) {
                try {
                    await dispatchInterviewInviteEmail(invitePayload, recipient);

                    const communicationId = communicationByEmail.get(recipient.email);
                    if (communicationId) {
                        await prisma.communication.update({
                            where: { id: communicationId },
                            data: {
                                status: 'sent',
                                sentAt: new Date(),
                            },
                        });
                    }
                } catch (error) {
                    const communicationId = communicationByEmail.get(recipient.email);
                    if (communicationId) {
                        await prisma.communication.update({
                            where: { id: communicationId },
                            data: {
                                status: 'failed',
                                retryCount: {
                                    increment: 1,
                                },
                            },
                        }).catch(() => undefined);
                    }

                    logger.error('Interview invite delivery failed after queueing', {
                        interviewId: stage.id,
                        recipient: recipient.email,
                        error: error instanceof Error ? error.message : String(error),
                    });
                }
            }
        });

        const reminderRecipients = recipients.map((recipient) => recipient.email);
        if (reminderRecipients.length > 0) {
            const reminder24hAt = startAtUtc.getTime() - 24 * 60 * 60 * 1000;
            const reminder1hAt = startAtUtc.getTime() - 60 * 60 * 1000;

            await enqueueInterviewReminder(
                {
                    interviewId: stage.id,
                    applicationId: input.applicationId,
                    reminderType: '24h',
                    recipientEmails: reminderRecipients,
                    scheduledAt: startAtUtc.toISOString(),
                },
                reminder24hAt - Date.now()
            );

            await enqueueInterviewReminder(
                {
                    interviewId: stage.id,
                    applicationId: input.applicationId,
                    reminderType: '1h',
                    recipientEmails: reminderRecipients,
                    scheduledAt: startAtUtc.toISOString(),
                },
                reminder1hAt - Date.now()
            );

            reminderJobsQueued = 2;
        }
    }

    await auditEvent({
        actorId: recruiter?.id ?? null,
        eventType: 'interview_scheduled',
        entityType: 'interview_stage',
        entityId: stage.id,
        payload: {
            applicationId: input.applicationId,
            interviewType: input.type,
            scheduledAt: stage.scheduledAt?.toISOString() ?? startAtUtc.toISOString(),
            endAt: stage.endAt?.toISOString() ?? endAtUtc.toISOString(),
            timezone: input.timezone,
            panelMembers: input.panelMemberIds,
            communicationsQueued,
            reminderJobsQueued,
        },
    });

    return {
        id: stage.id,
        applicationId: stage.applicationId,
        type: stage.type as InterviewStageTypeInput,
        scheduledAt: stage.scheduledAt!.toISOString(),
        endAt: stage.endAt!.toISOString(),
        timezone: stage.timezone,
        panelMembers: stage.panelMembers,
        communicationsQueued,
        reminderJobsQueued,
    };
}
