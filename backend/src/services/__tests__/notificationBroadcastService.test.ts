import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import { io as createClient, type Socket as ClientSocket } from 'socket.io-client';

// Mock environment before importing modules that use it
vi.mock('../../config/env', () => ({
  env: {
    FRONTEND_URL: 'http://localhost:3000',
    JWT_SECRET: 'test-secret',
    DATABASE_URL: 'postgresql://test',
    DIRECT_URL: 'postgresql://test',
    UPSTASH_REDIS_REST_URL: 'https://test.upstash.io',
    UPSTASH_REDIS_REST_TOKEN: 'test-token',
    SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'test-key'
  }
}));

// Mock the notification service and Socket.IO
vi.mock('../notificationService', () => ({
  createNotification: vi.fn(),
  getUnreadCount: vi.fn()
}));

vi.mock('../socket', () => ({
  getSocketServer: vi.fn(() => ({
    to: vi.fn(() => ({
      emit: vi.fn()
    }))
  }))
}));

vi.mock('../jwtService');
vi.mock('../../utils/logger', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

import { broadcastNotificationToUser, createAndBroadcastNotification } from '../notificationBroadcastService';
import { createNotification } from '../notificationService';
import { NotificationEventType } from '../../types/notification';
import { JwtService } from '../jwtService';
import { Notification } from '@prisma/client';

describe('notificationBroadcastService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('broadcastNotificationToUser', () => {
    it('should not throw error when broadcasting', async () => {
      const mockNotification: Notification = {
        id: 'notif-123',
        userId: 'user-456',
        eventType: NotificationEventType.REVIEW_ASSIGNED,
        payload: {
          title: 'New Review',
          message: 'You have a new review',
          entityType: 'application',
          entityId: 'app-789'
        },
        readAt: null,
        createdAt: new Date()
      } as any;

      // Should not throw error (best-effort broadcast)
      await expect(broadcastNotificationToUser('user-456', mockNotification)).resolves.not.toThrow();
    });

    it('should handle different notification types', async () => {
      const mockNotification: Notification = {
        id: 'notif-abc',
        userId: 'user-xyz',
        eventType: NotificationEventType.OFFER_APPROVED,
        payload: {
          title: 'Offer Approved',
          message: 'Your offer has been approved',
          entityType: 'offer',
          entityId: 'offer-123'
        },
        readAt: null,
        createdAt: new Date()
      } as any;

      // Should not throw error
      await expect(broadcastNotificationToUser('user-xyz', mockNotification)).resolves.not.toThrow();
    });

    it('should not throw error when broadcast fails', async () => {
      const { getSocketServer } = await import('../socket');
      
      vi.mocked(getSocketServer).mockImplementation(() => {
        throw new Error('Socket.IO not initialized');
      });

      const mockNotification: Notification = {
        id: 'notif-error',
        userId: 'user-error',
        eventType: NotificationEventType.SLA_WARNING,
        payload: {
          title: 'SLA Warning',
          message: 'Deadline approaching',
          entityType: 'application',
          entityId: 'app-urgent'
        },
        readAt: null,
        createdAt: new Date()
      } as any;

      // Should not throw error
      await expect(broadcastNotificationToUser('user-error', mockNotification)).resolves.not.toThrow();
    });

    it('should handle getUnreadCount failure gracefully', async () => {
      const { getSocketServer } = await import('../socket');
      const { getUnreadCount } = await import('../notificationService');
      
      const mockEmit = vi.fn();
      const mockTo = vi.fn(() => ({ emit: mockEmit }));
      vi.mocked(getSocketServer).mockReturnValue({ to: mockTo } as any);
      vi.mocked(getUnreadCount).mockRejectedValue(new Error('Database error'));

      const mockNotification: Notification = {
        id: 'notif-db-err',
        userId: 'user-db-err',
        eventType: NotificationEventType.DECISION_MADE,
        payload: {
          title: 'Decision Made',
          message: 'A decision has been made',
          entityType: 'application',
          entityId: 'app-decided'
        },
        readAt: null,
        createdAt: new Date()
      } as any;

      // Should not throw error
      await expect(broadcastNotificationToUser('user-db-err', mockNotification)).resolves.not.toThrow();
      
      // Emit should not be called if getUnreadCount fails
      expect(mockEmit).not.toHaveBeenCalled();
    });
  });

  describe('createAndBroadcastNotification', () => {
    it('should create notification and attempt broadcast', async () => {
      const { createNotification } = await import('../notificationService');
      
      const mockNotification: Notification = {
        id: 'notif-created',
        userId: 'user-create',
        eventType: NotificationEventType.INTERVIEW_SCHEDULED,
        payload: {
          title: 'Interview Scheduled',
          message: 'Your interview has been scheduled',
          entityType: 'interview',
          entityId: 'interview-123'
        },
        readAt: null,
        createdAt: new Date()
      } as any;

      vi.mocked(createNotification).mockResolvedValue(mockNotification);

      const result = await createAndBroadcastNotification(
        'user-create',
        NotificationEventType.INTERVIEW_SCHEDULED,
        {
          title: 'Interview Scheduled',
          message: 'Your interview has been scheduled',
          entityType: 'interview',
          entityId: 'interview-123'
        }
      );

      expect(result).toEqual(mockNotification);
      expect(createNotification).toHaveBeenCalledWith(
        'user-create',
        NotificationEventType.INTERVIEW_SCHEDULED,
        expect.objectContaining({
          title: 'Interview Scheduled',
          entityType: 'interview'
        })
      );
    });

    it('should create notification even if broadcast fails', async () => {
      const { createNotification } = await import('../notificationService');
      const { getSocketServer } = await import('../socket');
      
      const mockNotification: Notification = {
        id: 'notif-persist',
        userId: 'user-offline',
        eventType: NotificationEventType.PATH_OVERRIDE_REQUESTED,
        payload: {
          title: 'Path Override Requested',
          message: 'A path override has been requested',
          entityType: 'application',
          entityId: 'app-override'
        },
        readAt: null,
        createdAt: new Date()
      } as any;

      vi.mocked(createNotification).mockResolvedValue(mockNotification);
      vi.mocked(getSocketServer).mockImplementation(() => {
        throw new Error('Socket.IO not initialized');
      });

      const result = await createAndBroadcastNotification(
        'user-offline',
        NotificationEventType.PATH_OVERRIDE_REQUESTED,
        {
          title: 'Path Override Requested',
          message: 'A path override has been requested',
          entityType: 'application',
          entityId: 'app-override'
        }
      );

      // Notification should still be created and returned
      expect(result).toEqual(mockNotification);
      expect(createNotification).toHaveBeenCalled();
    });

    it('should handle all notification event types', async () => {
      const { createNotification, getUnreadCount } = await import('../notificationService');
      const { getSocketServer } = await import('../socket');
      
      const mockEmit = vi.fn();
      const mockTo = vi.fn(() => ({ emit: mockEmit }));
      vi.mocked(getSocketServer).mockReturnValue({ to: mockTo } as any);
      vi.mocked(getUnreadCount).mockResolvedValue(1);

      const eventTypes = [
        NotificationEventType.APPLICATION_SUBMITTED,
        NotificationEventType.REVIEW_ASSIGNED,
        NotificationEventType.DECISION_MADE,
        NotificationEventType.INTERVIEW_SCHEDULED,
        NotificationEventType.SCORECARD_SUBMITTED,
        NotificationEventType.OFFER_APPROVED,
        NotificationEventType.OFFER_EXTENDED,
        NotificationEventType.SLA_WARNING,
        NotificationEventType.PATH_OVERRIDE_REQUESTED
      ];

      for (const eventType of eventTypes) {
        const mockNotification: Notification = {
          id: `notif-${eventType}`,
          userId: 'user-all-types',
          eventType,
          payload: {
            title: 'Test',
            message: 'Test message',
            entityType: 'application',
            entityId: 'app-test'
          },
          readAt: null,
          createdAt: new Date()
        } as any;

        vi.mocked(createNotification).mockResolvedValue(mockNotification);

        await createAndBroadcastNotification(
          'user-all-types',
          eventType,
          {
            title: 'Test',
            message: 'Test message',
            entityType: 'application',
            entityId: 'app-test'
          }
        );

        expect(createNotification).toHaveBeenCalledWith(
          'user-all-types',
          eventType,
          expect.any(Object)
        );
      }
    });
  });
});
