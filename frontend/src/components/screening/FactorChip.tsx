'use client';

import React from 'react';

interface FactorChipProps {
    label: string;
    className?: string;
}

export function FactorChip({ label, className = '' }: FactorChipProps) {
    return (
        <div
            className={className}
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                backgroundColor: '#D1FAE5', // green-100
                color: '#065F46', // green-800 for WCAG AA contrast
                borderRadius: '16px',
                fontSize: '13px',
                fontWeight: 500,
                maxWidth: '100%',
            }}
            role="status"
            aria-label={`Positive factor: ${label}`}
        >
            {/* Checkmark Icon */}
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
                    d="M13.3334 4L6.00002 11.3333L2.66669 8"
                    stroke="#059669" // green-600
                    strokeWidth="2"
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
