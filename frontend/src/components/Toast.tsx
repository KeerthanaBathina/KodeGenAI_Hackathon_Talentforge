'use client';

import React, { useEffect, useState } from 'react';

export interface ToastProps {
    message: string;
    type: 'success' | 'error' | 'info';
    duration?: number;
    onClose: () => void;
}

export default function Toast({ message, type, duration = 3000, onClose }: ToastProps) {
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        // Slide in animation
        setIsVisible(true);

        // Auto dismiss for success toasts
        if (type === 'success' && duration > 0) {
            const timer = setTimeout(() => {
                handleClose();
            }, duration);

            return () => clearTimeout(timer);
        }
    }, [type, duration]);

    function handleClose() {
        setIsVisible(false);
        setTimeout(onClose, 300); // Wait for slide-out animation
    }

    const colors = {
        success: { bg: '#10b981', border: '#059669' },
        error: { bg: '#ef4444', border: '#dc2626' },
        info: { bg: '#3b82f6', border: '#2563eb' },
    };

    return (
        <div
            data-testid={`toast-${type}`}
            style={{
                position: 'fixed',
                top: isVisible ? '1rem' : '-100px',
                right: '1rem',
                backgroundColor: colors[type].bg,
                color: 'white',
                padding: '1rem 1.5rem',
                borderRadius: '8px',
                boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                display: 'flex',
                alignItems: 'center',
                gap: '1rem',
                minWidth: '300px',
                maxWidth: '500px',
                zIndex: 9999,
                transition: 'top 0.3s ease-in-out',
                border: `2px solid ${colors[type].border}`,
            }}
        >
            <span style={{ flex: 1 }}>{message}</span>
            <button
                onClick={handleClose}
                style={{
                    backgroundColor: 'transparent',
                    border: 'none',
                    color: 'white',
                    fontSize: '1.5rem',
                    cursor: 'pointer',
                    padding: '0',
                    lineHeight: '1',
                }}
            >
                ×
            </button>
        </div>
    );
}
