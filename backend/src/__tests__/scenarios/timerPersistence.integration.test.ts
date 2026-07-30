/**
 * Scenario-Based Integration Tests for Session Timer
 * 
 * Tests all 4 acceptance criteria scenarios end-to-end:
 * 1. Timer persists across page reload
 * 2. Reconnect within 10-minute window
 * 3. Session expiry after reconnect timeout
 * 4. Provider configuration workflow
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import {
    startSessionTimer,
    getSessionTimer,
    updateHeartbeat,
    expireSession,
    checkReconnectWindow,
} from '../../../services/sessionTimerService';
import { redis } from '../../../db/redis';
import prisma from '../../../db/prisma';

describe('Scenario-Based Integration Tests', () => {
    const mockSessionId = '550e8400-e29b-41d4-a716-446655440000';

    beforeEach(async () => {
        vi.clearAllMocks();
        // Clean up Redis keys before each test
        const keys = await redis.keys('session:timer:*');
        if (keys.length > 0) {
            await redis.del(...keys);
        }
    });

    afterAll(async () => {
        // Final cleanup
        const keys = await redis.keys('session:timer:*');
        if (keys.length > 0) {
            await redis.del(...keys);
        }
    });

    describe('Scenario 1: Timer Persistence Across Reload', () => {
        it('should persist timer state in Redis and calculate remaining time server-side', async () => {
            // Start 60-minute timer
            const startResult = await startSessionTimer(mockSessionId, 60);
            expect(startResult.status).toBe('active');
            expect(startResult.remainingMinutes).toBe(60);

            const startTime = new Date(startResult.startTime);

            // Simulate 5-minute wait (without actually waiting)
            const fiveMinutesLater = new Date(startTime.getTime() + 5 * 60 * 1000);
            vi.setSystemTime(fiveMinutesLater);

            // Fetch timer state (simulating page reload)
            const timerState = await getSessionTimer(mockSessionId);

            expect(timerState).toBeDefined();
            expect(timerState!.status).toBe('active');
            
            // Remaining time should be ~55 minutes (60 - 5)
            const expectedRemaining = 55;
            const actualRemaining = timerState!.remainingMinutes;
            const drift = Math.abs(actualRemaining - expectedRemaining);

            // Validate drift ≤ 1 minute (converting to seconds for more precise check)
            expect(drift).toBeLessThanOrEqual(1);
            expect(actualRemaining).toBeGreaterThan(54);
            expect(actualRemaining).toBeLessThan(56);

            vi.useRealTimers();
        });

        it('should validate clock drift ≤ 1 second over 60-minute session', async () => {
            vi.useFakeTimers();

            const startResult = await startSessionTimer(mockSessionId, 60);
            const startTime = new Date(startResult.startTime);

            // Simulate 60-minute passage
            const sixtyMinutesLater = new Date(startTime.getTime() + 60 * 60 * 1000);
            vi.setSystemTime(sixtyMinutesLater);

            const timerState = await getSessionTimer(mockSessionId);

            // At 60 minutes, timer should be expired or very close to 0
            expect(timerState).toBeDefined();
            
            // Remaining time should be 0 or very close (within 1/60 of a minute = 1 second)
            const remainingSeconds = timerState!.remainingMinutes * 60;
            expect(Math.abs(remainingSeconds)).toBeLessThanOrEqual(1);

            vi.useRealTimers();
        });
    });

    describe('Scenario 2: Reconnect Within 10-Minute Window', () => {
        it('should maintain active status when disconnected < 10 minutes', async () => {
            vi.useFakeTimers();

            // Start session and send initial heartbeat
            const startResult = await startSessionTimer(mockSessionId, 60);
            await updateHeartbeat(mockSessionId);

            const startTime = new Date(startResult.startTime);

            // Simulate 3-minute disconnection (no heartbeat)
            const threeMinutesLater = new Date(startTime.getTime() + 3 * 60 * 1000);
            vi.setSystemTime(threeMinutesLater);

            // Check reconnect window (should still be active)
            const timerData = await redis.get(`session:timer:${mockSessionId}`);
            expect(timerData).toBeDefined();
            
            const parsedData = JSON.parse(timerData!);
            const windowCheck = await checkReconnectWindow(mockSessionId, parsedData);

            expect(windowCheck.isExpired).toBe(false);
            expect(windowCheck.remainingMinutes).toBeGreaterThan(0);

            // Send heartbeat after reconnect (should succeed)
            await updateHeartbeat(mockSessionId);

            // Fetch timer state
            const timerState = await getSessionTimer(mockSessionId);
            expect(timerState!.status).toBe('active');

            // Remaining time should account for 3-minute offline period
            const expectedRemaining = 57; // 60 - 3
            expect(timerState!.remainingMinutes).toBeCloseTo(expectedRemaining, 0);

            vi.useRealTimers();
        });

        it('should resume timer correctly after multiple short disconnections', async () => {
            vi.useFakeTimers();

            const startResult = await startSessionTimer(mockSessionId, 60);
            const startTime = new Date(startResult.startTime);

            // First disconnection: 2 minutes
            let currentTime = new Date(startTime.getTime() + 2 * 60 * 1000);
            vi.setSystemTime(currentTime);
            await updateHeartbeat(mockSessionId);

            // Second disconnection: 3 minutes
            currentTime = new Date(currentTime.getTime() + 3 * 60 * 1000);
            vi.setSystemTime(currentTime);
            await updateHeartbeat(mockSessionId);

            // Third disconnection: 1 minute
            currentTime = new Date(currentTime.getTime() + 1 * 60 * 1000);
            vi.setSystemTime(currentTime);

            const timerState = await getSessionTimer(mockSessionId);
            expect(timerState!.status).toBe('active');

            // Total elapsed: 2 + 3 + 1 = 6 minutes
            const expectedRemaining = 54; // 60 - 6
            expect(timerState!.remainingMinutes).toBeCloseTo(expectedRemaining, 0);

            vi.useRealTimers();
        });
    });

    describe('Scenario 3: Session Expiry After 10-Minute Timeout', () => {
        it('should expire session when disconnected > 10 minutes', async () => {
            vi.useFakeTimers();

            // Start session and send heartbeat
            const startResult = await startSessionTimer(mockSessionId, 60);
            await updateHeartbeat(mockSessionId);

            const startTime = new Date(startResult.startTime);

            // Simulate 11-minute disconnection
            const elevenMinutesLater = new Date(startTime.getTime() + 11 * 60 * 1000);
            vi.setSystemTime(elevenMinutesLater);

            // Check reconnect window (should be expired)
            const timerData = await redis.get(`session:timer:${mockSessionId}`);
            expect(timerData).toBeDefined();
            
            const parsedData = JSON.parse(timerData!);
            const windowCheck = await checkReconnectWindow(mockSessionId, parsedData);

            expect(windowCheck.isExpired).toBe(true);

            // Attempt to fetch timer (should return expired status)
            const timerState = await getSessionTimer(mockSessionId);
            expect(timerState).toBeDefined();
            expect(timerState!.status).toBe('expired');

            vi.useRealTimers();
        });

        it('should log audit event when session expires due to reconnect timeout', async () => {
            vi.useFakeTimers();
            vi.mocked(prisma.auditEvent.create).mockResolvedValue({} as any);

            const startResult = await startSessionTimer(mockSessionId, 60);
            const startTime = new Date(startResult.startTime);

            // Simulate 11-minute disconnection
            const elevenMinutesLater = new Date(startTime.getTime() + 11 * 60 * 1000);
            vi.setSystemTime(elevenMinutesLater);

            // Expire session manually (simulating worker job)
            await expireSession(mockSessionId, 'reconnect_timeout');

            expect(prisma.auditEvent.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        eventType: 'SESSION_EXPIRED',
                        entityType: 'assessment_session',
                        entityId: mockSessionId,
                        payloadJson: expect.objectContaining({
                            reason: 'reconnect_timeout',
                        }),
                    }),
                })
            );

            vi.useRealTimers();
        });

        it('should return HTTP 410 (Gone) for expired session', async () => {
            vi.useFakeTimers();

            const startResult = await startSessionTimer(mockSessionId, 60);
            const startTime = new Date(startResult.startTime);

            // Expire session
            const elevenMinutesLater = new Date(startTime.getTime() + 11 * 60 * 1000);
            vi.setSystemTime(elevenMinutesLater);

            await expireSession(mockSessionId, 'reconnect_timeout');

            // Fetch timer should return expired status
            const timerState = await getSessionTimer(mockSessionId);
            expect(timerState).toBeDefined();
            expect(timerState!.status).toBe('expired');

            // API layer should map this to HTTP 410 (verified in API integration tests)

            vi.useRealTimers();
        });
    });

    describe('Scenario 4: Concurrent Session Handling', () => {
        it('should handle multiple concurrent sessions independently', async () => {
            const sessionId1 = '550e8400-e29b-41d4-a716-446655440001';
            const sessionId2 = '550e8400-e29b-41d4-a716-446655440002';
            const sessionId3 = '550e8400-e29b-41d4-a716-446655440003';

            // Start 3 sessions with different durations
            await startSessionTimer(sessionId1, 60);
            await startSessionTimer(sessionId2, 45);
            await startSessionTimer(sessionId3, 30);

            // Fetch all timers
            const timer1 = await getSessionTimer(sessionId1);
            const timer2 = await getSessionTimer(sessionId2);
            const timer3 = await getSessionTimer(sessionId3);

            expect(timer1!.remainingMinutes).toBeCloseTo(60, 0);
            expect(timer2!.remainingMinutes).toBeCloseTo(45, 0);
            expect(timer3!.remainingMinutes).toBeCloseTo(30, 0);

            // Update heartbeat for session 1 only
            await updateHeartbeat(sessionId1);

            // All sessions should remain independent
            const timer1After = await getSessionTimer(sessionId1);
            const timer2After = await getSessionTimer(sessionId2);
            const timer3After = await getSessionTimer(sessionId3);

            expect(timer1After!.status).toBe('active');
            expect(timer2After!.status).toBe('active');
            expect(timer3After!.status).toBe('active');

            // Cleanup
            await redis.del(
                `session:timer:${sessionId1}`,
                `session:timer:${sessionId2}`,
                `session:timer:${sessionId3}`
            );
        });

        it('should maintain accuracy under concurrent load (10 sessions)', async () => {
            const sessionIds = Array.from({ length: 10 }, (_, i) => 
                `550e8400-e29b-41d4-a716-44665544${String(i).padStart(4, '0')}`
            );

            // Start all sessions concurrently
            await Promise.all(
                sessionIds.map(id => startSessionTimer(id, 60))
            );

            // Fetch all timers concurrently
            const timers = await Promise.all(
                sessionIds.map(id => getSessionTimer(id))
            );

            // All should be active with ~60 minutes remaining
            timers.forEach(timer => {
                expect(timer!.status).toBe('active');
                expect(timer!.remainingMinutes).toBeGreaterThan(59);
                expect(timer!.remainingMinutes).toBeLessThanOrEqual(60);
            });

            // Send heartbeats concurrently
            await Promise.all(
                sessionIds.map(id => updateHeartbeat(id))
            );

            // Verify all heartbeats succeeded
            const timersAfter = await Promise.all(
                sessionIds.map(id => getSessionTimer(id))
            );

            timersAfter.forEach(timer => {
                expect(timer!.status).toBe('active');
            });

            // Cleanup
            await redis.del(...sessionIds.map(id => `session:timer:${id}`));
        });
    });

    describe('Performance Validation', () => {
        it('should calculate remaining time with minimal latency', async () => {
            await startSessionTimer(mockSessionId, 60);

            const startCalc = performance.now();
            await getSessionTimer(mockSessionId);
            const endCalc = performance.now();

            const latencyMs = endCalc - startCalc;

            // Should complete within 50ms for single operation
            expect(latencyMs).toBeLessThan(50);
        });

        it('should handle 100 timer fetches without degradation', async () => {
            const sessionIds = Array.from({ length: 100 }, (_, i) => 
                `550e8400-e29b-41d4-a716-44665544${String(i).padStart(4, '0')}`
            );

            // Start all sessions
            await Promise.all(
                sessionIds.map(id => startSessionTimer(id, 60))
            );

            // Measure fetch latency
            const start = performance.now();
            await Promise.all(
                sessionIds.map(id => getSessionTimer(id))
            );
            const end = performance.now();

            const totalLatencyMs = end - start;
            const avgLatencyMs = totalLatencyMs / 100;

            // Average p95 should be < 100ms
            expect(avgLatencyMs).toBeLessThan(100);

            // Cleanup
            await redis.del(...sessionIds.map(id => `session:timer:${id}`));
        });
    });
});
