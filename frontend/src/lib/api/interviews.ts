export type InterviewStageType = 'aptitude' | 'coding' | 'technical' | 'system_design' | 'cultural' | 'hr';

export interface InterviewConflict {
    panelMemberId: string;
    panelMemberName: string;
    interviewStageId: string;
    interviewType: InterviewStageType;
    requisitionTitle: string;
    scheduledAt: string;
    timezone: string;
}

export interface ScheduleInterviewRequest {
    applicationId: string;
    type: InterviewStageType;
    startAt: string;
    endAt: string;
    timezone: string;
    panelMemberIds: string[];
}

export interface ScheduleInterviewResponse {
    success: boolean;
    interview: {
        id: string;
        applicationId: string;
        type: InterviewStageType;
        scheduledAt: string;
        timezone: string;
        panelMembers: string[];
    };
}

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

export async function scheduleInterview(
    payload: ScheduleInterviewRequest
): Promise<ScheduleInterviewResponse> {
    const response = await fetch('/api/interviews', {
        method: 'POST',
        credentials: 'include',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
    });

    if (!response.ok) {
        const errorPayload = await response.json().catch(() => null);
        const errorMessage = errorPayload?.error || 'Failed to schedule interview';
        const error = new Error(errorMessage);
        (error as Error & { status?: number; conflicts?: InterviewConflict[] }).status = response.status;
        if (errorPayload?.conflicts) {
            (error as Error & { conflicts?: InterviewConflict[] }).conflicts = errorPayload.conflicts;
        }
        throw error;
    }

    return response.json();
}

export async function getPanelistAvailability(
    applicationId: string,
    panelMemberIds: string[]
): Promise<PanelistAvailabilityResponse[]> {
    const query = new URLSearchParams();
    query.set('applicationId', applicationId);
    query.set('panelMemberIds', panelMemberIds.join(','));

    const response = await fetch(`/api/interviews/availability?${query.toString()}`, {
        credentials: 'include',
    });

    if (!response.ok) {
        throw new Error('Failed to fetch panelist availability');
    }

    return response.json();
}

export type PanelistConfirmationStatus = 'pending' | 'confirmed' | 'declined';

export interface PanelistAssignment {
    id: string;
    name: string;
    email: string;
    timezone: string;
    status: PanelistConfirmationStatus;
    respondedAt?: string;
}

export interface AssignPanelistsRequest {
    interviewId: string;
    panelMemberIds: string[];
}

export interface AssignPanelistsResponse {
    success: boolean;
    message: string;
}

export interface ConfirmPanelistRequest {
    token: string;
}

export interface ConfirmPanelistResponse {
    success: boolean;
    message: string;
    status: PanelistConfirmationStatus;
}

export async function assignPanelists(
    payload: AssignPanelistsRequest
): Promise<AssignPanelistsResponse> {
    const response = await fetch(`/api/interviews/${payload.interviewId}/panelists`, {
        method: 'PATCH',
        credentials: 'include',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ panelMemberIds: payload.panelMemberIds }),
    });

    if (!response.ok) {
        const errorPayload = await response.json().catch(() => null);
        const errorMessage = errorPayload?.error || 'Failed to assign panelists';
        const error = new Error(errorMessage);
        (error as Error & { status?: number; unavailablePanelists?: Array<{ id: string; name: string }> }).status = response.status;
        if (errorPayload?.unavailablePanelists) {
            (error as Error & { unavailablePanelists?: Array<{ id: string; name: string }> }).unavailablePanelists = errorPayload.unavailablePanelists;
        }
        throw error;
    }

    return response.json();
}

export async function confirmPanelist(
    payload: ConfirmPanelistRequest
): Promise<ConfirmPanelistResponse> {
    const response = await fetch('/api/interviews/confirm-panelist', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
    });

    if (!response.ok) {
        const errorPayload = await response.json().catch(() => null);
        const errorMessage = errorPayload?.error || 'Failed to confirm panelist';
        throw new Error(errorMessage);
    }

    return response.json();
}

export interface UnconfirmedPanelist {
    id: string;
    name: string;
    status: 'pending' | 'declined';
}

export interface NotifyCandidateRequest {
    interviewId: string;
    forceNotify?: boolean;
    justification?: string;
}

export interface NotifyCandidateResponse {
    success: boolean;
    message: string;
    warningOverridden?: boolean;
}

export interface NotifyCandidateError extends Error {
    status?: number;
    unconfirmedPanelists?: UnconfirmedPanelist[];
}

