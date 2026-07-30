'use client';

import React from 'react';

interface GapChipProps {
    label: string;
    className?: string;
}

export function GapChip({ label, className = '' }: GapChipProps) {
    return (
        <div
            className={className}
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                backgroundColor: '#FEF3C7', // amber-100
                color: '#92400E', // amber-800 for WCAG AA contrast
                borderRadius: '16px',
                fontSize: '13px',
                fontWeight: 500,
                maxWidth: '100%',
            }}
            role="status"
            aria-label={`Missing skill: ${label}`}
        >
            {/* Warning Icon */}
            <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
                style={{ flexShrink: 0 }}
            >
                <path
                    d="M8.00002 5.33331V7.99998M8.00002 10.6666H8.00669M14.6667 7.99998C14.6667 11.6819 11.6819 14.6666 8.00002 14.6666C4.31812 14.6666 1.33335 11.6819 1.33335 7.99998C1.33335 4.31808 4.31812 1.33331 8.00002 1.33331C11.6819 1.33331 14.6667 4.31808 14.6667 7.99998Z"
                    stroke="#D97706" // amber-600
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                />
            </svg>

            {/* Label with truncation */}
            <span
                style={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                }}
                title={label}
            >
                {label}
            </span>
        </div>
    );
}
