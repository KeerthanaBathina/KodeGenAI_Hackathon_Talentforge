/**
 * Manual Review Queue Page
 * 
 * HR Dashboard page for managing applications in manual review queue
 * - Fallback mode banner
 * - Queue statistics
 * - Filterable, paginated queue table
 */

'use client';

import { FallbackModeBanner } from '@/components/system/FallbackModeBanner';
import { QueueStatsSummary } from '@/components/manualReview/QueueStatsSummary';
import { ManualReviewQueueTable } from '@/components/manualReview/ManualReviewQueueTable';
import { useState } from 'react';
import type { ManualReviewFilters } from '@/lib/api/manualReview';

export default function ManualReviewQueuePage() {
    const [filters, setFilters] = useState<ManualReviewFilters>({});

    return (
        <div
            style={{
                maxWidth: '1400px',
                margin: '0 auto',
                padding: '32px 24px',
            }}
        >
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
                <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-end' }}>
                    <div style={{ flex: 1 }}>
                        <label
                            htmlFor="reason-filter"
                            style={{
                                display: 'block',
                                fontSize: '14px',
                                fontWeight: 500,
                                color: '#374151',
                                marginBottom: '6px',
                            }}
                        >
                            Filter by Reason
                        </label>
                        <select
                            id="reason-filter"
                            onChange={(e) => {
                                const value = e.target.value;
                                setFilters({
                                    ...filters,
                                    reason: value ? [value] : undefined,
                                });
                            }}
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
                            <option value="">All Reasons</option>
                            <option value="low_confidence">Low AI Confidence</option>
                            <option value="fallback_mode">AI Unavailable</option>
                            <option value="screening_failed">Screening Failed</option>
                            <option value="flagged">Flagged</option>
                        </select>
                    </div>

                    <button
                        onClick={() => setFilters({})}
                        style={{
                            padding: '8px 16px',
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
            </div>

            {/* Queue Table */}
            <ManualReviewQueueTable filters={filters} />
        </div>
    );
}
