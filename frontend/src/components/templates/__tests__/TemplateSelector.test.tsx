/**
 * Template Selector Component Tests
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import TemplateSelector from '../TemplateSelector';
import type { Template } from '@/app/admin/templates/page';

describe('TemplateSelector', () => {
    const mockTemplates: Template[] = [
        {
            id: '1',
            name: 'Welcome Email',
            type: 'general',
            locale: 'en',
            subject: 'Welcome!',
            bodyHtml: '<p>Welcome</p>',
            bodyText: 'Welcome',
            versionNumber: 1,
            isActive: true,
        },
        {
            id: '2',
            name: 'Interview Invitation',
            type: 'interview_invite',
            locale: 'en',
            subject: 'Interview Scheduled',
            bodyHtml: '<p>Interview details</p>',
            bodyText: 'Interview details',
            versionNumber: 2,
            isActive: true,
        },
        {
            id: '3',
            name: 'Offer Letter',
            type: 'offer',
            locale: 'en',
            subject: 'Job Offer',
            bodyHtml: '<p>Offer details</p>',
            bodyText: 'Offer details',
            versionNumber: 1,
            isActive: false,
        },
    ];

    it('should render template selector with label', () => {
        const onSelect = vi.fn();
        render(
            <TemplateSelector
                templates={mockTemplates}
                onSelect={onSelect}
            />
        );

        expect(screen.getByLabelText('Select email template to edit')).toBeInTheDocument();
        expect(screen.getByText('Select Template')).toBeInTheDocument();
    });

    it('should display all templates in dropdown', () => {
        const onSelect = vi.fn();
        render(
            <TemplateSelector
                templates={mockTemplates}
                onSelect={onSelect}
            />
        );

        const select = screen.getByLabelText('Select email template to edit') as HTMLSelectElement;
        expect(select.options).toHaveLength(4); // 3 templates + 1 disabled default option
        expect(select.options[0].text).toBe('Choose a template...');
        expect(select.options[1].text).toContain('Welcome Email');
        expect(select.options[2].text).toContain('Interview Invitation');
        expect(select.options[3].text).toContain('Offer Letter');
    });

    it('should call onSelect when template is selected', () => {
        const onSelect = vi.fn();
        render(
            <TemplateSelector
                templates={mockTemplates}
                onSelect={onSelect}
            />
        );

        const select = screen.getByLabelText('Select email template to edit') as HTMLSelectElement;
        fireEvent.change(select, { target: { value: '2' } });

        expect(onSelect).toHaveBeenCalledWith('2');
    });

    it('should display selected template with version number', () => {
        const onSelect = vi.fn();
        render(
            <TemplateSelector
                templates={mockTemplates}
                selectedTemplateId="2"
                onSelect={onSelect}
            />
        );

        expect(screen.getByText('Version 2')).toBeInTheDocument();
        expect(screen.getByText('(Active)')).toBeInTheDocument();
    });

    it('should display inactive status for inactive templates', () => {
        const onSelect = vi.fn();
        render(
            <TemplateSelector
                templates={mockTemplates}
                selectedTemplateId="3"
                onSelect={onSelect}
            />
        );

        expect(screen.getByText('Version 1')).toBeInTheDocument();
        expect(screen.getByText('(Inactive)')).toBeInTheDocument();
    });

    it('should display template type labels correctly', () => {
        const onSelect = vi.fn();
        render(
            <TemplateSelector
                templates={mockTemplates}
                onSelect={onSelect}
            />
        );

        const select = screen.getByLabelText('Select email template to edit') as HTMLSelectElement;
        expect(select.options[1].text).toContain('[General]');
        expect(select.options[2].text).toContain('[Interview Invite]');
        expect(select.options[3].text).toContain('[Offer Letter]');
    });

    it('should not display version info when no template is selected', () => {
        const onSelect = vi.fn();
        render(
            <TemplateSelector
                templates={mockTemplates}
                onSelect={onSelect}
            />
        );

        expect(screen.queryByText(/Version/)).not.toBeInTheDocument();
    });
});
