/**
 * Template Editor Form Component
 * 
 * Rich text editor for email templates with token insertion support.
 * Includes subject, HTML body, and plain text body editors.
 * 
 * NOTE: This implementation uses a basic contentEditable div as a placeholder.
 * For production, consider replacing with Lexical, TipTap, or React-Quill for:
 * - Better formatting toolbar (bold, italic, lists, links)
 * - Undo/redo support
 * - Better cross-browser compatibility
 * - Built-in XSS protection
 */

import React, { useState, useEffect, useRef } from 'react';
import type { Template } from '@/app/admin/templates/page';
import TokenInserter from '@/components/templates/TokenInserter';

interface TemplateEditorFormProps {
    template: Template;
    onSave: (data: {
        name: string;
        subject: string;
        bodyHtml: string;
        bodyText: string;
    }) => void;
    onChange?: (content: {
        subject: string;
        bodyHtml: string;
        bodyText: string;
    }) => void;
    isSaving: boolean;
}

export default function TemplateEditorForm({
    template,
    onSave,
    onChange,
    isSaving,
}: TemplateEditorFormProps) {
    const [name, setName] = useState(template.name);
    const [subject, setSubject] = useState(template.subject);
    const [bodyHtml, setBodyHtml] = useState(template.bodyHtml);
    const [bodyText, setBodyText] = useState(template.bodyText);
    const [hasChanges, setHasChanges] = useState(false);
    const [activeEditor, setActiveEditor] = useState<'html' | 'text'>('html');
    
    const htmlEditorRef = useRef<HTMLDivElement>(null);
    const textEditorRef = useRef<HTMLTextAreaElement>(null);

    // Reset form when template changes
    useEffect(() => {
        setName(template.name);
        setSubject(template.subject);
        setBodyHtml(template.bodyHtml);
        setBodyText(template.bodyText);
        setHasChanges(false);
        
        // Update HTML editor content
        if (htmlEditorRef.current) {
            htmlEditorRef.current.innerHTML = template.bodyHtml;
        }
    }, [template]);

    // Track changes
    useEffect(() => {
        const changed =
            name !== template.name ||
            subject !== template.subject ||
            bodyHtml !== template.bodyHtml ||
            bodyText !== template.bodyText;
        setHasChanges(changed);
    }, [name, subject, bodyHtml, bodyText, template]);

    // Notify parent of content changes for live preview
    useEffect(() => {
        if (onChange) {
            onChange({ subject, bodyHtml, bodyText });
        }
    }, [subject, bodyHtml, bodyText, onChange]);

    const handleHtmlEditorChange = () => {
        if (htmlEditorRef.current) {
            setBodyHtml(htmlEditorRef.current.innerHTML);
        }
    };

    const handleInsertToken = (token: string) => {
        const tokenString = `{{${token}}}`;

        if (activeEditor === 'html' && htmlEditorRef.current) {
            // Insert token at cursor position in HTML editor
            const selection = window.getSelection();
            if (selection && selection.rangeCount > 0) {
                const range = selection.getRangeAt(0);
                
                // Check if selection is within the editor
                if (htmlEditorRef.current.contains(range.commonAncestorContainer)) {
                    range.deleteContents();
                    const tokenNode = document.createTextNode(tokenString);
                    range.insertNode(tokenNode);
                    
                    // Move cursor after token
                    range.setStartAfter(tokenNode);
                    range.setEndAfter(tokenNode);
                    selection.removeAllRanges();
                    selection.addRange(range);
                    
                    htmlEditorRef.current.focus();
                    handleHtmlEditorChange();
                    return;
                }
            }
            
            // Fallback: append to end
            htmlEditorRef.current.innerHTML += tokenString;
            handleHtmlEditorChange();
        } else if (activeEditor === 'text' && textEditorRef.current) {
            // Insert token at cursor position in text editor
            const textarea = textEditorRef.current;
            const startPos = textarea.selectionStart;
            const endPos = textarea.selectionEnd;
            const newValue =
                bodyText.substring(0, startPos) +
                tokenString +
                bodyText.substring(endPos);
            
            setBodyText(newValue);
            
            // Move cursor after token
            setTimeout(() => {
                textarea.selectionStart = textarea.selectionEnd = startPos + tokenString.length;
                textarea.focus();
            }, 0);
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        
        if (!hasChanges || isSaving) {
            return;
        }

        onSave({ name, subject, bodyHtml, bodyText });
    };

    const handleCancel = () => {
        setName(template.name);
        setSubject(template.subject);
        setBodyHtml(template.bodyHtml);
        setBodyText(template.bodyText);
        setHasChanges(false);
        
        if (htmlEditorRef.current) {
            htmlEditorRef.current.innerHTML = template.bodyHtml;
        }
    };

    return (
        <div className="overflow-hidden rounded-2xl border border-[var(--admin-color-border)] bg-[var(--admin-color-surface-0)] shadow-[var(--admin-shadow-sm)]">
            <form onSubmit={handleSubmit}>
                <div className="border-b border-[var(--admin-color-border)] bg-[var(--admin-color-surface-1)] px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                            <h2 className="admin-heading text-base font-semibold text-[var(--admin-color-ink-primary)]">Template Editor</h2>
                            <p className="text-xs text-[var(--admin-color-ink-secondary)]">{template.type} · {template.locale} · Version {template.versionNumber}</p>
                        </div>
                        <span className="rounded-full border border-[var(--admin-color-border)] bg-white px-2.5 py-1 text-xs font-semibold text-[var(--admin-color-ink-secondary)]">
                            {template.isActive ? 'Active' : 'Draft'}
                        </span>
                    </div>
                </div>

                <div className="border-b border-[var(--admin-color-border)] bg-[var(--admin-color-surface-1)] px-4 py-2">
                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            type="button"
                            disabled
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-[var(--admin-color-border)] bg-white text-sm font-semibold text-[var(--admin-color-ink-secondary)]"
                            title="Formatting toolbar placeholder"
                        >
                            B
                        </button>
                        <button
                            type="button"
                            disabled
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-[var(--admin-color-border)] bg-white text-sm italic text-[var(--admin-color-ink-secondary)]"
                            title="Formatting toolbar placeholder"
                        >
                            I
                        </button>
                        <button
                            type="button"
                            disabled
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-[var(--admin-color-border)] bg-white text-xs font-semibold text-[var(--admin-color-ink-secondary)]"
                            title="Formatting toolbar placeholder"
                        >
                            L
                        </button>

                        <TokenInserter
                            templateType={template.type}
                            onInsertToken={handleInsertToken}
                        />

                        <div className="ml-auto inline-flex rounded-md border border-[var(--admin-color-border)] bg-white p-0.5">
                            <button
                                type="button"
                                className={`rounded px-2.5 py-1 text-xs font-semibold transition ${
                                    activeEditor === 'html'
                                        ? 'bg-[var(--admin-color-brand-primary)] text-white'
                                        : 'text-[var(--admin-color-ink-secondary)] hover:bg-[var(--admin-color-surface-1)]'
                                }`}
                                onClick={() => setActiveEditor('html')}
                                aria-pressed={activeEditor === 'html'}
                            >
                                HTML
                            </button>
                            <button
                                type="button"
                                className={`rounded px-2.5 py-1 text-xs font-semibold transition ${
                                    activeEditor === 'text'
                                        ? 'bg-[var(--admin-color-brand-primary)] text-white'
                                        : 'text-[var(--admin-color-ink-secondary)] hover:bg-[var(--admin-color-surface-1)]'
                                }`}
                                onClick={() => setActiveEditor('text')}
                                aria-pressed={activeEditor === 'text'}
                            >
                                Text
                            </button>
                        </div>
                    </div>
                </div>

                <div className="space-y-4 px-4 py-4">
                    <div>
                        <label
                            htmlFor="template-name"
                            className="mb-1 block text-xs font-semibold uppercase tracking-[0.06em] text-[var(--admin-color-ink-tertiary)]"
                        >
                            Template Name
                        </label>
                        <input
                            type="text"
                            id="template-name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="block h-10 w-full rounded-md border border-[var(--admin-color-border)] px-3 text-sm text-[var(--admin-color-ink-primary)] focus:border-[var(--admin-color-brand-primary)] focus:outline-none"
                            required
                            aria-label="Template name"
                        />
                    </div>

                    <div>
                        <label
                            htmlFor="template-subject"
                            className="mb-1 block text-xs font-semibold uppercase tracking-[0.06em] text-[var(--admin-color-ink-tertiary)]"
                        >
                            Subject Line
                        </label>
                        <input
                            type="text"
                            id="template-subject"
                            value={subject}
                            onChange={(e) => setSubject(e.target.value)}
                            className="block h-10 w-full rounded-md border border-[var(--admin-color-border)] px-3 text-sm text-[var(--admin-color-ink-primary)] focus:border-[var(--admin-color-brand-primary)] focus:outline-none"
                            maxLength={500}
                            required
                            aria-label="Email subject line"
                        />
                        <p className="mt-1 text-xs text-[var(--admin-color-ink-tertiary)]">
                            {subject.length}/500 characters
                        </p>
                    </div>

                    {activeEditor === 'html' && (
                        <div>
                            <label
                                htmlFor="html-editor"
                                className="mb-1 block text-xs font-semibold uppercase tracking-[0.06em] text-[var(--admin-color-ink-tertiary)]"
                            >
                                HTML Body
                            </label>
                            <div
                                ref={htmlEditorRef}
                                id="html-editor"
                                contentEditable
                                onInput={handleHtmlEditorChange}
                                onFocus={() => setActiveEditor('html')}
                                className="block min-h-[360px] w-full overflow-y-auto rounded-md border border-[var(--admin-color-border)] px-3 py-3 text-sm text-[var(--admin-color-ink-primary)] focus:border-[var(--admin-color-brand-primary)] focus:outline-none"
                                role="textbox"
                                aria-label="HTML email body editor"
                                aria-multiline="true"
                                suppressContentEditableWarning
                            />
                            <p className="mt-1 text-xs text-[var(--admin-color-ink-tertiary)]">
                                Use semantic HTML and insert merge tokens where dynamic data is required.
                            </p>
                        </div>
                    )}

                    {activeEditor === 'text' && (
                        <div>
                            <label
                                htmlFor="text-editor"
                                className="mb-1 block text-xs font-semibold uppercase tracking-[0.06em] text-[var(--admin-color-ink-tertiary)]"
                            >
                                Plain Text Body
                            </label>
                            <textarea
                                ref={textEditorRef}
                                id="text-editor"
                                value={bodyText}
                                onChange={(e) => setBodyText(e.target.value)}
                                onFocus={() => setActiveEditor('text')}
                                className="admin-mono block min-h-[360px] w-full rounded-md border border-[var(--admin-color-border)] px-3 py-3 text-sm text-[var(--admin-color-ink-primary)] focus:border-[var(--admin-color-brand-primary)] focus:outline-none"
                                required
                                aria-label="Plain text email body editor"
                            />
                            <p className="mt-1 text-xs text-[var(--admin-color-ink-tertiary)]">
                                Plain-text fallback content for clients that block HTML rendering.
                            </p>
                        </div>
                    )}
                </div>

                <div className="flex items-center justify-between gap-3 border-t border-[var(--admin-color-border)] bg-[var(--admin-color-surface-1)] px-4 py-3">
                    <p className="text-xs text-[var(--admin-color-ink-secondary)]">
                        {hasChanges ? 'You have unsaved changes.' : 'All changes saved.'}
                    </p>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            disabled
                            className="h-9 rounded-md border border-[var(--admin-color-border)] bg-white px-3 text-sm font-medium text-[var(--admin-color-ink-secondary)] opacity-70"
                            title="Send test flow is not enabled in this environment."
                        >
                            Send Test
                        </button>
                        <button
                            type="button"
                            onClick={handleCancel}
                            disabled={!hasChanges || isSaving}
                            className="h-9 rounded-md border border-[var(--admin-color-border)] bg-white px-3 text-sm font-medium text-[var(--admin-color-ink-secondary)] hover:bg-[var(--admin-color-surface-1)] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={!hasChanges || isSaving}
                            className="h-9 rounded-md bg-[var(--admin-color-brand-primary)] px-3 text-sm font-semibold text-white hover:bg-[var(--admin-color-brand-primary-hover)] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {isSaving ? 'Saving...' : 'Save Template'}
                        </button>
                    </div>
                </div>
            </form>
        </div>
    );
}
