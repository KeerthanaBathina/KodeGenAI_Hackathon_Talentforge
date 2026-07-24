'use client';

import React from 'react';
import { FactorChip } from './FactorChip';

interface FactorChipListProps {
    factors: string[];
    className?: string;
    emptyMessage?: string;
}

export function FactorChipList({
    factors,
    className = '',
    emptyMessage = 'No positive factors identified',
}: FactorChipListProps) {
    if (factors.length === 0) {
        return (
            <p
                style={{
                    fontSize: '13px',
                    color: '#6B7280', // gray-500
                    fontStyle: 'italic',
                }}
            >
                {emptyMessage}
            </p>
        );
    }

    return (
        <div
            className={className}
            style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '8px',
            }}
            role="list"
            aria-label="Positive screening factors"
        >
            {factors.map((factor, index) => (
                <div key={index} role="listitem">
                    <FactorChip label={factor} />
                </div>
            ))}
        </div>
    );
}
