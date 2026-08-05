/**
 * Template Preview Panel Component
 * 
 * Displays live preview of email template with HTML and plain text views.
 * Shows rendered content with token replacement.
 */

import React, { useState, useEffect, useRef } from 'react';

interface TemplatePreviewPanelProps {
    subject: string;
    bodyHtml: string;
    bodyText: string;
    isLoading?: boolean;
    error?: Error | null;
}

type PreviewMode = 'html' | 'text';

export default function TemplatePreviewPanel({
    subject,
    bodyHtml,
    bodyText,
    isLoading = false,
    error = null,
}: TemplatePreviewPanelProps) {
    const [previewMode, setPreviewMode] = useState<PreviewMode>('html');
    const iframeRef = useRef<HTMLIFrameElement>(null);

    // Update iframe content when HTML changes
    useEffect(() => {
        if (previewMode === 'html' && iframeRef.current) {
            const iframe = iframeRef.current;
            const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
            
            if (iframeDoc) {
                iframeDoc.open();
                iframeDoc.write(`
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <meta charset="UTF-8">
                        <meta name="viewport" content="width=device-width, initial-scale=1.0">
                        <style>
                            body {
                                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
                                line-height: 1.6;
                                color: #333;
                                padding: 20px;
                                margin: 0;
                                background: #ffffff;
                            }
                            img {
                                max-width: 100%;
                                height: auto;
                            }
                            a {
                                color: #2563eb;
                                text-decoration: underline;
                            }
                            table {
                                border-collapse: collapse;
                                width: 100%;
                            }
                            th, td {
                                border: 1px solid #ddd;
                                padding: 8px;
                                text-align: left;
                            }
                        </style>
                    </head>
                    <body>
                        ${bodyHtml}
                    </body>
                    </html>
                `);
                iframeDoc.close();
            }
        }
    }, [bodyHtml, previewMode]);

    return (
        <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-[var(--admin-color-border)] bg-[var(--admin-color-surface-0)] shadow-[var(--admin-shadow-sm)]">
            {/* Header with tabs */}
            <div className="border-b border-[var(--admin-color-border)] bg-[var(--admin-color-surface-1)] px-4 py-3">
                <div className="flex items-center justify-between mb-2">
                    <h3 className="admin-heading text-lg font-semibold text-[var(--admin-color-ink-primary)]">Preview</h3>
                    {isLoading && (
                        <div className="flex items-center text-sm text-[var(--admin-color-ink-secondary)]">
                            <svg
                                className="animate-spin h-4 w-4 mr-2"
                                fill="none"
                                viewBox="0 0 24 24"
                            >
                                <circle
                                    className="opacity-25"
                                    cx="12"
                                    cy="12"
                                    r="10"
                                    stroke="currentColor"
                                    strokeWidth="4"
                                />
                                <path
                                    className="opacity-75"
                                    fill="currentColor"
                                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                />
                            </svg>
                            Updating...
                        </div>
                    )}
                </div>

                {/* Subject line preview */}
                <div className="mb-3">
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.06em] text-[var(--admin-color-ink-tertiary)]">
                        Subject
                    </label>
                    <div className="text-sm font-semibold text-[var(--admin-color-ink-primary)]">
                        {subject || <span className="italic text-[var(--admin-color-ink-tertiary)]">No subject</span>}
                    </div>
                </div>

                {/* Preview mode tabs */}
                <div className="flex space-x-1">
                    <button
                        type="button"
                        onClick={() => setPreviewMode('html')}
                        className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                            previewMode === 'html'
                                ? 'bg-[var(--admin-color-brand-primary)] text-white'
                                : 'text-[var(--admin-color-ink-secondary)] hover:bg-[var(--admin-color-surface-2)] hover:text-[var(--admin-color-ink-primary)]'
                        }`}
                        aria-pressed={previewMode === 'html'}
                    >
                        HTML Preview
                    </button>
                    <button
                        type="button"
                        onClick={() => setPreviewMode('text')}
                        className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                            previewMode === 'text'
                                ? 'bg-[var(--admin-color-brand-primary)] text-white'
                                : 'text-[var(--admin-color-ink-secondary)] hover:bg-[var(--admin-color-surface-2)] hover:text-[var(--admin-color-ink-primary)]'
                        }`}
                        aria-pressed={previewMode === 'text'}
                    >
                        Plain Text
                    </button>
                </div>
            </div>

            {/* Preview content */}
            <div className="flex-1 overflow-auto bg-[var(--admin-color-surface-1)] p-4">
                {error ? (
                    <div className="rounded-md border border-red-200 bg-red-50 p-4">
                        <div className="flex">
                            <svg
                                className="h-5 w-5 text-red-400"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                                />
                            </svg>
                            <div className="ml-3">
                                <h3 className="text-sm font-medium text-red-800">
                                    Preview Error
                                </h3>
                                <p className="mt-1 text-sm text-red-700">
                                    {error.message}
                                </p>
                            </div>
                        </div>
                    </div>
                ) : previewMode === 'html' ? (
                    <div className="overflow-hidden rounded-md border border-[var(--admin-color-border)] bg-white shadow-sm">
                        <iframe
                            ref={iframeRef}
                            title="HTML Preview"
                            sandbox="allow-same-origin"
                            className="w-full h-[600px] border-0"
                            aria-label="HTML email preview"
                        />
                    </div>
                ) : (
                    <div className="rounded-md border border-[var(--admin-color-border)] bg-white p-4 shadow-sm">
                        <pre className="admin-mono overflow-auto whitespace-pre-wrap text-sm text-[var(--admin-color-ink-primary)]">
                            {bodyText || <span className="italic text-[var(--admin-color-ink-tertiary)]">No plain text content</span>}
                        </pre>
                    </div>
                )}
            </div>
        </div>
    );
}
