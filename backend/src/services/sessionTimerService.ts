/**
 * Session Timer Service
 * 
 * Manages server-authoritative session timers with Redis storage.
 * Prevents client-side time manipulation and ensures fair assessment tracking.
 */

import { redis } from '../db/redis';
import prisma from '../db/prisma';
import logger from '../utils/logger';
import { 
    SessionTimerState, 
    SessionTimerData, 
    SessionExpiryEvent, 
    ReconnectWindowCheck 
} from '../types/sessionTimer';

/**
 * Redis key prefix for session timers
 */
const TIMER_KEY_PREFIX = 'session:timer:';

/**
 * Reconnect grace period in minutes
 */
const RECONNECT_WINDOW_MINUTES = 10;

/**
 * TTL buffer in minutes (for Redis key expiration)
 */
const TTL_BUFFER_MINUTES = 5;

/**
 * Start a new session timer
 * 
 * @param sessionId - Assessment session ID
 * @param durationMinutes - Total assessment duration in minutes
 * @returns Timer state
 */
export async function startSessionTimer(
    sessionId: string,
    durationMinutes: number
): Promise<SessionTimerState> {
    const now = new Date();
    const timerData: SessionTimerData = {
        startTime: now.toISOString(),
        durationMinutes,
        lastHeartbeat: now.toISOString(),
        status: 'active'
    };

    const key = `${TIMER_KEY_PREFIX}${sessionId}`;
    const ttlSeconds = (durationMinutes + RECONNECT_WINDOW_MINUTES + TTL_BUFFER_MINUTES) * 60;

    // Store timer data in Redis with TTL
    await redis.setex(key, ttlSeconds, JSON.stringify(timerData));

    logger.info({
        sessionId,
        durationMinutes,
        ttlSeconds
    }, 'Session timer started');

    return {
        sessionId,
        ...timerData,
        remainingMinutes: durationMinutes
    };
}

/**
 * Get current session timer state
 * 
 * @param sessionId - Assessment session ID
 * @returns Timer state or null if not found
 */
export async function getSessionTimer(
    sessionId: string
): Promise<SessionTimerState | null> {
    const key = `${TIMER_KEY_PREFIX}${sessionId}`;
    const data = await redis.get<string>(key);

    if (!data) {
        return null;
    }

    const timerData: SessionTimerData = JSON.parse(data);

    // Check reconnect window before returning state
    const reconnectCheck = await checkReconnectWindow(sessionId, timerData);
    
    if (reconnectCheck.isExpired) {
        return {
            sessionId,
            ...timerData,
            status: 'expired',
            remainingMinutes: 0
        };
    }

    // Calculate remaining time
    const now = new Date();
    const startTime = new Date(timerData.startTime);
    const elapsedMinutes = (now.getTime() - startTime.getTime()) / (1000 * 60);
    const remainingMinutes = Math.max(0, timerData.durationMinutes - elapsedMinutes);

    return {
        sessionId,
        ...timerData,
        remainingMinutes
    };
}

/**
 * Update heartbeat timestamp for a session
 * 
 * @param sessionId - Assessment session ID
 * @returns Updated timer state or null if not found
 */
export async function updateHeartbeat(
    sessionId: string
): Promise<SessionTimerState | null> {
    const key = `${TIMER_KEY_PREFIX}${sessionId}`;
    const data = await redis.get<string>(key);

    if (!data) {
        return null;
    }

    const timerData: SessionTimerData = JSON.parse(data);

    // Don't update if already expired
    if (timerData.status === 'expired') {
        return {
            sessionId,
            ...timerData,
            remainingMinutes: 0
        };
    }

    // Update heartbeat timestamp
    const now = new Date();
    timerData.lastHeartbeat = now.toISOString();

    // Get remaining TTL to preserve it
    const ttl = await redis.ttl(key);
    if (ttl > 0) {
        await redis.setex(key, ttl, JSON.stringify(timerData));
    } else {
        // Fallback if TTL expired but key still exists
        await redis.set(key, JSON.stringify(timerData));
    }

    logger.debug({
        sessionId,
        heartbeat: timerData.lastHeartbeat
    }, 'Heartbeat updated');

    // Calculate remaining time
    const startTime = new Date(timerData.startTime);
    const elapsedMinutes = (now.getTime() - startTime.getTime()) / (1000 * 60);
    const remainingMinutes = Math.max(0, timerData.durationMinutes - elapsedMinutes);

    return {
        sessionId,
        ...timerData,
        remainingMinutes
    };
}

