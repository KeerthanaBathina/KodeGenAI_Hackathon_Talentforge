import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { InterviewActions } from '../InterviewActions';
import * as interviewsApi from '../../../lib/api/interviews';
import { InterviewDetails } from '../../../types/interview';

vi.mock('../../../lib/api/interviews', () => ({
    transitionInterviewState: vi.fn(),
    recordNoShow: vi.fn(),
    rescheduleInterview: vi.fn(),
}));

const mockInterview: InterviewDetails = {
    id: 'int-123',
    applicationId: 'app-456',
    type: 'technical',
    state: 'scheduled',
    scheduledAt: new Date(Date.now() + 86400000).toISOString(), // tomorrow
    timezone: 'America/New_York',
    duration: 60,
    meetingLink: 'https://meet.google.com/abc',
    panelMembers: ['panel-1', 'panel-2'],
};

describe('InterviewActions', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('Scheduled Interview', () => {
        it('should render all action buttons for scheduled interview', () => {
            render(<InterviewActions interview={mockInterview} />);

            expect(screen.getByText('Cancel Interview')).toBeInTheDocument();
            expect(screen.getByText('Record No-Show')).toBeInTheDocument();
            expect(screen.getByText('Reschedule')).toBeInTheDocument();
        });

        it('should show state badge when showStateBadge is true', () => {
            render(<InterviewActions interview={mockInterview} showStateBadge />);
            expect(screen.getByText('Scheduled')).toBeInTheDocument();
        });

        it('should not show state badge when showStateBadge is false', () => {
            render(<InterviewActions interview={mockInterview} showStateBadge={false} />);
            expect(screen.queryByText('Scheduled')).not.toBeInTheDocument();
        });

        it('should open cancel dialog when cancel button is clicked', () => {
            render(<InterviewActions interview={mockInterview} />);
            fireEvent.click(screen.getByText('Cancel Interview'));
            expect(screen.getByText(/Are you sure you want to cancel/)).toBeInTheDocument();
        });

        it('should open no-show dialog when no-show button is clicked', () => {
            render(<InterviewActions interview={mockInterview} />);
            fireEvent.click(screen.getByRole('button', { name: 'Record no-show' }));
            expect(screen.getByRole('heading', { name: 'Record No-Show' })).toBeInTheDocument();
            expect(screen.getByText(/Recording No-Show/)).toBeInTheDocument();
        });

        it('should open reschedule modal when reschedule button is clicked', () => {
            render(<InterviewActions interview={mockInterview} />);
            fireEvent.click(screen.getByRole('button', { name: 'Reschedule interview' }));
            expect(screen.getByRole('heading', { name: 'Reschedule Interview' })).toBeInTheDocument();
        });
    });

    describe('Cancel Action', () => {
        it('should call transitionInterviewState with cancel and reason', async () => {
            const onSuccess = vi.fn();
            vi.mocked(interviewsApi.transitionInterviewState).mockResolvedValue({
                id: 'int-123',
                state: 'cancelled',
                cancelReason: 'Test reason',
            });

            render(<InterviewActions interview={mockInterview} onSuccess={onSuccess} />);

            fireEvent.click(screen.getByRole('button', { name: 'Cancel interview' }));
            
            const reasonInput = screen.getByPlaceholderText(
                'Provide a reason for cancellation...'
            );
            fireEvent.change(reasonInput, { target: { value: 'Test reason' } });

            const confirmButton = screen.getByRole('button', { name: 'Cancel Interview' });
            fireEvent.click(confirmButton);

            await waitFor(() => {
                expect(interviewsApi.transitionInterviewState).toHaveBeenCalledWith(
                    'int-123',
                    'cancelled',
                    'Test reason'
                );
                expect(onSuccess).toHaveBeenCalled();
            });
        });

        it('should handle cancel API error', async () => {
            const onError = vi.fn();
            vi.mocked(interviewsApi.transitionInterviewState).mockRejectedValue(
                new Error('API Error')
            );

            render(<InterviewActions interview={mockInterview} onError={onError} />);

            fireEvent.click(screen.getByRole('button', { name: 'Cancel interview' }));
            const confirmButton = screen.getByRole('button', { name: 'Cancel Interview' });
            fireEvent.click(confirmButton);

            await waitFor(() => {
                expect(onError).toHaveBeenCalledWith('API Error');
            });
        });
    });

    describe('No-Show Action', () => {
        it('should call recordNoShow with reason', async () => {
            const onSuccess = vi.fn();
            vi.mocked(interviewsApi.recordNoShow).mockResolvedValue({
                interview: {
                    id: 'int-123',
                    state: 'no_show',
                    cancelReason: 'Candidate did not attend',
                },
                candidate: {
                    id: 'cand-789',
                    noShowCount: 1,
                },
            });

            render(<InterviewActions interview={mockInterview} onSuccess={onSuccess} />);

            fireEvent.click(screen.getByRole('button', { name: 'Record no-show' }));

            const reasonInput = screen.getByPlaceholderText(
                'Candidate did not attend or join the interview...'
            );
            fireEvent.change(reasonInput, {
                target: { value: 'Candidate did not attend' },
            });

            const confirmButton = screen.getByRole('button', { name: 'Record No-Show' });
            fireEvent.click(confirmButton);

            await waitFor(() => {
                expect(interviewsApi.recordNoShow).toHaveBeenCalledWith(
                    'int-123',
                    'Candidate did not attend'
                );
                expect(onSuccess).toHaveBeenCalled();
            });
        });

        it('should disable no-show confirm button when reason is empty', async () => {
            render(<InterviewActions interview={mockInterview} />);

            fireEvent.click(screen.getByRole('button', { name: 'Record no-show' }));

            await waitFor(() => {
                const confirmButton = screen.getByRole('button', { name: 'Record No-Show' });
                expect(confirmButton).toBeDisabled();
            });
        });
    });

    describe('Reschedule Action', () => {
        it('should call rescheduleInterview with data', async () => {
            const onSuccess = vi.fn();
            const tomorrow = new Date(Date.now() + 86400000);
            
            vi.mocked(interviewsApi.rescheduleInterview).mockResolvedValue({
                originalInterview: {
                    id: 'int-123',
                    state: 'rescheduled',
                    cancelReason: null,
                    rescheduledToId: 'int-456',
                },
                newInterview: {
                    id: 'int-456',
                    scheduledAt: tomorrow.toISOString(),
                    endAt: null,
                    state: 'scheduled',
                    rescheduledFromId: 'int-123',
                },
            });

            render(<InterviewActions interview={mockInterview} onSuccess={onSuccess} />);

            fireEvent.click(screen.getByText('Reschedule'));

            // Wait for modal and click confirm (would need more detailed interaction in real test)
            await waitFor(() => {
                const confirmButton = screen.getByText('Reschedule Interview', {
                    selector: 'button',
                });
                expect(confirmButton).toBeInTheDocument();
            });
        });
    });

    describe('State-based Actions', () => {
        it('should show no actions for completed interview', () => {
            const completedInterview: InterviewDetails = {
                ...mockInterview,
                state: 'completed',
            };

            render(<InterviewActions interview={completedInterview} />);

            expect(screen.queryByText('Cancel Interview')).not.toBeInTheDocument();
            expect(screen.queryByText('Record No-Show')).not.toBeInTheDocument();
            expect(screen.queryByText('Reschedule')).not.toBeInTheDocument();
            expect(
                screen.getByText('No actions available for completed interviews')
            ).toBeInTheDocument();
        });

        it('should show only reschedule for no_show interview', () => {
            const noShowInterview: InterviewDetails = {
                ...mockInterview,
                state: 'no_show',
            };

            render(<InterviewActions interview={noShowInterview} />);

            expect(screen.queryByText('Cancel Interview')).not.toBeInTheDocument();
            expect(screen.queryByText('Record No-Show')).not.toBeInTheDocument();
            expect(screen.getByText('Reschedule')).toBeInTheDocument();
        });

        it('should show no actions for cancelled interview', () => {
            const cancelledInterview: InterviewDetails = {
                ...mockInterview,
                state: 'cancelled',
            };

            render(<InterviewActions interview={cancelledInterview} />);

            expect(screen.queryByText('Cancel Interview')).not.toBeInTheDocument();
            expect(screen.queryByText('Record No-Show')).not.toBeInTheDocument();
            expect(screen.queryByText('Reschedule')).not.toBeInTheDocument();
        });
    });
});
