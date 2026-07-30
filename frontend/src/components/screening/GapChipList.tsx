'use client';

import React from 'react';
import { GapChip } from './GapChip';

interface GapChipListProps {
    gaps: string[];
    className?: string;
    emptyMessage?: string;
}

export function GapChipList({
    gaps,
    className = '',
    emptyMessage = 'No skill gaps identified',
}: GapChipListProps) {
    if (gaps.length === 0) {
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
            aria-label="Skill gaps"
        >
            {gaps.map((gap, index) => (
                <div key={index} role="listitem">
                    <GapChip label={gap} />
                </div>
            ))}
        </div>
    );
}
