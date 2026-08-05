/**
 * Template Selector Component
 * 
 * Sidebar list selector for template editing.
 * Supports lightweight channel filtering and active-item highlighting.
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

type TemplateChannel = 'all' | 'email' | 'sms';

function inferTemplateChannel(type: string): Exclude<TemplateChannel, 'all'> {
    return type.toLowerCase().includes('sms') ? 'sms' : 'email';
}

export default function TemplateSelector({
    templates,
    selectedTemplateId,
    onSelect,
}: TemplateSelectorProps) {
    const [channelFilter, setChannelFilter] = React.useState<TemplateChannel>('all');

    const filteredTemplates = React.useMemo(() => {
        if (channelFilter === 'all') {
            return templates;
        }

        return templates.filter((template) => inferTemplateChannel(template.type) === channelFilter);
    }, [templates, channelFilter]);

    return (
        <aside className="flex h-full min-h-[560px] flex-col rounded-2xl border border-[var(--admin-color-border)] bg-[var(--admin-color-surface-1)]">
            <div className="flex items-center justify-between border-b border-[var(--admin-color-border)] px-3 py-3">
                <h2 className="admin-heading text-sm font-semibold text-[var(--admin-color-ink-primary)]">Templates</h2>
                <button
                    type="button"
                    disabled
                    className="text-xs font-semibold text-[var(--admin-color-brand-primary)] opacity-70"
                    title="Template creation is not enabled in this environment."
                >
                    + New
                </button>
            </div>

            <div className="grid grid-cols-3 gap-1 border-b border-[var(--admin-color-border)] px-2 py-2">
                {(['all', 'email', 'sms'] as TemplateChannel[]).map((channel) => {
                    const isActive = channelFilter === channel;
                    return (
                        <button
                            key={channel}
                            type="button"
                            onClick={() => setChannelFilter(channel)}
                            className={`h-7 rounded-md border text-[11px] font-semibold uppercase tracking-[0.04em] transition ${
                                isActive
                                    ? 'border-[var(--admin-color-brand-primary)] bg-[var(--admin-color-brand-primary)] text-white'
                                    : 'border-[var(--admin-color-border)] bg-[var(--admin-color-surface-0)] text-[var(--admin-color-ink-secondary)] hover:bg-[var(--admin-color-surface-2)]'
                            }`}
                        >
                            {channel}
                        </button>
                    );
                })}
            </div>

            <div className="flex-1 overflow-y-auto">
                {filteredTemplates.length === 0 ? (
                    <p className="px-3 py-4 text-sm text-[var(--admin-color-ink-secondary)]">No templates available.</p>
                ) : (
                    <ul>
                        {filteredTemplates.map((template) => {
                            const active = selectedTemplateId === template.id;
                            const statusText = template.isActive ? 'Active' : 'Draft';
                            const typeLabel = TEMPLATE_TYPE_LABELS[template.type] || template.type;
                            return (
                                <li key={template.id}>
                                    <button
                                        type="button"
                                        onClick={() => onSelect(template.id)}
                                        className={`w-full border-b border-[var(--admin-color-border)] px-3 py-2 text-left transition ${
                                            active
                                                ? 'border-r-2 border-r-[var(--admin-color-brand-primary)] bg-indigo-50'
                                                : 'bg-transparent hover:bg-[var(--admin-color-surface-2)]'
                                        }`}
                                        aria-current={active ? 'true' : undefined}
                                        aria-label={`Select template ${template.name}`}
                                    >
                                        <p className="truncate text-sm font-semibold text-[var(--admin-color-ink-primary)]">{template.name}</p>
                                        <p className="mt-0.5 text-xs text-[var(--admin-color-ink-tertiary)]">
                                            {typeLabel} · {template.locale} · v{template.versionNumber} · {statusText}
                                        </p>
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>
        </aside>
    );
}
