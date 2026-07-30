'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/Button';
import { getApplicationStageStatus } from '@/lib/api/interviews';
import type { StageStatus } from '@/lib/api/interviews';
import { StageProgressIndicator } from './StageProgressIndicator';

interface StageGateSchedulerProps {
    applicationId: string;
    applicationPath: 'fresher' | 'experienced';
    onSchedule?: (stage: string) => void;
}

const stageLabels: Record<string, string> = {
    aptitude: 'Aptitude',
    technical: 'Technical',
    system_design: 'System Design',
    cultural: 'Cultural Fit',
    hr: 'HR',
    coding: 'Coding',
};

export function StageGateScheduler({
    applicationId,
    applicationPath,
    onSchedule,
}: StageGateSchedulerProps) {
    const [stages, setStages] = useState<StageStatus[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedStage, setSelectedStage] = useState<string | null>(null);

    useEffect(() => {
        async function loadStageStatus() {
            try {
                const status = await getApplicationStageStatus(applicationId);
                setStages(status);
            } catch (error) {
                console.error('Failed to load stage status:', error);
            } finally {
                setLoading(false);
            }
        }

        loadStageStatus();
    }, [applicationId]);

    const handleScheduleClick = (stage: string) => {
        setSelectedStage(stage);
        if (onSchedule) {
            onSchedule(stage);
        }
        // Open scheduling modal here
        // (implementation depends on existing scheduling UI)
    };

    if (loading) {
        return <div>Loading stage information...</div>;
    }

    return (
        <div style={{ padding: '1.5rem' }}>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '1rem' }}>
                Interview Schedule - {applicationPath === 'fresher' ? 'Fresher' : 'Experienced'} Path
            </h2>

            {/* Stage progression indicator */}
            <div style={{ marginBottom: '2rem' }}>
                <StageProgressIndicator stages={stages} currentStage={selectedStage || undefined} />
            </div>

            {/* Schedule buttons */}
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                {stages
                    .filter(stage => stage.status !== 'not_applicable')
                    .map((stage) => {
                        const isLocked = stage.status === 'locked';
                        const isCompleted = stage.status === 'completed';
                        const isAvailable = stage.status === 'available';
                        const label = stageLabels[stage.stage] || stage.stage;

                        let buttonText = `Schedule ${label}`;
                        if (isCompleted) {
                            buttonText = `${label} ✓ Completed`;
                        } else if (isLocked) {
                            buttonText = `${label} 🔒 Locked`;
                        }

                        const tooltipText = isLocked
                            ? `Complete ${stage.missingPrerequisites.map(p => stageLabels[p] || p).join(', ')} before scheduling ${label}`
                            : isCompleted
                            ? 'This stage has been completed'
                            : `Schedule ${label} interview`;

                        return (
                            <div key={stage.stage} style={{ position: 'relative' }}>
                                <Button
                                    variant={isCompleted ? 'secondary' : isLocked ? 'secondary' : 'primary'}
                                    disabled={isLocked || isCompleted}
                                    onClick={() => handleScheduleClick(stage.stage)}
                                    aria-label={tooltipText}
                                    title={tooltipText}
                                >
                                    {buttonText}
                                </Button>
                            </div>
                        );
                    })}
            </div>

            {/* Path information */}
            <div
                style={{
                    marginTop: '2rem',
                    padding: '1rem',
                    backgroundColor: '#f3f4f6',
                    borderRadius: '0.5rem',
                    fontSize: '0.875rem',
                }}
            >
                <strong>Interview Path:</strong> {applicationPath === 'fresher' ? 'Fresher' : 'Experienced'}
                <br />
                <strong>Stages:</strong>{' '}
                {stages.filter(s => s.status !== 'not_applicable').map(s => stageLabels[s.stage] || s.stage).join(' → ')}
            </div>
        </div>
    );
}
