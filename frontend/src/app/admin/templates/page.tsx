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
import Toast from '@/components/Toast';
import { useTemplatePreview } from '@/hooks/useTemplatePreview';

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

function getApiUrl(pathname: string): string {
    const base = process.env.NEXT_PUBLIC_API_URL?.trim() ?? '';
    if (!base || (typeof window !== 'undefined' && window.location.hostname === '127.0.0.1')) {
        return pathname;
    }
    return `${base}${pathname}`;
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
                const response = await fetch(getApiUrl('/api/templates'), {
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
                setTemplates(data.data || []);
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
            try {
                const response = await fetch(
                    getApiUrl(`/api/templates/${selectedTemplate.id}/versions`),
                    {
                        credentials: 'include',
                    }
                );

                if (!response.ok) {
                    throw new Error('Failed to load version history');
                }

                const data = await response.json();
                setVersions(data.data || []);
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
            try {
                const response = await fetch(
                    getApiUrl(`/api/templates/sample-data/${selectedTemplate.type}`),
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
                getApiUrl(`/api/templates/${selectedTemplate.id}`),
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

            const updatedTemplate = await response.json();
            
            // Update local state
            setTemplates((prev) =>
                prev.map((t) =>
                    t.id === selectedTemplate.id
                        ? { ...t, ...updatedTemplate.data }
                        : t
                )
            );
            setSelectedTemplate((prev) =>
                prev ? { ...prev, ...updatedTemplate.data } : null
            );

            // Reload version history
            const versionsResponse = await fetch(
                getApiUrl(`/api/templates/${selectedTemplate.id}/versions`),
                {
                    credentials: 'include',
                }
            );
            if (versionsResponse.ok) {
                const versionsData = await versionsResponse.json();
                setVersions(versionsData.data || []);
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
                getApiUrl(`/api/templates/${selectedTemplate.id}/rollback`),
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

            const restoredTemplate = await response.json();

            // Update local state
            setTemplates((prev) =>
                prev.map((t) =>
                    t.id === selectedTemplate.id
                        ? { ...t, ...restoredTemplate.data }
                        : t
                )
            );
            setSelectedTemplate((prev) =>
                prev ? { ...prev, ...restoredTemplate.data } : null
            );

            // Reload version history
            const versionsResponse = await fetch(
                getApiUrl(`/api/templates/${selectedTemplate.id}/versions`),
                {
                    credentials: 'include',
                }
            );
            if (versionsResponse.ok) {
                const versionsData = await versionsResponse.json();
                setVersions(versionsData.data || []);
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
            <div className="flex items-center justify-center min-h-screen">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                    <p className="text-gray-600">Loading templates...</p>
                </div>
            </div>
        );
    }

    if (!isAuthorized) {
        return null; // Will redirect in useEffect
    }

    return (
        <div className="min-h-screen bg-gray-50">
            <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
                {/* Header */}
                <div className="mb-6">
                    <h1 className="text-3xl font-bold text-gray-900">
                        Email Template Management
                    </h1>
                    <p className="mt-2 text-sm text-gray-600">
                        Edit email templates, manage versions, and preview token replacements
                    </p>
                </div>

                {/* Template Selector */}
                <div className="mb-6">
                    <TemplateSelector
                        templates={templates}
                        selectedTemplateId={selectedTemplate?.id}
                        onSelect={handleTemplateSelect}
                    />
                </div>

                {/* Main Content Area */}
                {selectedTemplate ? (
                    <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
                        {/* Left Column: Editor + Preview (8/12 width on xl screens) */}
                        <div className="xl:col-span-8 space-y-6">
                            {/* Editor */}
                            <TemplateEditorForm
                                template={selectedTemplate}
                                onSave={handleSave}
                                onChange={handleEditorChange}
                                isSaving={isSaving}
                            />
                            
                            {/* Preview Panel */}
                            <TemplatePreviewPanel
                                subject={preview?.subject || editorContent.subject}
                                bodyHtml={preview?.bodyHtml || editorContent.bodyHtml}
                                bodyText={preview?.bodyText || editorContent.bodyText}
                                isLoading={isPreviewLoading}
                                error={previewError}
                            />
                        </div>

                        {/* Right Column: Token Docs + Version History (4/12 width on xl screens) */}
                        <div className="xl:col-span-4 space-y-6">
                            {/* Token Documentation */}
                            <TokenDocumentationPanel
                                templateType={selectedTemplate.type}
                                missingTokens={missingTokens}
                            />
                            
                            {/* Version History */}
                            <VersionHistorySidebar
                                versions={versions}
                                currentVersionNumber={selectedTemplate.versionNumber}
                                onRestore={handleRollback}
                            />
                        </div>
                    </div>
                ) : (
                    <div className="bg-white rounded-lg shadow p-8 text-center">
                        <svg
                            className="mx-auto h-12 w-12 text-gray-400"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            aria-hidden="true"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                            />
                        </svg>
                        <h3 className="mt-2 text-sm font-medium text-gray-900">
                            No template selected
                        </h3>
                        <p className="mt-1 text-sm text-gray-500">
                            Select a template from the dropdown above to start editing
                        </p>
                    </div>
                )}
            </div>

            {/* Toast Notifications */}
            {toast && (
                <Toast
                    message={toast.message}
                    type={toast.type}
                    onClose={() => setToast(null)}
                />
            )}
        </div>
    );
}
