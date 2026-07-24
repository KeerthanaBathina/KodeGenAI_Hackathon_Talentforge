/**
 * ManualReviewQueueTable Component
 * 
 * Displays paginated table of applications pending manual review
 * - Candidate info, requisition, reason badge, score, confidence
 * - Shortlist/Reject action buttons
 * - Pagination controls
 */

'use client';

import { useState, useEffect } from 'react';
import {
    getManualReviewQueue,
    markApplicationAsReviewed,
} from '@/lib/api/manualReview';
import type {
    ManualReviewQueueItem,
    ManualReviewQueueResponse,
    ManualReviewFilters,
} from '@/lib/api/manualReview';
import { ReviewReasonBadge } from './ReviewReasonBadge';

interface ManualReviewQueueTableProps {
    filters?: ManualReviewFilters;
}

export function ManualReviewQueueTable({
    filters = {},
}: ManualReviewQueueTableProps) {
    const [data, setData] = useState<ManualReviewQueueResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [page, setPage] = useState(1);
    const [actioningId, setActioningId] = useState<string | null>(null);

    useEffect(() => {
        loadQueue();
    }, [page, filters]);

    async function loadQueue() {
        try {
            setLoading(true);
            const response = await getManualReviewQueue(filters, {
                page,
                limit: 20,
            });
            setData(response);
            setError(null);
        } catch (err) {
            setError('Failed to load manual review queue');
            console.error(err);
        } finally {
            setLoading(false);
        }
    }

    async function handleAction(
        applicationId: string,
        decision: 'shortlisted' | 'rejected'
    ) {
        if (actioningId) return; // Prevent double-click

        try {
            setActioningId(applicationId);
            await markApplicationAsReviewed(applicationId, decision);
            await loadQueue(); // Reload queue after action
        } catch (err) {
            console.error('Failed to process decision:', err);
            alert('Failed to process decision. Please try again.');
        } finally {
            setActioningId(null);
        }
    }

    if (loading && !data) {
        return (
            <div
                style={{
                    padding: '40px',
                    textAlign: 'center',
                    color: '#6B7280',
                }}
            >
                Loading manual review queue...
            </div>
        );
    }

    if (error && !data) {
        return (
            <div
                style={{
                    padding: '40px',
                    textAlign: 'center',
                    color: '#DC2626',
                }}
                role="alert"
            >
                {error}
            </div>
        );
    }

    if (!data || data.items.length === 0) {
        return (
            <div
                style={{
                    padding: '40px',
                    textAlign: 'center',
                    color: '#6B7280',
                    backgroundColor: '#F9FAFB',
                    borderRadius: '8px',
                }}
            >
                No applications in manual review queue
            </div>
        );
    }

    return (
        <div>
            {/* Table */}
            <div style={{ overflowX: 'auto' }}>
                <table
                    style={{
                        width: '100%',
                        borderCollapse: 'collapse',
                        backgroundColor: '#FFFFFF',
                        border: '1px solid #E5E7EB',
                        borderRadius: '8px',
                    }}
                >
                    <thead>
                        <tr
                            style={{
                                backgroundColor: '#F9FAFB',
                                borderBottom: '1px solid #E5E7EB',
                            }}
                        >
                            <th
                                style={{
                                    padding: '12px 16px',
                                    textAlign: 'left',
                                    fontSize: '13px',
                                    fontWeight: 600,
                                    color: '#374151',
                                }}
                            >
                                Candidate
                            </th>
                            <th
                                style={{
                                    padding: '12px 16px',
                                    textAlign: 'left',
                                    fontSize: '13px',
                                    fontWeight: 600,
                                    color: '#374151',
                                }}
                            >
                                Requisition
                            </th>
                            <th
                                style={{
                                    padding: '12px 16px',
                                    textAlign: 'left',
                                    fontSize: '13px',
                                    fontWeight: 600,
                                    color: '#374151',
                                }}
                            >
                                Reason
                            </th>
                            <th
                                style={{
                                    padding: '12px 16px',
                                    textAlign: 'center',
                                    fontSize: '13px',
                                    fontWeight: 600,
                                    color: '#374151',
                                }}
                            >
                                Score
                            </th>
                            <th
                                style={{
                                    padding: '12px 16px',
                                    textAlign: 'center',
                                    fontSize: '13px',
                                    fontWeight: 600,
                                    color: '#374151',
                                }}
                            >
                                Confidence
                            </th>
                            <th
                                style={{
                                    padding: '12px 16px',
                                    textAlign: 'right',
                                    fontSize: '13px',
                                    fontWeight: 600,
                                    color: '#374151',
                                }}
                            >
                                Actions
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.items.map((item) => (
                            <tr
                                key={item.id}
                                style={{
                                    borderBottom: '1px solid #E5E7EB',
                                }}
                            >
                                <td style={{ padding: '16px' }}>
                                    <div
                                        style={{
                                            fontSize: '14px',
                                            fontWeight: 500,
                                            color: '#111827',
                                        }}
                                    >
                                        {item.candidateName}
                                    </div>
                                    <div
                                        style={{
                                            fontSize: '13px',
                                            color: '#6B7280',
                                            marginTop: '2px',
                                        }}
                                    >
                                        {item.candidateEmail}
                                    </div>
                                </td>
                                <td style={{ padding: '16px' }}>
                                    <div
                                        style={{
                                            fontSize: '14px',
                                            color: '#374151',
                                        }}
                                    >
                                        {item.requisitionTitle}
                                    </div>
                                </td>
                                <td style={{ padding: '16px' }}>
                                    <ReviewReasonBadge reason={item.manualReviewReason} />
                                </td>
                                <td
                                    style={{
                                        padding: '16px',
                                        textAlign: 'center',
                                        fontSize: '14px',
                                        fontWeight: 500,
                                        color: '#111827',
                                    }}
                                >
                                    {item.screeningScore !== null &&
                                        item.screeningScore !== undefined
                                        ? item.screeningScore
                                        : '—'}
                                </td>
                                <td
                                    style={{
                                        padding: '16px',
                                        textAlign: 'center',
                                        fontSize: '14px',
                                        fontWeight: 500,
                                        color: '#111827',
                                    }}
                                >
                                    {item.screeningConfidence !== null &&
                                        item.screeningConfidence !== undefined
                                        ? (item.screeningConfidence * 100).toFixed(0) + '%'
                                        : '—'}
                                </td>
                                <td style={{ padding: '16px', textAlign: 'right' }}>
                                    <div
                                        style={{
                                            display: 'flex',
                                            gap: '8px',
                                            justifyContent: 'flex-end',
                                        }}
                                    >
                                        <button
                                            onClick={() => handleAction(item.id, 'shortlisted')}
                                            disabled={actioningId !== null}
                                            style={{
                                                padding: '6px 14px',
                                                fontSize: '13px',
                                                fontWeight: 500,
                                                color: '#FFFFFF',
                                                backgroundColor:
                                                    actioningId === item.id ? '#9CA3AF' : '#10B981',
                                                border: 'none',
                                                borderRadius: '6px',
                                                cursor:
                                                    actioningId !== null ? 'not-allowed' : 'pointer',
                                            }}
                                            aria-label={`Shortlist ${item.candidateName}`}
                                        >
                                            {actioningId === item.id ? 'Processing...' : 'Shortlist'}
                                        </button>
                                        <button
                                            onClick={() => handleAction(item.id, 'rejected')}
                                            disabled={actioningId !== null}
                                            style={{
                                                padding: '6px 14px',
                                                fontSize: '13px',
                                                fontWeight: 500,
                                                color: '#FFFFFF',
                                                backgroundColor:
                                                    actioningId === item.id ? '#9CA3AF' : '#DC2626',
                                                border: 'none',
                                                borderRadius: '6px',
                                                cursor:
                                                    actioningId !== null ? 'not-allowed' : 'pointer',
                                            }}
                                            aria-label={`Reject ${item.candidateName}`}
                                        >
                                            {actioningId === item.id ? 'Processing...' : 'Reject'}
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Pagination */}
            {data.totalPages > 1 && (
                <div
                    style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginTop: '20px',
                        padding: '16px',
                        backgroundColor: '#F9FAFB',
                        borderRadius: '8px',
                    }}
                >
                    <div style={{ fontSize: '14px', color: '#6B7280' }}>
                        Showing {(data.page - 1) * data.limit + 1} to{' '}
                        {Math.min(data.page * data.limit, data.total)} of {data.total}{' '}
                        applications
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                            onClick={() => setPage((p) => Math.max(1, p - 1))}
                            disabled={data.page === 1}
                            style={{
                                padding: '8px 14px',
                                fontSize: '14px',
                                fontWeight: 500,
                                color: data.page === 1 ? '#9CA3AF' : '#374151',
                                backgroundColor: '#FFFFFF',
                                border: '1px solid #E5E7EB',
                                borderRadius: '6px',
                                cursor: data.page === 1 ? 'not-allowed' : 'pointer',
                            }}
                            aria-label="Previous page"
                        >
                            Previous
                        </button>
                        <button
                            onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
                            disabled={data.page === data.totalPages}
                            style={{
                                padding: '8px 14px',
                                fontSize: '14px',
                                fontWeight: 500,
                                color: data.page === data.totalPages ? '#9CA3AF' : '#374151',
                                backgroundColor: '#FFFFFF',
                                border: '1px solid #E5E7EB',
                                borderRadius: '6px',
                                cursor:
                                    data.page === data.totalPages ? 'not-allowed' : 'pointer',
                            }}
                            aria-label="Next page"
                        >
                            Next
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
