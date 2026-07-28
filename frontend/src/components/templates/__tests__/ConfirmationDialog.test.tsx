/**
 * Confirmation Dialog Component Tests
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ConfirmationDialog from '../ConfirmationDialog';

describe('ConfirmationDialog', () => {
    it('should not render when isOpen is false', () => {
        const onConfirm = vi.fn();
        const onCancel = vi.fn();
        
        render(
            <ConfirmationDialog
                isOpen={false}
                title="Test Dialog"
                message="Test message"
                onConfirm={onConfirm}
                onCancel={onCancel}
            />
        );

        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('should render when isOpen is true', () => {
        const onConfirm = vi.fn();
        const onCancel = vi.fn();
        
        render(
            <ConfirmationDialog
                isOpen={true}
                title="Test Dialog"
                message="Test message"
                onConfirm={onConfirm}
                onCancel={onCancel}
            />
        );

        expect(screen.getByRole('dialog')).toBeInTheDocument();
        expect(screen.getByText('Test Dialog')).toBeInTheDocument();
        expect(screen.getByText('Test message')).toBeInTheDocument();
    });

    it('should display custom button labels', () => {
        const onConfirm = vi.fn();
        const onCancel = vi.fn();
        
        render(
            <ConfirmationDialog
                isOpen={true}
                title="Test Dialog"
                message="Test message"
                confirmLabel="Yes, do it"
                cancelLabel="No, cancel"
                onConfirm={onConfirm}
                onCancel={onCancel}
            />
        );

        expect(screen.getByRole('button', { name: 'Yes, do it' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'No, cancel' })).toBeInTheDocument();
    });

    it('should use default button labels when not provided', () => {
        const onConfirm = vi.fn();
        const onCancel = vi.fn();
        
        render(
            <ConfirmationDialog
                isOpen={true}
                title="Test Dialog"
                message="Test message"
                onConfirm={onConfirm}
                onCancel={onCancel}
            />
        );

        expect(screen.getByRole('button', { name: 'Confirm' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    });

    it('should call onConfirm when confirm button is clicked', () => {
        const onConfirm = vi.fn();
        const onCancel = vi.fn();
        
        render(
            <ConfirmationDialog
                isOpen={true}
                title="Test Dialog"
                message="Test message"
                onConfirm={onConfirm}
                onCancel={onCancel}
            />
        );

        fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
        expect(onConfirm).toHaveBeenCalledTimes(1);
    });

    it('should call onCancel when cancel button is clicked', () => {
        const onConfirm = vi.fn();
        const onCancel = vi.fn();
        
        render(
            <ConfirmationDialog
                isOpen={true}
                title="Test Dialog"
                message="Test message"
                onConfirm={onConfirm}
                onCancel={onCancel}
            />
        );

        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it('should call onCancel when overlay is clicked', () => {
        const onConfirm = vi.fn();
        const onCancel = vi.fn();
        
        render(
            <ConfirmationDialog
                isOpen={true}
                title="Test Dialog"
                message="Test message"
                onConfirm={onConfirm}
                onCancel={onCancel}
            />
        );

        const overlay = document.querySelector('.bg-gray-500.bg-opacity-75');
        if (overlay) {
            fireEvent.click(overlay);
        }
        
        expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it('should call onCancel when Escape key is pressed', () => {
        const onConfirm = vi.fn();
        const onCancel = vi.fn();
        
        render(
            <ConfirmationDialog
                isOpen={true}
                title="Test Dialog"
                message="Test message"
                onConfirm={onConfirm}
                onCancel={onCancel}
            />
        );

        fireEvent.keyDown(document, { key: 'Escape' });
        expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it('should render info variant correctly', () => {
        const onConfirm = vi.fn();
        const onCancel = vi.fn();
        
        render(
            <ConfirmationDialog
                isOpen={true}
                title="Info Dialog"
                message="Information message"
                variant="info"
                onConfirm={onConfirm}
                onCancel={onCancel}
            />
        );

        const confirmButton = screen.getByRole('button', { name: 'Confirm' });
        expect(confirmButton).toHaveClass('bg-blue-600');
    });

    it('should render warning variant correctly', () => {
        const onConfirm = vi.fn();
        const onCancel = vi.fn();
        
        render(
            <ConfirmationDialog
                isOpen={true}
                title="Warning Dialog"
                message="Warning message"
                variant="warning"
                onConfirm={onConfirm}
                onCancel={onCancel}
            />
        );

        const confirmButton = screen.getByRole('button', { name: 'Confirm' });
        expect(confirmButton).toHaveClass('bg-yellow-600');
    });

    it('should render danger variant correctly', () => {
        const onConfirm = vi.fn();
        const onCancel = vi.fn();
        
        render(
            <ConfirmationDialog
                isOpen={true}
                title="Danger Dialog"
                message="Danger message"
                variant="danger"
                onConfirm={onConfirm}
                onCancel={onCancel}
            />
        );

        const confirmButton = screen.getByRole('button', { name: 'Confirm' });
        expect(confirmButton).toHaveClass('bg-red-600');
    });

    it('should render ReactNode message', () => {
        const onConfirm = vi.fn();
        const onCancel = vi.fn();
        
        const message = (
            <div>
                <p>First paragraph</p>
                <p>Second paragraph</p>
            </div>
        );
        
        render(
            <ConfirmationDialog
                isOpen={true}
                title="Test Dialog"
                message={message}
                onConfirm={onConfirm}
                onCancel={onCancel}
            />
        );

        expect(screen.getByText('First paragraph')).toBeInTheDocument();
        expect(screen.getByText('Second paragraph')).toBeInTheDocument();
    });
});
