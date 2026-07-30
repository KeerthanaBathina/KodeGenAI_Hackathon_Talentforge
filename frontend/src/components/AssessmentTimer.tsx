/**
 * Assessment Timer Component
 * 
 * Server-synchronized countdown timer for assessment sessions
 * Persists across page reloads and handles network reconnection
 */

'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
    fetchRemainingTime,
    sendHeartbeat,
    SessionExpiredError,
    RateLimitError,
    type SessionTimerState,
} from '@/lib/api/sessionTimer';

export interface AssessmentTimerProps {
    sessionId: string;
    sessionToken: string;
    onExpiry?: () => void;
    showWarnings?: boolean;
    autoHide?: boolean;
}

interface TimerState {
    remainingSeconds: number;
    status: 'active' | 'expired' | 'reconnecting' | 'loading';
    lastSyncTime: number;
    isVisible: boolean;
}

const HEARTBEAT_INTERVAL_MS = 30000; // 30 seconds
const SERVER_SYNC_INTERVAL_MS = 300000; // 5 minutes
const WARNING_THRESHOLD_SECONDS = 300; // 5 minutes
const CRITICAL_THRESHOLD_SECONDS = 120; // 2 minutes

/**
 * Format seconds into MM:SS format
 */
function formatTime(totalSeconds: number): string {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.floor(totalSeconds % 60);
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Get color class based on remaining time
 */
function getColorClass(remainingSeconds: number): string {
    if (remainingSeconds <= CRITICAL_THRESHOLD_SECONDS) {
        return 'text-red-600 font-bold';
    }
    if (remainingSeconds <= WARNING_THRESHOLD_SECONDS) {
        return 'text-amber-600 font-semibold';
    }
    return 'text-gray-900';
}

/**
 * Get icon based on timer status
 */
function getStatusIcon(status: TimerState['status']): string {
    switch (status) {
        case 'reconnecting':
            return '🔄';
        case 'expired':
            return '⏰';
        case 'active':
            return '⏱️';
        case 'loading':
            return '⌛';
        default:
            return '⏱️';
    }
}

export default function AssessmentTimer({
    sessionId,
    sessionToken,
    onExpiry,
    showWarnings = true,
    autoHide = false,
}: AssessmentTimerProps) {
    const [timerState, setTimerState] = useState<TimerState>({
        remainingSeconds: 0,
        status: 'loading',
        lastSyncTime: Date.now(),
        isVisible: true,
    });

    const [showExpiredModal, setShowExpiredModal] = useState(false);
    const [lastAnnouncement, setLastAnnouncement] = useState<number | null>(null);
    
    const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const syncIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const abortControllerRef = useRef<AbortController | null>(null);

    /**
     * Fetch timer state from server
     */
    const syncWithServer = useCallback(async () => {
        try {
            abortControllerRef.current = new AbortController();
            const timerData = await fetchRemainingTime(
                sessionId,
                sessionToken,
                abortControllerRef.current.signal
            );

            setTimerState((prev) => ({
                ...prev,
                remainingSeconds: Math.round(timerData.remainingMinutes * 60),
                status: timerData.status,
                lastSyncTime: Date.now(),
            }));
        } catch (error) {
            if (error instanceof SessionExpiredError) {
                setTimerState((prev) => ({ ...prev, status: 'expired' }));
                setShowExpiredModal(true);
                if (onExpiry) {
                    onExpiry();
                }
            } else if (error instanceof Error && error.name !== 'AbortError') {
                console.error('Failed to sync timer:', error);
                setTimerState((prev) => ({ ...prev, status: 'reconnecting' }));
            }
        }
    }, [sessionId, sessionToken, onExpiry]);

    /**
     * Send heartbeat to server
     */
    const sendHeartbeatToServer = useCallback(async () => {
        // Don't send heartbeat if not visible or expired
        if (!timerState.isVisible || timerState.status === 'expired') {
            return;
        }

        try {
            const timerData = await sendHeartbeat(sessionId, sessionToken);
            // Optionally update state with latest data
            setTimerState((prev) => ({
                ...prev,
                remainingSeconds: Math.round(timerData.remainingMinutes * 60),
            }));
        } catch (error) {
            if (error instanceof SessionExpiredError) {
                setTimerState((prev) => ({ ...prev, status: 'expired' }));
                setShowExpiredModal(true);
                if (onExpiry) {
                    onExpiry();
                }
            } else if (error instanceof RateLimitError) {
                // Rate limited - will retry on next interval
                console.warn('Heartbeat rate limited, will retry later');
            } else if (error instanceof Error) {
                console.error('Failed to send heartbeat:', error);
            }
        }
    }, [sessionId, sessionToken, timerState.isVisible, timerState.status, onExpiry]);

    /**
     * Initialize timer on mount
     */
    useEffect(() => {
        syncWithServer();

        return () => {
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
            }
        };
    }, [syncWithServer]);

    /**
     * Start countdown interval
     */
    useEffect(() => {
        if (timerState.status === 'active' && timerState.remainingSeconds > 0) {
            countdownIntervalRef.current = setInterval(() => {
                setTimerState((prev) => {
                    const newRemaining = prev.remainingSeconds - 1;
                    
                    if (newRemaining <= 0) {
                        setShowExpiredModal(true);
                        if (onExpiry) {
                            onExpiry();
                        }
                        return { ...prev, remainingSeconds: 0, status: 'expired' };
                    }
                    
                    return { ...prev, remainingSeconds: newRemaining };
                });
            }, 1000);
        }

        return () => {
            if (countdownIntervalRef.current) {
                clearInterval(countdownIntervalRef.current);
            }
        };
    }, [timerState.status, timerState.remainingSeconds, onExpiry]);

    /**
     * Start heartbeat interval
     */
    useEffect(() => {
        if (timerState.status === 'active') {
            heartbeatIntervalRef.current = setInterval(() => {
                sendHeartbeatToServer();
            }, HEARTBEAT_INTERVAL_MS);
        }

        return () => {
            if (heartbeatIntervalRef.current) {
                clearInterval(heartbeatIntervalRef.current);
            }
        };
    }, [timerState.status, sendHeartbeatToServer]);

    /**
     * Start periodic server sync interval
     */
    useEffect(() => {
        if (timerState.status === 'active') {
            syncIntervalRef.current = setInterval(() => {
                syncWithServer();
            }, SERVER_SYNC_INTERVAL_MS);
        }

        return () => {
            if (syncIntervalRef.current) {
                clearInterval(syncIntervalRef.current);
            }
        };
    }, [timerState.status, syncWithServer]);

    /**
     * Handle page visibility changes
     */
    useEffect(() => {
        const handleVisibilityChange = () => {
            const isVisible = !document.hidden;
            setTimerState((prev) => ({ ...prev, isVisible }));
            
            // Sync with server when tab becomes visible again
            if (isVisible && timerState.status === 'active') {
                syncWithServer();
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, [timerState.status, syncWithServer]);

    /**
     * Handle network online/offline events
     */
    useEffect(() => {
        const handleOnline = async () => {
            setTimerState((prev) => ({ ...prev, status: 'reconnecting' }));
            await syncWithServer();
        };

        const handleOffline = () => {
            setTimerState((prev) => ({ ...prev, status: 'reconnecting' }));
        };

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, [syncWithServer]);

    /**
     * Accessibility announcements at milestones
     */
    useEffect(() => {
        if (!showWarnings) return;

        const remainingMinutes = Math.floor(timerState.remainingSeconds / 60);
        const milestones = [10, 5, 2, 1];

        for (const milestone of milestones) {
            if (remainingMinutes === milestone && lastAnnouncement !== milestone) {
                setLastAnnouncement(milestone);
                // The ARIA live region will announce the change
                break;
            }
        }
    }, [timerState.remainingSeconds, lastAnnouncement, showWarnings]);

    // Hide timer during network issues if autoHide is enabled
    if (autoHide && timerState.status === 'reconnecting') {
        return null;
    }

    // Don't render if loading or no time remaining
    if (timerState.status === 'loading' || timerState.remainingSeconds === 0) {
        return null;
    }

    const colorClass = getColorClass(timerState.remainingSeconds);
    const statusIcon = getStatusIcon(timerState.status);
    const shouldPulse = timerState.remainingSeconds <= CRITICAL_THRESHOLD_SECONDS;

    return (
        <>
            <div className="flex items-center gap-3 bg-white px-6 py-4 rounded-lg shadow-md border border-gray-200">
                <span className="text-2xl" aria-hidden="true">
                    {statusIcon}
                </span>
                <div className="flex flex-col">
                    <span className="text-sm text-gray-600 font-medium">Time Remaining</span>
                    <div
                        role="timer"
                        aria-live="polite"
                        aria-atomic="true"
                        className={`text-4xl font-mono tabular-nums ${colorClass} ${
                            shouldPulse ? 'animate-pulse' : ''
                        }`}
                    >
                        {formatTime(timerState.remainingSeconds)}
                    </div>
                </div>
                {timerState.status === 'reconnecting' && (
                    <span className="ml-auto text-sm text-gray-500 animate-pulse">
                        Reconnecting...
                    </span>
                )}
                {showWarnings && timerState.remainingSeconds <= WARNING_THRESHOLD_SECONDS && (
                    <span className="ml-auto text-lg" aria-label="Warning">
                        ⚠️
                    </span>
                )}
            </div>

            {/* Session Expired Modal */}
            {showExpiredModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div
                        className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full mx-4"
                        role="dialog"
                        aria-labelledby="expired-title"
                        aria-describedby="expired-description"
                    >
                        <div className="flex items-center gap-3 mb-4">
                            <span className="text-4xl">⏰</span>
                            <h2
                                id="expired-title"
                                className="text-2xl font-bold text-gray-900"
                            >
                                Session Expired
                            </h2>
                        </div>
                        <p
                            id="expired-description"
                            className="text-gray-700 mb-6 text-lg"
                        >
                            Your session has expired. Please contact HR to reschedule your
                            assessment.
                        </p>
                        <button
                            onClick={() => {
                                setShowExpiredModal(false);
                                if (onExpiry) {
                                    onExpiry();
                                }
                            }}
                            className="w-full bg-blue-600 text-white py-3 px-6 rounded-lg font-semibold hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                            autoFocus
                        >
                            Close
                        </button>
                    </div>
                </div>
            )}
        </>
    );
}
