import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import UnconfirmedPanelistWarningModal from '../UnconfirmedPanelistWarningModal';
import type { UnconfirmedPanelist } from '@/lib/api/interviews';

describe('UnconfirmedPanelistWarningModal', () => {
    const mockUnconfirmedPanelists: UnconfirmedPanelist[] = [
        { id: 'panelist-1', name: 'Jane Panelist', status: 'pending' },
        { id: 'panelist-2', name: 'Bob Interviewer', status: 'declined' },
    ];

    const mockOnCancel = vi.fn();
    const mockOnConfirm = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders modal with unconfirmed panelist names', () => {
        render(
            <UnconfirmedPanelistWarningModal
                unconfirmedPanelists={mockUnconfirmedPanelists}
                onCancel={mockOnCancel}
                onConfirm={mockOnConfirm}
            />
        );

        expect(screen.getByRole('dialog')).toBeInTheDocument();
        expect(screen.getByText('Unconfirmed Panelists Warning')).toBeInTheDocument();
        expect(screen.getByText('Jane Panelist')).toBeInTheDocument();
        expect(screen.getByText('Bob Interviewer')).toBeInTheDocument();
    });

    it('displays status badges for each panelist', () => {
        render(
            <UnconfirmedPanelistWarningModal
                unconfirmedPanelists={mockUnconfirmedPanelists}
                onCancel={mockOnCancel}
                onConfirm={mockOnConfirm}
            />
        );

        expect(screen.getByText('pending')).toBeInTheDocument();
        expect(screen.getByText('declined')).toBeInTheDocument();
    });

    it('shows risk warning message', () => {
        render(
            <UnconfirmedPanelistWarningModal
                unconfirmedPanelists={mockUnconfirmedPanelists}
                onCancel={mockOnCancel}
                onConfirm={mockOnConfirm}
            />
        );

        expect(
            screen.getByText(/Notifying the candidate before all panelists confirm may result in/i)
        ).toBeInTheDocument();
    });

    it('disables notify button until checkbox is checked', async () => {
        render(
            <UnconfirmedPanelistWarningModal
                unconfirmedPanelists={mockUnconfirmedPanelists}
                onCancel={mockOnCancel}
                onConfirm={mockOnConfirm}
            />
        );

        const notifyButton = screen.getByText('Notify Anyway');
        expect(notifyButton).toBeDisabled();

        const user = userEvent.setup();
        const checkbox = screen.getByRole('checkbox');
        await user.click(checkbox);

        expect(notifyButton).not.toBeDisabled();
    });

    it('calls onConfirm with justification when notify button clicked', async () => {
        render(
            <UnconfirmedPanelistWarningModal
                unconfirmedPanelists={mockUnconfirmedPanelists}
                onCancel={mockOnCancel}
                onConfirm={mockOnConfirm}
            />
        );

        const user = userEvent.setup();

        // Enter justification
        const justificationInput = screen.getByLabelText(/Justification/i);
        await user.type(justificationInput, 'Urgent deadline requires immediate notification');

        // Check acknowledgement checkbox
        const checkbox = screen.getByRole('checkbox');
        await user.click(checkbox);

        // Click notify button
        const notifyButton = screen.getByText('Notify Anyway');
        await user.click(notifyButton);

        expect(mockOnConfirm).toHaveBeenCalledWith('Urgent deadline requires immediate notification');
    });

    it('calls onConfirm with undefined when no justification provided', async () => {
        render(
            <UnconfirmedPanelistWarningModal
                unconfirmedPanelists={mockUnconfirmedPanelists}
                onCancel={mockOnCancel}
                onConfirm={mockOnConfirm}
            />
        );

        const user = userEvent.setup();

        // Check acknowledgement checkbox without entering justification
        const checkbox = screen.getByRole('checkbox');
        await user.click(checkbox);

        // Click notify button
        const notifyButton = screen.getByText('Notify Anyway');
        await user.click(notifyButton);

        expect(mockOnConfirm).toHaveBeenCalledWith(undefined);
    });

    it('calls onCancel when cancel button clicked', async () => {
        render(
            <UnconfirmedPanelistWarningModal
                unconfirmedPanelists={mockUnconfirmedPanelists}
                onCancel={mockOnCancel}
                onConfirm={mockOnConfirm}
            />
        );

        const user = userEvent.setup();
        const cancelButton = screen.getByText('Cancel');
        await user.click(cancelButton);

        expect(mockOnCancel).toHaveBeenCalled();
    });

    it('calls onCancel when clicking outside modal', async () => {
        const { container } = render(
            <UnconfirmedPanelistWarningModal
                unconfirmedPanelists={mockUnconfirmedPanelists}
                onCancel={mockOnCancel}
                onConfirm={mockOnConfirm}
            />
        );

        const user = userEvent.setup();
        // The backdrop is the first div with fixed position
        const backdrop = container.firstChild as HTMLElement;
        
        // Simulate click on backdrop by calling the onClick directly
        // (userEvent.click doesn't work well with backdrop patterns)
        const clickEvent = new MouseEvent('click', { bubbles: true });
        Object.defineProperty(clickEvent, 'target', { value: backdrop, writable: false });
        Object.defineProperty(clickEvent, 'currentTarget', { value: backdrop, writable: false });
        backdrop.dispatchEvent(clickEvent);

        await waitFor(() => {
            expect(mockOnCancel).toHaveBeenCalled();
        });
    });

    it('disables all inputs when submitting', () => {
        render(
            <UnconfirmedPanelistWarningModal
                unconfirmedPanelists={mockUnconfirmedPanelists}
                onCancel={mockOnCancel}
                onConfirm={mockOnConfirm}
                isSubmitting={true}
            />
        );

        expect(screen.getByRole('checkbox')).toBeDisabled();
        expect(screen.getByLabelText(/Justification/i)).toBeDisabled();
        expect(screen.getByText('Cancel')).toBeDisabled();
        expect(screen.getByText('Notifying...')).toBeDisabled();
    });

    it('provides accessibility labels', () => {
        render(
            <UnconfirmedPanelistWarningModal
                unconfirmedPanelists={mockUnconfirmedPanelists}
                onCancel={mockOnCancel}
                onConfirm={mockOnConfirm}
            />
        );

        expect(screen.getByLabelText(/Acknowledge risk/i)).toBeInTheDocument();
        expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
        expect(screen.getByRole('dialog')).toHaveAttribute('aria-labelledby', 'warning-modal-title');
    });

    it('renders single panelist correctly', () => {
        const singlePanelist: UnconfirmedPanelist[] = [
            { id: 'panelist-1', name: 'Jane Panelist', status: 'pending' },
        ];

        render(
            <UnconfirmedPanelistWarningModal
                unconfirmedPanelists={singlePanelist}
                onCancel={mockOnCancel}
                onConfirm={mockOnConfirm}
            />
        );

        expect(screen.getByText('Jane Panelist')).toBeInTheDocument();
        expect(screen.queryByText('Bob Interviewer')).not.toBeInTheDocument();
    });
});
