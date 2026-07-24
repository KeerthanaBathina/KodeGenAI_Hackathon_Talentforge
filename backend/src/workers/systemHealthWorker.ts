/**
 * System Health Worker
 * 
 * Monitors system health and manages fallback mode
 * Runs as a cron job every 1 minute
 * 
 * Checks:
 * - Screening queue depth
 * - Worker heartbeat status
 * 
 * Actions:
 * - Enables fallback mode when thresholds exceeded
 * - Disables fallback mode when system recovers
 */

import cron from 'node-cron';
import { screeningQueue } from '../queues/screeningQueue';
import { redis } from '../db/redis';
import { FallbackModeService } from '../services/fallbackModeService';

const WORKER_HEARTBEAT_KEY = 'worker:screening:heartbeat';

/**
 * Get last worker heartbeat timestamp
 */
async function getWorkerLastHeartbeat(): Promise<number | undefined> {
    const heartbeatStr = await redis.get(WORKER_HEARTBEAT_KEY);
    return heartbeatStr ? parseInt(heartbeatStr, 10) : undefined;
}

/**
 * System health check - runs every minute
 */
async function performHealthCheck(): Promise<void> {
    try {
        const workerLastHeartbeat = await getWorkerLastHeartbeat();

        const result = await FallbackModeService.checkQueueHealth(
            screeningQueue,
            workerLastHeartbeat
        );

        if (result.shouldActivate) {
            console.log(
                `[SystemHealth] Fallback mode active - Reason: ${result.reason}`
            );
        }
    } catch (error) {
        console.error('[SystemHealth] Health check failed:', error);
    }
}

/**
 * Start system health monitoring cron job
 */
export function startSystemHealthWorker(): void {
    console.log('[SystemHealth] Starting health monitoring (every 1 minute)');

    // Run every minute
    cron.schedule('* * * * *', async () => {
        await performHealthCheck();
    });

    // Run initial check immediately
    performHealthCheck().catch((error) => {
        console.error('[SystemHealth] Initial health check failed:', error);
    });
}

/**
 * Update worker heartbeat (called by screening worker during job processing)
 */
export async function updateWorkerHeartbeat(): Promise<void> {
    await redis.set(
        WORKER_HEARTBEAT_KEY,
        Date.now().toString(),
        'EX',
        600 // Expire after 10 minutes
    );
}

export const SystemHealthWorker = {
    startSystemHealthWorker,
    updateWorkerHeartbeat,
    WORKER_HEARTBEAT_KEY,
};
