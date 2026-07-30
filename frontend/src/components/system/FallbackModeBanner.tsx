/**
 * FallbackModeBanner Component
 * 
 * Displays amber warning banner when AI screening is in fallback mode
 * - Polls API every 30 seconds
 * - Shows reason (high queue depth / worker offline)
 * - Displays metadata (queue depth, offline duration)
 * - Auto-hides when fallback mode deactivated
 */

'use client';

import { useEffect, useState } from 'react';
import { getFallbackModeState } from '@/lib/api/systemStatus';
import type { FallbackModeState } from '@/lib/api/systemStatus';

const POLL_INTERVAL_MS = 30000; // 30 seconds

export function FallbackModeBanner() {
    const [state, setState] = useState<FallbackModeState | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Initial fetch
        fetchState();

        // Poll every 30 seconds
        const interval = setInterval(fetchState, POLL_INTERVAL_MS);

        return () => clearInterval(interval);
    }, []);

    async function fetchState() {
        try {
            const data = await getFallbackModeState();
            setState(data);
            setLoading(false);
        } catch (err) {
            console.error('Failed to fetch fallback mode state:', err);
            setLoading(false);
        }
    }

    // Don't render if not active
    if (loading || !state || !state.active) {
        return null;
    }

    const reasonText = getReasonText(state);
    const metadataText = getMetadataText(state);

    return (
        <div
            role="alert"
            aria-live="polite"
            style={{
                padding: '16px 20px',
                backgroundColor: '#FEF3C7',
                border: '1px solid #F59E0B',
                borderRadius: '8px',
                marginBottom: '24px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '12px',
            }}
        >
            {/* Warning Icon */}
            <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                style={{
                    flexShrink: 0,
                    marginTop: '2px',
                }}
                aria-hidden="true"
            >
                <path
                    d="M12 9V13M12 17H12.01M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z"
                    stroke="#F59E0B"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                />
            </svg>

            {/* Content */}
            <div style={{ flex: 1 }}>
                <div
                    style={{
                        fontSize: '15px',
                        fontWeight: 600,
                        color: '#92400E',
                        marginBottom: '4px',
                    }}
                >
                    AI Screening Temporarily Offline
                </div>
                <div
                    style={{
                        fontSize: '14px',
                        color: '#78350F',
                        lineHeight: '1.5',
                    }}
                >
                    {reasonText}
                    {metadataText && (
                        <>
                            <br />
                            <span style={{ fontSize: '13px', color: '#92400E' }}>
                                {metadataText}
                            </span>
                        </>
                    )}
                </div>
                <div
                    style={{
                        fontSize: '13px',
                        color: '#78350F',
                        marginTop: '8px',
                        fontStyle: 'italic',
                    }}
                >
                    New applications are being routed to your manual review queue.
                </div>
            </div>
        </div>
    );
}

/**
 * Get human-readable reason text
 */
function getReasonText(state: FallbackModeState): string {
    switch (state.reason) {
        case 'high_queue_depth':
            return 'High queue depth detected. Applications are being routed to manual review until the queue clears.';
        case 'worker_offline':
            return 'AI screening worker is offline. Applications are being routed to manual review until the worker recovers.';
        case 'manual':
            return 'Fallback mode has been manually enabled by an administrator.';
        default:
            return 'Applications are being routed to manual review.';
    }
}

/**
 * Get metadata text (queue depth, offline duration)
 */
function getMetadataText(state: FallbackModeState): string | null {
    if (!state.metadata) return null;

    const parts: string[] = [];

    if (state.metadata.queueDepth !== undefined) {
        parts.push(`Queue depth: ${state.metadata.queueDepth} jobs`);
    }

    if (state.metadata.workerOfflineDurationMs !== undefined) {
        const minutes = Math.floor(state.metadata.workerOfflineDurationMs / 60000);
        parts.push(`Worker offline for ${minutes} minutes`);
    }

    if (state.activatedAt) {
        const activatedDate = new Date(state.activatedAt);
        const elapsed = Date.now() - activatedDate.getTime();
        const elapsedMinutes = Math.floor(elapsed / 60000);
        parts.push(`Active for ${elapsedMinutes} minutes`);
    }

    return parts.length > 0 ? parts.join(' • ') : null;
}
