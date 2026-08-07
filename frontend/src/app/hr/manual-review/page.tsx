/**
 * Manual Review Queue Page
 * 
 * HR Dashboard page for managing applications in manual review queue
 * - Fallback mode banner
 * - Queue statistics
 * - Filterable, paginated queue table
 */

'use client';

import React from 'react';
import { FallbackModeBanner } from '@/components/system/FallbackModeBanner';
import { QueueStatsSummary } from '@/components/manualReview/QueueStatsSummary';
import { ManualReviewQueueTable } from '@/components/manualReview/ManualReviewQueueTable';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ManualReviewFilters } from '@/lib/api/manualReview';
import {
    ensureReviewQueueBadgeRealtime,
    emitReviewQueueBadgeCount,
    subscribeToQueueNewApplication,
    subscribeToReviewQueueBadgeCount,
    type ReviewQueueBadgeCountPayload,
    type QueueNewApplicationPayload,
} from '@/lib/reviewQueueRealtime';
import { buildApiUrl } from '@/lib/api/url';

type QueueFilterState = Pick<
    ManualReviewFilters,
    'department' | 'scoreBand' | 'status' | 'requisitionId'
>;

interface RequisitionOption {
    id: string;
    title: string;
}

interface RequisitionFiltersResponse {
    departments?: string[];
}

function parseFilterStateFromUrl(): QueueFilterState {
    if (typeof window === 'undefined') {
        return {};
    }

    const params = new URLSearchParams(window.location.search);

    const department = params.get('department') || undefined;
    const scoreBand = (params.get('scoreBand') as QueueFilterState['scoreBand']) || undefined;
    const status = (params.get('status') as QueueFilterState['status']) || undefined;
    const requisitionId = params.get('requisitionId') || undefined;

    return {
        department,
        scoreBand,
        status,
        requisitionId,
    };
}

function getActiveFilterCount(filters: QueueFilterState): number {
    const entries = [
        filters.department,
        filters.scoreBand,
        filters.status,
        filters.requisitionId,
    ];

    return entries.filter((value) => Boolean(value)).length;
}

