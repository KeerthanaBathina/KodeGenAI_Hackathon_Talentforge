import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useCountdown } from '../useCountdown';

describe('useCountdown', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should count down from 90 seconds', () => {
        const targetDate = new Date(Date.now() + 90000); // 90 seconds from now
        const { result } = renderHook(() => useCountdown(targetDate));

        expect(result.current.minutes).toBe(1);
        expect(result.current.seconds).toBe(30);
        expect(result.current.formatted).toBe('01:30');
        expect(result.current.isExpired).toBe(false);

        // Advance 30 seconds
        act(() => {
            vi.advanceTimersByTime(30000);
        });

        expect(result.current.formatted).toBe('01:00');
    });

    it('should call onExpire when countdown reaches 0', () => {
        const onExpire = vi.fn();
        const targetDate = new Date(Date.now() + 2000); // 2 seconds from now

        renderHook(() => useCountdown(targetDate, onExpire));

        // Advance past expiry
        act(() => {
            vi.advanceTimersByTime(3000);
        });

        expect(onExpire).toHaveBeenCalledTimes(1);
    });

    it('should show 00:00 when expired', () => {
        const targetDate = new Date(Date.now() + 1000);
        const { result } = renderHook(() => useCountdown(targetDate));

        act(() => {
            vi.advanceTimersByTime(2000);
        });

        expect(result.current.formatted).toBe('00:00');
        expect(result.current.isExpired).toBe(true);
    });

    it('should handle ISO string input', () => {
        const targetDate = new Date(Date.now() + 60000).toISOString();
        const { result } = renderHook(() => useCountdown(targetDate));

        expect(result.current.formatted).toBe('01:00');
    });

    it('should handle null targetDate', () => {
        const { result } = renderHook(() => useCountdown(null));

        expect(result.current.formatted).toBe('00:00');
        expect(result.current.isExpired).toBe(true);
    });

    it('should update callback ref when onExpire changes', () => {
        const onExpire1 = vi.fn();
        const onExpire2 = vi.fn();
        const targetDate = new Date(Date.now() + 1000);

        const { rerender } = renderHook(
            ({ callback }) => useCountdown(targetDate, callback),
            { initialProps: { callback: onExpire1 } }
        );

        // Change callback
        rerender({ callback: onExpire2 });

        // Advance past expiry
        act(() => {
            vi.advanceTimersByTime(2000);
        });

        expect(onExpire1).not.toHaveBeenCalled();
        expect(onExpire2).toHaveBeenCalledTimes(1);
    });

    it('should format single digit minutes and seconds with leading zeros', () => {
        const targetDate = new Date(Date.now() + 125000); // 2:05
        const { result } = renderHook(() => useCountdown(targetDate));

        expect(result.current.formatted).toBe('02:05');
    });

    it('should handle countdown from exactly 60 seconds', () => {
        const targetDate = new Date(Date.now() + 60000);
        const { result } = renderHook(() => useCountdown(targetDate));

        expect(result.current.formatted).toBe('01:00');
        expect(result.current.minutes).toBe(1);
        expect(result.current.seconds).toBe(0);
    });
});
