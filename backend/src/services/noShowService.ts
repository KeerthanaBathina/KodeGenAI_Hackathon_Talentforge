import { prisma } from '../db/prisma';
import { transitionInterviewState } from './interviewStateService';
import { auditEvent } from './auditService';
import logger from '../utils/logger';

export interface RecordNoShowDTO {
    interviewStageId: string;
    reason?: string;
    actorId: string;
}

export interface NoShowResult {
    interview: {
        id: string;
        state: string;
        cancelReason: string | null;
    };
    candidate: {
        id: string;
        noShowCount: number;
    };
}

/**
 * Record an interview no-show
 * Transitions interview to no_show state and increments candidate's no-show count
 */
export async function recordNoShow(dto: RecordNoShowDTO): Promise<NoShowResult> {
    const { interviewStageId, reason, actorId } = dto;

    // Get interview details
    const interview = await prisma.interviewStage.findUnique({
        where: { id: interviewStageId },
        include: {
            application: {
                include: {
                    candidate: true,
                },
            },
        },
    });

    if (!interview) {
        throw new Error('Interview not found');
    }

    // Transition to no_show state (validates state machine)
    const updatedInterview = await transitionInterviewState({
        interviewStageId,
        newState: 'no_show',
        reason,
        actorId,
    });

    // Increment candidate's no-show count
    const updatedCandidate = await prisma.candidate.update({
        where: { id: interview.application.candidate.id },
        data: {
            noShowCount: {
                increment: 1,
            },
        },
    });

    // Create specific no-show audit event
    await auditEvent({
        actorId,
        eventType: 'interview_no_show',
        entityType: 'interview_stage',
        entityId: interviewStageId,
        payload: {
            candidateId: interview.application.candidate.id,
            previousNoShowCount: updatedCandidate.noShowCount - 1,
            newNoShowCount: updatedCandidate.noShowCount,
            reason: reason || null,
            scheduledAt: interview.scheduledAt?.toISOString(),
        },
    });

    logger.info(
        {
            interviewStageId,
            candidateId: interview.application.candidate.id,
            noShowCount: updatedCandidate.noShowCount,
        },
        '[no-show] Interview no-show recorded'
    );

    return {
        interview: {
            id: updatedInterview.id,
            state: updatedInterview.state,
            cancelReason: updatedInterview.cancelReason,
        },
        candidate: {
            id: updatedCandidate.id,
            noShowCount: updatedCandidate.noShowCount,
        },
    };
}

export interface CandidateNoShowHistory {
    candidate: {
        id: string;
        email: string;
        noShowCount: number;
    };
    noShowInterviews: Array<{
        id: string;
        scheduledAt: Date | null;
        positionTitle: string;
        cancelReason: string | null;
    }>;
}

/**
 * Get candidate's no-show history
 */
export async function getCandidateNoShowHistory(
    candidateId: string
): Promise<CandidateNoShowHistory> {
    const candidate = await prisma.candidate.findUnique({
        where: { id: candidateId },
        select: {
            id: true,
            email: true,
            noShowCount: true,
        },
    });

    if (!candidate) {
        throw new Error('Candidate not found');
    }

    // Get all no-show interviews for this candidate
    const noShowInterviews = await prisma.interviewStage.findMany({
        where: {
            application: {
                candidateId,
            },
            state: 'no_show',
        },
        include: {
            application: {
                include: {
                    requisition: {
                        select: {
                            title: true,
                        },
                    },
                },
            },
        },
        orderBy: {
            scheduledAt: 'desc',
        },
    });

    return {
        candidate: {
            id: candidate.id,
            email: candidate.email,
            noShowCount: candidate.noShowCount,
        },
        noShowInterviews: noShowInterviews.map((interview) => ({
            id: interview.id,
            scheduledAt: interview.scheduledAt,
            positionTitle: interview.application.requisition.title,
            cancelReason: interview.cancelReason,
        })),
    };
}
