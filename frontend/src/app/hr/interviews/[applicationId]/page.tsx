'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
    getPanelistAvailability,
    scheduleInterview,
    type InterviewConflict,
    type InterviewStageType,
    type PanelistAvailabilityResponse,
} from '@/lib/api/interviews';

type PlannerSlot = {
    startAt: string;
    endAt: string;
    available: boolean;
    label: string;
    panelMemberId: string;
    panelMemberName: string;
    timezone: string;
};

function formatBrowserTime(value: string) {
    return new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
    }).format(new Date(value));
}

function buildPreviewTimes(startAt: string, endAt: string, timezone: string) {
    return `${formatBrowserTime(startAt)} to ${formatBrowserTime(endAt)} (${timezone})`;
}

export default function InterviewPlannerPage({ params }: { params: { applicationId: string } }) {
    const [panelists, setPanelists] = useState<PanelistAvailabilityResponse[]>([]);
    const [selectedPanelMemberIds, setSelectedPanelMemberIds] = useState<string[]>([]);
    const [selectedSlot, setSelectedSlot] = useState<PlannerSlot | null>(null);
    const [selectedStage, setSelectedStage] = useState<InterviewStageType>('technical');
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
    const [conflicts, setConflicts] = useState<InterviewConflict[]>([]);

    useEffect(() => {
        async function loadAvailability() {
            try {
                const data = await getPanelistAvailability(params.applicationId, []);
                setPanelists(data);
                const firstAvailable = data
                    .flatMap((panelist) =>
                        panelist.slots
                            .filter((slot) => slot.available)
                            .map((slot) => ({
                                ...slot,
                                panelMemberId: panelist.panelMemberId,
                                panelMemberName: panelist.panelMemberName,
                                timezone: panelist.timezone,
                            }))
                    )[0] ?? null;
                setSelectedSlot(firstAvailable);
                setSelectedPanelMemberIds(data.map((panelist) => panelist.panelMemberId));
            } catch (error) {
                setToast({
                    message: error instanceof Error ? error.message : 'Failed to load availability',
                    type: 'error',
                });
            } finally {
                setIsLoading(false);
            }
        }

        void loadAvailability();
    }, [params.applicationId]);

    const availableSlots = useMemo(() => {
        return panelists.flatMap((panelist) =>
            panelist.slots.map((slot) => ({
                ...slot,
                panelMemberId: panelist.panelMemberId,
                panelMemberName: panelist.panelMemberName,
                timezone: panelist.timezone,
            }))
        );
    }, [panelists]);

    async function handleConfirm() {
        if (!selectedSlot) {
            return;
        }

        try {
            setIsSubmitting(true);
            setConflicts([]);

            const result = await scheduleInterview({
                applicationId: params.applicationId,
                type: selectedStage,
                startAt: selectedSlot.startAt,
                endAt: selectedSlot.endAt,
                timezone: selectedSlot.timezone,
                panelMemberIds: selectedPanelMemberIds,
            });

            setToast({
                message: `Interview scheduled for ${formatBrowserTime(result.interview.scheduledAt)}.`,
                type: 'success',
            });
        } catch (error) {
            const conflictList = (error as Error & { conflicts?: InterviewConflict[] }).conflicts ?? [];
            if (conflictList.length > 0) {
                setConflicts(conflictList);
                setToast({
                    message: 'Panelist conflict detected. Select a different slot or panelist.',
                    type: 'info',
                });
                return;
            }

            setToast({
                message: error instanceof Error ? error.message : 'Failed to schedule interview',
                type: 'error',
            });
        } finally {
            setIsSubmitting(false);
        }
    }

    if (isLoading) {
        return <main style={{ padding: '2rem' }}>Loading interview planner...</main>;
    }

    return (
        <main style={{ minHeight: '100vh', background: 'linear-gradient(180deg, #f8fafc 0%, #ffffff 100%)', padding: '2rem' }}>
            {toast && (
                <div
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

            <section style={{ maxWidth: '1100px', margin: '0 auto' }}>
                <header style={{ marginBottom: '1.5rem' }}>
                    <p style={{ color: '#64748b', fontSize: '0.875rem' }}>HR Scheduling</p>
                    <h1 style={{ fontSize: '2rem', fontWeight: 700, color: '#0f172a' }}>Interview Planner</h1>
                    <p style={{ color: '#475569' }}>Browser timezone: {Intl.DateTimeFormat().resolvedOptions().timeZone}</p>
                </header>

                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1rem' }}>
                    <section style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '1rem' }}>
                        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                            {(['aptitude', 'coding', 'technical', 'hr'] as InterviewStageType[]).map((stage) => (
                                <button
                                    key={stage}
                                    type="button"
                                    onClick={() => setSelectedStage(stage)}
                                    style={{
                                        padding: '0.5rem 0.75rem',
                                        borderRadius: '999px',
                                        border: selectedStage === stage ? '1px solid #2563eb' : '1px solid #cbd5e1',
                                        background: selectedStage === stage ? '#dbeafe' : '#fff',
                                    }}
                                >
                                    {stage}
                                </button>
                            ))}
                        </div>

                        <div style={{ display: 'grid', gap: '0.75rem' }}>
                            {availableSlots.map((slot) => {
                                const isSelected = selectedSlot?.startAt === slot.startAt && selectedSlot?.panelMemberId === slot.panelMemberId;
                                return (
                                    <button
                                        key={`${slot.panelMemberId}-${slot.startAt}`}
                                        type="button"
                                        disabled={!slot.available}
                                        onClick={() => setSelectedSlot(slot)}
                                        aria-label={`${slot.available ? 'Select' : 'Booked'} slot ${slot.label}`}
                                        style={{
                                            textAlign: 'left',
                                            padding: '0.875rem',
                                            borderRadius: '12px',
                                            border: isSelected ? '2px solid #2563eb' : '1px solid #e2e8f0',
                                            background: slot.available ? '#fff' : '#f1f5f9',
                                            opacity: slot.available ? 1 : 0.55,
                                            cursor: slot.available ? 'pointer' : 'not-allowed',
                                        }}
                                    >
                                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
                                            <strong>{slot.label}</strong>
                                            <span>{slot.available ? 'Available' : 'Booked'}</span>
                                        </div>
                                        <div style={{ color: '#475569', marginTop: '0.35rem' }}>
                                            {buildPreviewTimes(slot.startAt, slot.endAt, slot.timezone)}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </section>

                    <aside style={{ display: 'grid', gap: '1rem' }}>
                        <section style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '1rem' }}>
                            <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.75rem' }}>Selected slot</h2>
                            {selectedSlot ? (
                                <div>
                                    <p>{buildPreviewTimes(selectedSlot.startAt, selectedSlot.endAt, selectedSlot.timezone)}</p>
                                    <p style={{ color: '#64748b', marginTop: '0.35rem' }}>
                                        Local browser format with UTC request data preserved.
                                    </p>
                                </div>
                            ) : (
                                <p>No available slot selected.</p>
                            )}
                        </section>

                        <section style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '1rem' }}>
                            <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.75rem' }}>Panelists</h2>
                            <div style={{ display: 'grid', gap: '0.5rem' }}>
                                {panelists.map((panelist) => (
                                    <label key={panelist.panelMemberId} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <input
                                            type="checkbox"
                                            checked={selectedPanelMemberIds.includes(panelist.panelMemberId)}
                                            onChange={(event) => {
                                                setSelectedPanelMemberIds((current) =>
                                                    event.target.checked
                                                        ? [...current, panelist.panelMemberId]
                                                        : current.filter((id) => id !== panelist.panelMemberId)
                                                );
                                            }}
                                        />
                                        <span>{panelist.panelMemberName}</span>
                                    </label>
                                ))}
                            </div>
                        </section>

                        <button
                            type="button"
                            onClick={handleConfirm}
                            disabled={!selectedSlot || isSubmitting || conflicts.length > 0}
                            style={{
                                padding: '0.875rem 1rem',
                                borderRadius: '12px',
                                border: 'none',
                                background: !selectedSlot || isSubmitting || conflicts.length > 0 ? '#94a3b8' : '#2563eb',
                                color: '#fff',
                                cursor: !selectedSlot || isSubmitting || conflicts.length > 0 ? 'not-allowed' : 'pointer',
                            }}
                        >
                            {isSubmitting ? 'Scheduling...' : 'Confirm Interview'}
                        </button>
                    </aside>
                </div>

                {conflicts.length > 0 && (
                    <section
                        role="dialog"
                        aria-modal="true"
                        aria-label="Panelist conflict warning"
                        style={{ marginTop: '1rem', background: '#fff1f2', border: '1px solid #fecdd3', borderRadius: '16px', padding: '1rem' }}
                    >
                        <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#9f1239' }}>Panelist conflict detected</h2>
                        <p style={{ marginTop: '0.35rem', color: '#9f1239' }}>
                            Change the slot or remove the unavailable panelist before confirming.
                        </p>
                        <ul style={{ marginTop: '0.75rem', paddingLeft: '1.25rem' }}>
                            {conflicts.map((conflict) => (
                                <li key={`${conflict.interviewStageId}-${conflict.panelMemberId}`}>
                                    {conflict.panelMemberName} is unavailable: {conflict.requisitionTitle} at {formatBrowserTime(conflict.scheduledAt)}.
                                </li>
                            ))}
                        </ul>
                    </section>
                )}
            </section>
        </main>
    );
}
