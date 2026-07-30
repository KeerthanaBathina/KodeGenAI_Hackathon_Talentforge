/**
 * Integration Tests: Fallback Mode
 * 
 * Tests fallback mode triggers (high queue depth, worker offline)
 * and auto-recovery conditions
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { redis } from '../../db/redis';
import { screeningQueue } from '../../queues/screeningQueue';
import { FallbackModeService } from '../../services/fallbackModeService';
import { SystemHealthWorker } from '../../workers/systemHealthWorker';

describe('Fallback Mode Integration Tests', () => {
    beforeEach(async () => {
        // Clear fallback mode state
        await redis.del('system:fallback_mode');
        await redis.del('system:fallback_mode:metadata');
        await redis.del(SystemHealthWorker.WORKER_HEARTBEAT_KEY);

        // Clean queue
        await screeningQueue.obliterate({ force: true });
    });

    afterEach(async () => {
        // Cleanup
        await redis.del('system:fallback_mode');
        await redis.del('system:fallback_mode:metadata');
        await redis.del(SystemHealthWorker.WORKER_HEARTBEAT_KEY);
        await screeningQueue.obliterate({ force: true });
    });

    it('should activate fallback mode when queue depth exceeds threshold', async () => {
        // Add 101 jobs to exceed threshold (100)
        for (let i = 0; i < 101; i++) {
            await screeningQueue.add('screen-application', {
                applicationId: `test-app-${i}`,
                resumeId: `test-resume-${i}`,
                triggeredBy: 'parsing',
            });
        }

        // Check queue health
        const result = await FallbackModeService.checkQueueHealth(screeningQueue);

        expect(result.shouldActivate).toBe(true);
        expect(result.reason).toBe('high_queue_depth');

        const state = await FallbackModeService.getFallbackModeState();
        expect(state.active).toBe(true);
        expect(state.reason).toBe('high_queue_depth');
    });

    it('should activate fallback mode when worker is offline > 5 minutes', async () => {
        // Set heartbeat to 6 minutes ago
        const sixMinutesAgo = Date.now() - 6 * 60 * 1000;
        await redis.set(
            SystemHealthWorker.WORKER_HEARTBEAT_KEY,
            sixMinutesAgo.toString()
        );

        // Check queue health
        const result = await FallbackModeService.checkQueueHealth(
            screeningQueue,
            sixMinutesAgo
        );

        expect(result.shouldActivate).toBe(true);
        expect(result.reason).toBe('worker_offline');

        const state = await FallbackModeService.getFallbackModeState();
        expect(state.active).toBe(true);
        expect(state.reason).toBe('worker_offline');
    });

    it('should NOT activate fallback mode when queue is healthy and worker online', async () => {
        // Set recent heartbeat
        await SystemHealthWorker.updateWorkerHeartbeat();

        // Add only 10 jobs (below threshold)
        for (let i = 0; i < 10; i++) {
            await screeningQueue.add('screen-application', {
                applicationId: `test-app-${i}`,
                resumeId: `test-resume-${i}`,
                triggeredBy: 'parsing',
            });
        }

        const result = await FallbackModeService.checkQueueHealth(
            screeningQueue,
            Date.now()
        );

        expect(result.shouldActivate).toBe(false);

        const state = await FallbackModeService.getFallbackModeState();
        expect(state.active).toBe(false);
    });

    it('should auto-disable fallback mode when queue recovers and worker is online', async () => {
        // Manually activate fallback mode
        await FallbackModeService.enableFallbackMode('high_queue_depth', {
            queueDepth: 150,
        });

        let state = await FallbackModeService.getFallbackModeState();
        expect(state.active).toBe(true);

        // Clear queue (set to 10 jobs, below recovery threshold of 20)
        await screeningQueue.obliterate({ force: true });
        for (let i = 0; i < 10; i++) {
            await screeningQueue.add('screen-application', {
                applicationId: `test-app-${i}`,
                resumeId: `test-resume-${i}`,
                triggeredBy: 'parsing',
            });
        }

        // Update heartbeat (worker online)
        await SystemHealthWorker.updateWorkerHeartbeat();

        // Check queue health
        const result = await FallbackModeService.checkQueueHealth(
            screeningQueue,
            Date.now()
        );

        expect(result.shouldActivate).toBe(false);

        // Verify fallback mode is deactivated
        state = await FallbackModeService.getFallbackModeState();
        expect(state.active).toBe(false);
    });
});
