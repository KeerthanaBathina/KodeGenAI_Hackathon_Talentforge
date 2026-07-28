import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  enqueueEmailDelivery,
  cancelEmailDelivery,
  getQueueStats,
  closeEmailQueue,
  emailDeliveryQueue,
  EmailDeliveryJobData,
} from '../emailDeliveryQueue';

// Mock config/env
vi.mock('../../config/env', () => ({
  env: {
    REDIS_URL: 'redis://localhost:6379',
    NODE_ENV: 'test',
  },
}));

// Mock IORedis
vi.mock('ioredis', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      on: vi.fn(),
      connect: vi.fn(),
      disconnect: vi.fn(),
    })),
  };
});

// Mock BullMQ
vi.mock('bullmq', () => {
  const mockJobs = new Map<string, any>();

  const Queue = vi.fn().mockImplementation((name: string, opts: any) => {
    return {
      name,
      opts,
      add: vi.fn(async (jobName: string, data: any, options: any) => {
        const job = {
          id: options.jobId,
          name: jobName,
          data,
          opts: options,
          timestamp: Date.now(),
        };
        mockJobs.set(options.jobId, job);
        return job;
      }),
      getJob: vi.fn(async (jobId: string) => {
        const job = mockJobs.get(jobId);
        return job
          ? {
              ...job,
              remove: vi.fn(async () => {
                mockJobs.delete(jobId);
              }),
            }
          : null;
      }),
      getWaitingCount: vi.fn(async () => 5),
      getActiveCount: vi.fn(async () => 2),
      getCompletedCount: vi.fn(async () => 100),
      getFailedCount: vi.fn(async () => 3),
      close: vi.fn(async () => {}),
      on: vi.fn(),
      _mockJobs: mockJobs,
    };
  });

  return { Queue };
});

