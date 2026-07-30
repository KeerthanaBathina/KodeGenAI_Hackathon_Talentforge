/**
 * useTemplatePreview Hook Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTemplatePreview } from '../useTemplatePreview';

// Mock fetch
global.fetch = vi.fn();

describe('useTemplatePreview', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should return initial state', () => {
        const { result } = renderHook(() =>
            useTemplatePreview(
                { subject: 'Test', bodyHtml: '<p>Test</p>', bodyText: 'Test' },
                {},
                { enabled: false }
            )
        );

        expect(result.current.preview).toBeNull();
        expect(result.current.missingTokens).toEqual([]);
        expect(result.current.isLoading).toBe(false);
        expect(result.current.error).toBeNull();
    });

    it('should not fetch when enabled is false', async () => {
        renderHook(() =>
            useTemplatePreview(
                { subject: 'Test', bodyHtml: '<p>Test</p>', bodyText: 'Test' },
                {},
                { enabled: false, debounceMs: 50 }
            )
        );

        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 100));
        });

        expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should handle fetch errors gracefully', async () => {
        (global.fetch as any).mockRejectedValueOnce(new Error('Network error'));

        const { result } = renderHook(() =>
            useTemplatePreview(
                { subject: 'Test', bodyHtml: '<p>Test</p>', bodyText: 'Test' },
                {},
                { debounceMs: 50 }
            )
        );

        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 100));
        });

        expect(result.current.error).toEqual(new Error('Network error'));
        expect(result.current.isLoading).toBe(false);
    });
});
