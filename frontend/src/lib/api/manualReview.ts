/**
 * Manual Review Queue API Client
 * 
 * Client functions for interacting with manual review queue endpoints
 */

export interface ManualReviewQueueItem {
    id: string;
    candidateId: string;
    candidateName: string;
    candidateEmail: string;
    requisitionId: string;
    requisitionTitle: string;
    manualReviewReason: string | null;
    submittedAt: string;
    screeningScore?: number | null;
    screeningConfidence?: number | null;
}

export interface ManualReviewQueueResponse {
    items: ManualReviewQueueItem[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}

export interface ManualReviewQueueStats {
    totalCount: number;
    byReason: Record<string, number>;
    oldestApplicationAgeHours: number | null;
}

export interface ManualReviewFilters {
    reason?: string[];
    requisitionId?: string;
    dateFrom?: Date;
    dateTo?: Date;
}

export interface PaginationOptions {
    page?: number;
    limit?: number;
}

/**
 * Fetch manual review queue with filtering and pagination
 */
export async function getManualReviewQueue(
    filters: ManualReviewFilters = {},
    pagination: PaginationOptions = {}
): Promise<ManualReviewQueueResponse> {
    const params = new URLSearchParams();

    if (filters.reason && filters.reason.length > 0) {
        params.set('reason', filters.reason.join(','));
    }

    if (filters.requisitionId) {
        params.set('requisitionId', filters.requisitionId);
    }

    if (filters.dateFrom) {
        params.set('dateFrom', filters.dateFrom.toISOString());
    }

    if (filters.dateTo) {
        params.set('dateTo', filters.dateTo.toISOString());
    }

    if (pagination.page) {
        params.set('page', pagination.page.toString());
    }

    if (pagination.limit) {
        params.set('limit', pagination.limit.toString());
    }

    const response = await fetch(
        `/api/manual-review-queue?${params.toString()}`,
        {
            method: 'GET',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
            },
        }
    );

    if (!response.ok) {
        throw new Error('Failed to fetch manual review queue');
    }

    return response.json();
}

/**
 * Get queue statistics
 */
export async function getManualReviewQueueStats(): Promise<ManualReviewQueueStats> {
    const response = await fetch('/api/manual-review-queue/stats', {
        method: 'GET',
        credentials: 'include',
        headers: {
            'Content-Type': 'application/json',
        },
    });

    if (!response.ok) {
        throw new Error('Failed to fetch queue statistics');
    }

    return response.json();
}

/**
 * Mark application as reviewed with decision
 */
export async function markApplicationAsReviewed(
    applicationId: string,
    decision: 'shortlisted' | 'rejected',
    notes?: string
): Promise<void> {
    const response = await fetch(
        `/api/manual-review-queue/${applicationId}/review`,
        {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ decision, notes }),
        }
    );

    if (!response.ok) {
        throw new Error('Failed to mark application as reviewed');
    }
}
