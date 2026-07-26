import { prisma } from '../db/prisma';
import { InterviewStageState } from '@prisma/client';
import { canTransition, getAllowedTransitions, isTerminalState } from './interviewStateMachine';
import { auditEvent } from './auditService';
import { cancelInterviewReminders } from '../queues/interviewReminderQueue';
import logger from '../utils/logger';

export interface TransitionInterviewStateDTO {
    interviewStageId: string;
    newState: InterviewStageState;
    reason?: string;
    actorId: string;
}

/**
 * Transition interview to new state with validation
 */
export async function transitionInterviewState(
    dto: TransitionInterviewStateDTO
): Promise<any> {
    const { interviewStageId, newState, reason, actorId } = dto;

    // Get current interview state
    const interview = await prisma.interviewStage.findUnique({
        where: { id: interviewStageId },
        select: { id: true, state: true, type: true, scheduledAt: true },
    });

    if (!interview) {
        throw new Error('Interview not found');
    }

    // Validate transition
    const transitionCheck = canTransition(interview.state, newState);
    if (!transitionCheck.allowed) {
        const error: any = new Error(transitionCheck.reason || 'Invalid state transition');
        error.code = 'INVALID_STATE_TRANSITION';
        error.currentState = interview.state;
        error.requestedState = newState;
        throw error;
    }

    // Update interview state
    const updatedInterview = await prisma.interviewStage.update({
        where: { id: interviewStageId },
        data: {
            state: newState,
            ...(reason && { cancelReason: reason }),
        },
    });

    // Cancel reminder jobs if interview is cancelled or rescheduled
    if (newState === 'cancelled' || newState === 'rescheduled') {
        await cancelInterviewReminders(interviewStageId);
        logger.info(
            { interviewStageId, newState },
            '[interview-state] Cancelled reminder jobs for state transition'
        );
    }

    // Create audit event
    await auditEvent({
        actorId,
        eventType: `interview_state_${newState}`,
        entityType: 'interview_stage',
        entityId: interviewStageId,
        payload: {
            previousState: interview.state,
            newState,
            reason: reason || null,
            scheduledAt: interview.scheduledAt,
        },
    });

    logger.info(
        {
            interviewStageId,
            previousState: interview.state,
            newState,
            actorId,
        },
        `[interview-state] State transition: ${interview.state} → ${newState}`
    );

    return updatedInterview;
}

/**
 * Get interview state with allowed transitions
 */
export async function getInterviewStateInfo(interviewStageId: string) {
    const interview = await prisma.interviewStage.findUnique({
        where: { id: interviewStageId },
        select: { id: true, state: true, type: true, scheduledAt: true },
    });

    if (!interview) {
        throw new Error('Interview not found');
    }

    const allowedTransitions = getAllowedTransitions(interview.state);

    return {
        currentState: interview.state,
        allowedTransitions,
        isTerminal: isTerminalState(interview.state),
    };
}