/**
 * Expire a session and create audit event
 * 
 * @param sessionId - Assessment session ID
 * @param reason - Reason for expiry
 * @returns Expiry confirmation
 */
export async function expireSession(
    sessionId: string,
    reason: SessionExpiryEvent['reason']
): Promise<SessionExpiryEvent> {
    const key = `${TIMER_KEY_PREFIX}${sessionId}`;
    const data = await redis.get<string>(key);

    if (data) {
        const timerData: SessionTimerData = JSON.parse(data);
        timerData.status = 'expired';

        // Update status in Redis
        const ttl = await redis.ttl(key);
        if (ttl > 0) {
            await redis.setex(key, ttl, JSON.stringify(timerData));
        }
    }

    const expiredAt = new Date().toISOString();

    // Create audit event
    try {
        await prisma.auditEvent.create({
            data: {
                eventType: 'SESSION_EXPIRED',
                entityType: 'assessment_session',
                entityId: sessionId,
                details: {
                    reason,
                    expiredAt
                },
                ipAddress: null,
                userAgent: null
            }
        });

        logger.info({
            sessionId,
            reason,
            expiredAt
        }, 'Session expired');
    } catch (error) {
        // Non-blocking: log error but don't fail the expiry operation
        logger.error({
            error,
            sessionId,
            reason
        }, 'Failed to create audit event for session expiry');
    }

    return {
        sessionId,
        reason,
        expiredAt
    };
}

/**
 * Check if session has exceeded reconnect window
 * 
 * @param sessionId - Assessment session ID
 * @param timerData - Optional timer data (avoids Redis lookup if already fetched)
 * @returns Reconnect window check result
 */
export async function checkReconnectWindow(
    sessionId: string,
    timerData?: SessionTimerData
): Promise<ReconnectWindowCheck> {
    let data = timerData;

    if (!data) {
        const key = `${TIMER_KEY_PREFIX}${sessionId}`;
        const storedData = await redis.get<string>(key);
        
        if (!storedData) {
            return {
                isExpired: true,
                remainingMinutes: 0
            };
        }

        data = JSON.parse(storedData);
    }

    // Already marked as expired
    if (data.status === 'expired') {
        return {
            isExpired: true,
            remainingMinutes: 0
        };
    }

    const now = new Date();
    const lastHeartbeat = new Date(data.lastHeartbeat);
    const minutesSinceHeartbeat = (now.getTime() - lastHeartbeat.getTime()) / (1000 * 60);

    // Check if reconnect window exceeded
    if (minutesSinceHeartbeat > RECONNECT_WINDOW_MINUTES) {
        await expireSession(sessionId, 'reconnect_timeout');
        return {
            isExpired: true,
            remainingMinutes: 0
        };
    }

    // Calculate remaining time
    const startTime = new Date(data.startTime);
    const elapsedMinutes = (now.getTime() - startTime.getTime()) / (1000 * 60);
    const remainingMinutes = Math.max(0, data.durationMinutes - elapsedMinutes);

    // Check if time limit reached
    if (remainingMinutes <= 0) {
        await expireSession(sessionId, 'time_limit_reached');
        return {
            isExpired: true,
            remainingMinutes: 0
        };
    }

    return {
        isExpired: false,
        remainingMinutes
    };
}

/**
 * Get all active session timer keys (for background job)
 * 
 * @returns Array of session IDs with active timers
 */
export async function getActiveSessionIds(): Promise<string[]> {
    const pattern = `${TIMER_KEY_PREFIX}*`;
    const keys = await redis.keys(pattern);
    
    // Extract session IDs from keys
    return keys.map(key => key.replace(TIMER_KEY_PREFIX, ''));
}
