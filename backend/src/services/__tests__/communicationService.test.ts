import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CommunicationStatus } from '@prisma/client';

const mocks = vi.hoisted(() => ({
  auditEvent: vi.fn(),
}));

// Mock logger
vi.mock('../../utils/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock Prisma client
vi.mock('../../db/prisma', () => ({
  default: {
    communication: {
      update: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}));

vi.mock('../auditService', () => ({
  auditEvent: mocks.auditEvent,
}));

// Import after mocks are set up
import prisma from '../../db/prisma';
import {
  updateCommunicationStatus,
  updateCommunicationRetryCount,
  getCommunication,
} from '../communicationService';

describe('communicationService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('updateCommunicationStatus', () => {
    it('should update communication with all status fields', async () => {
      vi.mocked(prisma.communication.update).mockResolvedValue({
        id: 'comm-123',
        status: 'sent',
        messageId: 'msg_abc',
        sentAt: new Date(),
        retryCount: 1,
      } as any);

      const sentAt = new Date();
      await updateCommunicationStatus('comm-123', {
        status: 'sent' as CommunicationStatus,
        messageId: 'msg_abc',
        sentAt,
        retryCount: 1,
      });

      expect(prisma.communication.update).toHaveBeenCalledWith({
        where: { id: 'comm-123' },
        data: {
          status: 'sent',
          messageId: 'msg_abc',
          sentAt,
          retryCount: 1,
        },
      });
    });

    it('should update to queued status', async () => {
      vi.mocked(prisma.communication.update).mockResolvedValue({
        id: 'comm-456',
        status: 'queued',
      });

      await updateCommunicationStatus('comm-456', {
        status: 'queued' as CommunicationStatus,
      });

      expect(vi.mocked(prisma.communication.update)).toHaveBeenCalledWith({
        where: { id: 'comm-456' },
        data: {
          status: 'queued',
        },
      });

      expect(mocks.auditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'communication.queued',
          entityType: 'communication',
          entityId: 'comm-456',
          payload: expect.objectContaining({ status: 'queued' }),
        })
      );
    });

    it('should update to failed status', async () => {
      vi.mocked(prisma.communication.update).mockResolvedValue({
        id: 'comm-789',
        status: 'failed',
        retryCount: 5,
      });

      await updateCommunicationStatus('comm-789', {
        status: 'failed' as CommunicationStatus,
        retryCount: 5,
      });

      expect(vi.mocked(prisma.communication.update)).toHaveBeenCalledWith({
        where: { id: 'comm-789' },
        data: {
          status: 'failed',
          retryCount: 5,
        },
      });

      expect(mocks.auditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'communication.failed',
          entityType: 'communication',
          entityId: 'comm-789',
          payload: expect.objectContaining({
            status: 'failed',
            retryCount: 5,
          }),
        })
      );
    });

    it('should update to delivered status with timestamp', async () => {
      vi.mocked(prisma.communication.update).mockResolvedValue({
        id: 'comm-111',
        status: 'delivered',
        deliveredAt: new Date(),
      });

      const deliveredAt = new Date();
      await updateCommunicationStatus('comm-111', {
        status: 'delivered' as CommunicationStatus,
        deliveredAt,
      });

      expect(vi.mocked(prisma.communication.update)).toHaveBeenCalledWith({
        where: { id: 'comm-111' },
        data: {
          status: 'delivered',
          deliveredAt,
        },
      });
    });

    it('should handle optional fields', async () => {
      vi.mocked(prisma.communication.update).mockResolvedValue({
        id: 'comm-222',
        status: 'sent',
      });

      await updateCommunicationStatus('comm-222', {
        status: 'sent' as CommunicationStatus,
      });

      expect(vi.mocked(prisma.communication.update)).toHaveBeenCalledWith({
        where: { id: 'comm-222' },
        data: {
          status: 'sent',
        },
      });
    });

    it('should include messageId when provided', async () => {
      vi.mocked(prisma.communication.update).mockResolvedValue({
        id: 'comm-333',
        status: 'sent',
        messageId: 'msg_xyz789',
      });

      await updateCommunicationStatus('comm-333', {
        status: 'sent' as CommunicationStatus,
        messageId: 'msg_xyz789',
      });

      expect(vi.mocked(prisma.communication.update)).toHaveBeenCalledWith({
        where: { id: 'comm-333' },
        data: {
          status: 'sent',
          messageId: 'msg_xyz789',
        },
      });
    });
  });

  describe('updateCommunicationRetryCount', () => {
    it('should update retry count', async () => {
      vi.mocked(prisma.communication.update).mockResolvedValue({
        id: 'comm-123',
        retryCount: 2,
      });

      await updateCommunicationRetryCount('comm-123', 2);

      expect(vi.mocked(prisma.communication.update)).toHaveBeenCalledWith({
        where: { id: 'comm-123' },
        data: { retryCount: 2 },
      });

      expect(mocks.auditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'communication.retry',
          entityType: 'communication',
          entityId: 'comm-123',
          payload: { retryCount: 2 },
        })
      );
    });

    it('should update retry count to 0', async () => {
      vi.mocked(prisma.communication.update).mockResolvedValue({
        id: 'comm-456',
        retryCount: 0,
      });

      await updateCommunicationRetryCount('comm-456', 0);

      expect(vi.mocked(prisma.communication.update)).toHaveBeenCalledWith({
        where: { id: 'comm-456' },
        data: { retryCount: 0 },
      });
    });

    it('should update retry count to max attempts', async () => {
      vi.mocked(prisma.communication.update).mockResolvedValue({
        id: 'comm-789',
        retryCount: 5,
      });

      await updateCommunicationRetryCount('comm-789', 5);

      expect(vi.mocked(prisma.communication.update)).toHaveBeenCalledWith({
        where: { id: 'comm-789' },
        data: { retryCount: 5 },
      });
    });
  });

  describe('getCommunication', () => {
    it('should fetch communication with relations', async () => {
      const mockCommunication = {
        id: 'comm-123',
        applicationId: 'app-456',
        templateId: 'template-789',
        status: 'sent',
        template: {
          id: 'template-789',
          name: 'Offer Email',
          type: 'offer',
        },
        application: {
          id: 'app-456',
          candidateEmail: 'candidate@example.com',
        },
      };

      vi.mocked(prisma.communication.findUnique).mockResolvedValue(mockCommunication);

      const result = await getCommunication('comm-123');

      expect(result).toEqual(mockCommunication);
      expect(vi.mocked(prisma.communication.findUnique)).toHaveBeenCalledWith({
        where: { id: 'comm-123' },
        include: {
          template: true,
          application: true,
        },
      });
    });

    it('should return null if communication not found', async () => {
      vi.mocked(prisma.communication.findUnique).mockResolvedValue(null);

      const result = await getCommunication('comm-nonexistent');

      expect(result).toBeNull();
      expect(vi.mocked(prisma.communication.findUnique)).toHaveBeenCalledWith({
        where: { id: 'comm-nonexistent' },
        include: {
          template: true,
          application: true,
        },
      });
    });
  });

  describe('error handling', () => {
    it('should propagate database errors from updateCommunicationStatus', async () => {
      vi.mocked(prisma.communication.update).mockRejectedValue(new Error('Database connection failed'));

      await expect(
        updateCommunicationStatus('comm-123', {
          status: 'sent' as CommunicationStatus,
        })
      ).rejects.toThrow('Database connection failed');
    });

    it('should propagate database errors from updateCommunicationRetryCount', async () => {
      vi.mocked(prisma.communication.update).mockRejectedValue(new Error('Record not found'));

      await expect(
        updateCommunicationRetryCount('comm-456', 2)
      ).rejects.toThrow('Record not found');
    });

    it('should propagate database errors from getCommunication', async () => {
      vi.mocked(prisma.communication.findUnique).mockRejectedValue(new Error('Query timeout'));

      await expect(getCommunication('comm-789')).rejects.toThrow('Query timeout');
    });
  });
});
