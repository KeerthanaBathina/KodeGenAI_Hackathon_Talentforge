import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { CancelDialog } from '../CancelDialog';

describe('CancelDialog', () => {
    it('should render cancel dialog with warning message', () => {
        const onConfirm = vi.fn();
        const onCancel = vi.fn();

        render(
            <CancelDialog onConfirm={onConfirm} onCancel={onCancel} isLoading={false} />
        );

        expect(screen.getByRole('heading', { name: 'Cancel Interview' })).toBeInTheDocument();
        expect(
            screen.getByText(/Are you sure you want to cancel this interview/)
        ).toBeInTheDocument();
    });

    it('should call onConfirm with reason when cancel button is clicked', () => {
        const onConfirm = vi.fn();
        const onCancel = vi.fn();

        render(
            <CancelDialog onConfirm={onConfirm} onCancel={onCancel} isLoading={false} />
        );

        const reasonInput = screen.getByPlaceholderText(
            'Provide a reason for cancellation...'
        );
        fireEvent.change(reasonInput, { target: { value: 'Test reason' } });

        const cancelButton = screen.getByText('Cancel Interview', {
            selector: 'button',
        });
        fireEvent.click(cancelButton);

        expect(onConfirm).toHaveBeenCalledWith('Test reason');
    });

    it('should call onConfirm with undefined when reason is empty', () => {
        const onConfirm = vi.fn();
        const onCancel = vi.fn();

        render(
            <CancelDialog onConfirm={onConfirm} onCancel={onCancel} isLoading={false} />
        );

        const cancelButton = screen.getByText('Cancel Interview', {
            selector: 'button',
        });
        fireEvent.click(cancelButton);

        expect(onConfirm).toHaveBeenCalledWith(undefined);
    });

    it('should call onCancel when keep interview button is clicked', () => {
        const onConfirm = vi.fn();
        const onCancel = vi.fn();

        render(
            <CancelDialog onConfirm={onConfirm} onCancel={onCancel} isLoading={false} />
        );

        const keepButton = screen.getByText('Keep Interview');
        fireEvent.click(keepButton);

        expect(onCancel).toHaveBeenCalled();
        expect(onConfirm).not.toHaveBeenCalled();
    });

    it('should disable inputs when isLoading is true', () => {
        const onConfirm = vi.fn();
        const onCancel = vi.fn();

        render(
            <CancelDialog onConfirm={onConfirm} onCancel={onCancel} isLoading />
        );

        const reasonInput = screen.getByPlaceholderText(
            'Provide a reason for cancellation...'
        );
        expect(reasonInput).toBeDisabled();

        const cancelButton = screen.getByText('Cancelling...');
        expect(cancelButton).toBeDisabled();

        const keepButton = screen.getByText('Keep Interview');
        expect(keepButton).toBeDisabled();
    });
});
