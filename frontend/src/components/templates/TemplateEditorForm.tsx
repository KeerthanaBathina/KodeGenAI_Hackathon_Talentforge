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
        <div className="bg-white rounded-lg shadow">
            <form onSubmit={handleSubmit}>
                <div className="p-6 space-y-6">
                    {/* Template Name */}
                    <div>
                        <label
                            htmlFor="template-name"
                            className="block text-sm font-medium text-gray-700 mb-1"
                        >
                            Template Name
                        </label>
                        <input
                            type="text"
                            id="template-name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                            required
                            aria-label="Template name"
                        />
                    </div>

                    {/* Subject Line */}
                    <div>
                        <label
                            htmlFor="template-subject"
                            className="block text-sm font-medium text-gray-700 mb-1"
                        >
                            Subject Line
                        </label>
                        <input
                            type="text"
                            id="template-subject"
                            value={subject}
                            onChange={(e) => setSubject(e.target.value)}
                            className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                            maxLength={500}
                            required
                            aria-label="Email subject line"
                        />
                        <p className="mt-1 text-xs text-gray-500">
                            {subject.length}/500 characters
                        </p>
                    </div>

                    {/* Token Inserter */}
                    <TokenInserter
                        templateType={template.type}
                        onInsertToken={handleInsertToken}
                    />

                    {/* Editor Tabs */}
                    <div>
                        <div className="flex border-b border-gray-200 mb-4">
                            <button
                                type="button"
                                className={`px-4 py-2 text-sm font-medium ${
                                    activeEditor === 'html'
                                        ? 'text-blue-600 border-b-2 border-blue-600'
                                        : 'text-gray-500 hover:text-gray-700'
                                }`}
                                onClick={() => setActiveEditor('html')}
                                aria-pressed={activeEditor === 'html'}
                            >
                                HTML Body
                            </button>
                            <button
                                type="button"
                                className={`px-4 py-2 text-sm font-medium ${
                                    activeEditor === 'text'
                                        ? 'text-blue-600 border-b-2 border-blue-600'
                                        : 'text-gray-500 hover:text-gray-700'
                                }`}
                                onClick={() => setActiveEditor('text')}
                                aria-pressed={activeEditor === 'text'}
                            >
                                Plain Text
                            </button>
                        </div>

                        {/* HTML Editor */}
                        {activeEditor === 'html' && (
                            <div>
                                <label
                                    htmlFor="html-editor"
                                    className="block text-sm font-medium text-gray-700 mb-2"
                                >
                                    HTML Body
                                </label>
                                <div
                                    ref={htmlEditorRef}
                                    id="html-editor"
                                    contentEditable
                                    onInput={handleHtmlEditorChange}
                                    onFocus={() => setActiveEditor('html')}
                                    className="block w-full min-h-[400px] px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm overflow-y-auto"
                                    role="textbox"
                                    aria-label="HTML email body editor"
                                    aria-multiline="true"
                                    suppressContentEditableWarning
                                />
                                <p className="mt-1 text-xs text-gray-500">
                                    Use HTML tags for formatting. Click "Insert Token" to add dynamic content.
                                </p>
                            </div>
                        )}

                        {/* Plain Text Editor */}
                        {activeEditor === 'text' && (
                            <div>
                                <label
                                    htmlFor="text-editor"
                                    className="block text-sm font-medium text-gray-700 mb-2"
                                >
                                    Plain Text Body
                                </label>
                                <textarea
                                    ref={textEditorRef}
                                    id="text-editor"
                                    value={bodyText}
                                    onChange={(e) => setBodyText(e.target.value)}
                                    onFocus={() => setActiveEditor('text')}
                                    className="block w-full min-h-[400px] px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm font-mono text-sm"
                                    required
                                    aria-label="Plain text email body editor"
                                />
                                <p className="mt-1 text-xs text-gray-500">
                                    Fallback version for email clients that don't support HTML.
                                </p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Action Buttons */}
                <div className="bg-gray-50 px-6 py-4 flex justify-end space-x-3 rounded-b-lg">
                    <button
                        type="button"
                        onClick={handleCancel}
                        disabled={!hasChanges || isSaving}
                        className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        disabled={!hasChanges || isSaving}
                        className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isSaving ? 'Saving...' : 'Save Template'}
                    </button>
                </div>
            </form>
        </div>
    );
}
