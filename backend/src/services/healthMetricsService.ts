import { Queue, Job } from 'bullmq';
import { redis } from '../db/redis';
import { prisma } from '../db/prisma';
import { logger } from '../utils/logger';
import { WORKER_HEARTBEAT_KEYS, HEARTBEAT_THRESHOLDS } from '../constants/workerHeartbeats';

/**
 * Health Metrics Collection Service
 * Aggregates queue depths, worker status, and email delivery metrics
 */

export interface QueueMetrics {
  queueName: string;
  active: number;
  waiting: number;
  failed: number;
  delayed: number;
  completed: number; // Last 60 minutes
}

export interface WorkerHealthStatus {
  workerName: string;
  status: 'online' | 'degraded' | 'offline';
  lastHeartbeat: Date | null;
  minutesSinceHeartbeat: number | null;
}

export interface EmailDeliveryMetrics {
  totalAttempted: number;
  successful: number;
  failed: number;
  successRate: number; // Percentage
  failedEmails: Array<{
    id: string;
    to: string;
    templateType: string;
    status: string;
    createdAt: Date;
  }>;
}

export interface HealthDashboardData {
  queues: QueueMetrics[];
  workers: WorkerHealthStatus[];
  emailDelivery: EmailDeliveryMetrics;
  timestamp: Date;
  error?: string;
}

/**
 * Get metrics for a single BullMQ queue
 */
export async function getQueueMetrics(queue: Queue): Promise<QueueMetrics> {
  try {
    const [active, waiting, failed, delayed] = await Promise.all([
      queue.getActiveCount(),
      queue.getWaitingCount(),
      queue.getFailedCount(),
      queue.getDelayedCount(),
    ]);

    // Get completed jobs in last 60 minutes
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    const completedJobs = await queue.getCompleted(0, -1);
    const recentCompleted = completedJobs.filter(
      (job) => job.finishedOn && job.finishedOn >= oneHourAgo,
    ).length;

    return {
      queueName: queue.name,
      active,
      waiting,
      failed,
      delayed,
      completed: recentCompleted,
    };
  } catch (error) {
    logger.error(`[HealthMetrics] Failed to get metrics for queue ${queue.name}:`, error);
    return {
      queueName: queue.name,
      active: 0,
      waiting: 0,
      failed: 0,
      delayed: 0,
      completed: 0,
    };
  }
}

/**
 * Get metrics for all registered queues
 */
export async function getAllQueueMetrics(
  queues: Queue[],
): Promise<QueueMetrics[]> {
  try {
    return await Promise.all(queues.map((queue) => getQueueMetrics(queue)));
  } catch (error) {
    logger.error('[HealthMetrics] Failed to get all queue metrics:', error);
    return [];
  }
}

/**
 * Get health status for a worker based on heartbeat
 */
export async function getWorkerHealth(
  workerKey: string,
  workerName: string,
): Promise<WorkerHealthStatus> {
  try {
    const heartbeatStr = await redis.get(workerKey);

    if (!heartbeatStr) {
      return {
        workerName,
        status: 'offline',
        lastHeartbeat: null,
        minutesSinceHeartbeat: null,
      };
    }

    const lastHeartbeat = new Date(parseInt(heartbeatStr, 10));
    const minutesSinceHeartbeat = Math.floor(
      (Date.now() - lastHeartbeat.getTime()) / (60 * 1000),
    );

    // Status logic:
    // < ONLINE_MAX_MINUTES (2 min): online
    // ONLINE_MAX_MINUTES to DEGRADED_MAX_MINUTES (2-5 min): degraded (amber)
    // > DEGRADED_MAX_MINUTES (5 min): offline
    let status: 'online' | 'degraded' | 'offline';
    if (minutesSinceHeartbeat < HEARTBEAT_THRESHOLDS.ONLINE_MAX_MINUTES) {
      status = 'online';
    } else if (minutesSinceHeartbeat < HEARTBEAT_THRESHOLDS.DEGRADED_MAX_MINUTES) {
      status = 'degraded';
    } else {
      status = 'offline';
    }

    return {
      workerName,
      status,
      lastHeartbeat,
      minutesSinceHeartbeat,
    };
  } catch (error) {
    logger.error(`[HealthMetrics] Failed to get health for worker ${workerName}:`, error);
    return {
      workerName,
      status: 'offline',
      lastHeartbeat: null,
      minutesSinceHeartbeat: null,
    };
  }
}

