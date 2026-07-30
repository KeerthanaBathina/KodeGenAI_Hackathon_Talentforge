/**
 * Fallback Mode Service
 * 
 * Manages system fallback mode when AI screening is unavailable:
 * - Monitors queue depth and worker health
 * - Enables fallback mode when thresholds exceeded
 * - Auto-disables when system recovers
 * - Stores state in Redis for cross-process coordination
 * 
 * Triggers:
 * - Queue depth > 100 pending jobs
 * - Worker offline > 5 minutes
 * 
 * Recovery:
 * - Queue depth < 20 AND worker is online
 */

import { redis } from '../db/redis';
import type { Queue } from 'bullmq';

const FALLBACK_MODE_KEY = 'system:fallback_mode';
const FALLBACK_MODE_METADATA_KEY = 'system:fallback_mode:metadata';

// Thresholds
const QUEUE_DEPTH_TRIGGER_THRESHOLD = 100;
const QUEUE_DEPTH_RECOVERY_THRESHOLD = 20;
const WORKER_OFFLINE_TRIGGER_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

export interface FallbackModeState {
    active: boolean;
    reason?: FallbackReason;
    activatedAt?: string;
    metadata?: {
        queueDepth?: number;
        workerOfflineDurationMs?: number;
    };
}

export type FallbackReason = 'high_queue_depth' | 'worker_offline' | 'manual';

/**
 * Check if fallback mode is currently active
 */
export async function isFallbackModeActive(): Promise<boolean> {
    const value = await redis.get(FALLBACK_MODE_KEY);
    return value === 'true';
}

/**
 * Get current fallback mode state with metadata
 */
export async function getFallbackModeState(): Promise<FallbackModeState> {
    const active = await isFallbackModeActive();

    if (!active) {
        return { active: false };
    }

    const metadataJson = await redis.get(FALLBACK_MODE_METADATA_KEY);
    const metadata = metadataJson ? JSON.parse(metadataJson) : {};

    return {
        active: true,
        reason: metadata.reason,
        activatedAt: metadata.activatedAt,
        metadata: {
            queueDepth: metadata.queueDepth,
            workerOfflineDurationMs: metadata.workerOfflineDurationMs,
        },
    };
}

/**
 * Enable fallback mode with reason and metadata
 */
export async function enableFallbackMode(
    reason: FallbackReason,
    metadata?: { queueDepth?: number; workerOfflineDurationMs?: number }
): Promise<void> {
    const isActive = await isFallbackModeActive();

    if (isActive) {
        console.log('[FallbackMode] Already active, updating metadata');
    } else {
        console.log(`[FallbackMode] Activating - Reason: ${reason}`);
    }

    await redis.set(FALLBACK_MODE_KEY, 'true');

    const stateMetadata = {
        reason,
        activatedAt: new Date().toISOString(),
        ...metadata,
    };

    await redis.set(
        FALLBACK_MODE_METADATA_KEY,
        JSON.stringify(stateMetadata),
        'EX',
        3600 * 24 // Expire after 24 hours
    );
}

/**
 * Disable fallback mode
 */
export async function disableFallbackMode(): Promise<void> {
    const isActive = await isFallbackModeActive();

    if (!isActive) {
        return;
    }

    console.log('[FallbackMode] Deactivating - System recovered');

    await redis.del(FALLBACK_MODE_KEY);
    await redis.del(FALLBACK_MODE_METADATA_KEY);
}

/**
 * Check queue health and trigger/recover fallback mode
 */
export async function checkQueueHealth(
    queue: Queue,
    workerLastHeartbeat?: number
): Promise<{ shouldActivate: boolean; reason?: FallbackReason }> {
    const [waiting, delayed] = await Promise.all([
        queue.getWaitingCount(),
        queue.getDelayedCount(),
    ]);

    const queueDepth = waiting + delayed;
    const isActive = await isFallbackModeActive();

    // Check worker health
    const workerOffline =
        workerLastHeartbeat !== undefined &&
        Date.now() - workerLastHeartbeat > WORKER_OFFLINE_TRIGGER_THRESHOLD_MS;

    // Trigger conditions
    if (queueDepth > QUEUE_DEPTH_TRIGGER_THRESHOLD) {
        if (!isActive) {
            await enableFallbackMode('high_queue_depth', { queueDepth });
        }
        return { shouldActivate: true, reason: 'high_queue_depth' };
    }

    if (workerOffline) {
        const workerOfflineDurationMs = Date.now() - (workerLastHeartbeat || 0);
        if (!isActive) {
            await enableFallbackMode('worker_offline', { workerOfflineDurationMs });
        }
        return { shouldActivate: true, reason: 'worker_offline' };
    }

    // Recovery conditions (queue healthy AND worker online)
    const queueHealthy = queueDepth < QUEUE_DEPTH_RECOVERY_THRESHOLD;
    const workerOnline =
        workerLastHeartbeat === undefined ||
        Date.now() - workerLastHeartbeat < 60 * 1000; // Online if heartbeat within 1 min

    if (isActive && queueHealthy && workerOnline) {
        await disableFallbackMode();
        return { shouldActivate: false };
    }

    return { shouldActivate: false };
}

/**
 * Manually enable fallback mode (admin action)
 */
export async function manuallyEnableFallbackMode(): Promise<void> {
    await enableFallbackMode('manual');
}

/**
 * Manually disable fallback mode (admin action)
 */
export async function manuallyDisableFallbackMode(): Promise<void> {
    await disableFallbackMode();
}

export const FallbackModeService = {
    isFallbackModeActive,
    getFallbackModeState,
    enableFallbackMode,
    disableFallbackMode,
    checkQueueHealth,
    manuallyEnableFallbackMode,
    manuallyDisableFallbackMode,
    QUEUE_DEPTH_TRIGGER_THRESHOLD,
    QUEUE_DEPTH_RECOVERY_THRESHOLD,
    WORKER_OFFLINE_TRIGGER_THRESHOLD_MS,
};
