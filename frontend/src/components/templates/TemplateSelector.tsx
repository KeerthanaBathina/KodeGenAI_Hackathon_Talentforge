/**
 * Template Selector Component
 * 
 * Dropdown to select email templates by type and name.
 * Displays template type badge and name for easy identification.
 */

import React from 'react';
import type { Template } from '@/app/admin/templates/page';

interface TemplateSelectorProps {
    templates: Template[];
    selectedTemplateId?: string;
    onSelect: (templateId: string) => void;
}

const TEMPLATE_TYPE_LABELS: Record<string, string> = {
    offer: 'Offer Letter',
    rejection: 'Rejection',
    screening_invite: 'Screening Invite',
    interview_invite: 'Interview Invite',
    assessment_invite: 'Assessment Invite',
    withdrawal_ack: 'Withdrawal Acknowledgement',
    general: 'General',
};

export default function TemplateSelector({
    templates,
    selectedTemplateId,
    onSelect,
}: TemplateSelectorProps) {
    return (
        <div className="bg-white rounded-lg shadow p-4">
            <label
                htmlFor="template-selector"
                className="block text-sm font-medium text-gray-700 mb-2"
            >
                Select Template
            </label>
            <select
                id="template-selector"
                className="block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
                value={selectedTemplateId || ''}
                onChange={(e) => onSelect(e.target.value)}
                aria-label="Select email template to edit"
            >
                <option value="" disabled>
                    Choose a template...
                </option>
                {templates.map((template) => (
                    <option key={template.id} value={template.id}>
                        [{TEMPLATE_TYPE_LABELS[template.type] || template.type}] {template.name} ({template.locale})
                    </option>
                ))}
            </select>
            
            {selectedTemplateId && (
                <div className="mt-3 text-xs text-gray-500">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        Version {templates.find(t => t.id === selectedTemplateId)?.versionNumber}
                    </span>
                    <span className="ml-2">
                        {templates.find(t => t.id === selectedTemplateId)?.isActive ? '(Active)' : '(Inactive)'}
                    </span>
                </div>
            )}
        </div>
    );
}
