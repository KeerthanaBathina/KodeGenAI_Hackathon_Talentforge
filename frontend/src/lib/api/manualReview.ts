/**
 * Manual Review Queue API Client
 * 
 * Client functions for interacting with manual review queue endpoints
 */

import { buildApiUrl } from '@/lib/api/url';

export interface ManualReviewQueueItem {
    id: string;
    candidateId: string;
    candidateName: string;
    candidateEmail: string;
    requisitionId: string;
    requisitionTitle: string;
    requisitionDepartment: string;
    status: 'pending_review' | 'shortlisted' | 'rejected' | string;
    manualReviewReason: string | null;
    resumeId?: string | null;
    resumeFileName?: string | null;
    resumeMimeType?: 'application/pdf' | 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' | string | null;
    scheduledStageType?: 'aptitude' | 'coding' | 'technical' | 'hr' | null;
    submittedAt: string;
    screeningScore?: number | null;
    screeningConfidence?: number | null;
    aptitudeScore?: number | null;
    path?: 'fresher' | 'experienced' | null;
    pathOverridden?: boolean;
    slaDeadlineAt: string;
    slaRemainingSeconds: number;
    slaElapsedPercent: number;
    slaSeverity: 'normal' | 'amber' | 'red';
    isUrgent: boolean;
    canShortlist: boolean;
    canReject: boolean;
    decisionLocked: boolean;
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

export interface ManualReviewReasonCode {
    code: string;
    displayText: string;
    category: 'decision' | 'rejection' | 'withdrawal' | 'interview_cancellation' | string;
}

export interface ManualReviewReasonCodesResponse {
    items: ManualReviewReasonCode[];
}

export interface ManualReviewFilters {
    reason?: string[];
    requisitionId?: string;
    department?: string;
    scoreBand?: 'high' | 'medium' | 'low';
    status?: 'pending_review' | 'shortlisted' | 'rejected';
    dateFrom?: Date;
    dateTo?: Date;
}

export type ManualReviewSortBy = 'candidate' | 'role' | 'score' | 'sla' | 'status';
export type ManualReviewSortDir = 'asc' | 'desc';

export interface ManualReviewSort {
    sortBy?: ManualReviewSortBy;
    sortDir?: ManualReviewSortDir;
}

export interface PaginationOptions {
    page?: number;
    limit?: number;
}

export interface PathOverrideResponse {
    success: boolean;
    message: string;
    override: {
        applicationId: string;
        originalPath: 'fresher' | 'experienced' | null;
        newPath: 'fresher' | 'experienced';
        justification: string;
        overriddenAt: string;
    };
}

export interface BulkRejectResponse {
    success: boolean;
    message: string;
    result: {
        processedCount: number;
        rejectedIds: string[];
        skipped: Array<{
            applicationId: string;
            reason: 'NOT_FOUND' | 'NOT_PENDING_REVIEW';
        }>;
        reasonCode: string;
        correlationId: string;
        communicationsQueued: number;
    };
}

export interface ScheduleInitialInterviewResponse {
    success: boolean;
    message: string;
    interview: {
        applicationId: string;
        stageType: 'aptitude' | 'coding' | 'technical' | 'hr';
        interviewId: string;
        scheduledAt: string;
        endAt: string;
        timezone: string;
        joinUrl: string;
    };
}

/**
 * Fetch manual review queue with filtering and pagination
 */
export async function getManualReviewQueue(
    filters: ManualReviewFilters = {},
    pagination: PaginationOptions = {},
    sort: ManualReviewSort = {}
): Promise<ManualReviewQueueResponse> {
    const params = new URLSearchParams();

    if (filters.reason && filters.reason.length > 0) {
        params.set('reason', filters.reason.join(','));
    }

    if (filters.requisitionId) {
        params.set('requisitionId', filters.requisitionId);
    }

    if (filters.department) {
        params.set('department', filters.department);
    }

    if (filters.scoreBand) {
        params.set('scoreBand', filters.scoreBand);
    }

    if (filters.status) {
        params.set('status', filters.status);
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

    if (sort.sortBy) {
        params.set('sortBy', sort.sortBy);
    }

    if (sort.sortDir) {
        params.set('sortDir', sort.sortDir);
    }

    const response = await fetch(
        buildApiUrl(`/api/manual-review-queue?${params.toString()}`),
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
    const response = await fetch(buildApiUrl('/api/manual-review-queue/stats'), {
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
 * Get reason codes for manual-review decisions.
 */
export async function getManualReviewReasonCodes(
    decision?: 'shortlisted' | 'rejected'
): Promise<ManualReviewReasonCode[]> {
    const params = new URLSearchParams();
    if (decision) {
        params.set('decision', decision);
    }

    const query = params.toString();
    const response = await fetch(
        buildApiUrl(`/api/manual-review-queue/reason-codes${query ? `?${query}` : ''}`),
        {
            method: 'GET',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
            },
        }
    );

    if (!response.ok) {
        throw new Error('Failed to fetch reason codes');
    }

    const payload = (await response.json()) as ManualReviewReasonCodesResponse;
    return payload.items;
}

/**
 * Mark application as reviewed with decision
 */
export async function markApplicationAsReviewed(
    applicationId: string,
    decision: 'shortlisted' | 'rejected',
    reasonCode: string,
    comment?: string
): Promise<void> {
    const response = await fetch(
        buildApiUrl(`/api/manual-review-queue/${applicationId}/review`),
        {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ decision, reasonCode, comment }),
        }
    );

    if (!response.ok) {
        throw new Error('Failed to mark application as reviewed');
    }
}

export async function overrideApplicationPath(
    applicationId: string,
    newPath: 'fresher' | 'experienced',
    justification: string
): Promise<PathOverrideResponse> {
    const response = await fetch(
        buildApiUrl(`/api/manual-review-queue/${applicationId}/path-override`),
        {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ newPath, justification }),
        }
    );

    if (!response.ok) {
        throw new Error('Failed to override application path');
    }

    return response.json();
}

export async function bulkRejectApplications(
    applicationIds: string[],
    reasonCode: string,
    comment?: string
): Promise<BulkRejectResponse> {
    const response = await fetch(buildApiUrl('/api/manual-review-queue/bulk-reject'), {
        method: 'POST',
        credentials: 'include',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ applicationIds, reasonCode, comment }),
    });

    if (!response.ok) {
        throw new Error('Failed to bulk reject applications');
    }

    return response.json();
}

export async function scheduleInitialInterviewFromReview(
    applicationId: string,
    payload: {
        stageType?: 'aptitude' | 'coding' | 'technical' | 'hr';
        startAt: string;
        endAt: string;
        timezone: string;
        joinUrl?: string;
    }
): Promise<ScheduleInitialInterviewResponse> {
    const response = await fetch(
        buildApiUrl(`/api/manual-review-queue/${applicationId}/schedule-interview`),
        {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        }
    );

    if (!response.ok) {
        throw new Error('Failed to schedule interview');
    }

    return response.json();
}
