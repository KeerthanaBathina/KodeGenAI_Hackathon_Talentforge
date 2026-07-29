import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Queue, Job } from 'bullmq';
import {
  getQueueMetrics,
  getAllQueueMetrics,
  getWorkerHealth,
  getAllWorkerHealth,
  getEmailDeliveryMetrics,
  getHealthDashboardData,
  updateWorkerHeartbeat,
} from '../healthMetricsService';
import { redis } from '../../db/redis';
import { prisma } from '../../db/prisma';
import { HEARTBEAT_THRESHOLDS } from '../../constants/workerHeartbeats';

// Mock dependencies
vi.mock('../../db/redis');
vi.mock('../../db/prisma');
vi.mock('../../utils/logger', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
}));

describe('HealthMetricsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ============ Queue Metrics Tests ============

  describe('getQueueMetrics', () => {
    it('should collect metrics from a BullMQ queue', async () => {
      const mockQueue = {
        name: 'screening',
        getActiveCount: vi.fn().resolves(5),
        getWaitingCount: vi.fn().resolves(10),
        getFailedCount: vi.fn().resolves(2),
        getDelayedCount: vi.fn().resolves(1),
        getCompleted: vi.fn().resolves([
          { finishedOn: Date.now() - 30 * 60 * 1000 },
          { finishedOn: Date.now() - 45 * 60 * 1000 },
        ]),
      } as unknown as Queue;

      const metrics = await getQueueMetrics(mockQueue);

      expect(metrics).toEqual({
        queueName: 'screening',
        active: 5,
        waiting: 10,
        failed: 2,
        delayed: 1,
        completed: 2,
      });
    });

    it('should handle queue with no jobs', async () => {
      const mockQueue = {
        name: 'email-delivery',
        getActiveCount: vi.fn().resolves(0),
        getWaitingCount: vi.fn().resolves(0),
        getFailedCount: vi.fn().resolves(0),
        getDelayedCount: vi.fn().resolves(0),
        getCompleted: vi.fn().resolves([]),
      } as unknown as Queue;

      const metrics = await getQueueMetrics(mockQueue);

      expect(metrics.active).toBe(0);
      expect(metrics.completed).toBe(0);
    });

    it('should only count completed jobs from last 60 minutes', async () => {
      const now = Date.now();
      const mockQueue = {
        name: 'screening',
        getActiveCount: vi.fn().resolves(0),
        getWaitingCount: vi.fn().resolves(0),
        getFailedCount: vi.fn().resolves(0),
        getDelayedCount: vi.fn().resolves(0),
        getCompleted: vi.fn().resolves([
          { finishedOn: now - 30 * 60 * 1000 }, // 30 min ago - include
          { finishedOn: now - 45 * 60 * 1000 }, // 45 min ago - include
          { finishedOn: now - 90 * 60 * 1000 }, // 90 min ago - exclude
          { finishedOn: now - 120 * 60 * 1000 }, // 2 hours ago - exclude
        ]),
      } as unknown as Queue;

      const metrics = await getQueueMetrics(mockQueue);
      expect(metrics.completed).toBe(2);
    });

    it('should handle queue errors gracefully', async () => {
      const mockQueue = {
        name: 'error-queue',
        getActiveCount: vi.fn().rejects(new Error('Redis connection failed')),
        getWaitingCount: vi.fn().resolves(0),
        getFailedCount: vi.fn().resolves(0),
        getDelayedCount: vi.fn().resolves(0),
        getCompleted: vi.fn().resolves([]),
      } as unknown as Queue;

      const metrics = await getQueueMetrics(mockQueue);

      expect(metrics.queueName).toBe('error-queue');
      expect(metrics.active).toBe(0);
    });

    it('should handle jobs with missing finishedOn timestamp', async () => {
      const mockQueue = {
        name: 'mixed-queue',
        getActiveCount: vi.fn().resolves(0),
        getWaitingCount: vi.fn().resolves(0),
        getFailedCount: vi.fn().resolves(0),
        getDelayedCount: vi.fn().resolves(0),
        getCompleted: vi.fn().resolves([
          { finishedOn: Date.now() - 30 * 60 * 1000 },
          { finishedOn: null }, // No finished time
          { finishedOn: Date.now() - 45 * 60 * 1000 },
        ]),
      } as unknown as Queue;

      const metrics = await getQueueMetrics(mockQueue);
      expect(metrics.completed).toBe(2); // Only jobs with finishedOn
    });
  });

  describe('getAllQueueMetrics', () => {
    it('should collect metrics from all queues', async () => {
      const mockQueues = [
        {
          name: 'screening',
          getActiveCount: vi.fn().resolves(5),
          getWaitingCount: vi.fn().resolves(10),
          getFailedCount: vi.fn().resolves(0),
          getDelayedCount: vi.fn().resolves(0),
          getCompleted: vi.fn().resolves([]),
        },
        {
          name: 'email-delivery',
          getActiveCount: vi.fn().resolves(3),
          getWaitingCount: vi.fn().resolves(5),
          getFailedCount: vi.fn().resolves(1),
          getDelayedCount: vi.fn().resolves(0),
          getCompleted: vi.fn().resolves([]),
        },
      ] as unknown as Queue[];

      const metrics = await getAllQueueMetrics(mockQueues);

      expect(metrics).toHaveLength(2);
      expect(metrics[0].queueName).toBe('screening');
      expect(metrics[1].queueName).toBe('email-delivery');
    });

    it('should handle partial queue failures', async () => {
      const mockQueues = [
        {
          name: 'screening',
          getActiveCount: vi.fn().resolves(5),
          getWaitingCount: vi.fn().resolves(10),
          getFailedCount: vi.fn().resolves(0),
          getDelayedCount: vi.fn().resolves(0),
          getCompleted: vi.fn().resolves([]),
        },
        {
          name: 'error-queue',
          getActiveCount: vi.fn().rejects(new Error('Connection failed')),
          getWaitingCount: vi.fn().resolves(0),
          getFailedCount: vi.fn().resolves(0),
          getDelayedCount: vi.fn().resolves(0),
          getCompleted: vi.fn().resolves([]),
        },
      ] as unknown as Queue[];

      const metrics = await getAllQueueMetrics(mockQueues);

      // All queues should return metrics (even with error, falls back to 0s)
      expect(metrics).toHaveLength(2);
    });
  });

  // ============ Worker Health Tests ============

  describe('getWorkerHealth', () => {
    it('should return online status for recent heartbeat (< 2 min)', async () => {
      const now = Date.now();
      const oneMinuteAgo = now - 60 * 1000;

      vi.mocked(redis.get).mockResolvedValue(oneMinuteAgo.toString());

      const status = await getWorkerHealth('worker:screening:heartbeat', 'AI Screening Worker');

      expect(status).toEqual({
        workerName: 'AI Screening Worker',
        status: 'online',
        lastHeartbeat: new Date(oneMinuteAgo),
        minutesSinceHeartbeat: 1,
      });
    });

    it('should return degraded status for heartbeat 2-5 min old', async () => {
      const now = Date.now();
      const threeMinutesAgo = now - 3 * 60 * 1000;

      vi.mocked(redis.get).mockResolvedValue(threeMinutesAgo.toString());

      const status = await getWorkerHealth('worker:screening:heartbeat', 'AI Screening Worker');

      expect(status.status).toBe('degraded');
      expect(status.minutesSinceHeartbeat).toBe(3);
    });

    it('should return offline status for heartbeat > 5 min old', async () => {
      const now = Date.now();
      const tenMinutesAgo = now - 10 * 60 * 1000;

      vi.mocked(redis.get).mockResolvedValue(tenMinutesAgo.toString());

      const status = await getWorkerHealth('worker:screening:heartbeat', 'AI Screening Worker');

      expect(status.status).toBe('offline');
      expect(status.minutesSinceHeartbeat).toBe(10);
    });

    it('should return offline status when no heartbeat found', async () => {
      vi.mocked(redis.get).mockResolvedValue(null);

      const status = await getWorkerHealth('worker:screening:heartbeat', 'AI Screening Worker');

      expect(status).toEqual({
        workerName: 'AI Screening Worker',
        status: 'offline',
        lastHeartbeat: null,
        minutesSinceHeartbeat: null,
      });
    });

    it('should handle exact 2-minute threshold correctly (boundary)', async () => {
      const now = Date.now();
      const exactlyTwoMinutes = now - HEARTBEAT_THRESHOLDS.ONLINE_MAX_MINUTES * 60 * 1000;

      vi.mocked(redis.get).mockResolvedValue(exactlyTwoMinutes.toString());

      const status = await getWorkerHealth('worker:screening:heartbeat', 'AI Screening Worker');

      // At exactly 2 minutes, should be degraded (not online)
      expect(status.status).toBe('degraded');
    });

    it('should handle exact 5-minute threshold correctly (boundary)', async () => {
      const now = Date.now();
      const exactlyFiveMinutes = now - HEARTBEAT_THRESHOLDS.DEGRADED_MAX_MINUTES * 60 * 1000;

      vi.mocked(redis.get).mockResolvedValue(exactlyFiveMinutes.toString());

      const status = await getWorkerHealth('worker:screening:heartbeat', 'AI Screening Worker');

      // At exactly 5 minutes, should be offline (not degraded)
      expect(status.status).toBe('offline');
    });

    it('should handle Redis errors gracefully', async () => {
      vi.mocked(redis.get).mockRejectedValue(new Error('Redis connection failed'));

      const status = await getWorkerHealth('worker:screening:heartbeat', 'AI Screening Worker');

      expect(status.status).toBe('offline');
      expect(status.lastHeartbeat).toBeNull();
    });
  });

  describe('getAllWorkerHealth', () => {
    it('should collect health status for all workers', async () => {
      const now = Date.now();

      vi.mocked(redis.get)
        .mockResolvedValueOnce((now - 60 * 1000).toString()) // online
        .mockResolvedValueOnce((now - 3 * 60 * 1000).toString()); // degraded

      const statuses = await getAllWorkerHealth();

      expect(statuses).toHaveLength(2);
      expect(statuses[0].status).toBe('online');
      expect(statuses[1].status).toBe('degraded');
    });

    it('should handle multiple offline workers', async () => {
      vi.mocked(redis.get)
        .mockResolvedValueOnce(null) // offline
        .mockResolvedValueOnce(null); // offline

      const statuses = await getAllWorkerHealth();

      expect(statuses.every((s) => s.status === 'offline')).toBe(true);
    });
  });

  // ============ Email Delivery Metrics Tests ============

  describe('getEmailDeliveryMetrics', () => {
    it('should calculate email delivery success rate correctly', async () => {
      vi.mocked(prisma.communication.count)
        .mockResolvedValueOnce(95) // successful
        .mockResolvedValueOnce(5) // failed
        .mockResolvedValueOnce(100); // total

      vi.mocked(prisma.communication.findMany).mockResolvedValue([]);

      const metrics = await getEmailDeliveryMetrics();

      expect(metrics.totalAttempted).toBe(100);
      expect(metrics.successful).toBe(95);
      expect(metrics.failed).toBe(5);
      expect(metrics.successRate).toBe(95);
    });

    it('should handle 100% success rate (no failures)', async () => {
      vi.mocked(prisma.communication.count)
        .mockResolvedValueOnce(100) // successful
        .mockResolvedValueOnce(0) // failed
        .mockResolvedValueOnce(100); // total

      vi.mocked(prisma.communication.findMany).mockResolvedValue([]);

      const metrics = await getEmailDeliveryMetrics();

      expect(metrics.successRate).toBe(100);
      expect(metrics.failed).toBe(0);
    });

    it('should return 100% success rate when no emails attempted', async () => {
      vi.mocked(prisma.communication.count)
        .mockResolvedValueOnce(0) // successful
        .mockResolvedValueOnce(0) // failed
        .mockResolvedValueOnce(0); // total

      vi.mocked(prisma.communication.findMany).mockResolvedValue([]);

      const metrics = await getEmailDeliveryMetrics();

      expect(metrics.successRate).toBe(100);
      expect(metrics.totalAttempted).toBe(0);
    });

    it('should include failed email details', async () => {
      vi.mocked(prisma.communication.count)
        .mockResolvedValueOnce(97)
        .mockResolvedValueOnce(3)
        .mockResolvedValueOnce(100);

      const mockFailedEmails = [
        {
          id: 'email-1',
          status: 'failed',
          createdAt: new Date(),
          to: 'user1@example.com',
          templateType: 'offer_approval',
        },
        {
          id: 'email-2',
          status: 'failed',
          createdAt: new Date(),
          to: 'user2@example.com',
          templateType: 'interview_confirmation',
        },
      ];

      vi.mocked(prisma.communication.findMany).mockResolvedValue(mockFailedEmails as any);

      const metrics = await getEmailDeliveryMetrics();

      expect(metrics.failedEmails).toHaveLength(2);
      expect(metrics.failedEmails[0].to).toBe('user1@example.com');
      expect(metrics.failedEmails[0].templateType).toBe('offer_approval');
    });

    it('should limit failed emails to 100 most recent', async () => {
      vi.mocked(prisma.communication.count)
        .mockResolvedValueOnce(900)
        .mockResolvedValueOnce(150)
        .mockResolvedValueOnce(1050);

      const mockFailedEmails = Array(100)
        .fill(null)
        .map((_, i) => ({
          id: `email-${i}`,
          status: 'failed',
          createdAt: new Date(),
          to: `user${i}@example.com`,
          templateType: 'test',
        }));

      vi.mocked(prisma.communication.findMany).mockResolvedValue(mockFailedEmails as any);

      const metrics = await getEmailDeliveryMetrics();

      expect(metrics.failedEmails.length).toBeLessThanOrEqual(100);
      expect(prisma.communication.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 100 }),
      );
    });

    it('should only count emails from last 60 minutes', async () => {
      vi.mocked(prisma.communication.count)
        .mockResolvedValueOnce(50)
        .mockResolvedValueOnce(2)
        .mockResolvedValueOnce(52);

      vi.mocked(prisma.communication.findMany).mockResolvedValue([]);

      const metrics = await getEmailDeliveryMetrics();

      // Verify the time filter is applied to the query
      expect(prisma.communication.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            createdAt: expect.objectContaining({
              gte: expect.any(Date),
            }),
          }),
        }),
      );
    });

    it('should calculate correct percentage for non-round numbers', async () => {
      vi.mocked(prisma.communication.count)
        .mockResolvedValueOnce(73)
        .mockResolvedValueOnce(27)
        .mockResolvedValueOnce(100);

      vi.mocked(prisma.communication.findMany).mockResolvedValue([]);

      const metrics = await getEmailDeliveryMetrics();

      expect(metrics.successRate).toBe(73);
    });
  });

  // ============ Dashboard Aggregation Tests ============

  describe('getHealthDashboardData', () => {
    it('should aggregate all health metrics', async () => {
      const now = Date.now();

      // Mock queue metrics
      const mockQueues = [
        {
          name: 'screening',
          getActiveCount: vi.fn().resolves(5),
          getWaitingCount: vi.fn().resolves(10),
          getFailedCount: vi.fn().resolves(0),
          getDelayedCount: vi.fn().resolves(0),
          getCompleted: vi.fn().resolves([]),
        },
      ] as unknown as Queue[];

      // Mock worker heartbeat
      vi.mocked(redis.get).mockResolvedValue((now - 60 * 1000).toString());

      // Mock email metrics
      vi.mocked(prisma.communication.count)
        .mockResolvedValueOnce(98)
        .mockResolvedValueOnce(2)
        .mockResolvedValueOnce(100);

      vi.mocked(prisma.communication.findMany).mockResolvedValue([]);

      const data = await getHealthDashboardData(mockQueues);

      expect(data.queues).toBeDefined();
      expect(data.workers).toBeDefined();
      expect(data.emailDelivery).toBeDefined();
      expect(data.timestamp).toBeInstanceOf(Date);
    });

    it('should include performance metadata (collection time)', async () => {
      const mockQueues = [] as unknown as Queue[];

      vi.mocked(redis.get).mockResolvedValue(null);
      vi.mocked(prisma.communication.count)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0);
      vi.mocked(prisma.communication.findMany).mockResolvedValue([]);

      const data = await getHealthDashboardData(mockQueues);

      expect(data.meta).toBeDefined();
      expect(data.meta.collectionTimeMs).toBeGreaterThan(0);
      expect(typeof data.meta.collectionTimeMs).toBe('number');
    });

    it('should handle partial failures gracefully', async () => {
      const mockQueues = [
        {
          name: 'error-queue',
          getActiveCount: vi.fn().rejects(new Error('Connection failed')),
          getWaitingCount: vi.fn().resolves(0),
          getFailedCount: vi.fn().resolves(0),
          getDelayedCount: vi.fn().resolves(0),
          getCompleted: vi.fn().resolves([]),
        },
      ] as unknown as Queue[];

      vi.mocked(redis.get).mockResolvedValue(null);
      vi.mocked(prisma.communication.count)
        .mockResolvedValueOnce(100)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(100);
      vi.mocked(prisma.communication.findMany).mockResolvedValue([]);

      const data = await getHealthDashboardData(mockQueues);

      // Should have email data even if queue/worker failed
      expect(data.emailDelivery).toBeDefined();
      expect(data.timestamp).toBeInstanceOf(Date);
    });

    it('should complete data collection within 200ms', async () => {
      const mockQueues = [] as unknown as Queue[];

      vi.mocked(redis.get).mockResolvedValue(null);
      vi.mocked(prisma.communication.count)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0);
      vi.mocked(prisma.communication.findMany).mockResolvedValue([]);

      const startTime = Date.now();
      await getHealthDashboardData(mockQueues);
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(200);
    });
  });

  // ============ Worker Heartbeat Update Tests ============

  describe('updateWorkerHeartbeat', () => {
    it('should update worker heartbeat with current timestamp', async () => {
      const workerKey = 'worker:screening:heartbeat';
      const ttl = 600;

      vi.mocked(redis.setex).mockResolvedValue('OK');

      await updateWorkerHeartbeat(workerKey, ttl);

      expect(redis.setex).toHaveBeenCalledWith(
        workerKey,
        ttl,
        expect.stringMatching(/\d+/),
      );
    });

    it('should use provided TTL value', async () => {
      const workerKey = 'worker:email:heartbeat';
      const ttl = 1200;

      vi.mocked(redis.setex).mockResolvedValue('OK');

      await updateWorkerHeartbeat(workerKey, ttl);

      expect(redis.setex).toHaveBeenCalledWith(
        workerKey,
        ttl,
        expect.any(String),
      );
    });

    it('should handle Redis errors gracefully', async () => {
      const workerKey = 'worker:screening:heartbeat';

      vi.mocked(redis.setex).mockRejectedValue(new Error('Redis connection failed'));

      // Should not throw
      await updateWorkerHeartbeat(workerKey, 600);

      expect(redis.setex).toHaveBeenCalled();
    });
  });

  // ============ Integration & Edge Case Tests ============

  describe('Edge Cases & Integration', () => {
    it('should handle all workers offline simultaneously', async () => {
      vi.mocked(redis.get)
        .mockResolvedValue(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);

      const statuses = await getAllWorkerHealth();

      expect(statuses.every((s) => s.status === 'offline')).toBe(true);
    });

    it('should handle high volume of failed emails (1000+)', async () => {
      vi.mocked(prisma.communication.count)
        .mockResolvedValueOnce(5000)
        .mockResolvedValueOnce(1500)
        .mockResolvedValueOnce(6500);

      const mockFailedEmails = Array(100)
        .fill(null)
        .map((_, i) => ({
          id: `email-${i}`,
          status: 'failed',
          createdAt: new Date(),
          to: `user${i}@example.com`,
          templateType: 'test',
        }));

      vi.mocked(prisma.communication.findMany).mockResolvedValue(mockFailedEmails as any);

      const metrics = await getEmailDeliveryMetrics();

      expect(metrics.failed).toBe(1500);
      expect(metrics.successRate).toBe(77); // 5000/6500 = 76.92%
    });

    it('should handle mixed worker states (online, degraded, offline)', async () => {
      const now = Date.now();

      vi.mocked(redis.get)
        .mockResolvedValueOnce((now - 60 * 1000).toString()) // online
        .mockResolvedValueOnce((now - 3 * 60 * 1000).toString()) // degraded
        .mockResolvedValueOnce((now - 10 * 60 * 1000).toString()) // offline
        .mockResolvedValueOnce(null); // offline (no heartbeat)

      const statuses = await getAllWorkerHealth();

      expect(statuses[0].status).toBe('online');
      expect(statuses[1].status).toBe('degraded');
      expect(statuses[2].status).toBe('offline');
      expect(statuses[3].status).toBe('offline');
    });
  });
});
