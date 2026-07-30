/**
 * QueueStatsSummary Component
 * 
 * Displays summary statistics for manual review queue
 * - Total count
 * - Breakdown by reason
 * - Oldest application age
 */

'use client';

import { useEffect, useState } from 'react';
import { getManualReviewQueueStats } from '@/lib/api/manualReview';
import type { ManualReviewQueueStats } from '@/lib/api/manualReview';

export function QueueStatsSummary() {
    const [stats, setStats] = useState<ManualReviewQueueStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        loadStats();
    }, []);

    async function loadStats() {
        try {
            setLoading(true);
            const data = await getManualReviewQueueStats();
            setStats(data);
            setError(null);
        } catch (err) {
            setError('Failed to load queue statistics');
            console.error(err);
        } finally {
            setLoading(false);
        }
    }

    if (loading) {
        return (
            <div
                style={{
                    padding: '20px',
                    textAlign: 'center',
                    color: '#6B7280',
                }}
            >
                Loading statistics...
            </div>
        );
    }

    if (error || !stats) {
        return (
            <div
                style={{
                    padding: '20px',
                    textAlign: 'center',
                    color: '#DC2626',
                }}
                role="alert"
            >
                {error || 'Failed to load statistics'}
            </div>
        );
    }

    const reasonLabels: Record<string, string> = {
        low_confidence: 'Low AI Confidence',
        fallback_mode: 'AI Unavailable',
        screening_failed: 'Screening Failed',
        flagged: 'Flagged',
    };

    return (
        <div
            style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '16px',
                marginBottom: '24px',
            }}
        >
            {/* Total Count Card */}
            <div
                style={{
                    padding: '20px',
                    borderRadius: '8px',
                    border: '1px solid #E5E7EB',
                    backgroundColor: '#FFFFFF',
                }}
            >
                <div
                    style={{
                        fontSize: '14px',
                        fontWeight: 500,
                        color: '#6B7280',
                        marginBottom: '8px',
                    }}
                >
                    Total Pending
                </div>
                <div
                    style={{
                        fontSize: '32px',
                        fontWeight: 700,
                        color: '#111827',
                    }}
                >
                    {stats.totalCount}
                </div>
            </div>

            {/* By Reason Cards */}
            {Object.entries(stats.byReason).map(([reason, count]) => (
                <div
                    key={reason}
                    style={{
                        padding: '20px',
                        borderRadius: '8px',
                        border: '1px solid #E5E7EB',
                        backgroundColor: '#FFFFFF',
                    }}
                >
                    <div
                        style={{
                            fontSize: '14px',
                            fontWeight: 500,
                            color: '#6B7280',
                            marginBottom: '8px',
                        }}
                    >
                        {reasonLabels[reason] || reason}
                    </div>
                    <div
                        style={{
                            fontSize: '28px',
                            fontWeight: 700,
                            color: '#111827',
                        }}
                    >
                        {count}
                    </div>
                </div>
            ))}

            {/* Oldest Application Age Card */}
            {stats.oldestApplicationAgeHours !== null && (
                <div
                    style={{
                        padding: '20px',
                        borderRadius: '8px',
                        border: '1px solid #E5E7EB',
                        backgroundColor: '#FFFFFF',
                    }}
                >
                    <div
                        style={{
                            fontSize: '14px',
                            fontWeight: 500,
                            color: '#6B7280',
                            marginBottom: '8px',
                        }}
                    >
                        Oldest Application
                    </div>
                    <div
                        style={{
                            fontSize: '28px',
                            fontWeight: 700,
                            color: stats.oldestApplicationAgeHours > 48 ? '#DC2626' : '#111827',
                        }}
                    >
                        {stats.oldestApplicationAgeHours}h
                    </div>
                </div>
            )}
        </div>
    );
}
