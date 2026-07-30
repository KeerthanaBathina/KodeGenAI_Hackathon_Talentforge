---
id: task_002
us_id: us_005
epic: EP-003
title: "Implement Fallback Mode Detection and Worker Health Monitoring"
status: done
layer: backend
effort: 2.5h
priority: high
created: 2026-07-24
completed: 2026-07-24
---

# TASK-002 — Implement Fallback Mode Detection and Worker Health Monitoring

## Context

**User Story**: US-005 — Low-Confidence Escalation to Manual Review and AI Fallback Mode  
**Epic**: EP-003 — AI Resume Parsing  
**Addresses**: Scenario 2, 4 (fallback mode trigger and auto-recovery)

Implement real-time monitoring of AI worker health and queue depth to automatically enable/disable fallback mode.

---

## Objective

Build fallback mode detection system:
1. Monitor screening queue depth (threshold: >100 pending jobs)
2. Monitor worker health (offline >5 minutes)
3. Enable fallback mode when thresholds exceeded
4. Auto-disable fallback mode when system recovers

---

## Implementation Steps

### Step 1 — Create Fallback Mode State Service

Create `backend/src/services/fallbackModeService.ts`:

```typescript
import { redis } from '@/db/redis';

const FALLBACK_MODE_KEY = 'system:fallback_mode';
const FALLBACK_MODE_REASON_KEY = 'system:fallback_mode_reason';
const WORKER_LAST_SEEN_KEY = 'screening_worker:last_seen';

export interface FallbackModeState {
  active: boolean;
  reason?: 'high_queue_depth' | 'worker_offline' | 'manual';
  activatedAt?: Date;
  queueDepth?: number;
  workerOfflineDuration?: number; // seconds
}

// Thresholds
const QUEUE_DEPTH_THRESHOLD = 100;
const WORKER_OFFLINE_THRESHOLD_SECONDS = 300; // 5 minutes
const RECOVERY_QUEUE_DEPTH = 20;

/**
 * Get current fallback mode state
 */
export async function getFallbackModeState(): Promise<FallbackModeState> {
  const active = await redis.get(FALLBACK_MODE_KEY);
  const reason = await redis.get(FALLBACK_MODE_REASON_KEY);
  
  if (active === '1') {
    const metadata = await redis.hgetall(`${FALLBACK_MODE_KEY}:metadata`);
    return {
      active: true,
      reason: reason as any,
      activatedAt: metadata.activatedAt ? new Date(metadata.activatedAt) : undefined,
      queueDepth: metadata.queueDepth ? parseInt(metadata.queueDepth) : undefined,
      workerOfflineDuration: metadata.workerOfflineDuration ? parseInt(metadata.workerOfflineDuration) : undefined,
    };
  }
  
  return { active: false };
}

/**
 * Enable fallback mode
 */
export async function enableFallbackMode(
  reason: 'high_queue_depth' | 'worker_offline' | 'manual',
  metadata: { queueDepth?: number; workerOfflineDuration?: number }
): Promise<void> {
  await redis.set(FALLBACK_MODE_KEY, '1');
  await redis.set(FALLBACK_MODE_REASON_KEY, reason);
  await redis.hmset(`${FALLBACK_MODE_KEY}:metadata`, {
    activatedAt: new Date().toISOString(),
    reason,
    ...metadata,
  });
  
  console.log(`[FallbackMode] Enabled - Reason: ${reason}`, metadata);
}

/**
 * Disable fallback mode
 */
export async function disableFallbackMode(): Promise<void> {
  await redis.del(FALLBACK_MODE_KEY);
  await redis.del(FALLBACK_MODE_REASON_KEY);
  await redis.del(`${FALLBACK_MODE_KEY}:metadata`);
  
  console.log('[FallbackMode] Disabled');
}

/**
 * Update worker heartbeat
 */
export async function updateWorkerHeartbeat(): Promise<void> {
  await redis.set(WORKER_LAST_SEEN_KEY, Date.now().toString(), 'EX', 600); // 10 min TTL
}

/**
 * Check worker health
 */
export async function checkWorkerHealth(): Promise<{
  online: boolean;
  lastSeenSeconds?: number;
}> {
  const lastSeen = await redis.get(WORKER_LAST_SEEN_KEY);
  
  if (!lastSeen) {
    return { online: false };
  }
  
  const lastSeenSeconds = Math.floor((Date.now() - parseInt(lastSeen)) / 1000);
  const online = lastSeenSeconds < WORKER_OFFLINE_THRESHOLD_SECONDS;
  
  return { online, lastSeenSeconds };
}

/**
 * Check queue health and update fallback mode
 */
export async function checkSystemHealthAndUpdateFallbackMode(): Promise<FallbackModeState> {
  // Get queue stats
  const { getScreeningQueueHealth } = await import('@/queues/screeningQueue');
  const queueHealth = await getScreeningQueueHealth();
  const queueDepth = queueHealth.waiting + queueHealth.active;
  
  // Check worker health
  const workerHealth = await checkWorkerHealth();
  
  const currentState = await getFallbackModeState();
  
  // Determine if fallback mode should be enabled
  const shouldEnable =
    queueDepth > QUEUE_DEPTH_THRESHOLD ||
    !workerHealth.online;
  
  // Determine if fallback mode should be disabled (recovery)
  const shouldDisable =
    currentState.active &&
    queueDepth < RECOVERY_QUEUE_DEPTH &&
    workerHealth.online;
  
  if (shouldEnable && !currentState.active) {
    const reason = !workerHealth.online ? 'worker_offline' : 'high_queue_depth';
    await enableFallbackMode(reason, {
      queueDepth,
      workerOfflineDuration: workerHealth.lastSeenSeconds,
    });
    return await getFallbackModeState();
  }
  
  if (shouldDisable) {
    await disableFallbackMode();
    return { active: false };
  }
  
  return currentState;
}
```

