import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useReasonCodes } from '../useReasonCodes';

// Mock global fetch
global.fetch = vi.fn();

describe('useReasonCodes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockReasonCodes = [
    {
      id: '1',
      code: 'SKILLS_GAP',
      displayText: 'Skills Gap',
      description: 'Candidate lacks required skills',
      category: 'reject_decision',
      displayOrder: 1
    },
    {
      id: '2',
      code: 'EXPERIENCE',
      displayText: 'Insufficient Experience',
      description: 'Not enough relevant experience',
      category: 'reject_decision',
      displayOrder: 2
    }
  ];

  it('should return empty array when category is null', () => {
    const { result } = renderHook(() => useReasonCodes(null));

    expect(result.current.reasonCodes).toEqual([]);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('should fetch reason codes when category is provided', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: mockReasonCodes })
    } as Response);

    const { result } = renderHook(() => useReasonCodes('reject_decision'));

    expect(result.current.loading).toBe(true);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.reasonCodes).toEqual(mockReasonCodes);
    expect(result.current.error).toBeNull();
    expect(fetch).toHaveBeenCalledWith(
      '/api/reason-codes?category=reject_decision',
      expect.objectContaining({
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        }
      })
    );
  });

  it('should handle fetch errors gracefully', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('Network error'));

    const { result } = renderHook(() => useReasonCodes('reject_decision'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.reasonCodes).toEqual([]);
    expect(result.current.error).toBe('Network error');
  });

  it('should handle HTTP errors', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      statusText: 'Internal Server Error'
    } as Response);

    const { result } = renderHook(() => useReasonCodes('reject_decision'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.reasonCodes).toEqual([]);
    expect(result.current.error).toContain('Failed to load reason codes');
  });

  it('should handle invalid response format', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ invalid: 'response' })
    } as Response);

    const { result } = renderHook(() => useReasonCodes('reject_decision'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.reasonCodes).toEqual([]);
    expect(result.current.error).toBe('Invalid response format');
  });

  it('should refetch when category changes', async () => {
    const rejectReasonCodes = mockReasonCodes;
    const offerReasonCodes = [
      {
        id: '3',
        code: 'COMPETITIVE_PACKAGE',
        displayText: 'Competitive Package',
        description: 'Strong compensation offer',
        category: 'offer_decision',
        displayOrder: 1
      }
    ];

    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: rejectReasonCodes })
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: offerReasonCodes })
      } as Response);

    const { result, rerender } = renderHook(
      ({ category }) => useReasonCodes(category),
      { initialProps: { category: 'reject_decision' } }
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.reasonCodes).toEqual(rejectReasonCodes);

    // Change category
    rerender({ category: 'offer_decision' });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.reasonCodes).toEqual(offerReasonCodes);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('should reset state when category becomes null', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: mockReasonCodes })
    } as Response);

    const { result, rerender } = renderHook(
      ({ category }) => useReasonCodes(category),
      { initialProps: { category: 'reject_decision' } }
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.reasonCodes).toEqual(mockReasonCodes);

    // Clear category
    rerender({ category: null });

    expect(result.current.reasonCodes).toEqual([]);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });
});
