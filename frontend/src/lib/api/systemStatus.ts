/**
 * System Status API Client
 * 
 * Client functions for system status and fallback mode
 */

export interface FallbackModeState {
    active: boolean;
    reason?: 'high_queue_depth' | 'worker_offline' | 'manual';
    activatedAt?: string;
    metadata?: {
        queueDepth?: number;
        workerOfflineDurationMs?: number;
    };
}

/**
 * Get current fallback mode state
 */
export async function getFallbackModeState(): Promise<FallbackModeState> {
    const response = await fetch('/api/admin/system-status/fallback-mode', {
        method: 'GET',
        credentials: 'include',
        headers: {
            'Content-Type': 'application/json',
        },
    });

    if (!response.ok) {
        throw new Error('Failed to get fallback mode state');
    }

    return response.json();
}

/**
 * Manually enable fallback mode (admin only)
 */
export async function enableFallbackMode(): Promise<void> {
    const response = await fetch(
        '/api/admin/system-status/fallback-mode/enable',
        {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
            },
        }
    );

    if (!response.ok) {
        throw new Error('Failed to enable fallback mode');
    }
}

/**
 * Manually disable fallback mode (admin only)
 */
export async function disableFallbackMode(): Promise<void> {
    const response = await fetch(
        '/api/admin/system-status/fallback-mode/disable',
        {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
            },
        }
    );

    if (!response.ok) {
        throw new Error('Failed to disable fallback mode');
    }
}