### Step 2 — Add Health Check to Screening Worker

Update `backend/src/queues/screeningQueue.ts`:

```typescript
import { updateWorkerHeartbeat } from '@/services/fallbackModeService';

// In worker job processor
screeningWorker.on('active', async (job) => {
  // Update heartbeat when job starts processing
  await updateWorkerHeartbeat();
});

screeningWorker.on('completed', async (job) => {
  // Update heartbeat when job completes
  await updateWorkerHeartbeat();
});

// Add periodic heartbeat update (every 30 seconds)
setInterval(async () => {
  try {
    await updateWorkerHeartbeat();
  } catch (error) {
    console.error('[ScreeningWorker] Failed to update heartbeat:', error);
  }
}, 30000);
```

### Step 3 — Add Health Check Cron Job

Create `backend/src/workers/systemHealthWorker.ts`:

```typescript
import cron from 'node-cron';
import { checkSystemHealthAndUpdateFallbackMode } from '@/services/fallbackModeService';

/**
 * System health check worker
 * Runs every minute to monitor queue depth and worker health
 */
export function startSystemHealthWorker(): void {
  console.log('[SystemHealthWorker] Starting health check cron...');
  
  // Run every 1 minute
  cron.schedule('*/1 * * * *', async () => {
    try {
      const state = await checkSystemHealthAndUpdateFallbackMode();
      
      if (state.active) {
        console.log(`[SystemHealthWorker] Fallback mode ACTIVE - Reason: ${state.reason}`);
      }
    } catch (error) {
      console.error('[SystemHealthWorker] Health check failed:', error);
    }
  });
  
  console.log('[SystemHealthWorker] Health check cron started');
}
```

### Step 4 — Add Fallback Mode API Endpoint

Create `backend/src/routes/admin/systemStatus.ts`:

```typescript
import { Router } from 'express';
import { authenticate } from '@/middleware/authenticate';
import { getFallbackModeState } from '@/services/fallbackModeService';

const router = Router();

/**
 * GET /api/admin/system-status/fallback-mode
 * Get current fallback mode state
 */
router.get('/fallback-mode', authenticate, async (req, res) => {
  try {
    const state = await getFallbackModeState();
    res.json(state);
  } catch (error) {
    console.error('[SystemStatus] Failed to get fallback mode state:', error);
    res.status(500).json({ error: 'Failed to retrieve fallback mode state' });
  }
});

export default router;
```

---

## Acceptance Criteria

- [ ] Fallback mode triggers when queue depth > 100
- [ ] Fallback mode triggers when worker offline > 5 minutes
- [ ] Fallback mode auto-disables when queue depth < 20 AND worker online
- [ ] Worker heartbeat updates every 30 seconds
- [ ] Health check runs every 1 minute via cron
- [ ] API endpoint returns current fallback mode state

---

## Testing Checklist

- [ ] Unit test: Enable fallback mode sets Redis keys
- [ ] Unit test: Disable fallback mode clears Redis keys
- [ ] Unit test: Worker health check detects offline worker
- [ ] Integration test: High queue depth triggers fallback mode
- [ ] Integration test: Worker offline triggers fallback mode
- [ ] Integration test: Recovery disables fallback mode
- [ ] Load test: 150 pending jobs triggers fallback

---

## Dependencies

- Redis for state management
- BullMQ queue health monitoring (US-002)
- node-cron for periodic health checks

---

## Definition of Done

- [ ] Fallback mode service implemented
- [ ] Worker heartbeat mechanism added
- [ ] Health check cron job created
- [ ] API endpoint for fallback mode state
- [ ] Unit tests passing (6+ tests)
- [ ] Integration tests passing
- [ ] Health worker started in server.ts
