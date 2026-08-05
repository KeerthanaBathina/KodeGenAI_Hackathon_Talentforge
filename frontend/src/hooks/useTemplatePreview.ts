/**
 * Template Preview Hook
 * 
 * Provides debounced preview functionality for email templates.
 * Calls preview API with current editor content and sample data.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { buildApiUrl } from '@/lib/api/url';

interface PreviewContent {
    subject: string;
    bodyHtml: string;
    bodyText: string;
}

interface PreviewResponse {
    subject: string;
    bodyHtml: string;
    bodyText: string;
    missingTokens: string[];
}

interface UseTemplatePreviewOptions {
    debounceMs?: number;
    enabled?: boolean;
}

export function useTemplatePreview(
    content: PreviewContent,
    sampleData: Record<string, string>,
    options: UseTemplatePreviewOptions = {}
) {
    const { debounceMs = 300, enabled = true } = options;
    
    const [preview, setPreview] = useState<PreviewResponse | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<Error | null>(null);
    
    const abortControllerRef = useRef<AbortController | null>(null);
    const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

    const fetchPreview = useCallback(async (
        previewContent: PreviewContent,
        previewSampleData: Record<string, string>
    ) => {
        // Abort previous request if still pending
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }

        // Create new abort controller for this request
        const abortController = new AbortController();
        abortControllerRef.current = abortController;

        setIsLoading(true);
        setError(null);

        try {
            const response = await fetch(buildApiUrl('/api/templates/preview'), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                credentials: 'include',
                signal: abortController.signal,
                body: JSON.stringify({
                    subject: previewContent.subject,
                    bodyHtml: previewContent.bodyHtml,
                    bodyText: previewContent.bodyText,
                    sampleData: previewSampleData,
                }),
            });

            if (!response.ok) {
                throw new Error(`Preview failed: ${response.statusText}`);
            }

            const data = await response.json();
            
            // Only update if this request wasn't aborted
            if (!abortController.signal.aborted) {
                setPreview(data);
                setIsLoading(false);
            }
        } catch (err) {
            // Ignore abort errors
            if (err instanceof Error && err.name === 'AbortError') {
                return;
            }
            
            if (!abortController.signal.aborted) {
                setError(err instanceof Error ? err : new Error('Preview failed'));
                setIsLoading(false);
            }
        }
    }, []);

    // Debounced preview update
    useEffect(() => {
        if (!enabled) {
            return;
        }

        // Clear existing timer
        if (debounceTimerRef.current) {
            clearTimeout(debounceTimerRef.current);
        }

        // Set new timer
        debounceTimerRef.current = setTimeout(() => {
            fetchPreview(content, sampleData);
        }, debounceMs);

        // Cleanup
        return () => {
            if (debounceTimerRef.current) {
                clearTimeout(debounceTimerRef.current);
            }
        };
    }, [content, sampleData, debounceMs, enabled, fetchPreview]);

    // Cleanup abort controller on unmount
    useEffect(() => {
        return () => {
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
            }
        };
    }, []);

    return {
        preview,
        missingTokens: preview?.missingTokens || [],
        isLoading,
        error,
    };
}
