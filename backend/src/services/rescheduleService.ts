import { prisma } from '../db/prisma';
import { InterviewStageState } from '@prisma/client';
import { transitionInterviewState } from './interviewStateService';
import {
    enqueueInterviewReminder,
    cancelInterviewReminders,
} from '../queues/interviewReminderQueue';
import {
    dispatchInterviewInviteEmail,
    type InterviewInvitePayload,
} from './interviewInviteService';
import { auditEvent } from './auditService';
import logger from '../utils/logger';

export interface RescheduleInterviewDTO {
    originalInterviewId: string;
    newScheduledAt: Date;
    newEndAt?: Date;
    newMeetingLink?: string;
    newLocation?: string;
    reason?: string;
    actorId: string;
}

export interface RescheduleResult {
    originalInterview: {
        id: string;
        state: InterviewStageState;
        cancelReason: string | null;
        rescheduledToId: string | null;
    };
    newInterview: {
        id: string;
        scheduledAt: Date;
        endAt: Date | null;
        state: InterviewStageState;
        rescheduledFromId: string | null;
    };
}

/**
 * Reschedule an interview
 * Creates new interview linked to original, transitions original to rescheduled state
 */
export async function rescheduleInterview(
    dto: RescheduleInterviewDTO
): Promise<RescheduleResult> {
    const {
        originalInterviewId,
        newScheduledAt,
        newEndAt,
        newMeetingLink,
        newLocation,
        reason,
        actorId,
    } = dto;

    // Get original interview with all related data
    const originalInterview = await prisma.interviewStage.findUnique({
        where: { id: originalInterviewId },
        include: {
            application: {
                include: {
                    candidate: {
                        include: {
                            profile: true,
                        },
                    },
                    requisition: true,
                },
            },
            panelistConfirmations: {
                include: {
                    panelist: true,
                },
            },
        },
    });

    if (!originalInterview) {
        throw new Error('Interview not found');
    }

    // Validate original interview can be rescheduled
    // (Only scheduled or no_show interviews can be rescheduled)
    if (
        originalInterview.state !== InterviewStageState.scheduled &&
        originalInterview.state !== InterviewStageState.no_show
    ) {
        throw new Error(
            `Cannot reschedule interview in ${originalInterview.state} state. Only scheduled or no_show interviews can be rescheduled.`
        );
    }

    // Calculate duration if not provided
    const calculatedEndAt =
        newEndAt ||
        new Date(
            newScheduledAt.getTime() +
                (originalInterview.endAt && originalInterview.scheduledAt
                    ? originalInterview.endAt.getTime() -
                      originalInterview.scheduledAt.getTime()
                    : 60 * 60 * 1000)
        ); // Default 60 minutes

    // Use Prisma transaction for atomicity
    const result = await prisma.$transaction(async (tx) => {
        // Create new interview
        const newInterview = await tx.interviewStage.create({
            data: {
                applicationId: originalInterview.applicationId,
                type: originalInterview.type,
                scheduledAt: newScheduledAt,
                endAt: calculatedEndAt,
                timezone: originalInterview.timezone,
                panelMembers: originalInterview.panelMembers,
                state: InterviewStageState.scheduled,
                rescheduledFromId: originalInterviewId,
            },
        });

        // Copy panelist assignments to new interview (reset to pending)
        for (const confirmation of originalInterview.panelistConfirmations) {
            await tx.panelistConfirmation.create({
                data: {
                    interviewStageId: newInterview.id,
                    panelistId: confirmation.panelistId,
                    status: 'pending', // Reset to pending for new interview
                },
            });
        }

        // Update original interview to rescheduled state
        const updatedOriginal = await tx.interviewStage.update({
            where: { id: originalInterviewId },
            data: {
                state: InterviewStageState.rescheduled,
                cancelReason: reason || 'Rescheduled',
                rescheduledToId: newInterview.id,
            },
        });

        return { newInterview, updatedOriginal };
    });

    // Cancel reminder jobs for original interview
    await cancelInterviewReminders(originalInterviewId);

    // Schedule reminder jobs for new interview
    const recipientEmails = [
        originalInterview.application.candidate.email,
        ...originalInterview.panelistConfirmations.map((pc) => pc.panelist.email),
    ];

    const reminder24hDelay = newScheduledAt.getTime() - Date.now() - 24 * 60 * 60 * 1000;
    const reminder1hDelay = newScheduledAt.getTime() - Date.now() - 60 * 60 * 1000;

    if (reminder24hDelay > 0) {
        await enqueueInterviewReminder(
            {
                interviewId: result.newInterview.id,
                applicationId: originalInterview.applicationId,
                reminderType: '24h',
                recipientEmails,
                scheduledAt: newScheduledAt.toISOString(),
            },
            reminder24hDelay
        );
    }

    if (reminder1hDelay > 0) {
        await enqueueInterviewReminder(
            {
                interviewId: result.newInterview.id,
                applicationId: originalInterview.applicationId,
                reminderType: '1h',
                recipientEmails,
                scheduledAt: newScheduledAt.toISOString(),
            },
            reminder1hDelay
        );
    }

    // Send calendar invites for new interview
    const invitePayload: InterviewInvitePayload = {
        interviewId: result.newInterview.id,
        applicationId: originalInterview.applicationId,
        interviewType: originalInterview.type,
        startAt: newScheduledAt,
        endAt: calculatedEndAt,
        timezone: originalInterview.timezone,
        candidateName:
            originalInterview.application.candidate.profile?.fullName || 'Candidate',
        requisitionTitle: originalInterview.application.requisition.title,
        location: newLocation || null,
        joinUrl: newMeetingLink || null,
        recipients: [
            {
                email: originalInterview.application.candidate.email,
                name:
                    originalInterview.application.candidate.profile?.fullName ||
                    'Candidate',
                timezone: originalInterview.application.candidate.timezone,
                role: 'candidate' as const,
            },
            ...originalInterview.panelistConfirmations.map((pc) => ({
                email: pc.panelist.email,
                name: pc.panelist.fullName,
                timezone: pc.panelist.timezone,
                role: 'panelist' as const,
            })),
        ],
    };

    // Send invites asynchronously
    setImmediate(async () => {
        for (const recipient of invitePayload.recipients) {
            try {
                await dispatchInterviewInviteEmail(invitePayload, recipient);
                logger.info(
                    {
                        interviewId: result.newInterview.id,
                        recipient: recipient.email,
                    },
                    '[reschedule] Interview invite sent'
                );
            } catch (error) {
                logger.error(
                    {
                        interviewId: result.newInterview.id,
                        recipient: recipient.email,
                        error,
                    },
                    '[reschedule] Failed to send interview invite'
                );
            }
        }
    });

    // Create audit event
    await auditEvent({
        actorId,
        eventType: 'interview_rescheduled',
        entityType: 'interview_stage',
        entityId: originalInterviewId,
        payload: {
            originalScheduledAt: originalInterview.scheduledAt?.toISOString(),
            newScheduledAt: newScheduledAt.toISOString(),
            newInterviewId: result.newInterview.id,
            reason: reason || null,
        },
    });

    logger.info(
        {
            originalInterviewId,
            newInterviewId: result.newInterview.id,
            originalScheduledAt: originalInterview.scheduledAt,
            newScheduledAt,
        },
        '[reschedule] Interview rescheduled'
    );

    return {
        originalInterview: {
            id: result.updatedOriginal.id,
            state: result.updatedOriginal.state,
            cancelReason: result.updatedOriginal.cancelReason,
            rescheduledToId: result.updatedOriginal.rescheduledToId,
        },
        newInterview: {
            id: result.newInterview.id,
            scheduledAt: result.newInterview.scheduledAt!,
            endAt: result.newInterview.endAt,
            state: result.newInterview.state,
            rescheduledFromId: result.newInterview.rescheduledFromId,
        },
    };
}

