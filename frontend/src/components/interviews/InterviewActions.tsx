'use client';

import React, { useState } from 'react';
import { Button } from '../ui/Button';
import { CancelDialog } from './CancelDialog';
import { NoShowDialog } from './NoShowDialog';
import { RescheduleModal } from './RescheduleModal';
import { InterviewStateBadge } from './InterviewStateBadge';
import { InterviewDetails, RescheduleData } from '../../types/interview';
import {
    transitionInterviewState,
    recordNoShow,
    rescheduleInterview,
} from '../../lib/api/interviews';

interface InterviewActionsProps {
    interview: InterviewDetails;
    onSuccess?: () => void;
    onError?: (message: string) => void;
    showStateBadge?: boolean;
}

type DialogState = 'none' | 'cancel' | 'noshow' | 'reschedule';

export function InterviewActions({
    interview,
    onSuccess,
    onError,
    showStateBadge = true,
}: InterviewActionsProps) {
    const [dialog, setDialog] = useState<DialogState>('none');
    const [isLoading, setIsLoading] = useState(false);

    const handleCancel = async (reason?: string) => {
        setIsLoading(true);
        try {
            await transitionInterviewState(interview.id, 'cancelled', reason);
            onSuccess?.();
        } catch (error) {
            onError?.(error instanceof Error ? error.message : 'Failed to cancel interview');
        } finally {
            setIsLoading(false);
            setDialog('none');
        }
    };

    const handleNoShow = async (reason: string) => {
        setIsLoading(true);
        try {
            await recordNoShow(interview.id, reason);
            onSuccess?.();
        } catch (error) {
            onError?.(error instanceof Error ? error.message : 'Failed to record no-show');
        } finally {
            setIsLoading(false);
            setDialog('none');
        }
    };

    const handleReschedule = async (data: RescheduleData) => {
        setIsLoading(true);
        try {
            await rescheduleInterview(interview.id, data);
            onSuccess?.();
        } catch (error) {
            onError?.(
                error instanceof Error ? error.message : 'Failed to reschedule interview'
            );
        } finally {
            setIsLoading(false);
            setDialog('none');
        }
    };

    const canCancel = interview.state === 'scheduled';
    const canRecordNoShow = interview.state === 'scheduled';
    const canReschedule = interview.state === 'scheduled' || interview.state === 'no_show';

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {showStateBadge && <InterviewStateBadge state={interview.state} />}

            <div
                style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '0.75rem',
                    alignItems: 'center',
                }}
            >
                {canCancel && (
                    <Button
                        variant="danger"
                        size="md"
                        onClick={() => setDialog('cancel')}
                        disabled={isLoading}
                        aria-label="Cancel interview"
                    >
                        Cancel Interview
                    </Button>
                )}

                {canRecordNoShow && (
                    <Button
                        variant="warning"
                        size="md"
                        onClick={() => setDialog('noshow')}
                        disabled={isLoading}
                        aria-label="Record no-show"
                    >
                        Record No-Show
                    </Button>
                )}

                {canReschedule && (
                    <Button
                        variant="primary"
                        size="md"
                        onClick={() => setDialog('reschedule')}
                        disabled={isLoading}
                        aria-label="Reschedule interview"
                    >
                        Reschedule
                    </Button>
                )}

                {!canCancel && !canRecordNoShow && !canReschedule && (
                    <p
                        style={{
                            margin: 0,
                            color: '#6b7280',
                            fontSize: '0.875rem',
                            fontStyle: 'italic',
                        }}
                    >
                        No actions available for {interview.state} interviews
                    </p>
                )}
            </div>

            {dialog === 'cancel' && (
                <CancelDialog
                    onConfirm={handleCancel}
                    onCancel={() => setDialog('none')}
                    isLoading={isLoading}
                />
            )}

            {dialog === 'noshow' && (
                <NoShowDialog
                    onConfirm={handleNoShow}
                    onCancel={() => setDialog('none')}
                    isLoading={isLoading}
                />
            )}

            {dialog === 'reschedule' && (
                <RescheduleModal
                    interview={interview}
                    onConfirm={handleReschedule}
                    onCancel={() => setDialog('none')}
                    isLoading={isLoading}
                />
            )}
        </div>
    );
}
