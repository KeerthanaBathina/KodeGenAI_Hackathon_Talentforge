'use client';

import React from 'react';
import type { StageStatus } from '@/lib/api/interviews';

interface StageProgressIndicatorProps {
    stages: StageStatus[];
    currentStage?: string;
}

const stageLabels: Record<string, string> = {
    aptitude: 'Aptitude',
    technical: 'Technical',
    system_design: 'System Design',
    cultural: 'Cultural Fit',
    hr: 'HR',
    coding: 'Coding',
};

const stageIcons: Record<StageStatus['status'], string> = {
    completed: '✓',
    available: '○',
    locked: '🔒',
    not_applicable: '',
};

const stageColors: Record<StageStatus['status'], string> = {
    completed: '#10b981', // green
    available: '#3b82f6', // blue
    locked: '#9ca3af', // gray
    not_applicable: '#e5e7eb', // light gray
};

export function StageProgressIndicator({
    stages,
    currentStage,
}: StageProgressIndicatorProps) {
    return (
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
            {stages.map((stage, index) => {
                const isCurrentStage = stage.stage === currentStage;
                const label = stageLabels[stage.stage] || stage.stage;
                const icon = stageIcons[stage.status];
                const color = stageColors[stage.status];

                return (
                    <div
                        key={stage.stage}
                        style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            opacity: stage.status === 'not_applicable' ? 0.3 : 1,
                            position: 'relative',
                        }}
                    >
                        {/* Stage circle */}
                        <div
                            style={{
                                width: '3rem',
                                height: '3rem',
                                borderRadius: '50%',
                                backgroundColor: color,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '1.5rem',
                                color: 'white',
                                border: isCurrentStage ? '3px solid #fbbf24' : 'none',
                                position: 'relative',
                            }}
                        >
                            {icon}
                        </div>

                        {/* Stage label */}
                        <div
                            style={{
                                marginTop: '0.5rem',
                                fontSize: '0.875rem',
                                fontWeight: isCurrentStage ? 'bold' : 'normal',
                                textAlign: 'center',
                            }}
                        >
                            {label}
                        </div>

                        {/* Prerequisite info for locked stages */}
                        {stage.status === 'locked' && stage.missingPrerequisites.length > 0 && (
                            <div
                                style={{
                                    marginTop: '0.25rem',
                                    fontSize: '0.75rem',
                                    color: '#6b7280',
                                    textAlign: 'center',
                                }}
                            >
                                Requires: {stage.missingPrerequisites.map(p => stageLabels[p] || p).join(', ')}
                            </div>
                        )}

                        {/* Connector line */}
                        {index < stages.length - 1 && (
                            <div
                                style={{
                                    position: 'absolute',
                                    top: '1.5rem',
                                    left: 'calc(100% + 0.5rem)',
                                    width: '1rem',
                                    height: '2px',
                                    backgroundColor: '#d1d5db',
                                }}
                            />
                        )}
                    </div>
                );
            })}
        </div>
    );
}
