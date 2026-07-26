import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { RescheduleModal } from '../RescheduleModal';
import { InterviewDetails } from '../../../types/interview';

describe('RescheduleModal', () => {
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

    it('should render reschedule modal with form fields', () => {
        const onConfirm = vi.fn();
        const onCancel = vi.fn();

        render(
            <RescheduleModal
                interview={mockInterview}
                onConfirm={onConfirm}
                onCancel={onCancel}
                isLoading={false}
            />
        );

        expect(screen.getByRole('heading', { name: 'Reschedule Interview' })).toBeInTheDocument();
        expect(screen.getByLabelText(/New Date & Time/)).toBeInTheDocument();
        expect(screen.getByLabelText(/Duration \(minutes\)/)).toBeInTheDocument();
        expect(screen.getByLabelText('Meeting Link')).toBeInTheDocument();
        expect(screen.getByLabelText('Or Physical Location')).toBeInTheDocument();
        expect(screen.getByLabelText('Reason (Optional)')).toBeInTheDocument();
    });

    it('should show no-show info banner when rescheduling after no-show', () => {
        const noShowInterview: InterviewDetails = {
            ...mockInterview,
            state: 'no_show',
        };

        const onConfirm = vi.fn();
        const onCancel = vi.fn();

        render(
            <RescheduleModal
                interview={noShowInterview}
                onConfirm={onConfirm}
                onCancel={onCancel}
                isLoading={false}
            />
        );

        expect(screen.getByText(/Rescheduling After No-Show/)).toBeInTheDocument();
        expect(
            screen.getByText(/This will create a new interview and send updated invites/)
        ).toBeInTheDocument();
    });

    it('should validate that new time is in the future', async () => {
        const onConfirm = vi.fn();
        const onCancel = vi.fn();

        render(
            <RescheduleModal
                interview={mockInterview}
                onConfirm={onConfirm}
                onCancel={onCancel}
                isLoading={false}
            />
        );

        // Try to set a past date
        const dateInput = screen.getByLabelText(/New Date & Time/);
        const pastDate = new Date(Date.now() - 86400000); // yesterday
        fireEvent.change(dateInput, {
            target: { value: pastDate.toISOString().slice(0, 16) },
        });

        const confirmButton = screen.getByText('Reschedule Interview', {
            selector: 'button',
        });
        fireEvent.click(confirmButton);

        await waitFor(() => {
            expect(screen.getByText('New time must be in the future')).toBeInTheDocument();
            expect(onConfirm).not.toHaveBeenCalled();
        });
    });

    it('should validate duration is within allowed range', async () => {
        const onConfirm = vi.fn();
        const onCancel = vi.fn();

        render(
            <RescheduleModal
                interview={mockInterview}
                onConfirm={onConfirm}
                onCancel={onCancel}
                isLoading={false}
            />
        );

        const durationInput = screen.getByLabelText(/Duration \(minutes\)/);
        fireEvent.change(durationInput, { target: { value: '10' } }); // Too short

        const confirmButton = screen.getByText('Reschedule Interview', {
            selector: 'button',
        });
        fireEvent.click(confirmButton);

        await waitFor(() => {
            expect(
                screen.getByText('Duration must be between 15 and 480 minutes')
            ).toBeInTheDocument();
            expect(onConfirm).not.toHaveBeenCalled();
        });
    });

    it('should validate that either meeting link or location is provided', async () => {
        const interviewWithoutLocation: InterviewDetails = {
            ...mockInterview,
            meetingLink: undefined,
            location: undefined,
        };

        const onConfirm = vi.fn();
        const onCancel = vi.fn();

        render(
            <RescheduleModal
                interview={interviewWithoutLocation}
                onConfirm={onConfirm}
                onCancel={onCancel}
                isLoading={false}
            />
        );

        const confirmButton = screen.getByText('Reschedule Interview', {
            selector: 'button',
        });
        fireEvent.click(confirmButton);

        await waitFor(() => {
            expect(
                screen.getByText('Provide either a meeting link or location')
            ).toBeInTheDocument();
            expect(onConfirm).not.toHaveBeenCalled();
        });
    });

    it('should call onConfirm with reschedule data when valid', async () => {
        const onConfirm = vi.fn();
        const onCancel = vi.fn();

        render(
            <RescheduleModal
                interview={mockInterview}
                onConfirm={onConfirm}
                onCancel={onCancel}
                isLoading={false}
            />
        );

        const durationInput = screen.getByLabelText(/Duration \(minutes\)/);
        fireEvent.change(durationInput, { target: { value: '90' } });

        const reasonInput = screen.getByLabelText('Reason (Optional)');
        fireEvent.change(reasonInput, { target: { value: 'Schedule conflict' } });

        const confirmButton = screen.getByText('Reschedule Interview', {
            selector: 'button',
        });
        fireEvent.click(confirmButton);

        await waitFor(() => {
            expect(onConfirm).toHaveBeenCalledWith(
                expect.objectContaining({
                    newDuration: 90,
                    newMeetingLink: 'https://meet.google.com/abc',
                    reason: 'Schedule conflict',
                })
            );
        });
    });

    it('should call onCancel when cancel button is clicked', () => {
        const onConfirm = vi.fn();
        const onCancel = vi.fn();

        render(
            <RescheduleModal
                interview={mockInterview}
                onConfirm={onConfirm}
                onCancel={onCancel}
                isLoading={false}
            />
        );

        const cancelButton = screen.getByText('Cancel');
        fireEvent.click(cancelButton);

        expect(onCancel).toHaveBeenCalled();
        expect(onConfirm).not.toHaveBeenCalled();
    });

    it('should disable all inputs when isLoading is true', () => {
        const onConfirm = vi.fn();
        const onCancel = vi.fn();

        render(
            <RescheduleModal
                interview={mockInterview}
                onConfirm={onConfirm}
                onCancel={onCancel}
                isLoading
            />
        );

        expect(screen.getByLabelText(/New Date & Time/)).toBeDisabled();
        expect(screen.getByLabelText(/Duration \(minutes\)/)).toBeDisabled();
        expect(screen.getByLabelText('Meeting Link')).toBeDisabled();
        expect(screen.getByLabelText('Or Physical Location')).toBeDisabled();
        expect(screen.getByLabelText('Reason (Optional)')).toBeDisabled();

        const confirmButton = screen.getByText('Rescheduling...');
        expect(confirmButton).toBeDisabled();

        const cancelButton = screen.getByText('Cancel');
        expect(cancelButton).toBeDisabled();
    });

    it('should pre-fill form with current interview details', () => {
        const onConfirm = vi.fn();
        const onCancel = vi.fn();

        render(
            <RescheduleModal
                interview={mockInterview}
                onConfirm={onConfirm}
                onCancel={onCancel}
                isLoading={false}
            />
        );

        const durationInput = screen.getByLabelText(
            /Duration \(minutes\)/
        ) as HTMLInputElement;
        expect(durationInput.value).toBe('60');

        const meetingLinkInput = screen.getByLabelText('Meeting Link') as HTMLInputElement;
        expect(meetingLinkInput.value).toBe('https://meet.google.com/abc');
    });
});
