'use client';

import React, { useEffect, useState } from 'react';
import { ConfidenceMeter } from './ConfidenceMeter';
import { FactorChipList } from './FactorChipList';
import { GapChipList } from './GapChipList';
import { getScreeningByApplication, getActiveThresholds } from '@/lib/api/screening';
import type { ScreeningResult, ScreeningThresholds } from '@/types/screening';

interface ScreeningExplainabilityPanelProps {
    applicationId: string;
    className?: string;
}

export function ScreeningExplainabilityPanel({
    applicationId,
    className = '',
}: ScreeningExplainabilityPanelProps) {
    const [screening, setScreening] = useState<ScreeningResult | null>(null);
    const [thresholds, setThresholds] = useState<ScreeningThresholds | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        async function fetchData() {
            try {
                setLoading(true);
                setError(null);
                const [screeningData, thresholdData] = await Promise.all([
                    getScreeningByApplication(applicationId),
                    getActiveThresholds(),
                ]);
                setScreening(screeningData);
                setThresholds(thresholdData);
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to load screening data');
            } finally {
                setLoading(false);
            }
        }

        fetchData();
    }, [applicationId]);

    if (loading) {
        return (
            <div
                style={{
                    padding: '24px',
                    textAlign: 'center',
                    color: '#6B7280',
                }}
                role="status"
                aria-live="polite"
            >
                Loading screening analysis...
            </div>
        );
    }

    if (error) {
        return (
            <div
                style={{
                    padding: '24px',
                    backgroundColor: '#FEF2F2',
                    borderRadius: '8px',
                    color: '#991B1B',
                }}
                role="alert"
            >
                <p style={{ fontWeight: 600, marginBottom: '8px' }}>Error</p>
                <p style={{ fontSize: '14px' }}>{error}</p>
            </div>
        );
    }

    if (!screening || !thresholds) {
        return (
            <div
                style={{
                    padding: '24px',
                    textAlign: 'center',
                    color: '#6B7280',
                    fontStyle: 'italic',
                }}
            >
                No screening data available for this application
            </div>
        );
    }

    return (
        <div
            className={className}
            style={{
                padding: '24px',
                backgroundColor: '#FFFFFF',
                borderRadius: '8px',
                border: '1px solid #E5E7EB',
            }}
        >
            {/* Header */}
            <h3
                style={{
                    fontSize: '18px',
                    fontWeight: 600,
                    color: '#111827',
                    marginBottom: '20px',
                }}
            >
                AI Screening Analysis
            </h3>

            {/* Confidence Meter */}
            <div style={{ marginBottom: '24px' }}>
                <ConfidenceMeter
                    score={screening.score}
                    shortlistThreshold={thresholds.shortlistThreshold}
                    borderlineMin={thresholds.borderlineMin}
                    rejectThreshold={thresholds.rejectThreshold}
                />
            </div>

            {/* Score Breakdown */}
            {screening.factors?.scoreBreakdown && (
                <div style={{ marginBottom: '24px' }}>
                    <h4
                        style={{
                            fontSize: '14px',
                            fontWeight: 600,
                            color: '#374151',
                            marginBottom: '12px',
                        }}
                    >
                        Score Breakdown
                    </h4>
                    <div
                        style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
                            gap: '12px',
                        }}
                    >
                        <ScoreBreakdownItem
                            label="Skills"
                            score={screening.factors.scoreBreakdown.skillMatch}
                            max={50}
                        />
                        <ScoreBreakdownItem
                            label="Experience"
                            score={screening.factors.scoreBreakdown.experienceMatch}
                            max={30}
                        />
                        <ScoreBreakdownItem
                            label="Education"
                            score={screening.factors.scoreBreakdown.educationMatch}
                            max={20}
                        />
                    </div>
                </div>
            )}

            {/* Positive Factors */}
            <div style={{ marginBottom: '24px' }}>
                <h4
                    style={{
                        fontSize: '14px',
                        fontWeight: 600,
                        color: '#374151',
                        marginBottom: '12px',
                    }}
                >
                    Positive Factors
                </h4>
                <FactorChipList factors={screening.factors?.positiveFactors || []} />
            </div>

            {/* Skill Gaps */}
            <div>
                <h4
                    style={{
                        fontSize: '14px',
                        fontWeight: 600,
                        color: '#374151',
                        marginBottom: '12px',
                    }}
                >
                    Skill Gaps
                </h4>
                <GapChipList gaps={screening.factors?.skillGaps || []} />
            </div>
        </div>
    );
}

interface ScoreBreakdownItemProps {
    label: string;
    score: number;
    max: number;
}

function ScoreBreakdownItem({ label, score, max }: ScoreBreakdownItemProps) {
    const percentage = Math.round((score / max) * 100);

    return (
        <div
            style={{
                padding: '12px',
                backgroundColor: '#F9FAFB',
                borderRadius: '6px',
            }}
        >
            <div
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    marginBottom: '4px',
                }}
            >
                <span style={{ fontSize: '12px', color: '#6B7280', fontWeight: 500 }}>
                    {label}
                </span>
                <span style={{ fontSize: '12px', color: '#111827', fontWeight: 600 }}>
                    {score}/{max}
                </span>
            </div>
            <div
                style={{
                    height: '4px',
                    backgroundColor: '#E5E7EB',
                    borderRadius: '2px',
                    overflow: 'hidden',
                }}
                role="progressbar"
                aria-valuenow={percentage}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`${label} score: ${score} out of ${max}`}
            >
                <div
                    style={{
                        width: `${percentage}%`,
                        height: '100%',
                        backgroundColor: '#3B82F6',
                    }}
                />
            </div>
        </div>
    );
}
