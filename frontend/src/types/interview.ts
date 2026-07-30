export type InterviewState = 'scheduled' | 'completed' | 'cancelled' | 'no_show' | 'rescheduled';
export type InterviewStageType = 'aptitude' | 'coding' | 'technical' | 'hr';

export interface InterviewDetails {
    id: string;
    applicationId: string;
    type: InterviewStageType;
    state: InterviewState;
    scheduledAt: string;
    endAt?: string;
    timezone: string;
    duration?: number;
    meetingLink?: string;
    location?: string;
    cancelReason?: string;
    panelMembers: string[];
    panelistConfirmations?: Array<{
        id: string;
        status: 'pending' | 'confirmed' | 'declined';
        panelist: {
            id: string;
            fullName: string;
            email: string;
        };
    }>;
}

export interface RescheduleData {
    newScheduledAt: string;
    newEndAt?: string;
    newDuration?: number;
    newMeetingLink?: string;
    newLocation?: string;
    reason?: string;
}

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
