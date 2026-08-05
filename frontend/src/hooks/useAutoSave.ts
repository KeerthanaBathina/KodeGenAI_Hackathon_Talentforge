import { useEffect, useRef, useState } from 'react';
import { buildApiUrl } from '@/lib/api/url';

interface UseAutoSaveParams {
    formData: object;
    requisitionId: string;
    enabled: boolean;
    onSaveSuccess?: () => void;
    onSaveError?: (error: Error) => void;
}

interface UseAutoSaveReturn {
    isSaving: boolean;
    lastSavedAt: Date | null;
}

/**
 * Auto-save hook that debounces form changes and saves draft after 60 seconds of inactivity
 */
export function useAutoSave(params: UseAutoSaveParams): UseAutoSaveReturn {
    const { formData, requisitionId, enabled, onSaveSuccess, onSaveError } = params;

    const [isSaving, setIsSaving] = useState(false);
    const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
    const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
    const previousDataRef = useRef<string>('');

    useEffect(() => {
        if (!enabled) {
            return;
        }

        // Serialize formData to detect changes
        const currentData = JSON.stringify(formData);

        // Skip if data hasn't changed
        if (currentData === previousDataRef.current) {
            return;
        }

        previousDataRef.current = currentData;

        // Clear existing timer
        if (debounceTimerRef.current) {
            clearTimeout(debounceTimerRef.current);
        }

        // Set new timer for 60 seconds
        debounceTimerRef.current = setTimeout(() => {
            saveDraft();
        }, 60000); // 60 seconds

        return () => {
            if (debounceTimerRef.current) {
                clearTimeout(debounceTimerRef.current);
            }
        };
    }, [formData, enabled, requisitionId]);

    async function saveDraft() {
        if (!enabled) {
            return;
        }

        setIsSaving(true);

        try {
            const response = await fetch(buildApiUrl('/api/applications/drafts'), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                credentials: 'include',
                body: JSON.stringify({
                    requisitionId,
                    draftData: formData,
                }),
            });

            if (!response.ok) {
                throw new Error('Failed to save draft');
            }

            const data = await response.json();
            setLastSavedAt(new Date(data.draftSavedAt));

            if (onSaveSuccess) {
                onSaveSuccess();
            }
        } catch (error) {
            console.error('Auto-save error:', error);

            if (onSaveError) {
                onSaveError(error instanceof Error ? error : new Error('Unknown error'));
            }
        } finally {
            setIsSaving(false);
        }
    }

    return {
        isSaving,
        lastSavedAt,
    };
}