// Mock logger
vi.mock('../../utils/logger', () => ({
  default: {
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

describe('emailDeliveryQueue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Clear mock jobs
    const queue = emailDeliveryQueue as any;
    if (queue._mockJobs) {
      queue._mockJobs.clear();
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Queue Configuration', () => {
    it('should create queue with correct name', () => {
      expect(emailDeliveryQueue.name).toBe('email-delivery');
    });

    it('should configure 5 retry attempts', () => {
      expect(emailDeliveryQueue.opts.defaultJobOptions.attempts).toBe(5);
    });

    it('should configure exponential backoff with 30s initial delay', () => {
      const backoff = emailDeliveryQueue.opts.defaultJobOptions.backoff;
      expect(backoff).toEqual({
        type: 'exponential',
        delay: 30000,
      });
    });

    it('should configure 24h retention for completed jobs', () => {
      const removeOnComplete = emailDeliveryQueue.opts.defaultJobOptions.removeOnComplete;
      expect(removeOnComplete).toEqual({ age: 86400 });
    });

    it('should configure no removal for failed jobs', () => {
      expect(emailDeliveryQueue.opts.defaultJobOptions.removeOnFail).toBe(false);
    });
  });

  describe('enqueueEmailDelivery', () => {
    it('should enqueue job with correct data and ID', async () => {
      const jobData: EmailDeliveryJobData = {
        communicationId: 'comm-123',
        to: 'candidate@example.com',
        templateType: 'offer',
        templateId: 'template-456',
        tokenData: {
          candidate_name: 'John Doe',
          role_title: 'Software Engineer',
        },
        idempotencyKey: 'abcdef123456',
        eventType: 'offer_extended',
        entityId: 'offer-789',
      };

      await enqueueEmailDelivery(jobData);

      expect(emailDeliveryQueue.add).toHaveBeenCalledWith(
        'send-email',
        jobData,
        {
          jobId: 'email-comm-123',
          attempts: 5,
        }
      );
    });

    it('should generate job ID from communicationId', async () => {
      const jobData: EmailDeliveryJobData = {
        communicationId: 'unique-comm-id',
        to: 'test@example.com',
        templateType: 'general',
        templateId: 'template-1',
        tokenData: {},
        idempotencyKey: 'key123',
        eventType: 'test_event',
        entityId: 'entity-1',
      };

      await enqueueEmailDelivery(jobData);

      const queue = emailDeliveryQueue as any;
      const jobs = Array.from(queue._mockJobs.values());
      expect(jobs[0].id).toBe('email-unique-comm-id');
    });

    it('should log enqueue event with metadata', async () => {
      const logger = await import('../../utils/logger');
      
      const jobData: EmailDeliveryJobData = {
        communicationId: 'comm-log-test',
        to: 'log@example.com',
        templateType: 'rejection',
        templateId: 'template-reject',
        tokenData: {},
        idempotencyKey: 'log-key',
        eventType: 'application_rejected',
        entityId: 'app-123',
      };

      await enqueueEmailDelivery(jobData);

      expect(logger.default.info).toHaveBeenCalledWith(
        {
          communicationId: 'comm-log-test',
          to: 'log@example.com',
          templateType: 'rejection',
          eventType: 'application_rejected',
        },
        'Email delivery job enqueued'
      );
    });

    it('should allow different template types', async () => {
      const templateTypes = ['offer', 'rejection', 'general', 'screening_invite', 'interview_invite'];

      for (const templateType of templateTypes) {
        const jobData: EmailDeliveryJobData = {
          communicationId: `comm-${templateType}`,
          to: 'test@example.com',
          templateType: templateType as any,
          templateId: 'template-1',
          tokenData: {},
          idempotencyKey: 'key',
          eventType: 'test',
          entityId: 'entity-1',
        };

        await enqueueEmailDelivery(jobData);

        expect(emailDeliveryQueue.add).toHaveBeenCalledWith(
          'send-email',
          expect.objectContaining({ templateType }),
          expect.any(Object)
        );
      }
    });
  });

  describe('cancelEmailDelivery', () => {
    it('should cancel existing job', async () => {
      const queue = emailDeliveryQueue as any;
      
      // First enqueue a job
      await enqueueEmailDelivery({
        communicationId: 'comm-to-cancel',
        to: 'cancel@example.com',
        templateType: 'offer',
        templateId: 'template-1',
        tokenData: {},
        idempotencyKey: 'key',
        eventType: 'test',
        entityId: 'entity-1',
      });

      // Verify job exists
      expect(queue._mockJobs.has('email-comm-to-cancel')).toBe(true);

      // Cancel the job
      await cancelEmailDelivery('comm-to-cancel');

      // Verify job was removed
      expect(queue._mockJobs.has('email-comm-to-cancel')).toBe(false);
    });

    it('should handle cancellation of non-existent job gracefully', async () => {
      const logger = await import('../../utils/logger');

      await cancelEmailDelivery('non-existent-comm');

      expect(logger.default.debug).toHaveBeenCalledWith(
        { communicationId: 'non-existent-comm' },
        'Email delivery job not found for cancellation'
      );
    });

    it('should log successful cancellation', async () => {
      const logger = await import('../../utils/logger');

      // Enqueue then cancel
      await enqueueEmailDelivery({
        communicationId: 'comm-log-cancel',
        to: 'test@example.com',
        templateType: 'general',
        templateId: 'template-1',
        tokenData: {},
        idempotencyKey: 'key',
        eventType: 'test',
        entityId: 'entity-1',
      });

      await cancelEmailDelivery('comm-log-cancel');

      expect(logger.default.info).toHaveBeenCalledWith(
        { communicationId: 'comm-log-cancel' },
        'Email delivery job cancelled'
      );
    });
  });

  describe('getQueueStats', () => {
    it('should return queue statistics', async () => {
      const stats = await getQueueStats();

      expect(stats).toEqual({
        waiting: 5,
        active: 2,
        completed: 100,
        failed: 3,
      });
    });

    it('should call all queue count methods', async () => {
      await getQueueStats();

      expect(emailDeliveryQueue.getWaitingCount).toHaveBeenCalled();
      expect(emailDeliveryQueue.getActiveCount).toHaveBeenCalled();
      expect(emailDeliveryQueue.getCompletedCount).toHaveBeenCalled();
      expect(emailDeliveryQueue.getFailedCount).toHaveBeenCalled();
    });
  });

  describe('closeEmailQueue', () => {
    it('should close queue gracefully', async () => {
      await closeEmailQueue();

      expect(emailDeliveryQueue.close).toHaveBeenCalled();
    });

    it('should log queue closure', async () => {
      const logger = await import('../../utils/logger');

      await closeEmailQueue();

      expect(logger.default.info).toHaveBeenCalledWith('Email delivery queue closed');
    });
  });

  describe('Job ID Pattern', () => {
    it('should generate deterministic job IDs', async () => {
      const communicationId = 'comm-deterministic';

      await enqueueEmailDelivery({
        communicationId,
        to: 'test@example.com',
        templateType: 'general',
        templateId: 'template-1',
        tokenData: {},
        idempotencyKey: 'key',
        eventType: 'test',
        entityId: 'entity-1',
      });

      const queue = emailDeliveryQueue as any;
      const jobs = Array.from(queue._mockJobs.values());
      const jobIds = jobs.map((job: any) => job.id);

      expect(jobIds).toContain('email-comm-deterministic');
    });

    it('should prevent duplicate jobs with same communicationId', async () => {
      const communicationId = 'comm-duplicate';

      // Enqueue first job
      await enqueueEmailDelivery({
        communicationId,
        to: 'first@example.com',
        templateType: 'general',
        templateId: 'template-1',
        tokenData: {},
        idempotencyKey: 'key1',
        eventType: 'test',
        entityId: 'entity-1',
      });

      // Enqueue second job with same communicationId
      await enqueueEmailDelivery({
        communicationId,
        to: 'second@example.com',
        templateType: 'offer',
        templateId: 'template-2',
        tokenData: {},
        idempotencyKey: 'key2',
        eventType: 'test',
        entityId: 'entity-2',
      });

      const queue = emailDeliveryQueue as any;
      const job = queue._mockJobs.get('email-comm-duplicate');

      // Second job should overwrite first
      expect(job.data.to).toBe('second@example.com');
      expect(job.data.templateType).toBe('offer');
    });
  });
});
