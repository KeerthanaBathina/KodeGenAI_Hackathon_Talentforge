import React from 'react';

interface ProgressBarProps {
    progress: number; // 0-100
    status: 'idle' | 'validating' | 'requesting_url' | 'uploading' | 'scanning' | 'success' | 'error';
    className?: string;
}

const STATUS_TEXT: Record<string, string> = {
    idle: '',
    validating: 'Validating file...',
    requesting_url: 'Preparing upload...',
    uploading: 'Uploading resume...',
    scanning: 'Scanning for malware...',
    success: 'Upload complete',
    error: 'Upload failed',
};

export const ProgressBar: React.FC<ProgressBarProps> = ({ progress, status, className = '' }) => {
    if (status === 'idle') {
        return null;
    }

    const statusText = STATUS_TEXT[status] || '';
    const percentage = Math.round(progress);

    return (
        <div className={className} style={{ marginTop: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span
                    style={{
                        fontSize: '14px',
                        fontWeight: '500',
                        color: status === 'error' ? '#dc2626' : status === 'success' ? '#16a34a' : '#4b5563',
                    }}
                >
                    {statusText}
                </span>
                <span style={{ fontSize: '14px', fontWeight: '500', color: '#6b7280' }}>
                    {percentage}%
                </span>
            </div>
            <div
                style={{
                    width: '100%',
                    height: '8px',
                    backgroundColor: '#e5e7eb',
                    borderRadius: '4px',
                    overflow: 'hidden',
                }}
            >
                <div
                    style={{
                        width: `${percentage}%`,
                        height: '100%',
                        backgroundColor:
                            status === 'error'
                                ? '#dc2626'
                                : status === 'success'
                                    ? '#16a34a'
                                    : '#3b82f6',
                        transition: 'width 0.3s ease',
                        borderRadius: '4px',
                    }}
                />
            </div>
        </div>
    );
};
