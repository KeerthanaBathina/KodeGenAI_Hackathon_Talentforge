'use client';

import React, { useState } from 'react';
import type { UnconfirmedPanelist } from '@/lib/api/interviews';

interface UnconfirmedPanelistWarningModalProps {
    unconfirmedPanelists: UnconfirmedPanelist[];
    onCancel: () => void;
    onConfirm: (justification?: string) => void;
    isSubmitting?: boolean;
}

export default function UnconfirmedPanelistWarningModal({
    unconfirmedPanelists,
    onCancel,
    onConfirm,
    isSubmitting = false,
}: UnconfirmedPanelistWarningModalProps) {
    const [acknowledged, setAcknowledged] = useState(false);
    const [justification, setJustification] = useState('');

    const handleConfirm = () => {
        if (!acknowledged) return;
        onConfirm(justification.trim() || undefined);
    };

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="warning-modal-title"
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: 'rgba(0, 0, 0, 0.5)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 1000,
            }}
            onClick={(e) => {
                if (e.target === e.currentTarget) onCancel();
            }}
        >
            <div
                style={{
                    background: '#fff',
                    borderRadius: '12px',
                    padding: '1.5rem',
                    maxWidth: '500px',
                    width: '90%',
                    boxShadow: '0 10px 25px rgba(0, 0, 0, 0.2)',
                }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div style={{ marginBottom: '1rem' }}>
                    <h2
                        id="warning-modal-title"
                        style={{
                            fontSize: '1.25rem',
                            fontWeight: 700,
                            color: '#dc2626',
                            marginBottom: '0.5rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                        }}
                    >
                        <svg
                            width="24"
                            height="24"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            aria-hidden="true"
                        >
                            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                            <line x1="12" y1="9" x2="12" y2="13" />
                            <line x1="12" y1="17" x2="12.01" y2="17" />
                        </svg>
                        Unconfirmed Panelists Warning
                    </h2>
                    <p style={{ color: '#475569', fontSize: '0.875rem' }}>
                        The following panelists have not confirmed their participation:
                    </p>
                </div>

                {/* Unconfirmed Panelist List */}
                <div
                    style={{
                        background: '#fef3c7',
                        border: '1px solid #fde68a',
                        borderRadius: '8px',
                        padding: '1rem',
                        marginBottom: '1rem',
                    }}
                >
                    <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                        {unconfirmedPanelists.map((panelist) => (
                            <li
                                key={panelist.id}
                                style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    padding: '0.5rem 0',
                                    borderBottom:
                                        unconfirmedPanelists.indexOf(panelist) < unconfirmedPanelists.length - 1
                                            ? '1px solid #fde68a'
                                            : 'none',
                                }}
                            >
                                <span style={{ fontWeight: 600, color: '#92400e' }}>{panelist.name}</span>
                                <span
                                    style={{
                                        fontSize: '0.75rem',
                                        padding: '0.25rem 0.5rem',
                                        borderRadius: '12px',
                                        background:
                                            panelist.status === 'declined' ? '#fee2e2' : '#fef3c7',
                                        color: panelist.status === 'declined' ? '#991b1b' : '#92400e',
                                        border:
                                            panelist.status === 'declined'
                                                ? '1px solid #fecaca'
                                                : '1px solid #fde68a',
                                        textTransform: 'capitalize',
                                    }}
                                >
                                    {panelist.status}
                                </span>
                            </li>
                        ))}
                    </ul>
                </div>

                {/* Warning Message */}
                <div
                    style={{
                        background: '#fee2e2',
                        border: '1px solid #fecaca',
                        borderRadius: '8px',
                        padding: '0.75rem',
                        marginBottom: '1rem',
                        fontSize: '0.875rem',
                        color: '#991b1b',
                    }}
                >
                    <strong>Risk:</strong> Notifying the candidate before all panelists confirm may result in
                    interview cancellation or rescheduling if panelists decline.
                </div>

                {/* Justification (Optional) */}
                <div style={{ marginBottom: '1rem' }}>
                    <label
                        htmlFor="justification"
                        style={{
                            display: 'block',
                            fontSize: '0.875rem',
                            fontWeight: 600,
                            color: '#334155',
                            marginBottom: '0.5rem',
                        }}
                    >
                        Justification (optional):
                    </label>
                    <textarea
                        id="justification"
                        value={justification}
                        onChange={(e) => setJustification(e.target.value)}
                        placeholder="Explain why you're proceeding without full confirmation..."
                        disabled={isSubmitting}
                        style={{
                            width: '100%',
                            padding: '0.5rem',
                            border: '1px solid #cbd5e1',
                            borderRadius: '6px',
                            fontSize: '0.875rem',
                            fontFamily: 'inherit',
                            resize: 'vertical',
                            minHeight: '60px',
                        }}
                        aria-describedby="justification-hint"
                    />
                    <p
                        id="justification-hint"
                        style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}
                    >
                        This will be recorded in the audit trail.
                    </p>
                </div>

                {/* Acknowledgement Checkbox */}
                <label
                    style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '0.5rem',
                        marginBottom: '1rem',
                        cursor: isSubmitting ? 'not-allowed' : 'pointer',
                    }}
                >
                    <input
                        type="checkbox"
                        checked={acknowledged}
                        onChange={(e) => setAcknowledged(e.target.checked)}
                        disabled={isSubmitting}
                        style={{
                            marginTop: '0.25rem',
                            cursor: isSubmitting ? 'not-allowed' : 'pointer',
                        }}
                        aria-label="Acknowledge risk of notifying with unconfirmed panelists"
                    />
                    <span style={{ fontSize: '0.875rem', color: '#334155' }}>
                        I acknowledge the risk of notifying the candidate with unconfirmed panelists and
                        take responsibility for any necessary rescheduling.
                    </span>
                </label>

                {/* Action Buttons */}
                <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                    <button
                        type="button"
                        onClick={onCancel}
                        disabled={isSubmitting}
                        style={{
                            padding: '0.625rem 1rem',
                            borderRadius: '8px',
                            border: '1px solid #cbd5e1',
                            background: '#fff',
                            color: '#475569',
                            fontWeight: 600,
                            cursor: isSubmitting ? 'not-allowed' : 'pointer',
                            opacity: isSubmitting ? 0.5 : 1,
                        }}
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={handleConfirm}
                        disabled={!acknowledged || isSubmitting}
                        style={{
                            padding: '0.625rem 1rem',
                            borderRadius: '8px',
                            border: 'none',
                            background: !acknowledged || isSubmitting ? '#94a3b8' : '#dc2626',
                            color: '#fff',
                            fontWeight: 600,
                            cursor: !acknowledged || isSubmitting ? 'not-allowed' : 'pointer',
                        }}
                    >
                        {isSubmitting ? 'Notifying...' : 'Notify Anyway'}
                    </button>
                </div>
            </div>
        </div>
    );
}
