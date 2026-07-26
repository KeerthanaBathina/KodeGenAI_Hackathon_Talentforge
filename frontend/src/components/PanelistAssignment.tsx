'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
    getPanelistAvailability,
    assignPanelists,
    type PanelistAvailabilityResponse,
    type PanelistConfirmationStatus,
} from '@/lib/api/interviews';
import { subscribeToPanelistConfirmation } from '@/lib/panelistRealtime';

export interface PanelistWithStatus {
    id: string;
    name: string;
    email: string;
    timezone: string;
    status: PanelistConfirmationStatus;
    available: boolean;
    respondedAt?: string;
}

interface PanelistAssignmentProps {
    interviewId: string;
    scheduledStart: string;
    scheduledEnd: string;
    initialPanelists?: PanelistWithStatus[];
    onAssignmentChange?: (panelists: PanelistWithStatus[]) => void;
}

function StatusBadge({ status }: { status: PanelistConfirmationStatus }) {
    const colors = {
        pending: { bg: '#fef3c7', text: '#92400e', border: '#fde68a' },
        confirmed: { bg: '#d1fae5', text: '#065f46', border: '#a7f3d0' },
        declined: { bg: '#fee2e2', text: '#991b1b', border: '#fecaca' },
    };

    const style = colors[status];

    return (
        <span
            style={{
                display: 'inline-block',
                padding: '0.25rem 0.5rem',
                borderRadius: '12px',
                fontSize: '0.75rem',
                fontWeight: 600,
                background: style.bg,
                color: style.text,
                border: `1px solid ${style.border}`,
                textTransform: 'capitalize',
            }}
            aria-label={`Status: ${status}`}
        >
            {status}
        </span>
    );
}

function AvailabilityIndicator({ available }: { available: boolean }) {
    return (
        <span
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.25rem',
                fontSize: '0.75rem',
                fontWeight: 600,
                color: available ? '#059669' : '#dc2626',
            }}
            aria-label={available ? 'Available' : 'Unavailable'}
        >
            {available ? (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <circle cx="8" cy="8" r="7" fill="#d1fae5" stroke="#059669" strokeWidth="1.5" />
                    <path d="M5 8l2 2 4-4" stroke="#059669" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
            ) : (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <circle cx="8" cy="8" r="7" fill="#fee2e2" stroke="#dc2626" strokeWidth="1.5" />
                    <path d="M5.5 5.5l5 5M10.5 5.5l-5 5" stroke="#dc2626" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
            )}
            {available ? 'Available' : 'Conflict'}
        </span>
    );
}

