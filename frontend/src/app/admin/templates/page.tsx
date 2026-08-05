/**
 * Template Management Page
 * 
 * Admin-only page for managing email templates with rich text editing,
 * token insertion, and version history management.
 * 
 * Route: /admin/templates
 * Authorization: Admin role required
 */

'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import TemplateSelector from '@/components/templates/TemplateSelector';
import TemplateEditorForm from '@/components/templates/TemplateEditorForm';
import VersionHistorySidebar from '@/components/templates/VersionHistorySidebar';
import TemplatePreviewPanel from '@/components/templates/TemplatePreviewPanel';
import TokenDocumentationPanel from '@/components/templates/TokenDocumentationPanel';
import { AdminPageShell } from '@/components/admin/AdminPageShell';
import { useTemplatePreview } from '@/hooks/useTemplatePreview';
import { buildApiUrl } from '@/lib/api/url';

export interface Template {
    id: string;
    name: string;
    type: string;
    locale: string;
    subject: string;
    bodyHtml: string;
    bodyText: string;
    versionNumber: number;
    isActive: boolean;
}

export interface TemplateVersion {
    id: string;
    versionNumber: number;
    name: string;
    subject: string;
    bodyHtml: string;
    bodyText: string;
    createdBy: {
        name: string;
    };
    createdAt: string;
}

interface TemplateApiPayload {
    id: string;
    name: string;
    type: string;
    locale: string;
    subject: string;
    bodyHtml: string;
    bodyText: string;
    version?: number;
    versionNumber?: number;
    active?: boolean;
    isActive?: boolean;
}

interface TemplateVersionApiPayload {
    id: string;
    versionNumber: number;
    name: string;
    subject: string;
    bodyHtml: string;
    bodyText: string;
    createdBy?: {
        name?: string;
        fullName?: string;
    };
    createdAt: string;
}

function normalizeTemplate(payload: TemplateApiPayload): Template {
    return {
        id: payload.id,
        name: payload.name,
        type: payload.type,
        locale: payload.locale,
        subject: payload.subject,
        bodyHtml: payload.bodyHtml,
        bodyText: payload.bodyText,
        versionNumber:
            typeof payload.versionNumber === 'number'
                ? payload.versionNumber
                : typeof payload.version === 'number'
                  ? payload.version
                  : 1,
        isActive: typeof payload.isActive === 'boolean' ? payload.isActive : payload.active !== false,
    };
}

function normalizeTemplatesResponse(payload: unknown): Template[] {
    const response = payload as {
        templates?: unknown;
        data?: unknown;
    };

    const templates = Array.isArray(response?.templates)
        ? response.templates
        : Array.isArray(response?.data)
          ? response.data
          : [];

    return templates.map((template) => normalizeTemplate(template as TemplateApiPayload));
}

function normalizeVersionsResponse(payload: unknown): TemplateVersion[] {
    const response = payload as {
        versions?: unknown;
        data?: unknown;
    };

    const versions = Array.isArray(response?.versions)
        ? response.versions
        : Array.isArray(response?.data)
          ? response.data
          : [];

    return versions.map((version) => {
        const item = version as TemplateVersionApiPayload;

        return {
            id: item.id,
            versionNumber: item.versionNumber,
            name: item.name,
            subject: item.subject,
            bodyHtml: item.bodyHtml,
            bodyText: item.bodyText,
            createdBy: {
                name: item.createdBy?.name || item.createdBy?.fullName || 'Unknown',
            },
            createdAt: item.createdAt,
        };
    });
}

