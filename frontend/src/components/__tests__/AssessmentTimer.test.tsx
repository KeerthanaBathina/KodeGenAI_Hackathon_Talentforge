/**
 * Frontend Component Tests for AssessmentTimer
 * 
 * Tests React timer component with server sync, heartbeat, and network handling
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import AssessmentTimer from '../AssessmentTimer';
import * as sessionTimerApi from '@/lib/api/sessionTimer';

// Mock the API module
vi.mock('@/lib/api/sessionTimer');

describe('AssessmentTimer Component', () => {
    const mockSessionId = '550e8400-e29b-41d4-a716-446655440000';
    const mockSessionToken = 'test-token-123';

    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    describe('Initial Render and Server Sync', () => {
        it('should render countdown in MM:SS format', async () => {
            vi.mocked(sessionTimerApi.fetchRemainingTime).mockResolvedValue({
                sessionId: mockSessionId,
                remainingMinutes: 42.5,
                status: 'active',
                lastHeartbeat: new Date().toISOString(),
            });

            render(
                <AssessmentTimer
                    sessionId={mockSessionId}
                    sessionToken={mockSessionToken}
                />
            );

            await waitFor(() => {
                expect(screen.getByRole('timer')).toBeInTheDocument();
            });

            // 42.5 minutes = 42:30
            await waitFor(() => {
                expect(screen.getByText(/42:30/)).toBeInTheDocument();
            });
        });

        it('should fetch remaining time from server on mount', async () => {
            vi.mocked(sessionTimerApi.fetchRemainingTime).mockResolvedValue({
                sessionId: mockSessionId,
                remainingMinutes: 60,
                status: 'active',
                lastHeartbeat: new Date().toISOString(),
            });

            render(
                <AssessmentTimer
                    sessionId={mockSessionId}
                    sessionToken={mockSessionToken}
                />
            );

            await waitFor(() => {
                expect(sessionTimerApi.fetchRemainingTime).toHaveBeenCalledWith(
                    mockSessionId,
                    mockSessionToken,
                    expect.any(AbortController.signal?.constructor)
                );
            });
        });

        it('should display loading state initially', () => {
            vi.mocked(sessionTimerApi.fetchRemainingTime).mockImplementation(
                () => new Promise(() => {}) // Never resolves
            );

            const { container } = render(
                <AssessmentTimer
                    sessionId={mockSessionId}
                    sessionToken={mockSessionToken}
                />
            );

            // Component should not render anything during loading
            expect(container.firstChild).toBeNull();
        });
    });

    describe('Countdown Logic', () => {
        it('should decrement timer every second', async () => {
            vi.mocked(sessionTimerApi.fetchRemainingTime).mockResolvedValue({
                sessionId: mockSessionId,
                remainingMinutes: 5,
                status: 'active',
                lastHeartbeat: new Date().toISOString(),
            });

            render(
                <AssessmentTimer
                    sessionId={mockSessionId}
                    sessionToken={mockSessionToken}
                />
            );

            await waitFor(() => {
                expect(screen.getByText(/05:00/)).toBeInTheDocument();
            });

            // Advance 3 seconds
            act(() => {
                vi.advanceTimersByTime(3000);
            });

            await waitFor(() => {
                expect(screen.getByText(/04:57/)).toBeInTheDocument();
            });
        });

        it('should handle transition across minute boundary', async () => {
            vi.mocked(sessionTimerApi.fetchRemainingTime).mockResolvedValue({
                sessionId: mockSessionId,
                remainingMinutes: 1.016667, // 1 minute 1 second
                status: 'active',
                lastHeartbeat: new Date().toISOString(),
            });

            render(
                <AssessmentTimer
                    sessionId={mockSessionId}
                    sessionToken={mockSessionToken}
                />
            );

            await waitFor(() => {
                expect(screen.getByText(/01:01/)).toBeInTheDocument();
            });

            // Advance 2 seconds
            act(() => {
                vi.advanceTimersByTime(2000);
            });

            await waitFor(() => {
                expect(screen.getByText(/00:59/)).toBeInTheDocument();
            });
        });

        it('should show zero when timer expires', async () => {
            vi.mocked(sessionTimerApi.fetchRemainingTime).mockResolvedValue({
                sessionId: mockSessionId,
                remainingMinutes: 0.016667, // 1 second
                status: 'active',
                lastHeartbeat: new Date().toISOString(),
            });

            const onExpiry = vi.fn();

            render(
                <AssessmentTimer
                    sessionId={mockSessionId}
                    sessionToken={mockSessionToken}
                    onExpiry={onExpiry}
                />
            );

            await waitFor(() => {
                expect(screen.getByText(/00:01/)).toBeInTheDocument();
            });

            // Advance past expiry
            act(() => {
                vi.advanceTimersByTime(2000);
            });

            await waitFor(() => {
                expect(onExpiry).toHaveBeenCalled();
            });
        });
    });

    describe('Heartbeat Mechanism', () => {
        it('should send heartbeat every 30 seconds', async () => {
            vi.mocked(sessionTimerApi.fetchRemainingTime).mockResolvedValue({
                sessionId: mockSessionId,
                remainingMinutes: 60,
                status: 'active',
                lastHeartbeat: new Date().toISOString(),
            });

            vi.mocked(sessionTimerApi.sendHeartbeat).mockResolvedValue({
                sessionId: mockSessionId,
                remainingMinutes: 60,
                status: 'active',
                lastHeartbeat: new Date().toISOString(),
            });

            render(
                <AssessmentTimer
                    sessionId={mockSessionId}
                    sessionToken={mockSessionToken}
                />
            );

            await waitFor(() => {
                expect(screen.getByRole('timer')).toBeInTheDocument();
            });

            // Advance 30 seconds
            await act(async () => {
                vi.advanceTimersByTime(30000);
            });

            await waitFor(() => {
                expect(sessionTimerApi.sendHeartbeat).toHaveBeenCalledWith(
                    mockSessionId,
                    mockSessionToken
                );
            });
        });

        it('should pause heartbeat when tab is hidden', async () => {
            vi.mocked(sessionTimerApi.fetchRemainingTime).mockResolvedValue({
                sessionId: mockSessionId,
                remainingMinutes: 60,
                status: 'active',
                lastHeartbeat: new Date().toISOString(),
            });

            render(
                <AssessmentTimer
                    sessionId={mockSessionId}
                    sessionToken={mockSessionToken}
                />
            );

            await waitFor(() => {
                expect(screen.getByRole('timer')).toBeInTheDocument();
            });

            // Simulate tab becoming hidden
            Object.defineProperty(document, 'hidden', {
                configurable: true,
                get: () => true,
            });
            document.dispatchEvent(new Event('visibilitychange'));

            // Advance 30 seconds
            await act(async () => {
                vi.advanceTimersByTime(30000);
            });

            // Heartbeat should not be sent when tab is hidden
            expect(sessionTimerApi.sendHeartbeat).not.toHaveBeenCalled();
        });

        it('should handle rate limit error (429) gracefully', async () => {
            vi.mocked(sessionTimerApi.fetchRemainingTime).mockResolvedValue({
                sessionId: mockSessionId,
                remainingMinutes: 60,
                status: 'active',
                lastHeartbeat: new Date().toISOString(),
            });

            const rateLimitError = new sessionTimerApi.RateLimitError(
                'Rate limit exceeded',
                10
            );
            vi.mocked(sessionTimerApi.sendHeartbeat).mockRejectedValue(rateLimitError);

            const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});

            render(
                <AssessmentTimer
                    sessionId={mockSessionId}
                    sessionToken={mockSessionToken}
                />
            );

            await waitFor(() => {
                expect(screen.getByRole('timer')).toBeInTheDocument();
            });

            // Advance 30 seconds to trigger heartbeat
            await act(async () => {
                vi.advanceTimersByTime(30000);
            });

            await waitFor(() => {
                expect(consoleWarn).toHaveBeenCalledWith(
                    expect.stringContaining('Rate limited')
                );
            });

            consoleWarn.mockRestore();
        });
    });

    describe('Network Handling', () => {
        it('should show reconnecting status when offline', async () => {
            vi.mocked(sessionTimerApi.fetchRemainingTime).mockResolvedValue({
                sessionId: mockSessionId,
                remainingMinutes: 60,
                status: 'active',
                lastHeartbeat: new Date().toISOString(),
            });

            render(
                <AssessmentTimer
                    sessionId={mockSessionId}
                    sessionToken={mockSessionToken}
                />
            );

            await waitFor(() => {
                expect(screen.getByRole('timer')).toBeInTheDocument();
            });

            // Simulate offline event
            act(() => {
                window.dispatchEvent(new Event('offline'));
            });

            await waitFor(() => {
                expect(screen.getByText(/Reconnecting.../)).toBeInTheDocument();
            });
        });

        it('should sync with server when coming back online', async () => {
            vi.mocked(sessionTimerApi.fetchRemainingTime).mockResolvedValue({
                sessionId: mockSessionId,
                remainingMinutes: 60,
                status: 'active',
                lastHeartbeat: new Date().toISOString(),
            });

            render(
                <AssessmentTimer
                    sessionId={mockSessionId}
                    sessionToken={mockSessionToken}
                />
            );

            await waitFor(() => {
                expect(screen.getByRole('timer')).toBeInTheDocument();
            });

            // Clear initial fetch call
            vi.mocked(sessionTimerApi.fetchRemainingTime).mockClear();

            // Simulate offline then online
            act(() => {
                window.dispatchEvent(new Event('offline'));
            });

            await act(async () => {
                window.dispatchEvent(new Event('online'));
            });

            await waitFor(() => {
                // Should fetch remaining time again
                expect(sessionTimerApi.fetchRemainingTime).toHaveBeenCalled();
            });
        });

        it('should hide timer during reconnect if autoHide is true', async () => {
            vi.mocked(sessionTimerApi.fetchRemainingTime).mockResolvedValue({
                sessionId: mockSessionId,
                remainingMinutes: 60,
                status: 'active',
                lastHeartbeat: new Date().toISOString(),
            });

            const { container } = render(
                <AssessmentTimer
                    sessionId={mockSessionId}
                    sessionToken={mockSessionToken}
                    autoHide={true}
                />
            );

            await waitFor(() => {
                expect(screen.getByRole('timer')).toBeInTheDocument();
            });

            // Simulate offline
            act(() => {
                window.dispatchEvent(new Event('offline'));
            });

            await waitFor(() => {
                expect(container.firstChild).toBeNull();
            });
        });
    });

    describe('Visual Design and Color Coding', () => {
        it('should display normal color for > 5 minutes', async () => {
            vi.mocked(sessionTimerApi.fetchRemainingTime).mockResolvedValue({
                sessionId: mockSessionId,
                remainingMinutes: 10,
                status: 'active',
                lastHeartbeat: new Date().toISOString(),
            });

            render(
                <AssessmentTimer
                    sessionId={mockSessionId}
                    sessionToken={mockSessionToken}
                />
            );

            await waitFor(() => {
                const timer = screen.getByRole('timer');
                expect(timer).toHaveClass('text-gray-900');
            });
        });

        it('should display warning color for ≤ 5 minutes', async () => {
            vi.mocked(sessionTimerApi.fetchRemainingTime).mockResolvedValue({
                sessionId: mockSessionId,
                remainingMinutes: 5,
                status: 'active',
                lastHeartbeat: new Date().toISOString(),
            });

            render(
                <AssessmentTimer
                    sessionId={mockSessionId}
                    sessionToken={mockSessionToken}
                    showWarnings={true}
                />
            );

            await waitFor(() => {
                const timer = screen.getByRole('timer');
                expect(timer).toHaveClass('text-amber-600');
                expect(screen.getByLabelText('Warning')).toBeInTheDocument();
            });
        });

        it('should display critical color and pulse for ≤ 2 minutes', async () => {
            vi.mocked(sessionTimerApi.fetchRemainingTime).mockResolvedValue({
                sessionId: mockSessionId,
                remainingMinutes: 2,
                status: 'active',
                lastHeartbeat: new Date().toISOString(),
            });

            render(
                <AssessmentTimer
                    sessionId={mockSessionId}
                    sessionToken={mockSessionToken}
                />
            );

            await waitFor(() => {
                const timer = screen.getByRole('timer');
                expect(timer).toHaveClass('text-red-600');
                expect(timer).toHaveClass('animate-pulse');
            });
        });

        it('should update color dynamically as time decreases', async () => {
            vi.mocked(sessionTimerApi.fetchRemainingTime).mockResolvedValue({
                sessionId: mockSessionId,
                remainingMinutes: 5.016667, // 5 minutes 1 second
                status: 'active',
                lastHeartbeat: new Date().toISOString(),
            });

            render(
                <AssessmentTimer
                    sessionId={mockSessionId}
                    sessionToken={mockSessionToken}
                />
            );

            await waitFor(() => {
                const timer = screen.getByRole('timer');
                expect(timer).toHaveClass('text-amber-600'); // Warning
            });

            // Advance to critical threshold (2 minutes)
            await act(async () => {
                vi.advanceTimersByTime(3 * 60 * 1000); // 3 minutes
            });

            await waitFor(() => {
                const timer = screen.getByRole('timer');
                expect(timer).toHaveClass('text-red-600'); // Critical
                expect(timer).toHaveClass('animate-pulse');
            });
        });
    });

    describe('Session Expired Modal', () => {
        it('should show modal when session expires', async () => {
            vi.mocked(sessionTimerApi.fetchRemainingTime).mockResolvedValue({
                sessionId: mockSessionId,
                remainingMinutes: 0.016667, // 1 second
                status: 'active',
                lastHeartbeat: new Date().toISOString(),
            });

            render(
                <AssessmentTimer
                    sessionId={mockSessionId}
                    sessionToken={mockSessionToken}
                />
            );

            await waitFor(() => {
                expect(screen.getByRole('timer')).toBeInTheDocument();
            });

            // Advance past expiry
            await act(async () => {
                vi.advanceTimersByTime(2000);
            });

            await waitFor(() => {
                expect(screen.getByRole('dialog')).toBeInTheDocument();
                expect(screen.getByText('Session Expired')).toBeInTheDocument();
                expect(
                    screen.getByText(/Please contact HR to reschedule/)
                ).toBeInTheDocument();
            });
        });

        it('should show modal on SessionExpiredError from API', async () => {
            vi.mocked(sessionTimerApi.fetchRemainingTime).mockRejectedValue(
                new sessionTimerApi.SessionExpiredError('Session expired')
            );

            render(
                <AssessmentTimer
                    sessionId={mockSessionId}
                    sessionToken={mockSessionToken}
                />
            );

            await waitFor(() => {
                expect(screen.getByRole('dialog')).toBeInTheDocument();
                expect(screen.getByText('Session Expired')).toBeInTheDocument();
            });
        });

        it('should call onExpiry callback when modal is shown', async () => {
            vi.mocked(sessionTimerApi.fetchRemainingTime).mockResolvedValue({
                sessionId: mockSessionId,
                remainingMinutes: 0.016667,
                status: 'active',
                lastHeartbeat: new Date().toISOString(),
            });

            const onExpiry = vi.fn();

            render(
                <AssessmentTimer
                    sessionId={mockSessionId}
                    sessionToken={mockSessionToken}
                    onExpiry={onExpiry}
                />
            );

            await waitFor(() => {
                expect(screen.getByRole('timer')).toBeInTheDocument();
            });

            await act(async () => {
                vi.advanceTimersByTime(2000);
            });

            await waitFor(() => {
                expect(onExpiry).toHaveBeenCalled();
            });
        });
    });

    describe('Accessibility Features', () => {
        it('should have ARIA live region with proper attributes', async () => {
            vi.mocked(sessionTimerApi.fetchRemainingTime).mockResolvedValue({
                sessionId: mockSessionId,
                remainingMinutes: 60,
                status: 'active',
                lastHeartbeat: new Date().toISOString(),
            });

            render(
                <AssessmentTimer
                    sessionId={mockSessionId}
                    sessionToken={mockSessionToken}
                />
            );

            await waitFor(() => {
                const timer = screen.getByRole('timer');
                expect(timer).toHaveAttribute('aria-live', 'polite');
                expect(timer).toHaveAttribute('aria-atomic', 'true');
            });
        });

        it('should announce milestone at 10 minutes', async () => {
            vi.mocked(sessionTimerApi.fetchRemainingTime).mockResolvedValue({
                sessionId: mockSessionId,
                remainingMinutes: 10.016667, // Just above 10 minutes
                status: 'active',
                lastHeartbeat: new Date().toISOString(),
            });

            render(
                <AssessmentTimer
                    sessionId={mockSessionId}
                    sessionToken={mockSessionToken}
                    showWarnings={true}
                />
            );

            await waitFor(() => {
                expect(screen.getByRole('timer')).toBeInTheDocument();
            });

            // Advance to exactly 10 minutes
            await act(async () => {
                vi.advanceTimersByTime(2000);
            });

            // ARIA live region should update (announcement happens automatically)
            await waitFor(() => {
                expect(screen.getByText(/10:00/)).toBeInTheDocument();
            });
        });

        it('should have accessible modal with focus management', async () => {
            vi.mocked(sessionTimerApi.fetchRemainingTime).mockResolvedValue({
                sessionId: mockSessionId,
                remainingMinutes: 0.016667,
                status: 'active',
                lastHeartbeat: new Date().toISOString(),
            });

            render(
                <AssessmentTimer
                    sessionId={mockSessionId}
                    sessionToken={mockSessionToken}
                />
            );

            await act(async () => {
                vi.advanceTimersByTime(2000);
            });

            await waitFor(() => {
                const dialog = screen.getByRole('dialog');
                expect(dialog).toHaveAttribute('aria-labelledby', 'expired-title');
                expect(dialog).toHaveAttribute('aria-describedby', 'expired-description');
                
                const closeButton = screen.getByRole('button', { name: /Close/i });
                expect(closeButton).toHaveAttribute('autoFocus');
            });
        });
    });
});
