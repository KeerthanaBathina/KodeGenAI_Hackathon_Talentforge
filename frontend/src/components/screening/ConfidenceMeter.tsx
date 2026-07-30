'use client';

import React from 'react';

interface ConfidenceMeterProps {
    score: number; // 0-100
    shortlistThreshold: number; // e.g., 75
    borderlineMin: number; // e.g., 40
    rejectThreshold: number; // e.g., 39
    className?: string;
}

type ScoreLevel = 'strong' | 'borderline' | 'below';

function getScoreLevel(
    score: number,
    shortlistThreshold: number,
    rejectThreshold: number
): ScoreLevel {
    if (score >= shortlistThreshold) return 'strong';
    if (score <= rejectThreshold) return 'below';
    return 'borderline';
}

function getColorStyles(level: ScoreLevel): { backgroundColor: string; color: string } {
    switch (level) {
        case 'strong':
            return { backgroundColor: '#10B981', color: '#FFFFFF' }; // green-500
        case 'borderline':
            return { backgroundColor: '#F59E0B', color: '#FFFFFF' }; // amber-500
        case 'below':
            return { backgroundColor: '#EF4444', color: '#FFFFFF' }; // red-500
    }
}

function getLabel(level: ScoreLevel): string {
    switch (level) {
        case 'strong':
            return 'Strong Match';
        case 'borderline':
            return 'Borderline';
        case 'below':
            return 'Below Threshold';
    }
}

export function ConfidenceMeter({
    score,
    shortlistThreshold,
    borderlineMin,
    rejectThreshold,
    className = '',
}: ConfidenceMeterProps) {
    const level = getScoreLevel(score, shortlistThreshold, rejectThreshold);
    const colorStyles = getColorStyles(level);
    const label = getLabel(level);

    return (
        <div className={className}>
            {/* Score and Label */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span
                    style={{
                        fontSize: '14px',
                        fontWeight: 600,
                        color: '#374151', // gray-700
                    }}
                >
                    {label}
                </span>
                <span
                    style={{
                        fontSize: '14px',
                        fontWeight: 600,
                        color: '#374151',
                    }}
                    aria-label={`Score: ${score} out of 100`}
                >
                    {score}%
                </span>
            </div>

            {/* Progress Bar */}
            <div
                style={{
                    width: '100%',
                    height: '12px',
                    backgroundColor: '#E5E7EB', // gray-200
                    borderRadius: '9999px',
                    overflow: 'hidden',
                }}
                role="progressbar"
                aria-valuenow={score}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`Screening confidence: ${score} percent, ${label}`}
            >
                <div
                    style={{
                        width: `${score}%`,
                        height: '100%',
                        backgroundColor: colorStyles.backgroundColor,
                        transition: 'width 0.3s ease-in-out',
                    }}
                />
            </div>

            {/* Threshold Markers */}
            <div
                style={{
                    position: 'relative',
                    marginTop: '4px',
                    height: '16px',
                }}
            >
                <div
                    style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: '11px',
                        color: '#9CA3AF', // gray-400
                    }}
                >
                    <span>0</span>
                    <span>100</span>
                </div>
                {rejectThreshold > 0 && rejectThreshold < 100 && (
                    <div
                        style={{
                            position: 'absolute',
                            left: `${rejectThreshold}%`,
                            top: '-8px',
                            transform: 'translateX(-50%)',
                            fontSize: '10px',
                            color: '#9CA3AF',
                            whiteSpace: 'nowrap',
                        }}
                        title={`Reject threshold: ${rejectThreshold}`}
                    >
                        {rejectThreshold}
                    </div>
                )}
                {shortlistThreshold > 0 && shortlistThreshold < 100 && (
                    <div
                        style={{
                            position: 'absolute',
                            left: `${shortlistThreshold}%`,
                            top: '-8px',
                            transform: 'translateX(-50%)',
                            fontSize: '10px',
                            color: '#9CA3AF',
                            whiteSpace: 'nowrap',
                        }}
                        title={`Shortlist threshold: ${shortlistThreshold}`}
                    >
                        {shortlistThreshold}
                    </div>
                )}
            </div>
        </div>
    );
}
