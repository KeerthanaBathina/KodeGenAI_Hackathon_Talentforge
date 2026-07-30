'use client';

import React from 'react';
import type { ScreeningRecommendation } from '@/types/screening';

interface ScreeningBadgeProps {
    recommendation: ScreeningRecommendation;
    className?: string;
}

export function ScreeningBadge({ recommendation, className = '' }: ScreeningBadgeProps) {
    const colors = {
        shortlist: { bg: '#D1FAE5', text: '#065F46', label: 'Shortlist' },
        manual_review: { bg: '#FEF3C7', text: '#92400E', label: 'Manual Review' },
        reject: { bg: '#FEE2E2', text: '#991B1B', label: 'Reject' },
    };

    const color = colors[recommendation] || colors.manual_review;

    return (
        <span
            className={className}
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '4px 10px',
                backgroundColor: color.bg,
                color: color.text,
                borderRadius: '12px',
                fontSize: '12px',
                fontWeight: 500,
            }}
            role="status"
            aria-label={`Screening recommendation: ${color.label}`}
        >
            {color.label}
        </span>
    );
}
