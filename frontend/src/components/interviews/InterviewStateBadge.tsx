'use client';

import React from 'react';
import { InterviewState } from '../../types/interview';
import styles from './InterviewStateBadge.module.css';

interface InterviewStateBadgeProps {
    state: InterviewState;
}

const STATE_CONFIG = {
    scheduled: { label: 'Scheduled', className: 'badge-scheduled' },
    completed: { label: 'Completed', className: 'badge-completed' },
    cancelled: { label: 'Cancelled', className: 'badge-cancelled' },
    no_show: { label: 'No Show', className: 'badge-noshow' },
    rescheduled: { label: 'Rescheduled', className: 'badge-rescheduled' },
};

export function InterviewStateBadge({ state }: InterviewStateBadgeProps) {
    const config = STATE_CONFIG[state];

    return (
        <span
            className={`${styles.badge} ${styles[config.className]}`}
            data-state={state}
        >
            {config.label}
        </span>
    );
}
