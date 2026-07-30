'use client';

import React, { useState } from 'react';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { Textarea } from '../ui/Textarea';

interface CancelDialogProps {
    onConfirm: (reason?: string) => void;
    onCancel: () => void;
    isLoading: boolean;
}

export function CancelDialog({ onConfirm, onCancel, isLoading }: CancelDialogProps) {
    const [reason, setReason] = useState('');

    return (
        <Dialog open onClose={onCancel} title="Cancel Interview">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <p style={{ margin: 0, color: '#dc2626', fontWeight: 500 }}>
                    Are you sure you want to cancel this interview? This action cannot be undone.
                </p>

                <div>
                    <label
                        htmlFor="cancel-reason"
                        style={{
                            display: 'block',
                            marginBottom: '0.5rem',
                            fontWeight: 500,
                            fontSize: '0.875rem',
                        }}
                    >
                        Reason (Optional)
                    </label>
                    <Textarea
                        id="cancel-reason"
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="Provide a reason for cancellation..."
                        rows={3}
                        disabled={isLoading}
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
                    <Button
                        variant="secondary"
                        onClick={onCancel}
                        disabled={isLoading}
                    >
                        Keep Interview
                    </Button>
                    <Button
                        variant="danger"
                        onClick={() => onConfirm(reason || undefined)}
                        disabled={isLoading}
                    >
                        {isLoading ? 'Cancelling...' : 'Cancel Interview'}
                    </Button>
                </div>
            </div>
        </Dialog>
    );
}
