import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Queue } from 'bullmq';
import { redis } from '../../db/redis';
import { prisma } from '../../db/prisma';
import {
  getQueueMetrics,
  getAllQueueMetrics,
  getWorkerHealth,
  getAllWorkerHealth,
  getEmailDeliveryMetrics,
  getHealthDashboardData,
  updateWorkerHeartbeat,
} from '../../services/healthMetricsService';
import { WORKER_HEARTBEAT_KEYS } from '../../constants/workerHeartbeats';

// Mock dependencies
vi.mock('../../db/redis');
vi.mock('../../db/prisma');

describe('HealthMetricsService', () => {
  const mockQueue: Partial<Queue> = {
    name: 'test-queue',
    getActiveCount: vi.fn(),
    getWaitingCount: vi.fn(),
    getFailedCount: vi.fn(),
    getDelayedCount: vi.fn(),
    getCompleted: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('getQueueMetrics', () => {
    it('should return queue metrics with all counts', async () => {
      const now = Date.now();
      const oneHourAgo = now - 60 * 60 * 1000;

      vi.mocked(mockQueue.getActiveCount).mockResolvedValue(5);
      vi.mocked(mockQueue.getWaitingCount).mockResolvedValue(10);
      vi.mocked(mockQueue.getFailedCount).mockResolvedValue(2);
      vi.mocked(mockQueue.getDelayedCount).mockResolvedValue(3);
      vi.mocked(mockQueue.getCompleted).mockResolvedValue([
        {
          finishedOn: now - 1000,
          id: 'job1',
        } as any,
        {
          finishedOn: now - 2000,
          id: 'job2',
        } as any,
        {
          finishedOn: oneHourAgo - 1000,
          id: 'old-job',
        } as any,
      ]);

      const metrics = await getQueueMetrics(mockQueue as Queue);

      expect(metrics).toEqual({
        queueName: 'test-queue',
        active: 5,
        waiting: 10,
        failed: 2,
        delayed: 3,
        completed: 2, // Only recent jobs
      });
    });

    it('should return zero metrics on error', async () => {
      vi.mocked(mockQueue.getActiveCount).mockRejectedValue(
        new Error('Connection failed'),
      );

      const metrics = await getQueueMetrics(mockQueue as Queue);

      expect(metrics).toEqual({
        queueName: 'test-queue',
        active: 0,
        waiting: 0,
        failed: 0,
        delayed: 0,
        completed: 0,
      });
    });

    it('should filter completed jobs by time window', async () => {
      const now = Date.now();
      const oneHourAgo = now - 60 * 60 * 1000;
      const twoHoursAgo = now - 2 * 60 * 60 * 1000;

      vi.mocked(mockQueue.getActiveCount).mockResolvedValue(0);
      vi.mocked(mockQueue.getWaitingCount).mockResolvedValue(0);
      vi.mocked(mockQueue.getFailedCount).mockResolvedValue(0);
      vi.mocked(mockQueue.getDelayedCount).mockResolvedValue(0);
      vi.mocked(mockQueue.getCompleted).mockResolvedValue([
        { finishedOn: now, id: 'recent' } as any,
        { finishedOn: oneHourAgo + 1000, id: 'recent-edge' } as any,
        { finishedOn: oneHourAgo - 1000, id: 'old' } as any,
        { finishedOn: twoHoursAgo, id: 'very-old' } as any,
      ]);

      const metrics = await getQueueMetrics(mockQueue as Queue);

      // Should include jobs within last 60 minutes
      expect(metrics.completed).toBe(2);
    });
  });

  describe('getAllQueueMetrics', () => {
    it('should get metrics for all queues in parallel', async () => {
      const queue1 = { ...mockQueue, name: 'queue1' };
      const queue2 = { ...mockQueue, name: 'queue2' };

      vi.mocked(queue1.getActiveCount).mockResolvedValue(5);
      vi.mocked(queue1.getWaitingCount).mockResolvedValue(0);
      vi.mocked(queue1.getFailedCount).mockResolvedValue(0);
      vi.mocked(queue1.getDelayedCount).mockResolvedValue(0);
      vi.mocked(queue1.getCompleted).mockResolvedValue([]);

      vi.mocked(queue2.getActiveCount).mockResolvedValue(3);
      vi.mocked(queue2.getWaitingCount).mockResolvedValue(0);
      vi.mocked(queue2.getFailedCount).mockResolvedValue(0);
      vi.mocked(queue2.getDelayedCount).mockResolvedValue(0);
      vi.mocked(queue2.getCompleted).mockResolvedValue([]);

      const metrics = await getAllQueueMetrics([queue1 as Queue, queue2 as Queue]);

      expect(metrics).toHaveLength(2);
      expect(metrics[0].queueName).toBe('queue1');
      expect(metrics[0].active).toBe(5);
      expect(metrics[1].queueName).toBe('queue2');
      expect(metrics[1].active).toBe(3);
    });

    it('should return empty array on error', async () => {
      vi.mocked(mockQueue.getActiveCount).mockRejectedValue(
        new Error('Connection failed'),
      );

      const metrics = await getAllQueueMetrics([mockQueue as Queue]);

      expect(metrics).toEqual([]);
    });
  });

  describe('getWorkerHealth', () => {
    it('should return online status if heartbeat < 2 minutes old', async () => {
      const now = Date.now();
      const oneMinuteAgo = new Date(now - 60 * 1000).getTime();

      vi.mocked(redis.get).mockResolvedValue(oneMinuteAgo.toString());

      const health = await getWorkerHealth(
        WORKER_HEARTBEAT_KEYS.SCREENING,
        'Test Worker',
      );

      expect(health.status).toBe('online');
      expect(health.minutesSinceHeartbeat).toBe(1);
      expect(health.lastHeartbeat).toBeDefined();
    });

    it('should return degraded status if heartbeat 2-5 minutes old', async () => {
      const now = Date.now();
      const threeMinutesAgo = new Date(now - 3 * 60 * 1000).getTime();

      vi.mocked(redis.get).mockResolvedValue(threeMinutesAgo.toString());

      const health = await getWorkerHealth(
        WORKER_HEARTBEAT_KEYS.SCREENING,
        'Test Worker',
      );

      expect(health.status).toBe('degraded');
      expect(health.minutesSinceHeartbeat).toBe(3);
    });

    it('should return offline status if heartbeat > 5 minutes old', async () => {
      const now = Date.now();
      const tenMinutesAgo = new Date(now - 10 * 60 * 1000).getTime();

      vi.mocked(redis.get).mockResolvedValue(tenMinutesAgo.toString());

      const health = await getWorkerHealth(
        WORKER_HEARTBEAT_KEYS.SCREENING,
        'Test Worker',
      );

      expect(health.status).toBe('offline');
      expect(health.minutesSinceHeartbeat).toBe(10);
    });

    it('should return offline status if no heartbeat found', async () => {
      vi.mocked(redis.get).mockResolvedValue(null);

      const health = await getWorkerHealth(
        WORKER_HEARTBEAT_KEYS.SCREENING,
        'Test Worker',
      );

      expect(health.status).toBe('offline');
      expect(health.lastHeartbeat).toBeNull();
      expect(health.minutesSinceHeartbeat).toBeNull();
    });

    it('should handle Redis errors gracefully', async () => {
      vi.mocked(redis.get).mockRejectedValue(new Error('Redis connection failed'));

      const health = await getWorkerHealth(
        WORKER_HEARTBEAT_KEYS.SCREENING,
        'Test Worker',
      );

      expect(health.status).toBe('offline');
      expect(health.lastHeartbeat).toBeNull();
    });
  });

  describe('getAllWorkerHealth', () => {
    it('should get health for all workers', async () => {
      const now = Date.now();
      const oneMinuteAgo = new Date(now - 60 * 1000).getTime();
      const threeMinutesAgo = new Date(now - 3 * 60 * 1000).getTime();
      const tenMinutesAgo = new Date(now - 10 * 60 * 1000).getTime();

      let callCount = 0;
      vi.mocked(redis.get).mockImplementation(async () => {
        callCount++;
        if (callCount === 1) return oneMinuteAgo.toString(); // online
        if (callCount === 2) return threeMinutesAgo.toString(); // degraded
        if (callCount === 3) return tenMinutesAgo.toString(); // offline
        if (callCount === 4) return null; // offline (no heartbeat)
        return null;
      });

      const workers = await getAllWorkerHealth();

      expect(workers).toHaveLength(4);
      expect(workers[0].status).toBe('online');
      expect(workers[1].status).toBe('degraded');
      expect(workers[2].status).toBe('offline');
      expect(workers[3].status).toBe('offline');
    });
  });

  describe('getEmailDeliveryMetrics', () => {
    it('should return email delivery metrics with success rate', async () => {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

      vi.mocked(prisma.communication.count)
        .mockResolvedValueOnce(80) // successful
        .mockResolvedValueOnce(20) // failed
        .mockResolvedValueOnce(100); // total

      vi.mocked(prisma.communication.findMany).mockResolvedValue([
        {
          id: 'email1',
          recipientEmail: 'user1@example.com',
          templateType: 'onboarding',
          status: 'failed',
          createdAt: oneHourAgo,
        },
        {
          id: 'email2',
          recipientEmail: 'user2@example.com',
          templateType: 'reminder',
          status: 'failed',
          createdAt: oneHourAgo,
        },
      ] as any);

      const metrics = await getEmailDeliveryMetrics();

      expect(metrics.totalAttempted).toBe(100);
      expect(metrics.successful).toBe(80);
      expect(metrics.failed).toBe(20);
      expect(metrics.successRate).toBe(80);
      expect(metrics.failedEmails).toHaveLength(2);
    });

    it('should return 100% success rate if no emails attempted', async () => {
      vi.mocked(prisma.communication.count)
        .mockResolvedValueOnce(0) // successful
        .mockResolvedValueOnce(0) // failed
        .mockResolvedValueOnce(0); // total

      vi.mocked(prisma.communication.findMany).mockResolvedValue([]);

      const metrics = await getEmailDeliveryMetrics();

      expect(metrics.successRate).toBe(100);
      expect(metrics.failedEmails).toHaveLength(0);
    });

    it('should return partial data on error', async () => {
      vi.mocked(prisma.communication.count).mockRejectedValue(
        new Error('Database error'),
      );

      const metrics = await getEmailDeliveryMetrics();

      expect(metrics.totalAttempted).toBe(0);
      expect(metrics.successful).toBe(0);
      expect(metrics.failed).toBe(0);
      expect(metrics.successRate).toBe(0);
      expect(metrics.failedEmails).toEqual([]);
    });

    it('should limit failed emails to last 100', async () => {
      const failedEmails = Array.from({ length: 150 }, (_, i) => ({
        id: `email${i}`,
        recipientEmail: `user${i}@example.com`,
        templateType: 'reminder',
        status: 'failed',
        createdAt: new Date(),
      }));

      vi.mocked(prisma.communication.count)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(150)
        .mockResolvedValueOnce(150);

      vi.mocked(prisma.communication.findMany).mockResolvedValue(failedEmails.slice(0, 100) as any);

      const metrics = await getEmailDeliveryMetrics();

      expect(metrics.failedEmails).toHaveLength(100);
    });
  });

  describe('getHealthDashboardData', () => {
    it('should aggregate all health data', async () => {
      vi.mocked(mockQueue.getActiveCount).mockResolvedValue(5);
      vi.mocked(mockQueue.getWaitingCount).mockResolvedValue(0);
      vi.mocked(mockQueue.getFailedCount).mockResolvedValue(0);
      vi.mocked(mockQueue.getDelayedCount).mockResolvedValue(0);
      vi.mocked(mockQueue.getCompleted).mockResolvedValue([]);

      const now = Date.now();
      const oneMinuteAgo = new Date(now - 60 * 1000).getTime();

      let redisCallCount = 0;
      vi.mocked(redis.get).mockImplementation(async () => {
        redisCallCount++;
        if (redisCallCount <= 4) return oneMinuteAgo.toString();
        return null;
      });

      vi.mocked(prisma.communication.count)
        .mockResolvedValueOnce(80)
        .mockResolvedValueOnce(20)
        .mockResolvedValueOnce(100);

      vi.mocked(prisma.communication.findMany).mockResolvedValue([]);

      const data = await getHealthDashboardData([mockQueue as Queue]);

      expect(data.queues).toHaveLength(1);
      expect(data.queues[0].active).toBe(5);
      expect(data.workers).toHaveLength(4);
      expect(data.emailDelivery.successRate).toBe(80);
      expect(data.timestamp).toBeDefined();
      expect(data.error).toBeUndefined();
    });

    it('should include error field on failure', async () => {
      vi.mocked(mockQueue.getActiveCount).mockRejectedValue(
        new Error('Connection failed'),
      );

      vi.mocked(redis.get).mockRejectedValue(new Error('Redis error'));

      vi.mocked(prisma.communication.count).mockRejectedValue(
        new Error('Database error'),
      );

      const data = await getHealthDashboardData([mockQueue as Queue]);

      expect(data.queues).toEqual([]);
      expect(data.workers).toEqual([]);
      expect(data.emailDelivery.totalAttempted).toBe(0);
      expect(data.error).toBe('Failed to collect health metrics');
    });
  });

  describe('updateWorkerHeartbeat', () => {
    it('should update worker heartbeat in Redis with TTL', async () => {
      vi.mocked(redis.setex).mockResolvedValue('OK');

      await updateWorkerHeartbeat(WORKER_HEARTBEAT_KEYS.SCREENING);

      expect(vi.mocked(redis.setex)).toHaveBeenCalledWith(
        WORKER_HEARTBEAT_KEYS.SCREENING,
        600, // 10 minutes
        expect.any(String), // timestamp
      );
    });

    it('should handle Redis errors gracefully', async () => {
      vi.mocked(redis.setex).mockRejectedValue(
        new Error('Redis connection failed'),
      );

      // Should not throw
      await expect(
        updateWorkerHeartbeat(WORKER_HEARTBEAT_KEYS.SCREENING),
      ).resolves.toBeUndefined();
    });
  });
});
