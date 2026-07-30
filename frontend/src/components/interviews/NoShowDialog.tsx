'use client';

import React, { useState } from 'react';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { Textarea } from '../ui/Textarea';

interface NoShowDialogProps {
    onConfirm: (reason: string) => void;
    onCancel: () => void;
    isLoading: boolean;
}

export function NoShowDialog({ onConfirm, onCancel, isLoading }: NoShowDialogProps) {
    const [reason, setReason] = useState('');
    const [error, setError] = useState('');

    const handleConfirm = () => {
        if (!reason.trim()) {
            setError('Please provide a reason for the no-show');
            return;
        }
        setError('');
        onConfirm(reason);
    };

    return (
        <Dialog open onClose={onCancel} title="Record No-Show">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div
                    style={{
                        backgroundColor: '#fff3cd',
                        border: '1px solid #ffc107',
                        borderRadius: '0.375rem',
                        padding: '1rem',
                    }}
                >
                    <strong style={{ display: 'block', marginBottom: '0.5rem' }}>
                        ⚠️ Recording No-Show
                    </strong>
                    <p style={{ margin: 0, fontSize: '0.875rem' }}>
                        This will increment the candidate's no-show count and mark the interview
                        as not attended. You can reschedule after recording the no-show if needed.
                    </p>
                </div>

                <div>
                    <label
                        htmlFor="noshow-reason"
                        style={{
                            display: 'block',
                            marginBottom: '0.5rem',
                            fontWeight: 500,
                            fontSize: '0.875rem',
                        }}
                    >
                        Reason <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <Textarea
                        id="noshow-reason"
                        value={reason}
                        onChange={(e) => {
                            setReason(e.target.value);
                            setError('');
                        }}
                        placeholder="Candidate did not attend or join the interview..."
                        rows={3}
                        disabled={isLoading}
                        error={error}
                    />
                </div>

                <div
                    style={{
                        display: 'flex',
                        gap: '0.75rem',
                        justifyContent: 'flex-end',
                        marginTop: '0.5rem',
                    }}
                >
                    <Button variant="secondary" onClick={onCancel} disabled={isLoading}>
                        Cancel
                    </Button>
                    <Button
                        variant="warning"
                        onClick={handleConfirm}
                        disabled={isLoading || !reason.trim()}
                    >
                        {isLoading ? 'Recording...' : 'Record No-Show'}
                    </Button>
                </div>
            </div>
        </Dialog>
    );
}
