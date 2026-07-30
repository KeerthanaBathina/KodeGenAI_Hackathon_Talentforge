import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { Job } from 'bullmq';
import { EmailDeliveryJobData } from '../emailDeliveryQueue';
import {
  PermanentEmailError,
  TransientEmailError,
} from '../../services/errors/emailErrors';

// Mock all dependencies before imports
vi.mock('../../config/env', () => ({
  env: {
    REDIS_URL: 'redis://localhost:6379',
    NODE_ENV: 'test',
  },
}));

vi.mock('ioredis', () => ({
  default: vi.fn().mockImplementation(() => ({
    on: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
  })),
}));

vi.mock('../../utils/logger', () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock service functions
const mockResolveTemplate = vi.fn();
const mockRenderTemplate = vi.fn();
const mockSendEmailViaResend = vi.fn();
const mockUpdateCommunicationStatus = vi.fn();
const mockUpdateCommunicationRetryCount = vi.fn();

vi.mock('../../services/templateService', () => ({
  resolveTemplate: mockResolveTemplate,
}));

vi.mock('../../services/templateRenderer', () => ({
  renderTemplate: mockRenderTemplate,
}));

vi.mock('../../services/resendEmailService', () => ({
  sendEmailViaResend: mockSendEmailViaResend,
}));

vi.mock('../../services/communicationService', () => ({
  updateCommunicationStatus: mockUpdateCommunicationStatus,
  updateCommunicationRetryCount: mockUpdateCommunicationRetryCount,
}));

// Mock BullMQ Worker
let capturedProcessor: any = null;
const mockWorkerOn = vi.fn();
const mockWorkerClose = vi.fn();

vi.mock('bullmq', () => ({
  Worker: vi.fn().mockImplementation((queueName, processor, options) => {
    // Capture the processor for testing
    capturedProcessor = processor;
    return {
      on: mockWorkerOn,
      close: mockWorkerClose,
    };
  }),
  Queue: vi.fn().mockImplementation(() => ({
    add: vi.fn(),
    remove: vi.fn(),
    getJob: vi.fn(),
    count: vi.fn(),
    close: vi.fn(),
  })),
  Job: vi.fn(),
}));

describe('emailDeliveryWorker', () => {
  const mockJobData: EmailDeliveryJobData = {
    communicationId: 'comm-123',
    to: 'candidate@example.com',
    templateType: 'offer' as any,
    templateId: 'template-456',
    tokenData: {
      candidateName: 'John Doe',
      position: 'Software Engineer',
    },
    idempotencyKey: 'key-789',
    eventType: 'offer_extended',
    entityId: 'offer-001',
  };

  const mockJob = {
    id: 'job-123',
    data: mockJobData,
    attemptsMade: 0,
    opts: {
      attempts: 5,
    },
  } as Job<EmailDeliveryJobData>;

  const mockTemplate = {
    id: 'template-456',
    name: 'Offer Email',
    type: 'offer',
    locale: 'en',
    subject: 'Job Offer - {{position}}',
    bodyHtml: '<p>Dear {{candidateName}},</p>',
    bodyText: 'Dear {{candidateName}},',
  };

  const mockRendered = {
    subject: 'Job Offer - Software Engineer',
    bodyHtml: '<p>Dear John Doe,</p>',
    bodyText: 'Dear John Doe,',
  };

  beforeAll(async () => {
    // Import worker module to trigger Worker constructor and capture processor
    await import('../emailDeliveryWorker');
  });

  beforeEach(() => {
    // Clear all mocks except worker creation mocks
    mockResolveTemplate.mockClear();
    mockRenderTemplate.mockClear();
    mockSendEmailViaResend.mockClear();
    mockUpdateCommunicationStatus.mockClear();
    mockUpdateCommunicationRetryCount.mockClear();
    
    // Reset default behavior
    mockResolveTemplate.mockResolvedValue(mockTemplate);
    mockRenderTemplate.mockReturnValue(mockRendered);
    mockSendEmailViaResend.mockResolvedValue({
      messageId: 'msg_abc123',
      success: true,
    });
    mockUpdateCommunicationStatus.mockResolvedValue(undefined);
    mockUpdateCommunicationRetryCount.mockResolvedValue(undefined);
  });

  describe('job processor - successful flow', () => {
    it('should process email delivery job successfully', async () => {
      const processor = capturedProcessor;
      await processor(mockJob);

      // Verify template resolution
      expect(mockResolveTemplate).toHaveBeenCalledWith('offer', 'en');

      // Verify template rendering
      expect(mockRenderTemplate).toHaveBeenCalledWith(mockTemplate, mockJobData.tokenData);

      // Verify email sending
      expect(mockSendEmailViaResend).toHaveBeenCalledWith({
        to: 'candidate@example.com',
        subject: 'Job Offer - Software Engineer',
        html: '<p>Dear John Doe,</p>',
        text: 'Dear John Doe,',
        idempotencyKey: 'key-789',
      });

      // Verify status update
      expect(mockUpdateCommunicationStatus).toHaveBeenCalledWith('comm-123', {
        status: 'sent',
        messageId: 'msg_abc123',
        sentAt: expect.any(Date),
        retryCount: 0,
      });
    });

    it('should update retry count to match job attempts', async () => {
      const processor = capturedProcessor;
      const jobWithRetries = { ...mockJob, attemptsMade: 2 };
      await processor(jobWithRetries);

      expect(mockUpdateCommunicationStatus).toHaveBeenCalledWith('comm-123', {
        status: 'sent',
        messageId: 'msg_abc123',
        sentAt: expect.any(Date),
        retryCount: 2,
      });
    });

    it('should use correct idempotency key', async () => {
      const processor = capturedProcessor;
      await processor(mockJob);

      expect(mockSendEmailViaResend).toHaveBeenCalledWith(
        expect.objectContaining({
          idempotencyKey: 'key-789',
        })
      );
    });
  });

  describe('job processor - template resolution errors', () => {
    it('should handle template not found as permanent error', async () => {
      mockResolveTemplate.mockResolvedValue(null);

      const processor = capturedProcessor;

      // Should not throw (permanent errors don't retry)
      await processor(mockJob);

      // Should update retry count
      expect(mockUpdateCommunicationRetryCount).toHaveBeenCalledWith('comm-123', 0);

      // Should update status to failed
      expect(mockUpdateCommunicationStatus).toHaveBeenCalledWith('comm-123', {
        status: 'failed',
        retryCount: 0,
      });

      // Should not call sendEmailViaResend
      expect(mockSendEmailViaResend).not.toHaveBeenCalled();
    });
  });

  describe('job processor - permanent errors', () => {
    it('should handle PermanentEmailError without retrying', async () => {
      mockSendEmailViaResend.mockRejectedValue(
        new PermanentEmailError('Invalid email address', 422)
      );

      const processor = capturedProcessor;
      
      // Should not throw (prevents retry)
      await processor(mockJob);

      // Should update retry count first
      expect(mockUpdateCommunicationRetryCount).toHaveBeenCalledWith('comm-123', 0);

      // Should update status to failed
      expect(mockUpdateCommunicationStatus).toHaveBeenCalledWith('comm-123', {
        status: 'failed',
        retryCount: 0,
      });
    });

    it('should not retry on PermanentEmailError', async () => {
      mockSendEmailViaResend.mockRejectedValue(
        new PermanentEmailError('Unauthorized', 401)
      );

      const processor = capturedProcessor;
      
      // Should complete without throwing
      await expect(processor(mockJob)).resolves.toBeUndefined();
    });
  });

  describe('job processor - transient errors', () => {
    it('should throw TransientEmailError to trigger retry', async () => {
      mockSendEmailViaResend.mockRejectedValue(
        new TransientEmailError('Service unavailable', 503)
      );

      const processor = capturedProcessor;

      // Should throw to trigger retry
      await expect(processor(mockJob)).rejects.toThrow(TransientEmailError);

      // Should update retry count
      expect(mockUpdateCommunicationRetryCount).toHaveBeenCalledWith('comm-123', 0);

      // Should not update status to failed
      expect(mockUpdateCommunicationStatus).not.toHaveBeenCalledWith('comm-123', {
        status: 'failed',
        retryCount: expect.any(Number),
      });
    });

    it('should throw generic errors to trigger retry', async () => {
      mockSendEmailViaResend.mockRejectedValue(new Error('Unknown error'));

      const processor = capturedProcessor;

      // Should throw to trigger retry
      await expect(processor(mockJob)).rejects.toThrow('Unknown error');

      // Should update retry count
      expect(mockUpdateCommunicationRetryCount).toHaveBeenCalledWith('comm-123', 0);
    });
  });

  describe('job processor - retry count tracking', () => {
    it('should track retry count on each attempt', async () => {
      const jobWithRetries = { ...mockJob, attemptsMade: 3 };
      mockSendEmailViaResend.mockRejectedValue(
        new TransientEmailError('Timeout', 504)
      );

      const processor = capturedProcessor;

      await expect(processor(jobWithRetries)).rejects.toThrow();

      expect(mockUpdateCommunicationRetryCount).toHaveBeenCalledWith('comm-123', 3);
    });

    it('should include retry count in final status update', async () => {
      const jobWithRetries = { ...mockJob, attemptsMade: 2 };

      const processor = capturedProcessor;
      await processor(jobWithRetries);

      expect(mockUpdateCommunicationStatus).toHaveBeenCalledWith('comm-123', {
        status: 'sent',
        messageId: 'msg_abc123',
        sentAt: expect.any(Date),
        retryCount: 2,
      });
    });
  });

  describe('worker configuration', () => {
    it('should create worker and capture processor', () => {
      // Verify worker was created and processor was captured
      expect(capturedProcessor).toBeDefined();
      expect(typeof capturedProcessor).toBe('function');
    });

    it('should register event handlers', () => {
      // Verify event handlers were registered
      expect(mockWorkerOn).toHaveBeenCalled();
      expect(mockWorkerOn.mock.calls.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('worker event handlers', () => {
    it('should register completed event handler', () => {
      expect(mockWorkerOn).toHaveBeenCalledWith('completed', expect.any(Function));
    });

    it('should register failed event handler', () => {
      expect(mockWorkerOn).toHaveBeenCalledWith('failed', expect.any(Function));
    });

    it('should register error event handler', () => {
      expect(mockWorkerOn).toHaveBeenCalledWith('error', expect.any(Function));
    });
  });

  describe('graceful shutdown', () => {
    it('should export shutdownEmailDeliveryWorker function', async () => {
      const worker = await import('../emailDeliveryWorker');
      
      expect(worker.shutdownEmailDeliveryWorker).toBeDefined();
      expect(typeof worker.shutdownEmailDeliveryWorker).toBe('function');
    });

    it('should close worker on shutdown', async () => {
      const { shutdownEmailDeliveryWorker } = await import('../emailDeliveryWorker');
      
      await shutdownEmailDeliveryWorker();
      
      expect(mockWorkerClose).toHaveBeenCalled();
    });
  });

  describe('template integration', () => {
    it('should request English locale by default', async () => {
      const processor = capturedProcessor;
      await processor(mockJob);

      expect(mockResolveTemplate).toHaveBeenCalledWith('offer', 'en');
    });

    it('should pass token data to renderTemplate', async () => {
      const processor = capturedProcessor;
      await processor(mockJob);

      expect(mockRenderTemplate).toHaveBeenCalledWith(
        mockTemplate,
        mockJobData.tokenData
      );
    });

    it('should use rendered content in email', async () => {
      const processor = capturedProcessor;
      await processor(mockJob);

      expect(mockSendEmailViaResend).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: 'Job Offer - Software Engineer',
          html: '<p>Dear John Doe,</p>',
          text: 'Dear John Doe,',
        })
      );
    });
  });
});
