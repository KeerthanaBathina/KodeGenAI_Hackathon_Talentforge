import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { InterviewStateBadge } from '../InterviewStateBadge';

describe('InterviewStateBadge', () => {
    it('should render scheduled badge', () => {
        render(<InterviewStateBadge state="scheduled" />);
        const badge = screen.getByText('Scheduled');
        expect(badge).toBeInTheDocument();
        expect(badge).toHaveAttribute('data-state', 'scheduled');
    });

    it('should render completed badge', () => {
        render(<InterviewStateBadge state="completed" />);
        const badge = screen.getByText('Completed');
        expect(badge).toBeInTheDocument();
        expect(badge).toHaveAttribute('data-state', 'completed');
    });

    it('should render cancelled badge', () => {
        render(<InterviewStateBadge state="cancelled" />);
        const badge = screen.getByText('Cancelled');
        expect(badge).toBeInTheDocument();
        expect(badge).toHaveAttribute('data-state', 'cancelled');
    });

    it('should render no_show badge', () => {
        render(<InterviewStateBadge state="no_show" />);
        const badge = screen.getByText('No Show');
        expect(badge).toBeInTheDocument();
        expect(badge).toHaveAttribute('data-state', 'no_show');
    });

    it('should render rescheduled badge', () => {
        render(<InterviewStateBadge state="rescheduled" />);
        const badge = screen.getByText('Rescheduled');
        expect(badge).toBeInTheDocument();
        expect(badge).toHaveAttribute('data-state', 'rescheduled');
    });
});
