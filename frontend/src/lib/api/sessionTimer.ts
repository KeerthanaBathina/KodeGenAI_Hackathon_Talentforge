/**
 * Session Timer API Service
 * 
 * API calls for session timer operations
 */

export interface SessionTimerState {
    sessionId: string;
    remainingMinutes: number;
    status: 'active' | 'expired';
    lastHeartbeat: string;
}

export interface SessionTimerResponse {
    success: boolean;
    data?: SessionTimerState;
    error?: {
        code: string;
        message: string;
        retryAfter?: number;
    };
    correlationId?: string;
}

/**
 * Fetch current timer state for a session
 * 
 * @param sessionId - Assessment session ID
 * @param sessionToken - Session authentication token
 * @returns Timer state with remaining minutes
 * @throws Error if request fails or session expired
 */
export async function fetchRemainingTime(
    sessionId: string,
    sessionToken: string,
    signal?: AbortSignal
): Promise<SessionTimerState> {
    const response = await fetch(`/api/sessions/${sessionId}/timer`, {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${sessionToken}`,
        },
        credentials: 'include',
        signal,
    });

    const data: SessionTimerResponse = await response.json();

    if (!response.ok) {
        if (response.status === 410) {
            // Session expired
            throw new SessionExpiredError(data.error?.message || 'Session expired');
        }
        if (response.status === 404) {
            throw new TimerNotFoundError(data.error?.message || 'Timer not found');
        }
        if (response.status === 401) {
            throw new AuthenticationError(data.error?.message || 'Authentication failed');
        }
        throw new Error(data.error?.message || 'Failed to fetch timer');
    }

    if (!data.success || !data.data) {
        throw new Error('Invalid response from server');
    }

    return data.data;
}

/**
 * Send heartbeat to update session activity
 * 
 * @param sessionId - Assessment session ID
 * @param sessionToken - Session authentication token
 * @returns Updated timer state
 * @throws Error if request fails or rate limited
 */
export async function sendHeartbeat(
    sessionId: string,
    sessionToken: string,
    signal?: AbortSignal
): Promise<SessionTimerState> {
    const response = await fetch(`/api/sessions/${sessionId}/heartbeat`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${sessionToken}`,
        },
        credentials: 'include',
        signal,
    });

    const data: SessionTimerResponse = await response.json();

    if (!response.ok) {
        if (response.status === 429) {
            // Rate limited
            const retryAfter = data.error?.retryAfter || 10;
            throw new RateLimitError(
                data.error?.message || 'Rate limit exceeded',
                retryAfter
            );
        }
        if (response.status === 410) {
            // Session expired
            throw new SessionExpiredError(data.error?.message || 'Session expired');
        }
        if (response.status === 404) {
            throw new TimerNotFoundError(data.error?.message || 'Timer not found');
        }
        if (response.status === 401) {
            throw new AuthenticationError(data.error?.message || 'Authentication failed');
        }
        throw new Error(data.error?.message || 'Failed to send heartbeat');
    }

    if (!data.success || !data.data) {
        throw new Error('Invalid response from server');
    }

    return data.data;
}

/**
 * Custom error classes for specific error scenarios
 */
export class SessionExpiredError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'SessionExpiredError';
    }
}

export class TimerNotFoundError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'TimerNotFoundError';
    }
}

export class AuthenticationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'AuthenticationError';
    }
}

export class RateLimitError extends Error {
    retryAfter: number;
    
    constructor(message: string, retryAfter: number) {
        super(message);
        this.name = 'RateLimitError';
        this.retryAfter = retryAfter;
    }
}