/**
 * Get health status for all workers
 */
export async function getAllWorkerHealth(): Promise<WorkerHealthStatus[]> {
  try {
    return await Promise.all([
      getWorkerHealth(WORKER_HEARTBEAT_KEYS.SCREENING, 'AI Screening Worker'),
      getWorkerHealth(WORKER_HEARTBEAT_KEYS.RESUME_PARSE, 'Resume Parser Worker'),
      getWorkerHealth(WORKER_HEARTBEAT_KEYS.EMAIL_DELIVERY, 'Email Delivery Worker'),
      getWorkerHealth(WORKER_HEARTBEAT_KEYS.OFFER_PROCESSING, 'Offer Processing Worker'),
    ]);
  } catch (error) {
    logger.error('[HealthMetrics] Failed to get all worker health:', error);
    return [];
  }
}

/**
 * Get email delivery metrics from Communication table (last 60 minutes)
 */
export async function getEmailDeliveryMetrics(): Promise<EmailDeliveryMetrics> {
  try {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    // Query Communication table for email stats in last 60 min
    const [successful, failed, totalAttempted] = await Promise.all([
      prisma.communication.count({
        where: {
          channel: 'email',
          status: 'delivered',
          createdAt: { gte: oneHourAgo },
        },
      }),
      prisma.communication.count({
        where: {
          channel: 'email',
          status: 'failed',
          createdAt: { gte: oneHourAgo },
        },
      }),
      prisma.communication.count({
        where: {
          channel: 'email',
          createdAt: { gte: oneHourAgo },
        },
      }),
    ]);

    // Get failed email details (most recent 100)
    const failedEmails = await prisma.communication.findMany({
      where: {
        channel: 'email',
        status: 'failed',
        createdAt: { gte: oneHourAgo },
      },
      select: {
        id: true,
        status: true,
        createdAt: true,
        recipientEmail: true,
        templateType: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    const successRate =
      totalAttempted > 0 ? Math.round((successful / totalAttempted) * 100) : 100;

    return {
      totalAttempted,
      successful,
      failed,
      successRate,
      failedEmails: failedEmails.map((email) => ({
        id: email.id,
        to: email.recipientEmail,
        templateType: email.templateType || 'unknown',
        status: email.status,
        createdAt: email.createdAt,
      })),
    };
  } catch (error) {
    logger.error('[HealthMetrics] Failed to get email delivery metrics:', error);
    return {
      totalAttempted: 0,
      successful: 0,
      failed: 0,
      successRate: 0,
      failedEmails: [],
    };
  }
}

/**
 * Aggregate all health dashboard data
 */
export async function getHealthDashboardData(
  queues: Queue[],
): Promise<HealthDashboardData> {
  try {
    const [queueMetrics, workers, emailDelivery] = await Promise.all([
      getAllQueueMetrics(queues),
      getAllWorkerHealth(),
      getEmailDeliveryMetrics(),
    ]);

    return {
      queues: queueMetrics,
      workers,
      emailDelivery,
      timestamp: new Date(),
    };
  } catch (error) {
    logger.error('[HealthMetrics] Failed to get health dashboard data:', error);

    return {
      queues: [],
      workers: [],
      emailDelivery: {
        totalAttempted: 0,
        successful: 0,
        failed: 0,
        successRate: 0,
        failedEmails: [],
      },
      timestamp: new Date(),
      error: 'Failed to collect health metrics',
    };
  }
}

/**
 * Update worker heartbeat in Redis
 * Called by workers during job processing
 */
export async function updateWorkerHeartbeat(workerKey: string): Promise<void> {
  try {
    const now = Date.now().toString();
    await redis.setex(
      workerKey,
      HEARTBEAT_THRESHOLDS.TTL_SECONDS,
      now,
    );
  } catch (error) {
    logger.error(`[HealthMetrics] Failed to update heartbeat for ${workerKey}:`, error);
  }
}
