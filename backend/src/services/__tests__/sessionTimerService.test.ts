/**
 * Unit Tests for Session Timer Service
 * 
 * Tests server-authoritative timer logic with Redis storage.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    startSessionTimer,
    getSessionTimer,
    updateHeartbeat,
    expireSession,
    checkReconnectWindow,
    getActiveSessionIds
} from '../sessionTimerService';
import { redis } from '../../db/redis';
import prisma from '../../db/prisma';

// Mock Redis client
vi.mock('../../db/redis', () => ({
    redis: {
        setex: vi.fn(),
        get: vi.fn(),
        set: vi.fn(),
        ttl: vi.fn(),
        keys: vi.fn(),
    },
}));

// Mock Prisma client
vi.mock('../../db/prisma', () => ({
    default: {
        auditEvent: {
            create: vi.fn(),
        },
    },
}));

// Mock logger
vi.mock('../../utils/logger', () => ({
    default: {
        info: vi.fn(),
        debug: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    },
}));

describe('Session Timer Service', () => {
    const mockSessionId = '550e8400-e29b-41d4-a716-446655440000';
    const mockDurationMinutes = 60;

    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    describe('startSessionTimer', () => {
        it('should create timer with correct TTL', async () => {
            vi.mocked(redis.setex).mockResolvedValue('OK');

            const now = new Date('2026-07-27T12:00:00Z');
            vi.setSystemTime(now);

            const result = await startSessionTimer(mockSessionId, mockDurationMinutes);

            // TTL = duration (60) + reconnect window (10) + buffer (5) = 75 minutes = 4500 seconds
            const expectedTTL = (60 + 10 + 5) * 60;
            
            expect(redis.setex).toHaveBeenCalledWith(
                `session:timer:${mockSessionId}`,
                expectedTTL,
                expect.stringContaining('"durationMinutes":60')
            );

            expect(result).toEqual({
                sessionId: mockSessionId,
                startTime: now.toISOString(),
                durationMinutes: mockDurationMinutes,
                lastHeartbeat: now.toISOString(),
                status: 'active',
                remainingMinutes: mockDurationMinutes
            });
        });

        it('should store timer data with active status', async () => {
            vi.mocked(redis.setex).mockResolvedValue('OK');

            await startSessionTimer(mockSessionId, 30);

            const setexCall = vi.mocked(redis.setex).mock.calls[0];
            const storedData = JSON.parse(setexCall[2] as string);

            expect(storedData).toMatchObject({
                durationMinutes: 30,
                status: 'active'
            });
            expect(storedData.startTime).toBeTruthy();
            expect(storedData.lastHeartbeat).toBeTruthy();
        });
    });

    describe('getSessionTimer', () => {
        it('should return null when timer does not exist', async () => {
            vi.mocked(redis.get).mockResolvedValue(null);

            const result = await getSessionTimer(mockSessionId);

            expect(result).toBeNull();
            expect(redis.get).toHaveBeenCalledWith(`session:timer:${mockSessionId}`);
        });

        it('should calculate remaining time correctly', async () => {
            const startTime = new Date('2026-07-27T12:00:00Z');
            const currentTime = new Date('2026-07-27T12:30:00Z'); // 30 minutes later

            vi.setSystemTime(currentTime);

            const timerData = {
                startTime: startTime.toISOString(),
                durationMinutes: 60,
                lastHeartbeat: currentTime.toISOString(),
                status: 'active'
            };

            vi.mocked(redis.get).mockResolvedValue(JSON.stringify(timerData));

            const result = await getSessionTimer(mockSessionId);

            expect(result).toMatchObject({
                sessionId: mockSessionId,
                remainingMinutes: 30, // 60 - 30 elapsed
                status: 'active'
            });
        });

        it('should return zero remaining time when duration exceeded', async () => {
            const startTime = new Date('2026-07-27T12:00:00Z');
            const currentTime = new Date('2026-07-27T13:30:00Z'); // 90 minutes later

            vi.setSystemTime(currentTime);

            const timerData = {
                startTime: startTime.toISOString(),
                durationMinutes: 60,
                lastHeartbeat: currentTime.toISOString(),
                status: 'active'
            };

            vi.mocked(redis.get).mockResolvedValue(JSON.stringify(timerData));
            vi.mocked(redis.ttl).mockResolvedValue(300);
            vi.mocked(redis.setex).mockResolvedValue('OK');
            vi.mocked(prisma.auditEvent.create).mockResolvedValue({} as any);

            const result = await getSessionTimer(mockSessionId);

            // Should be expired due to time limit reached
            expect(result?.status).toBe('expired');
            expect(result?.remainingMinutes).toBe(0);
        });

        it('should have clock drift tolerance ≤ 1 second', async () => {
            const startTime = new Date('2026-07-27T12:00:00.000Z');
            const currentTime = new Date('2026-07-27T12:00:30.500Z'); // 30.5 seconds later

            vi.setSystemTime(currentTime);

            const timerData = {
                startTime: startTime.toISOString(),
                durationMinutes: 60,
                lastHeartbeat: currentTime.toISOString(),
                status: 'active'
            };

            vi.mocked(redis.get).mockResolvedValue(JSON.stringify(timerData));

            const result = await getSessionTimer(mockSessionId);

            // 30.5 seconds = 0.508333 minutes
            const expectedRemaining = 60 - 0.508333;
            const drift = Math.abs(result!.remainingMinutes - expectedRemaining);

            // Drift should be less than 1 second = 0.01667 minutes
            expect(drift).toBeLessThan(0.02);
        });
    });

    describe('updateHeartbeat', () => {
        it('should return null when timer does not exist', async () => {
            vi.mocked(redis.get).mockResolvedValue(null);

            const result = await updateHeartbeat(mockSessionId);

            expect(result).toBeNull();
        });

        it('should update heartbeat timestamp', async () => {
            const startTime = new Date('2026-07-27T12:00:00Z');
            const oldHeartbeat = new Date('2026-07-27T12:10:00Z');
            const newHeartbeat = new Date('2026-07-27T12:20:00Z');

            vi.setSystemTime(newHeartbeat);

            const timerData = {
                startTime: startTime.toISOString(),
                durationMinutes: 60,
                lastHeartbeat: oldHeartbeat.toISOString(),
                status: 'active'
            };

            vi.mocked(redis.get).mockResolvedValue(JSON.stringify(timerData));
            vi.mocked(redis.ttl).mockResolvedValue(3000);
            vi.mocked(redis.setex).mockResolvedValue('OK');

            const result = await updateHeartbeat(mockSessionId);

            expect(result?.lastHeartbeat).toBe(newHeartbeat.toISOString());
            
            // Verify Redis update was called
            const setexCall = vi.mocked(redis.setex).mock.calls[0];
            const updatedData = JSON.parse(setexCall[2] as string);
            expect(updatedData.lastHeartbeat).toBe(newHeartbeat.toISOString());
        });

        it('should not update heartbeat for expired session', async () => {
            const timerData = {
                startTime: new Date().toISOString(),
                durationMinutes: 60,
                lastHeartbeat: new Date().toISOString(),
                status: 'expired'
            };

            vi.mocked(redis.get).mockResolvedValue(JSON.stringify(timerData));

            const result = await updateHeartbeat(mockSessionId);

            expect(result?.status).toBe('expired');
            expect(result?.remainingMinutes).toBe(0);
            expect(redis.setex).not.toHaveBeenCalled();
        });

        it('should preserve TTL when updating heartbeat', async () => {
            const timerData = {
                startTime: new Date().toISOString(),
                durationMinutes: 60,
                lastHeartbeat: new Date().toISOString(),
                status: 'active'
            };

            vi.mocked(redis.get).mockResolvedValue(JSON.stringify(timerData));
            vi.mocked(redis.ttl).mockResolvedValue(2400); // 40 minutes remaining
            vi.mocked(redis.setex).mockResolvedValue('OK');

            await updateHeartbeat(mockSessionId);

            expect(redis.ttl).toHaveBeenCalledWith(`session:timer:${mockSessionId}`);
            expect(redis.setex).toHaveBeenCalledWith(
                `session:timer:${mockSessionId}`,
                2400,
                expect.any(String)
            );
        });
    });

    describe('expireSession', () => {
        it('should mark session as expired in Redis', async () => {
            const timerData = {
                startTime: new Date().toISOString(),
                durationMinutes: 60,
                lastHeartbeat: new Date().toISOString(),
                status: 'active'
            };

            vi.mocked(redis.get).mockResolvedValue(JSON.stringify(timerData));
            vi.mocked(redis.ttl).mockResolvedValue(1200);
            vi.mocked(redis.setex).mockResolvedValue('OK');
            vi.mocked(prisma.auditEvent.create).mockResolvedValue({} as any);

            await expireSession(mockSessionId, 'reconnect_timeout');

            const setexCall = vi.mocked(redis.setex).mock.calls[0];
            const updatedData = JSON.parse(setexCall[2] as string);
            expect(updatedData.status).toBe('expired');
        });

        it('should create audit event with reason', async () => {
            vi.mocked(redis.get).mockResolvedValue(null);
            vi.mocked(prisma.auditEvent.create).mockResolvedValue({} as any);

            const result = await expireSession(mockSessionId, 'manual_termination');

            expect(prisma.auditEvent.create).toHaveBeenCalledWith({
                data: expect.objectContaining({
                    eventType: 'SESSION_EXPIRED',
                    entityType: 'assessment_session',
                    entityId: mockSessionId,
                    details: expect.objectContaining({
                        reason: 'manual_termination'
                    })
                })
            });

            expect(result.reason).toBe('manual_termination');
        });

        it('should not fail if audit event creation fails', async () => {
            vi.mocked(redis.get).mockResolvedValue(null);
            vi.mocked(prisma.auditEvent.create).mockRejectedValue(new Error('DB error'));

            // Should not throw - error is logged but operation completes
            const result = await expireSession(mockSessionId, 'time_limit_reached');

            expect(result).toMatchObject({
                sessionId: mockSessionId,
                reason: 'time_limit_reached'
            });
        });
    });

    describe('checkReconnectWindow', () => {
        it('should return not expired when within 10-minute window', async () => {
            const now = new Date('2026-07-27T12:00:00Z');
            const lastHeartbeat = new Date('2026-07-27T11:55:00Z'); // 5 minutes ago

            vi.setSystemTime(now);

            const timerData = {
                startTime: new Date('2026-07-27T11:00:00Z').toISOString(),
                durationMinutes: 90,
                lastHeartbeat: lastHeartbeat.toISOString(),
                status: 'active'
            };

            const result = await checkReconnectWindow(mockSessionId, timerData);

            expect(result.isExpired).toBe(false);
            expect(result.remainingMinutes).toBeGreaterThan(0);
        });

        it('should expire session when reconnect window exceeded', async () => {
            const now = new Date('2026-07-27T12:00:00Z');
            const lastHeartbeat = new Date('2026-07-27T11:49:00Z'); // 11 minutes ago

            vi.setSystemTime(now);

            const timerData = {
                startTime: new Date('2026-07-27T11:00:00Z').toISOString(),
                durationMinutes: 90,
                lastHeartbeat: lastHeartbeat.toISOString(),
                status: 'active'
            };

            vi.mocked(redis.get).mockResolvedValue(JSON.stringify(timerData));
            vi.mocked(redis.ttl).mockResolvedValue(3000);
            vi.mocked(redis.setex).mockResolvedValue('OK');
            vi.mocked(prisma.auditEvent.create).mockResolvedValue({} as any);

            const result = await checkReconnectWindow(mockSessionId, timerData);

            expect(result.isExpired).toBe(true);
            expect(result.remainingMinutes).toBe(0);
            expect(prisma.auditEvent.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        details: expect.objectContaining({
                            reason: 'reconnect_timeout'
                        })
                    })
                })
            );
        });

        it('should expire session when time limit reached', async () => {
            const now = new Date('2026-07-27T13:00:00Z');

            vi.setSystemTime(now);

            const timerData = {
                startTime: new Date('2026-07-27T12:00:00Z').toISOString(),
                durationMinutes: 30, // 30-minute assessment
                lastHeartbeat: now.toISOString(), // Heartbeat is current
                status: 'active'
            };

            vi.mocked(redis.get).mockResolvedValue(JSON.stringify(timerData));
            vi.mocked(redis.ttl).mockResolvedValue(900);
            vi.mocked(redis.setex).mockResolvedValue('OK');
            vi.mocked(prisma.auditEvent.create).mockResolvedValue({} as any);

            const result = await checkReconnectWindow(mockSessionId, timerData);

            expect(result.isExpired).toBe(true);
            expect(prisma.auditEvent.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        details: expect.objectContaining({
                            reason: 'time_limit_reached'
                        })
                    })
                })
            );
        });

        it('should return expired for already expired session', async () => {
            const timerData = {
                startTime: new Date().toISOString(),
                durationMinutes: 60,
                lastHeartbeat: new Date().toISOString(),
                status: 'expired'
            };

            const result = await checkReconnectWindow(mockSessionId, timerData);

            expect(result.isExpired).toBe(true);
            expect(result.remainingMinutes).toBe(0);
        });

        it('should fetch timer data from Redis when not provided', async () => {
            const timerData = {
                startTime: new Date().toISOString(),
                durationMinutes: 60,
                lastHeartbeat: new Date().toISOString(),
                status: 'active'
            };

            vi.mocked(redis.get).mockResolvedValue(JSON.stringify(timerData));

            await checkReconnectWindow(mockSessionId);

            expect(redis.get).toHaveBeenCalledWith(`session:timer:${mockSessionId}`);
        });
    });

    describe('getActiveSessionIds', () => {
        it('should return empty array when no sessions exist', async () => {
            vi.mocked(redis.keys).mockResolvedValue([]);

            const result = await getActiveSessionIds();

            expect(result).toEqual([]);
            expect(redis.keys).toHaveBeenCalledWith('session:timer:*');
        });

        it('should extract session IDs from Redis keys', async () => {
            const keys = [
                'session:timer:session-id-1',
                'session:timer:session-id-2',
                'session:timer:session-id-3'
            ];

            vi.mocked(redis.keys).mockResolvedValue(keys);

            const result = await getActiveSessionIds();

            expect(result).toEqual([
                'session-id-1',
                'session-id-2',
                'session-id-3'
            ]);
        });
    });
});
