/**
 * Token Inserter Component Tests
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import TokenInserter from '../TokenInserter';

describe('TokenInserter', () => {
    it('should render insert token button', () => {
        const onInsertToken = vi.fn();
        render(
            <TokenInserter
                templateType="general"
                onInsertToken={onInsertToken}
            />
        );

        expect(screen.getByRole('button', { name: /insert token/i })).toBeInTheDocument();
    });

    it('should open dropdown when button is clicked', () => {
        const onInsertToken = vi.fn();
        render(
            <TokenInserter
                templateType="general"
                onInsertToken={onInsertToken}
            />
        );

        const button = screen.getByRole('button', { name: /insert token/i });
        fireEvent.click(button);

        expect(screen.getByRole('menu')).toBeInTheDocument();
    });

    it('should display tokens for general template type', () => {
        const onInsertToken = vi.fn();
        render(
            <TokenInserter
                templateType="general"
                onInsertToken={onInsertToken}
            />
        );

        fireEvent.click(screen.getByRole('button', { name: /insert token/i }));

        expect(screen.getByText('{{recipient_name}}')).toBeInTheDocument();
        expect(screen.getByText('{{company_name}}')).toBeInTheDocument();
        expect(screen.getByText('{{support_email}}')).toBeInTheDocument();
    });

    it('should display tokens for offer template type', () => {
        const onInsertToken = vi.fn();
        render(
            <TokenInserter
                templateType="offer"
                onInsertToken={onInsertToken}
            />
        );

        fireEvent.click(screen.getByRole('button', { name: /insert token/i }));

        expect(screen.getByText('{{candidate_name}}')).toBeInTheDocument();
        expect(screen.getByText('{{role_title}}')).toBeInTheDocument();
        expect(screen.getByText('{{salary}}')).toBeInTheDocument();
        expect(screen.getByText('{{start_date}}')).toBeInTheDocument();
    });

    it('should display tokens for interview_invite template type', () => {
        const onInsertToken = vi.fn();
        render(
            <TokenInserter
                templateType="interview_invite"
                onInsertToken={onInsertToken}
            />
        );

        fireEvent.click(screen.getByRole('button', { name: /insert token/i }));

        expect(screen.getByText('{{candidate_name}}')).toBeInTheDocument();
        expect(screen.getByText('{{interview_date}}')).toBeInTheDocument();
        expect(screen.getByText('{{interview_time}}')).toBeInTheDocument();
        expect(screen.getByText('{{meeting_link}}')).toBeInTheDocument();
    });

    it('should call onInsertToken when token is clicked', () => {
        const onInsertToken = vi.fn();
        render(
            <TokenInserter
                templateType="general"
                onInsertToken={onInsertToken}
            />
        );

        fireEvent.click(screen.getByRole('button', { name: /insert token/i }));
        
        const tokenButton = screen.getByText('{{recipient_name}}').closest('button');
        if (tokenButton) {
            fireEvent.click(tokenButton);
        }

        expect(onInsertToken).toHaveBeenCalledWith('recipient_name');
    });

    it('should close dropdown after token insertion', () => {
        const onInsertToken = vi.fn();
        render(
            <TokenInserter
                templateType="general"
                onInsertToken={onInsertToken}
            />
        );

        fireEvent.click(screen.getByRole('button', { name: /insert token/i }));
        expect(screen.getByRole('menu')).toBeInTheDocument();

        const tokenButton = screen.getByText('{{recipient_name}}').closest('button');
        if (tokenButton) {
            fireEvent.click(tokenButton);
        }

        expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });

    it('should close dropdown when clicking outside', () => {
        const onInsertToken = vi.fn();
        render(
            <TokenInserter
                templateType="general"
                onInsertToken={onInsertToken}
            />
        );

        fireEvent.click(screen.getByRole('button', { name: /insert token/i }));
        expect(screen.getByRole('menu')).toBeInTheDocument();

        // Click backdrop
        const backdrop = document.querySelector('.fixed.inset-0');
        if (backdrop) {
            fireEvent.click(backdrop);
        }

        expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });

    it('should display token descriptions', () => {
        const onInsertToken = vi.fn();
        render(
            <TokenInserter
                templateType="offer"
                onInsertToken={onInsertToken}
            />
        );

        fireEvent.click(screen.getByRole('button', { name: /insert token/i }));

        expect(screen.getByText('Candidate\'s full name')).toBeInTheDocument();
        expect(screen.getByText('Job position title')).toBeInTheDocument();
        expect(screen.getByText('Annual salary')).toBeInTheDocument();
    });

    it('should handle unknown template type gracefully', () => {
        const onInsertToken = vi.fn();
        render(
            <TokenInserter
                templateType="unknown_type"
                onInsertToken={onInsertToken}
            />
        );

        fireEvent.click(screen.getByRole('button', { name: /insert token/i }));

        expect(screen.getByText('No tokens available for this template type')).toBeInTheDocument();
    });
});