export default function ManualReviewQueuePage() {
    const [filters, setFilters] = useState<QueueFilterState>({});
    const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(true);
    const [departments, setDepartments] = useState<string[]>([]);
    const [requisitions, setRequisitions] = useState<RequisitionOption[]>([]);
    const [badgeCounts, setBadgeCounts] = useState<ReviewQueueBadgeCountPayload | null>(null);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
    const lastRealtimeApplicationIdRef = useRef<string | null>(null);

    const activeFilterCount = useMemo(() => getActiveFilterCount(filters), [filters]);

    useEffect(() => {
        const initialFilters = parseFilterStateFromUrl();
        setFilters(initialFilters);
        setIsFilterPanelOpen(getActiveFilterCount(initialFilters) > 0);
    }, []);

    useEffect(() => {
        if (typeof window === 'undefined') {
            return;
        }

        const params = new URLSearchParams(window.location.search);
        params.delete('department');
        params.delete('scoreBand');
        params.delete('status');
        params.delete('requisitionId');

        if (filters.department) {
            params.set('department', filters.department);
        }
        if (filters.scoreBand) {
            params.set('scoreBand', filters.scoreBand);
        }
        if (filters.status) {
            params.set('status', filters.status);
        }
        if (filters.requisitionId) {
            params.set('requisitionId', filters.requisitionId);
        }

        const queryString = params.toString();
        const nextUrl = queryString
            ? `${window.location.pathname}?${queryString}`
            : window.location.pathname;
        window.history.replaceState({}, '', nextUrl);
    }, [filters]);

    useEffect(() => {
        async function loadFilterOptions() {
            try {
                const [filterOptionsResponse, requisitionsResponse] = await Promise.all([
                    fetch(buildApiUrl('/api/requisitions/filters'), {
                        credentials: 'include',
                    }),
                    fetch(buildApiUrl('/api/requisitions?page=1&pageSize=100&status=open'), {
                        credentials: 'include',
                    }),
                ]);

                if (filterOptionsResponse.ok) {
                    const data = (await filterOptionsResponse.json()) as RequisitionFiltersResponse;
                    setDepartments(data.departments ?? []);
                }

                if (requisitionsResponse.ok) {
                    const data = (await requisitionsResponse.json()) as {
                        data?: Array<{ id: string; title: string }>;
                    };

                    setRequisitions(
                        (data.data ?? []).map((item) => ({
                            id: item.id,
                            title: item.title,
                        }))
                    );
                }
            } catch (error) {
                console.error('Failed to load manual review filter options', error);
            }
        }

        void loadFilterOptions();
    }, []);

    useEffect(() => {
        ensureReviewQueueBadgeRealtime();
        const unsubscribeNewApplication = subscribeToQueueNewApplication(
            (payload: QueueNewApplicationPayload) => {
                if (lastRealtimeApplicationIdRef.current === payload.applicationId) {
                    return;
                }

                lastRealtimeApplicationIdRef.current = payload.applicationId;
                setBadgeCounts((current) => ({
                    pendingCount: Math.max(current?.pendingCount ?? 0, payload.queueCount),
                    urgentCount: current?.urgentCount ?? 0,
                    timestamp: payload.timestamp,
                }));
                setToast({
                    message: `New application: ${payload.candidateName} for ${payload.requisitionTitle}.`,
                    type: 'info',
                });
            }
        );

        const unsubscribeBadgeCount = subscribeToReviewQueueBadgeCount((payload) => {
            setBadgeCounts(payload);
        });

        return () => {
            unsubscribeNewApplication();
            unsubscribeBadgeCount();
        };
    }, []);

    function handleDepartmentChange(value: string) {
        setFilters((current) => ({
            ...current,
            department: value || undefined,
        }));
    }

    function handleScoreBandChange(value: QueueFilterState['scoreBand'] | '') {
        setFilters((current) => ({
            ...current,
            scoreBand: value || undefined,
        }));
    }

    function handleStatusChange(value: QueueFilterState['status'] | '') {
        setFilters((current) => ({
            ...current,
            status: value || undefined,
        }));
    }

    function handleRequisitionChange(value: string) {
        setFilters((current) => ({
            ...current,
            requisitionId: value || undefined,
        }));
    }

    function clearFilters() {
        setFilters({});
    }

    return (
        <div
            style={{
                maxWidth: '1400px',
                margin: '0 auto',
                padding: '32px 24px',
            }}
        >
            {toast && (
                <div
                    data-testid={`toast-${toast.type}`}
                    style={{
                        position: 'fixed',
                        top: '1rem',
                        right: '1rem',
                        padding: '1rem',
                        borderRadius: '0.5rem',
                        backgroundColor: toast.type === 'success' ? '#10b981' : toast.type === 'error' ? '#ef4444' : '#3b82f6',
                        color: 'white',
                        boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
                        zIndex: 9999,
                        maxWidth: '400px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: '1rem'
                    }}
                >
                    <span>{toast.message}</span>
                    <button
                        onClick={() => setToast(null)}
                        style={{
                            background: 'transparent',
                            border: 'none',
                            color: 'white',
                            cursor: 'pointer',
                            fontSize: '1.25rem',
                            padding: '0',
                            lineHeight: '1'
                        }}
                        aria-label="Close notification"
                    >
                        ×
                    </button>
                </div>
            )}

            <div
                style={{
                    marginBottom: '16px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                }}
            >
                <span
                    style={{
                        fontSize: '13px',
                        fontWeight: 600,
                        color: '#6B7280',
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                    }}
                >
                    HR Navigation
                </span>
                <span
                    style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '6px 12px',
                        borderRadius: '999px',
                        border: '1px solid #BFDBFE',
                        backgroundColor: '#EFF6FF',
                        color: '#1D4ED8',
                        fontSize: '13px',
                        fontWeight: 600,
                    }}
                    aria-live="polite"
                    aria-label={`Manual review queue badge pending ${badgeCounts?.pendingCount ?? 0}, urgent ${badgeCounts?.urgentCount ?? 0}`}
                    data-testid="manual-review-nav-badge"
                >
                    Manual Review
                    <span
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            minWidth: '24px',
                            height: '24px',
                            borderRadius: '999px',
                            backgroundColor: '#DBEAFE',
                            color: '#1E3A8A',
                            fontWeight: 700,
                            padding: '0 8px',
                        }}
                    >
                        {badgeCounts?.pendingCount ?? 0}
                    </span>
                    {(badgeCounts?.urgentCount ?? 0) > 0 && (
                        <span
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                minWidth: '24px',
                                height: '24px',
                                borderRadius: '999px',
                                backgroundColor: '#FEE2E2',
                                color: '#991B1B',
                                fontWeight: 700,
                                padding: '0 8px',
                            }}
                            data-testid="manual-review-nav-urgent"
                        >
                            {badgeCounts?.urgentCount}
                        </span>
                    )}
                </span>
            </div>

            {/* Page Header */}
            <div style={{ marginBottom: '32px' }}>
                <h1
                    style={{
                        fontSize: '28px',
                        fontWeight: 700,
                        color: '#111827',
                        marginBottom: '8px',
                    }}
                >
                    Manual Review Queue
                </h1>
                <p
                    style={{
                        fontSize: '15px',
                        color: '#6B7280',
                    }}
                >
                    Applications pending human review and decision
                </p>
            </div>

            {/* Fallback Mode Banner */}
            <FallbackModeBanner />

            {/* Queue Statistics */}
            <QueueStatsSummary />

            {/* Filter Controls */}
            <div
                style={{
                    marginBottom: '24px',
                    padding: '16px',
                    backgroundColor: '#F9FAFB',
                    borderRadius: '8px',
                    border: '1px solid #E5E7EB',
                }}
            >
                <div
                    style={{
                        display: 'flex',
                        gap: '12px',
                        marginBottom: isFilterPanelOpen ? '16px' : 0,
                    }}
                >
                    <button
                        type="button"
                        onClick={() => setIsFilterPanelOpen((current) => !current)}
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '8px 14px',
                            fontSize: '14px',
                            fontWeight: 600,
                            color: '#1F2937',
                            backgroundColor: '#FFFFFF',
                            border: '1px solid #D1D5DB',
                            borderRadius: '6px',
                            cursor: 'pointer',
                        }}
                        aria-label={`Filters${activeFilterCount > 0 ? `, ${activeFilterCount} active` : ''}`}
                        data-testid="filter-toggle-button"
                    >
                        Filters
                        {activeFilterCount > 0 && (
                            <span
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    minWidth: '22px',
                                    height: '22px',
                                    borderRadius: '999px',
                                    backgroundColor: '#E0E7FF',
                                    color: '#3730A3',
                                    fontSize: '12px',
                                    fontWeight: 700,
                                    padding: '0 6px',
                                }}
                                data-testid="active-filter-count"
                            >
                                {activeFilterCount}
                            </span>
                        )}
                    </button>

                    <button
                        type="button"
                        onClick={clearFilters}
                        style={{
                            padding: '8px 14px',
                            fontSize: '14px',
                            fontWeight: 500,
                            color: '#374151',
                            backgroundColor: '#FFFFFF',
                            border: '1px solid #D1D5DB',
                            borderRadius: '6px',
                            cursor: 'pointer',
                        }}
                    >
                        Clear Filters
                    </button>
                </div>

                {isFilterPanelOpen && (
                    <div
                        style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                            gap: '14px',
                        }}
                    >
                        <div>
                            <label
                                htmlFor="department-filter"
                                style={{
                                    display: 'block',
                                    fontSize: '14px',
                                    fontWeight: 500,
                                    color: '#374151',
                                    marginBottom: '6px',
                                }}
                            >
                                Department
                            </label>
                            <select
                                id="department-filter"
                                value={filters.department ?? ''}
                                onChange={(event) => handleDepartmentChange(event.target.value)}
                                style={{
                                    width: '100%',
                                    padding: '8px 12px',
                                    fontSize: '14px',
                                    color: '#374151',
                                    backgroundColor: '#FFFFFF',
                                    border: '1px solid #D1D5DB',
                                    borderRadius: '6px',
                                }}
                            >
                                <option value="">All Departments</option>
                                {departments.map((department) => (
                                    <option key={department} value={department}>
                                        {department}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label
                                htmlFor="score-band-filter"
                                style={{
                                    display: 'block',
                                    fontSize: '14px',
                                    fontWeight: 500,
                                    color: '#374151',
                                    marginBottom: '6px',
                                }}
                            >
                                Score Band
                            </label>
                            <select
                                id="score-band-filter"
                                value={filters.scoreBand ?? ''}
                                onChange={(event) =>
                                    handleScoreBandChange(event.target.value as QueueFilterState['scoreBand'])
                                }
                                style={{
                                    width: '100%',
                                    padding: '8px 12px',
                                    fontSize: '14px',
                                    color: '#374151',
                                    backgroundColor: '#FFFFFF',
                                    border: '1px solid #D1D5DB',
                                    borderRadius: '6px',
                                }}
                            >
                                <option value="">All Scores</option>
                                <option value="high">High (&gt; 75)</option>
                                <option value="medium">Medium (50 - 75)</option>
                                <option value="low">Low (&lt; 50)</option>
                            </select>
                        </div>

                        <div>
                            <label
                                htmlFor="status-filter"
                                style={{
                                    display: 'block',
                                    fontSize: '14px',
                                    fontWeight: 500,
                                    color: '#374151',
                                    marginBottom: '6px',
                                }}
                            >
                                Status
                            </label>
                            <select
                                id="status-filter"
                                value={filters.status ?? ''}
                                onChange={(event) =>
                                    handleStatusChange(event.target.value as QueueFilterState['status'])
                                }
                                style={{
                                    width: '100%',
                                    padding: '8px 12px',
                                    fontSize: '14px',
                                    color: '#374151',
                                    backgroundColor: '#FFFFFF',
                                    border: '1px solid #D1D5DB',
                                    borderRadius: '6px',
                                }}
                            >
                                <option value="">All Statuses</option>
                                <option value="pending_review">Pending Review</option>
                                <option value="shortlisted">Shortlisted</option>
                                <option value="rejected">Rejected</option>
                            </select>
                        </div>

                        <div>
                            <label
                                htmlFor="requisition-filter"
                                style={{
                                    display: 'block',
                                    fontSize: '14px',
                                    fontWeight: 500,
                                    color: '#374151',
                                    marginBottom: '6px',
                                }}
                            >
                                Requisition
                            </label>
                            <select
                                id="requisition-filter"
                                value={filters.requisitionId ?? ''}
                                onChange={(event) => handleRequisitionChange(event.target.value)}
                                style={{
                                    width: '100%',
                                    padding: '8px 12px',
                                    fontSize: '14px',
                                    color: '#374151',
                                    backgroundColor: '#FFFFFF',
                                    border: '1px solid #D1D5DB',
                                    borderRadius: '6px',
                                }}
                            >
                                <option value="">All Requisitions</option>
                                {requisitions.map((requisition) => (
                                    <option key={requisition.id} value={requisition.id}>
                                        {requisition.title}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>
                )}
            </div>

            {/* Queue Table */}
            <ManualReviewQueueTable filters={filters} />
        </div>
    );
}
