import { describe, it, expect, beforeEach, vi } from 'vitest';

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
    SUPABASE_SERVICE_ROLE_KEY: 'test-key',
    OTP_HASH_SALT: 'test-salt',
    OTP_EXPIRY_MINUTES: 15
  }
}));

vi.mock('../notificationPreferenceService');
vi.mock('../../db/prisma', () => ({
  prisma: {
    notification: {
      create: vi.fn(),
      count: vi.fn()
    }
  }
}));
vi.mock('../socket', () => ({
  getSocketServer: vi.fn(() => ({
    to: vi.fn(() => ({
      emit: vi.fn()
    }))
  }))
}));
vi.mock('../../utils/logger', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

import { createNotification } from '../notificationService';
import { broadcastNotificationToUser, createAndBroadcastNotification } from '../notificationBroadcastService';
import * as preferenceService from '../notificationPreferenceService';
import { NotificationChannel, NotificationTypeEnum } from '@prisma/client';
import { NotificationEventType } from '../../types/notification';
import { prisma } from '../../db/prisma';

describe('Notification Delivery with Preferences', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createNotification', () => {
    it('should create notification when preference is enabled', async () => {
      vi.mocked(preferenceService.shouldSendNotification).mockResolvedValue(true);
      
      const mockNotification = {
        id: 'notif-1',
        userId: 'user-1',
        eventType: NotificationEventType.REVIEW_ASSIGNED,
        payload: {
          title: 'Test',
          message: 'Test message',
          entityType: 'application' as const,
          entityId: 'app-1'
        },
        readAt: null,
        createdAt: new Date()
      };
      
      vi.mocked(prisma.notification.create).mockResolvedValue(mockNotification);

      const result = await createNotification(
        'user-1',
        NotificationEventType.REVIEW_ASSIGNED,
        {
          title: 'Test',
          message: 'Test message',
          entityType: 'application',
          entityId: 'app-1'
        }
      );

      expect(result).not.toBeNull();
      expect(result).toEqual(mockNotification);
      expect(preferenceService.shouldSendNotification).toHaveBeenCalledWith(
        'user-1',
        NotificationTypeEnum.REVIEW_ASSIGNED,
        NotificationChannel.IN_APP
      );
      expect(prisma.notification.create).toHaveBeenCalled();
    });

    it('should skip notification when preference is disabled', async () => {
      vi.mocked(preferenceService.shouldSendNotification).mockResolvedValue(false);

      const result = await createNotification(
        'user-1',
        NotificationEventType.REVIEW_ASSIGNED,
        {
          title: 'Test',
          message: 'Test message',
          entityType: 'application',
          entityId: 'app-1'
        }
      );

      expect(result).toBeNull();
      expect(preferenceService.shouldSendNotification).toHaveBeenCalledWith(
        'user-1',
        NotificationTypeEnum.REVIEW_ASSIGNED,
        NotificationChannel.IN_APP
      );
      expect(prisma.notification.create).not.toHaveBeenCalled();
    });

    it('should check preferences for all notification types', async () => {
      vi.mocked(preferenceService.shouldSendNotification).mockResolvedValue(true);
      vi.mocked(prisma.notification.create).mockResolvedValue({
        id: 'notif-1',
        userId: 'user-1',
        eventType: NotificationEventType.DECISION_MADE,
        payload: {},
        readAt: null,
        createdAt: new Date()
      });

      await createNotification(
        'user-1',
        NotificationEventType.DECISION_MADE,
        {
          title: 'Test',
          message: 'Test message',
          entityType: 'application',
          entityId: 'app-1'
        }
      );

      expect(preferenceService.shouldSendNotification).toHaveBeenCalledWith(
        'user-1',
        NotificationTypeEnum.DECISION_MADE,
        NotificationChannel.IN_APP
      );
    });
  });

  describe('broadcastNotificationToUser', () => {
    it('should broadcast when preference is enabled', async () => {
      vi.mocked(preferenceService.shouldSendNotification).mockResolvedValue(true);
      vi.mocked(prisma.notification.count).mockResolvedValue(5);

      const mockNotification = {
        id: 'notif-1',
        userId: 'user-1',
        eventType: NotificationEventType.REVIEW_ASSIGNED,
        payload: {},
        readAt: null,
        createdAt: new Date()
      };

      await broadcastNotificationToUser('user-1', mockNotification);

      expect(preferenceService.shouldSendNotification).toHaveBeenCalledWith(
        'user-1',
        NotificationTypeEnum.REVIEW_ASSIGNED,
        NotificationChannel.IN_APP
      );
    });

    it('should skip broadcast when preference is disabled', async () => {
      vi.mocked(preferenceService.shouldSendNotification).mockResolvedValue(false);

      const mockNotification = {
        id: 'notif-1',
        userId: 'user-1',
        eventType: NotificationEventType.REVIEW_ASSIGNED,
        payload: {},
        readAt: null,
        createdAt: new Date()
      };

      await broadcastNotificationToUser('user-1', mockNotification);

      expect(preferenceService.shouldSendNotification).toHaveBeenCalledWith(
        'user-1',
        NotificationTypeEnum.REVIEW_ASSIGNED,
        NotificationChannel.IN_APP
      );
      // Should not throw error, just skip silently
    });

    it('should not throw error when broadcast fails', async () => {
      vi.mocked(preferenceService.shouldSendNotification).mockRejectedValue(new Error('Service unavailable'));

      const mockNotification = {
        id: 'notif-1',
        userId: 'user-1',
        eventType: NotificationEventType.REVIEW_ASSIGNED,
        payload: {},
        readAt: null,
        createdAt: new Date()
      };

      // Should not throw
      await expect(broadcastNotificationToUser('user-1', mockNotification)).resolves.not.toThrow();
    });
  });

  describe('createAndBroadcastNotification', () => {
    it('should create and broadcast when preference is enabled', async () => {
      vi.mocked(preferenceService.shouldSendNotification).mockResolvedValue(true);
      
      const mockNotification = {
        id: 'notif-1',
        userId: 'user-1',
        eventType: NotificationEventType.REVIEW_ASSIGNED,
        payload: {
          title: 'Test',
          message: 'Test message',
          entityType: 'application' as const,
          entityId: 'app-1'
        },
        readAt: null,
        createdAt: new Date()
      };
      
      vi.mocked(prisma.notification.create).mockResolvedValue(mockNotification);
      vi.mocked(prisma.notification.count).mockResolvedValue(1);

      const result = await createAndBroadcastNotification(
        'user-1',
        NotificationEventType.REVIEW_ASSIGNED,
        {
          title: 'Test',
          message: 'Test message',
          entityType: 'application',
          entityId: 'app-1'
        }
      );

      expect(result).not.toBeNull();
      expect(result).toEqual(mockNotification);
      expect(prisma.notification.create).toHaveBeenCalled();
    });

    it('should return null when preference is disabled', async () => {
      vi.mocked(preferenceService.shouldSendNotification).mockResolvedValue(false);

      const result = await createAndBroadcastNotification(
        'user-1',
        NotificationEventType.REVIEW_ASSIGNED,
        {
          title: 'Test',
          message: 'Test message',
          entityType: 'application',
          entityId: 'app-1'
        }
      );

      expect(result).toBeNull();
      expect(prisma.notification.create).not.toHaveBeenCalled();
    });
  });

  describe('Event Type Mapping', () => {
    it('should map all event types correctly', async () => {
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

      vi.mocked(preferenceService.shouldSendNotification).mockResolvedValue(false);

      for (const eventType of eventTypes) {
        await createNotification('user-1', eventType, {
          title: 'Test',
          message: 'Test',
          entityType: 'application',
          entityId: 'app-1'
        });
      }

      // Should have been called for each event type
      expect(preferenceService.shouldSendNotification).toHaveBeenCalledTimes(eventTypes.length);
    });
  });
});