export default function TemplateManagementPage() {
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(true);
    const [isAuthorized, setIsAuthorized] = useState(false);
    const [templates, setTemplates] = useState<Template[]>([]);
    const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
    const [versions, setVersions] = useState<TemplateVersion[]>([]);
    const [isSaving, setIsSaving] = useState(false);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
    
    // Preview state
    const [editorContent, setEditorContent] = useState({
        subject: '',
        bodyHtml: '',
        bodyText: '',
    });
    const [sampleData, setSampleData] = useState<Record<string, string>>({});
    
    // Live preview with debouncing
    const { preview, missingTokens, isLoading: isPreviewLoading, error: previewError } = useTemplatePreview(
        editorContent,
        sampleData,
        { enabled: !!selectedTemplate }
    );

    // Check authorization and load templates
    useEffect(() => {
        async function checkAuthAndLoadTemplates() {
            try {
                // TODO: Replace with actual auth check when auth service is ready
                // For now, assuming user is authorized if they can fetch templates
                const response = await fetch(buildApiUrl('/api/templates'), {
                    credentials: 'include',
                });

                if (response.status === 403) {
                    // Not authorized - redirect to home
                    router.push('/');
                    return;
                }

                if (!response.ok) {
                    throw new Error('Failed to load templates');
                }

                const data = await response.json();
                setTemplates(normalizeTemplatesResponse(data));
                setIsAuthorized(true);
            } catch (error) {
                console.error('Error loading templates:', error);
                setToast({
                    message: 'Failed to load templates. Please try again.',
                    type: 'error',
                });
            } finally {
                setIsLoading(false);
            }
        }

        checkAuthAndLoadTemplates();
    }, [router]);

    // Load version history when template is selected
    useEffect(() => {
        if (!selectedTemplate) {
            setVersions([]);
            return;
        }

        async function loadVersionHistory() {
            if (!selectedTemplate) return;
            
            try {
                const response = await fetch(
                    buildApiUrl(`/api/templates/${selectedTemplate.id}/versions`),
                    {
                        credentials: 'include',
                    }
                );

                if (!response.ok) {
                    throw new Error('Failed to load version history');
                }

                const data = await response.json();
                setVersions(normalizeVersionsResponse(data));
            } catch (error) {
                console.error('Error loading version history:', error);
                setToast({
                    message: 'Failed to load version history.',
                    type: 'error',
                });
            }
        }

        loadVersionHistory();
    }, [selectedTemplate]);

    // Load sample data when template type changes
    useEffect(() => {
        if (!selectedTemplate) {
            setSampleData({});
            return;
        }

        async function loadSampleData() {
            if (!selectedTemplate) return;
            
            try {
                const response = await fetch(
                    buildApiUrl(`/api/templates/sample-data/${selectedTemplate.type}`),
                    {
                        credentials: 'include',
                    }
                );

                if (response.ok) {
                    const data = await response.json();
                    setSampleData(data.sampleData || {});
                }
            } catch (error) {
                console.error('Error loading sample data:', error);
            }
        }

        loadSampleData();
    }, [selectedTemplate]);

    // Update editor content when template changes
    useEffect(() => {
        if (selectedTemplate) {
            setEditorContent({
                subject: selectedTemplate.subject,
                bodyHtml: selectedTemplate.bodyHtml,
                bodyText: selectedTemplate.bodyText,
            });
        }
    }, [selectedTemplate]);

    const handleTemplateSelect = (templateId: string) => {
        const template = templates.find((t) => t.id === templateId);
        setSelectedTemplate(template || null);
    };

    const handleEditorChange = (content: {
        subject: string;
        bodyHtml: string;
        bodyText: string;
    }) => {
        setEditorContent(content);
    };

    const handleSave = async (data: {
        name: string;
        subject: string;
        bodyHtml: string;
        bodyText: string;
    }) => {
        if (!selectedTemplate) return;

        setIsSaving(true);
        try {
            const response = await fetch(
                buildApiUrl(`/api/templates/${selectedTemplate.id}`),
                {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    credentials: 'include',
                    body: JSON.stringify(data),
                }
            );

            if (!response.ok) {
                throw new Error('Failed to save template');
            }

            const updatedTemplatePayload = await response.json();
            const updatedTemplate = normalizeTemplate({
                ...(updatedTemplatePayload.template || updatedTemplatePayload.data || updatedTemplatePayload),
                versionNumber:
                    typeof updatedTemplatePayload.version === 'number'
                        ? updatedTemplatePayload.version
                        : undefined,
            } as TemplateApiPayload);
            
            // Update local state
            setTemplates((prev) =>
                prev.map((t) =>
                    t.id === selectedTemplate.id
                        ? { ...t, ...updatedTemplate }
                        : t
                )
            );
            setSelectedTemplate((prev) =>
                prev ? { ...prev, ...updatedTemplate } : null
            );

            // Reload version history
            const versionsResponse = await fetch(
                buildApiUrl(`/api/templates/${selectedTemplate.id}/versions`),
                {
                    credentials: 'include',
                }
            );
            if (versionsResponse.ok) {
                const versionsData = await versionsResponse.json();
                setVersions(normalizeVersionsResponse(versionsData));
            }

            setToast({
                message: 'Template saved successfully!',
                type: 'success',
            });
        } catch (error) {
            console.error('Error saving template:', error);
            setToast({
                message: 'Failed to save template. Please try again.',
                type: 'error',
            });
        } finally {
            setIsSaving(false);
        }
    };

    const handleRollback = async (versionNumber: number) => {
        if (!selectedTemplate) return;

        try {
            const response = await fetch(
                buildApiUrl(`/api/templates/${selectedTemplate.id}/rollback`),
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    credentials: 'include',
                    body: JSON.stringify({ versionNumber }),
                }
            );

            if (!response.ok) {
                throw new Error('Failed to rollback template');
            }

            const restoredTemplatePayload = await response.json();
            const restoredTemplate = normalizeTemplate({
                ...(restoredTemplatePayload.template || restoredTemplatePayload.data || restoredTemplatePayload),
                versionNumber:
                    typeof restoredTemplatePayload.newVersion === 'number'
                        ? restoredTemplatePayload.newVersion
                        : undefined,
            } as TemplateApiPayload);

            // Update local state
            setTemplates((prev) =>
                prev.map((t) =>
                    t.id === selectedTemplate.id
                        ? { ...t, ...restoredTemplate }
                        : t
                )
            );
            setSelectedTemplate((prev) =>
                prev ? { ...prev, ...restoredTemplate } : null
            );

            // Reload version history
            const versionsResponse = await fetch(
                buildApiUrl(`/api/templates/${selectedTemplate.id}/versions`),
                {
                    credentials: 'include',
                }
            );
            if (versionsResponse.ok) {
                const versionsData = await versionsResponse.json();
                setVersions(normalizeVersionsResponse(versionsData));
            }

            setToast({
                message: `Template restored to version ${versionNumber}`,
                type: 'success',
            });
        } catch (error) {
            console.error('Error rolling back template:', error);
            setToast({
                message: 'Failed to restore template version. Please try again.',
                type: 'error',
            });
        }
    };

    if (isLoading) {
        return (
            <AdminPageShell
                title="Template Management"
                description="Create and manage notification templates with token-safe content and version history."
            >
                <div className="flex min-h-[320px] items-center justify-center rounded-2xl border border-[var(--admin-color-border)] bg-[var(--admin-color-surface-0)] shadow-[var(--admin-shadow-sm)]">
                    <div className="text-center">
                        <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-b-2 border-[var(--admin-color-brand-primary)]"></div>
                        <p className="text-sm text-[var(--admin-color-ink-secondary)]">Loading templates...</p>
                    </div>
                </div>
            </AdminPageShell>
        );
    }

    if (!isAuthorized) {
        return null; // Will redirect in useEffect
    }

    return (
        <AdminPageShell
            title="Template Management"
            description="Create and manage email or SMS notification templates with version control, token guidance, and live preview support."
        >
            <div className="grid gap-5 xl:grid-cols-[230px_minmax(0,1fr)_320px]">
                <TemplateSelector
                    templates={templates}
                    selectedTemplateId={selectedTemplate?.id}
                    onSelect={handleTemplateSelect}
                />

                <div className="space-y-5">
                    {selectedTemplate ? (
                        <>
                            <TemplateEditorForm
                                template={selectedTemplate}
                                onSave={handleSave}
                                onChange={handleEditorChange}
                                isSaving={isSaving}
                            />

                            <TemplatePreviewPanel
                                subject={preview?.subject || editorContent.subject}
                                bodyHtml={preview?.bodyHtml || editorContent.bodyHtml}
                                bodyText={preview?.bodyText || editorContent.bodyText}
                                isLoading={isPreviewLoading}
                                error={previewError}
                            />
                        </>
                    ) : (
                        <div className="rounded-2xl border border-[var(--admin-color-border)] bg-[var(--admin-color-surface-0)] p-10 text-center shadow-[var(--admin-shadow-sm)]">
                            <h2 className="admin-heading text-lg font-semibold text-[var(--admin-color-ink-primary)]">No template selected</h2>
                            <p className="mt-2 text-sm text-[var(--admin-color-ink-secondary)]">
                                Select a template from the sidebar to begin editing.
                            </p>
                        </div>
                    )}
                </div>

                <div className="space-y-5">
                    {selectedTemplate ? (
                        <>
                            <TokenDocumentationPanel
                                templateType={selectedTemplate.type}
                                missingTokens={missingTokens}
                            />

                            <VersionHistorySidebar
                                versions={versions}
                                currentVersionNumber={selectedTemplate.versionNumber}
                                onRestore={handleRollback}
                            />
                        </>
                    ) : (
                        <div className="rounded-2xl border border-dashed border-[var(--admin-color-border)] bg-[var(--admin-color-surface-0)] p-5 text-sm text-[var(--admin-color-ink-secondary)] shadow-[var(--admin-shadow-sm)]">
                            Version history and token reference will appear after you select a template.
                        </div>
                    )}
                </div>
            </div>

            {/* Toast Notifications */}
            {toast && (
                <div
                    role="status"
                    aria-live="polite"
                    className={`fixed right-4 top-4 z-[9999] flex max-w-md items-center justify-between gap-4 rounded-xl border px-4 py-3 text-white shadow-lg ${
                        toast.type === 'success'
                            ? 'border-emerald-200 bg-emerald-600'
                            : toast.type === 'error'
                              ? 'border-red-200 bg-red-600'
                              : 'border-blue-200 bg-blue-600'
                    }`}
                >
                    <span>{toast.message}</span>
                    <button
                        onClick={() => setToast(null)}
                        type="button"
                        className="text-xl leading-none text-white hover:text-gray-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                        aria-label="Close notification"
                    >
                        ×
                    </button>
                </div>
            )}
        </AdminPageShell>
    );
}