export default function PanelistAssignment({
    interviewId,
    scheduledStart,
    scheduledEnd,
    initialPanelists = [],
    onAssignmentChange,
}: PanelistAssignmentProps) {
    const [assignedPanelists, setAssignedPanelists] = useState<PanelistWithStatus[]>(initialPanelists);
    const [availablePanelists, setAvailablePanelists] = useState<PanelistAvailabilityResponse[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [isLoadingAvailability, setIsLoadingAvailability] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    // Load panelist availability on mount
    useEffect(() => {
        async function loadAvailability() {
            try {
                setIsLoadingAvailability(true);
                // Get all available panelists (empty array means all)
                const data = await getPanelistAvailability('', []);
                setAvailablePanelists(data);
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to load panelist availability');
            } finally {
                setIsLoadingAvailability(false);
            }
        }

        void loadAvailability();
    }, []);

    // Subscribe to real-time confirmation updates
    useEffect(() => {
        const unsubscribe = subscribeToPanelistConfirmation((payload) => {
            if (payload.interviewStageId === interviewId) {
                setAssignedPanelists((current) =>
                    current.map((panelist) =>
                        panelist.id === payload.panelistId
                            ? { ...panelist, status: payload.status, respondedAt: payload.timestamp }
                            : panelist
                    )
                );

                // Show toast notification
                const panelist = assignedPanelists.find((p) => p.id === payload.panelistId);
                if (panelist) {
                    setSuccessMessage(
                        `${panelist.name} has ${payload.status === 'confirmed' ? 'confirmed' : 'declined'} participation`
                    );
                    setTimeout(() => setSuccessMessage(null), 5000);
                }
            }
        });

        return unsubscribe;
    }, [interviewId, assignedPanelists]);

    // Check if a panelist is available for the scheduled slot
    const checkPanelistAvailability = (panelistId: string): boolean => {
        const panelist = availablePanelists.find((p) => p.panelMemberId === panelistId);
        if (!panelist) return false;

        const slotStart = new Date(scheduledStart).getTime();
        const slotEnd = new Date(scheduledEnd).getTime();

        return panelist.slots.some((slot) => {
            const availStart = new Date(slot.startAt).getTime();
            const availEnd = new Date(slot.endAt).getTime();
            return availStart <= slotStart && availEnd >= slotEnd && slot.available;
        });
    };

    // Filter panelists based on search query
    const filteredPanelists = useMemo(() => {
        return availablePanelists.filter((panelist) => {
            const matchesSearch =
                searchQuery.trim() === '' ||
                panelist.panelMemberName.toLowerCase().includes(searchQuery.toLowerCase());
            const notAlreadyAssigned = !assignedPanelists.some((ap) => ap.id === panelist.panelMemberId);
            return matchesSearch && notAlreadyAssigned;
        });
    }, [availablePanelists, searchQuery, assignedPanelists]);

    const handleAddPanelist = (panelist: PanelistAvailabilityResponse) => {
        const isAvailable = checkPanelistAvailability(panelist.panelMemberId);
        const newPanelist: PanelistWithStatus = {
            id: panelist.panelMemberId,
            name: panelist.panelMemberName,
            email: '', // Not provided in availability response
            timezone: panelist.timezone,
            status: 'pending',
            available: isAvailable,
        };

        setAssignedPanelists((current) => [...current, newPanelist]);
        setSearchQuery('');
    };

    const handleRemovePanelist = (panelistId: string) => {
        setAssignedPanelists((current) => current.filter((p) => p.id !== panelistId));
    };

    const handleSaveAssignments = async () => {
        try {
            setIsSaving(true);
            setError(null);

            // Check for unavailable panelists
            const unavailable = assignedPanelists.filter((p) => !p.available);
            if (unavailable.length > 0) {
                setError(
                    `Cannot assign unavailable panelists: ${unavailable.map((p) => p.name).join(', ')}`
                );
                return;
            }

            await assignPanelists({
                interviewId,
                panelMemberIds: assignedPanelists.map((p) => p.id),
            });

            setSuccessMessage('Panelists assigned successfully. Confirmation emails sent.');
            setTimeout(() => setSuccessMessage(null), 5000);

            if (onAssignmentChange) {
                onAssignmentChange(assignedPanelists);
            }
        } catch (err) {
            const error = err as Error & { unavailablePanelists?: Array<{ id: string; name: string }> };
            if (error.unavailablePanelists) {
                setError(
                    `Unavailable panelists: ${error.unavailablePanelists.map((p) => p.name).join(', ')}`
                );
            } else {
                setError(error.message || 'Failed to assign panelists');
            }
        } finally {
            setIsSaving(false);
        }
    };

    const hasUnsavedChanges = assignedPanelists.length > 0 && assignedPanelists.some((p) => p.status === 'pending');
    const allConfirmed = assignedPanelists.length > 0 && assignedPanelists.every((p) => p.status === 'confirmed');
    const hasUnavailablePanelists = assignedPanelists.some((p) => !p.available);

    return (
        <div style={{ display: 'grid', gap: '1rem' }}>
            {/* Success message */}
            {successMessage && (
                <div
                    role="status"
                    style={{
                        padding: '0.75rem 1rem',
                        background: '#d1fae5',
                        border: '1px solid #a7f3d0',
                        borderRadius: '8px',
                        color: '#065f46',
                        fontSize: '0.875rem',
                    }}
                >
                    {successMessage}
                </div>
            )}

            {/* Error message */}
            {error && (
                <div
                    role="alert"
                    style={{
                        padding: '0.75rem 1rem',
                        background: '#fee2e2',
                        border: '1px solid #fecaca',
                        borderRadius: '8px',
                        color: '#991b1b',
                        fontSize: '0.875rem',
                    }}
                >
                    {error}
                </div>
            )}

            {/* Inline error for unavailable panelists */}
            {hasUnavailablePanelists && !error && (
                <div
                    role="alert"
                    style={{
                        padding: '0.75rem 1rem',
                        background: '#fee2e2',
                        border: '1px solid #fecaca',
                        borderRadius: '8px',
                        color: '#991b1b',
                        fontSize: '0.875rem',
                    }}
                >
                    Cannot assign unavailable panelists: {assignedPanelists.filter((p) => !p.available).map((p) => p.name).join(', ')}
                </div>
            )}

            {/* Assigned Panelists */}
            <section
                style={{
                    background: '#fff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '12px',
                    padding: '1rem',
                }}
            >
                <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.75rem' }}>
                    Assigned Panelists ({assignedPanelists.length})
                </h2>

                {allConfirmed && (
                    <div
                        style={{
                            padding: '0.5rem',
                            background: '#d1fae5',
                            border: '1px solid #a7f3d0',
                            borderRadius: '8px',
                            marginBottom: '0.75rem',
                            fontSize: '0.875rem',
                            color: '#065f46',
                        }}
                    >
                        ✓ All panelists have confirmed
                    </div>
                )}

                {assignedPanelists.length === 0 ? (
                    <p style={{ color: '#64748b', fontSize: '0.875rem' }}>
                        No panelists assigned yet. Use the search below to add panelists.
                    </p>
                ) : (
                    <div style={{ display: 'grid', gap: '0.5rem' }}>
                        {assignedPanelists.map((panelist) => (
                            <div
                                key={panelist.id}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    padding: '0.75rem',
                                    background: '#f8fafc',
                                    border: '1px solid #e2e8f0',
                                    borderRadius: '8px',
                                }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1 }}>
                                    <div>
                                        <div style={{ fontWeight: 600 }}>{panelist.name}</div>
                                        <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>
                                            {panelist.timezone}
                                        </div>
                                    </div>
                                    <AvailabilityIndicator available={panelist.available} />
                                    <StatusBadge status={panelist.status} />
                                </div>
                                {panelist.status === 'pending' && (
                                    <button
                                        type="button"
                                        onClick={() => handleRemovePanelist(panelist.id)}
                                        style={{
                                            padding: '0.5rem',
                                            background: 'transparent',
                                            border: 'none',
                                            color: '#dc2626',
                                            cursor: 'pointer',
                                            fontSize: '0.875rem',
                                            fontWeight: 600,
                                        }}
                                        aria-label={`Remove ${panelist.name}`}
                                    >
                                        Remove
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </section>

            {/* Add Panelist Search */}
            <section
                style={{
                    background: '#fff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '12px',
                    padding: '1rem',
                }}
            >
                <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.75rem' }}>Add Panelist</h2>

                <input
                    type="text"
                    placeholder="Search by name..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{
                        width: '100%',
                        padding: '0.75rem',
                        border: '1px solid #cbd5e1',
                        borderRadius: '8px',
                        fontSize: '0.875rem',
                        marginBottom: '0.75rem',
                    }}
                    aria-label="Search for panelists"
                />

                {isLoadingAvailability ? (
                    <p style={{ color: '#64748b', fontSize: '0.875rem' }}>Loading available panelists...</p>
                ) : (
                    <div style={{ display: 'grid', gap: '0.5rem', maxHeight: '300px', overflowY: 'auto' }}>
                        {filteredPanelists.length === 0 ? (
                            <p style={{ color: '#64748b', fontSize: '0.875rem' }}>
                                {searchQuery ? 'No panelists found matching your search.' : 'No more panelists available.'}
                            </p>
                        ) : (
                            filteredPanelists.map((panelist) => {
                                const isAvailable = checkPanelistAvailability(panelist.panelMemberId);
                                return (
                                    <button
                                        key={panelist.panelMemberId}
                                        type="button"
                                        onClick={() => handleAddPanelist(panelist)}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            padding: '0.75rem',
                                            background: '#fff',
                                            border: '1px solid #e2e8f0',
                                            borderRadius: '8px',
                                            cursor: 'pointer',
                                            textAlign: 'left',
                                        }}
                                    >
                                        <div>
                                            <div style={{ fontWeight: 600 }}>{panelist.panelMemberName}</div>
                                            <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>
                                                {panelist.timezone}
                                            </div>
                                        </div>
                                        <AvailabilityIndicator available={isAvailable} />
                                    </button>
                                );
                            })
                        )}
                    </div>
                )}
            </section>

            {/* Save Button */}
            {hasUnsavedChanges && (
                <button
                    type="button"
                    onClick={handleSaveAssignments}
                    disabled={isSaving || hasUnavailablePanelists}
                    style={{
                        padding: '0.875rem 1rem',
                        borderRadius: '8px',
                        border: 'none',
                        background: hasUnavailablePanelists ? '#94a3b8' : '#2563eb',
                        color: '#fff',
                        fontWeight: 600,
                        cursor: hasUnavailablePanelists || isSaving ? 'not-allowed' : 'pointer',
                    }}
                >
                    {isSaving ? 'Assigning Panelists...' : 'Save Assignments & Send Confirmations'}
                </button>
            )}
        </div>
    );
}
