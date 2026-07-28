/**
 * Template Preview Panel Component Tests
 */

import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import TemplatePreviewPanel from '../TemplatePreviewPanel';

describe('TemplatePreviewPanel', () => {
    const defaultProps = {
        subject: 'Test Subject',
        bodyHtml: '<p>Test HTML content</p>',
        bodyText: 'Test plain text content',
        isLoading: false,
        error: null,
    };

    it('should render preview panel with subject', () => {
        render(<TemplatePreviewPanel {...defaultProps} />);
        
        expect(screen.getByText('Preview')).toBeInTheDocument();
        expect(screen.getByText('Test Subject')).toBeInTheDocument();
    });

    it('should display "No subject" when subject is empty', () => {
        render(<TemplatePreviewPanel {...defaultProps} subject="" />);
        
        expect(screen.getByText('No subject')).toBeInTheDocument();
    });

    it('should show HTML preview tab by default', () => {
        render(<TemplatePreviewPanel {...defaultProps} />);
        
        const htmlButton = screen.getByRole('button', { name: 'HTML Preview' });
        expect(htmlButton).toHaveClass('bg-blue-100');
        expect(screen.getByTitle('HTML Preview')).toBeInTheDocument();
    });

    it('should switch to plain text preview when clicked', () => {
        render(<TemplatePreviewPanel {...defaultProps} />);
        
        const textButton = screen.getByRole('button', { name: 'Plain Text' });
        fireEvent.click(textButton);
        
        expect(textButton).toHaveClass('bg-blue-100');
        expect(screen.getByText('Test plain text content')).toBeInTheDocument();
    });

    it('should display loading state', () => {
        render(<TemplatePreviewPanel {...defaultProps} isLoading={true} />);
        
        expect(screen.getByText('Updating...')).toBeInTheDocument();
    });

    it('should display error message when error occurs', () => {
        const error = new Error('Preview failed');
        render(<TemplatePreviewPanel {...defaultProps} error={error} />);
        
        expect(screen.getByText('Preview Error')).toBeInTheDocument();
        expect(screen.getByText('Preview failed')).toBeInTheDocument();
    });

    it('should show "No plain text content" when bodyText is empty', () => {
        render(<TemplatePreviewPanel {...defaultProps} bodyText="" />);
        
        const textButton = screen.getByRole('button', { name: 'Plain Text' });
        fireEvent.click(textButton);
        
        expect(screen.getByText('No plain text content')).toBeInTheDocument();
    });

    it('should render iframe for HTML preview', () => {
        render(<TemplatePreviewPanel {...defaultProps} />);
        
        const iframe = screen.getByTitle('HTML Preview');
        expect(iframe).toHaveAttribute('sandbox', 'allow-same-origin');
    });

    it('should preserve preview mode across re-renders', () => {
        const { rerender } = render(<TemplatePreviewPanel {...defaultProps} />);
        
        // Switch to text mode
        const textButton = screen.getByRole('button', { name: 'Plain Text' });
        fireEvent.click(textButton);
        expect(textButton).toHaveClass('bg-blue-100');
        
        // Re-render with new props
        rerender(<TemplatePreviewPanel {...defaultProps} subject="Updated Subject" />);
        
        // Should still be in text mode
        expect(textButton).toHaveClass('bg-blue-100');
    });
});
