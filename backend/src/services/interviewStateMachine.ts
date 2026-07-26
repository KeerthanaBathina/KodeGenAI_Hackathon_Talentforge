import { InterviewStageState } from '@prisma/client';

// Define valid state transitions
const STATE_TRANSITIONS: Record<InterviewStageState, InterviewStageState[]> = {
    scheduled: ['completed', 'cancelled', 'no_show', 'rescheduled'],
    completed: [], // Terminal state - no transitions allowed
    cancelled: [], // Terminal state
    no_show: ['rescheduled'], // Can only reschedule after no-show
    rescheduled: [], // Terminal state
};

export interface StateTransitionResult {
    allowed: boolean;
    reason?: string;
}

/**
 * Validate if a state transition is allowed
 */
export function canTransition(
    from: InterviewStageState,
    to: InterviewStageState
): StateTransitionResult {
    const allowedStates = STATE_TRANSITIONS[from];

    if (!allowedStates) {
        return {
            allowed: false,
            reason: `Unknown state: ${from}`,
        };
    }

    if (!allowedStates.includes(to)) {
        return {
            allowed: false,
            reason: `Cannot transition from ${from} to ${to}. Allowed transitions: ${allowedStates.join(', ') || 'none'}`,
        };
    }

    return { allowed: true };
}

/**
 * Get all allowed transitions for a given state
 */
export function getAllowedTransitions(
    currentState: InterviewStageState
): InterviewStageState[] {
    return STATE_TRANSITIONS[currentState] || [];
}

/**
 * Check if state is terminal (no transitions allowed)
 */
export function isTerminalState(state: InterviewStageState): boolean {
    return STATE_TRANSITIONS[state]?.length === 0;
}