export interface RescheduleHistoryItem {
    id: string;
    scheduledAt: Date | null;
    state: InterviewStageState;
    cancelReason: string | null;
}

export interface RescheduleHistory {
    interviewId: string;
    rescheduleCount: number;
    history: RescheduleHistoryItem[];
}

/**
 * Get reschedule history for an interview
 * Returns the full chain of rescheduled interviews
 */
export async function getInterviewRescheduleHistory(
    interviewStageId: string
): Promise<RescheduleHistory> {
    const interview = await prisma.interviewStage.findUnique({
        where: { id: interviewStageId },
        include: {
            rescheduledFrom: true,
            rescheduledTo: true,
        },
    });

    if (!interview) {
        throw new Error('Interview not found');
    }

    // Build reschedule chain
    const history: RescheduleHistoryItem[] = [];

    // Walk backwards to find original
    let current: any = interview;
    const visited = new Set<string>([interview.id]);

    while (current.rescheduledFromId && !visited.has(current.rescheduledFromId)) {
        visited.add(current.rescheduledFromId);
        const prev = await prisma.interviewStage.findUnique({
            where: { id: current.rescheduledFromId },
            include: {
                rescheduledFrom: true,
            },
        });

        if (!prev) break;

        history.unshift({
            id: prev.id,
            scheduledAt: prev.scheduledAt,
            state: prev.state,
            cancelReason: prev.cancelReason,
        });

        current = prev;
    }

    // Add current interview
    history.push({
        id: interview.id,
        scheduledAt: interview.scheduledAt,
        state: interview.state,
        cancelReason: interview.cancelReason,
    });

    // Walk forwards to find latest
    current = interview;
    while (current.rescheduledToId && !visited.has(current.rescheduledToId)) {
        visited.add(current.rescheduledToId);
        const next = await prisma.interviewStage.findUnique({
            where: { id: current.rescheduledToId },
            include: {
                rescheduledTo: true,
            },
        });

        if (!next) break;

        history.push({
            id: next.id,
            scheduledAt: next.scheduledAt,
            state: next.state,
            cancelReason: next.cancelReason,
        });

        current = next;
    }

    return {
        interviewId: interviewStageId,
        rescheduleCount: history.length - 1,
        history,
    };
}
