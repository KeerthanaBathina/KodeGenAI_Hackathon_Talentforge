'use client';

import React, { useRef } from 'react';
import { useResumeUpload } from '../hooks/useResumeUpload';
import { ProgressBar } from './ProgressBar';

interface ResumeUploadProps {
    applicationId: string;
    onSuccess?: (resumeId: string) => void;
    onError?: (error: string) => void;
    className?: string;
}

export const ResumeUpload: React.FC<ResumeUploadProps> = ({
    applicationId,
    onSuccess,
    onError,
    className = '',
}) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const { uploadState, uploadFile, reset } = useResumeUpload({
        applicationId,
        onSuccess,
        onError,
    });

    const handleButtonClick = () => {
        if (uploadState.status === 'error') {
            reset();
        }
        fileInputRef.current?.click();
    };

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            uploadFile(file);
        }
    };

    const isUploading =
        uploadState.status === 'validating' ||
        uploadState.status === 'requesting_url' ||
        uploadState.status === 'uploading' ||
        uploadState.status === 'scanning';

    return (
        <div className={className}>
            <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.docx"
                onChange={handleFileChange}
                style={{ display: 'none' }}
                disabled={isUploading}
            />

            <button
                type="button"
                onClick={handleButtonClick}
                disabled={isUploading || uploadState.status === 'success'}
                style={{
                    padding: '12px 24px',
                    fontSize: '16px',
                    fontWeight: '500',
                    color: '#fff',
                    backgroundColor:
                        isUploading || uploadState.status === 'success' ? '#9ca3af' : '#3b82f6',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: isUploading || uploadState.status === 'success' ? 'not-allowed' : 'pointer',
                    transition: 'background-color 0.2s',
                    width: '100%',
                }}
                onMouseEnter={(e) => {
                    if (!isUploading && uploadState.status !== 'success') {
                        e.currentTarget.style.backgroundColor = '#2563eb';
                    }
                }}
                onMouseLeave={(e) => {
                    if (!isUploading && uploadState.status !== 'success') {
                        e.currentTarget.style.backgroundColor = '#3b82f6';
                    }
                }}
            >
                {uploadState.status === 'success'
                    ? 'Resume Uploaded'
                    : uploadState.status === 'error'
                        ? 'Try Again'
                        : isUploading
                            ? 'Uploading...'
                            : 'Upload Resume'}
            </button>

            <ProgressBar
                progress={uploadState.progress}
                status={uploadState.status}
                className="progress-bar"
            />

            {uploadState.status === 'error' && uploadState.error && (
                <div
                    style={{
                        marginTop: '12px',
                        padding: '12px',
                        backgroundColor: '#fee2e2',
                        borderLeft: '4px solid #dc2626',
                        borderRadius: '4px',
                    }}
                >
                    <p style={{ margin: 0, fontSize: '14px', color: '#991b1b', fontWeight: '500' }}>
                        {uploadState.error}
                    </p>
                </div>
            )}

            {uploadState.status === 'success' && (
                <div
                    style={{
                        marginTop: '12px',
                        padding: '12px',
                        backgroundColor: '#d1fae5',
                        borderLeft: '4px solid #16a34a',
                        borderRadius: '4px',
                    }}
                >
                    <p style={{ margin: 0, fontSize: '14px', color: '#065f46', fontWeight: '500' }}>
                        Resume uploaded successfully! Your file is being processed.
                    </p>
                </div>
            )}

            <div style={{ marginTop: '16px' }}>
                <p style={{ fontSize: '13px', color: '#6b7280', margin: '4px 0' }}>
                    <strong>Accepted formats:</strong> PDF, DOCX
                </p>
                <p style={{ fontSize: '13px', color: '#6b7280', margin: '4px 0' }}>
                    <strong>Maximum file size:</strong> 10 MB
                </p>
            </div>
        </div>
    );
};
