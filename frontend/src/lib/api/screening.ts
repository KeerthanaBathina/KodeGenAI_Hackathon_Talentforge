import { ScreeningResult, ScreeningThresholds } from '@/types/screening';

/**
 * Fetch screening result for a specific application
 */
export async function getScreeningByApplication(
    applicationId: string
): Promise<ScreeningResult> {
    const response = await fetch(`/api/screenings/application/${applicationId}`, {
        credentials: 'include',
    });

    if (!response.ok) {
        if (response.status === 404) {
            throw new Error('Screening not found for this application');
        }
        throw new Error('Failed to fetch screening data');
    }

    return response.json();
}

/**
 * Fetch active screening thresholds
 */
export async function getActiveThresholds(): Promise<ScreeningThresholds> {
    const response = await fetch('/api/admin/thresholds/active', {
        credentials: 'include',
    });

    if (!response.ok) {
        throw new Error('Failed to fetch screening thresholds');
    }

    return response.json();
}

/**
 * Trigger screening for an application (enqueue via BullMQ)
 */
export async function triggerScreening(applicationId: string): Promise<{ jobId: string }> {
    const response = await fetch('/api/screenings/trigger', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ applicationId }),
    });

    if (!response.ok) {
        throw new Error('Failed to trigger screening');
    }

    return response.json();
}

/**
 * Perform screening immediately (not queued)
 */
export async function performScreening(applicationId: string): Promise<ScreeningResult> {
    const response = await fetch('/api/screenings/perform', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ applicationId }),
    });

    if (!response.ok) {
        throw new Error('Failed to perform screening');
    }

    return response.json();
}