export async function notifyCandidate(
    payload: NotifyCandidateRequest
): Promise<NotifyCandidateResponse> {
    const response = await fetch(`/api/interviews/${payload.interviewId}/notify-candidate`, {
        method: 'POST',
        credentials: 'include',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            forceNotify: payload.forceNotify,
            justification: payload.justification,
        }),
    });

    if (!response.ok) {
        const errorPayload = await response.json().catch(() => null);
        const errorMessage = errorPayload?.error || 'Failed to notify candidate';
        const error = new Error(errorMessage) as NotifyCandidateError;
        error.status = response.status;
        if (errorPayload?.unconfirmedPanelists) {
            error.unconfirmedPanelists = errorPayload.unconfirmedPanelists;
        }
        throw error;
    }

    return response.json();
}

// Interview State Management Types
export type InterviewState = 'scheduled' | 'completed' | 'cancelled' | 'no_show' | 'rescheduled';

export interface TransitionStateResponse {
    id: string;
    state: InterviewState;
    cancelReason: string | null;
}

export interface RecordNoShowResponse {
    interview: {
        id: string;
        state: InterviewState;
        cancelReason: string | null;
    };
    candidate: {
        id: string;
        noShowCount: number;
    };
}

export interface RescheduleData {
    newScheduledAt: string;
    newEndAt?: string;
    newDuration?: number;
    newMeetingLink?: string;
    newLocation?: string;
    reason?: string;
}

export interface RescheduleResponse {
    originalInterview: {
        id: string;
        state: InterviewState;
        cancelReason: string | null;
        rescheduledToId: string | null;
    };
    newInterview: {
        id: string;
        scheduledAt: string;
        endAt: string | null;
        state: InterviewState;
        rescheduledFromId: string | null;
    };
}

/**
 * Transition interview to a new state
 */
export async function transitionInterviewState(
    interviewId: string,
    newState: InterviewState,
    reason?: string
): Promise<TransitionStateResponse> {
    const response = await fetch(`/api/interviews/${interviewId}/state`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: newState, reason }),
    });

    if (!response.ok) {
        const errorPayload = await response.json().catch(() => null);
        const errorMessage = errorPayload?.error || 'Failed to update interview state';
        throw new Error(errorMessage);
    }

    return response.json();
}

/**
 * Record interview no-show
 */
export async function recordNoShow(
    interviewId: string,
    reason: string
): Promise<RecordNoShowResponse> {
    const response = await fetch(`/api/interviews/${interviewId}/no-show`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
    });

    if (!response.ok) {
        const errorPayload = await response.json().catch(() => null);
        const errorMessage = errorPayload?.error || 'Failed to record no-show';
        throw new Error(errorMessage);
    }

    return response.json();
}

/**
 * Reschedule interview
 */
export async function rescheduleInterview(
    interviewId: string,
    data: RescheduleData
): Promise<RescheduleResponse> {
    const response = await fetch(`/api/interviews/${interviewId}/reschedule`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });

    if (!response.ok) {
        const errorPayload = await response.json().catch(() => null);
        const errorMessage = errorPayload?.error || 'Failed to reschedule interview';
        throw new Error(errorMessage);
    }

    return response.json();
}

// Stage Prerequisite Management Types and Functions

export interface StageStatus {
    stage: string;
    status: 'completed' | 'available' | 'locked' | 'not_applicable';
    prerequisites: string[];
    missingPrerequisites: string[];
}

export interface StageSequence {
    path: 'fresher' | 'experienced';
    sequence: Array<{
        stage: string;
        prerequisites: string[];
    }>;
}

/**
 * Get stage sequence for a path
 */
export async function getStageSequence(path: 'fresher' | 'experienced'): Promise<StageSequence> {
    const response = await fetch(`/api/interview-paths/${path}/sequence`, {
        credentials: 'include',
    });

    if (!response.ok) {
        throw new Error('Failed to fetch stage sequence');
    }

    return response.json();
}

/**
 * Get stage status for an application
 */
export async function getApplicationStageStatus(applicationId: string): Promise<StageStatus[]> {
    const response = await fetch(`/api/applications/${applicationId}/stage-status`, {
        credentials: 'include',
    });

    if (!response.ok) {
        throw new Error('Failed to fetch stage status');
    }

    return response.json();
}

/**
 * Check if a stage can be scheduled
 */
export async function checkStagePrerequisites(
    applicationId: string,
    stage: string
): Promise<{ canSchedule: boolean; reason?: string; missingStages: string[] }> {
    const response = await fetch(
        `/api/interviews/check-prerequisites/${applicationId}/${stage}`,
        { credentials: 'include' }
    );

    if (!response.ok) {
        throw new Error('Failed to check prerequisites');
    }

    return response.json();
}
