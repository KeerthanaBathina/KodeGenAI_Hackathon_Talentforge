import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { NoShowDialog } from '../NoShowDialog';

describe('NoShowDialog', () => {
    it('should render no-show dialog with warning', () => {
        const onConfirm = vi.fn();
        const onCancel = vi.fn();

        render(
            <NoShowDialog onConfirm={onConfirm} onCancel={onCancel} isLoading={false} />
        );

        expect(screen.getByRole('heading', { name: 'Record No-Show' })).toBeInTheDocument();
        expect(screen.getByText(/Recording No-Show/)).toBeInTheDocument();
        expect(
            screen.getByText(
                /This will increment the candidate's no-show count/
            )
        ).toBeInTheDocument();
    });

    it('should disable confirm button when reason is empty', () => {
        const onConfirm = vi.fn();
        const onCancel = vi.fn();

        render(
            <NoShowDialog onConfirm={onConfirm} onCancel={onCancel} isLoading={false} />
        );

        const confirmButton = screen.getByRole('button', { name: 'Record No-Show' });
        expect(confirmButton).toBeDisabled();
    });

    it('should call onConfirm with reason when reason is provided', async () => {
        const onConfirm = vi.fn();
        const onCancel = vi.fn();

        render(
            <NoShowDialog onConfirm={onConfirm} onCancel={onCancel} isLoading={false} />
        );

        const reasonInput = screen.getByPlaceholderText(
            'Candidate did not attend or join the interview...'
        );
        fireEvent.change(reasonInput, {
            target: { value: 'Candidate did not join' },
        });

        const confirmButton = screen.getByRole('button', { name: 'Record No-Show' });
        fireEvent.click(confirmButton);

        await waitFor(() => {
            expect(onConfirm).toHaveBeenCalledWith('Candidate did not join');
        });
    });

    it('should enable confirm button when reason is provided', async () => {
        const onConfirm = vi.fn();
        const onCancel = vi.fn();

        render(
            <NoShowDialog onConfirm={onConfirm} onCancel={onCancel} isLoading={false} />
        );

        const confirmButton = screen.getByRole('button', { name: 'Record No-Show' });
        expect(confirmButton).toBeDisabled();

        const reasonInput = screen.getByPlaceholderText(
            'Candidate did not attend or join the interview...'
        );
        fireEvent.change(reasonInput, { target: { value: 'New reason' } });

        await waitFor(() => {
            expect(confirmButton).not.toBeDisabled();
        });
    });

    it('should call onCancel when cancel button is clicked', () => {
        const onConfirm = vi.fn();
        const onCancel = vi.fn();

        render(
            <NoShowDialog onConfirm={onConfirm} onCancel={onCancel} isLoading={false} />
        );

        const cancelButton = screen.getByText('Cancel');
        fireEvent.click(cancelButton);

        expect(onCancel).toHaveBeenCalled();
        expect(onConfirm).not.toHaveBeenCalled();
    });

    it('should disable inputs when isLoading is true', () => {
        const onConfirm = vi.fn();
        const onCancel = vi.fn();

        render(
            <NoShowDialog onConfirm={onConfirm} onCancel={onCancel} isLoading />
        );

        const reasonInput = screen.getByPlaceholderText(
            'Candidate did not attend or join the interview...'
        );
        expect(reasonInput).toBeDisabled();

        const confirmButton = screen.getByRole('button', { name: 'Recording...' });
        expect(confirmButton).toBeDisabled();

        const cancelButton = screen.getByRole('button', { name: 'Cancel' });
        expect(cancelButton).toBeDisabled();
    });

    it('should disable confirm button when reason is empty', async () => {
        const onConfirm = vi.fn();
        const onCancel = vi.fn();

        render(
            <NoShowDialog onConfirm={onConfirm} onCancel={onCancel} isLoading={false} />
        );

        await waitFor(() => {
            const confirmButton = screen.getByRole('button', { name: 'Record No-Show' });
            expect(confirmButton).toBeDisabled();
        });
    });
});
