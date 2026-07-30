import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as preferenceService from '../notificationPreferenceService';
import { prisma } from '../../db/prisma';
import { NotificationTypeEnum, NotificationChannel } from '@prisma/client';

vi.mock('../../db/prisma', () => ({
  prisma: {
    notificationPreference: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      upsert: vi.fn(),
      createMany: vi.fn(),
      deleteMany: vi.fn()
    },
    $transaction: vi.fn()
  }
}));

vi.mock('../../utils/notificationPreferences', () => ({
  isSystemCritical: vi.fn(() => false)
}));

vi.mock('../../utils/logger', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

describe('notificationPreferenceService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getUserPreferences', () => {
    it('should return all preferences for user', async () => {
      const mockPreferences = [
        {
          id: 'pref-1',
          userId: 'user-1',
          notificationType: NotificationTypeEnum.REVIEW_ASSIGNED,
          channel: NotificationChannel.EMAIL,
          enabled: true,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ];

      vi.mocked(prisma.notificationPreference.findMany).mockResolvedValue(mockPreferences);

      const result = await preferenceService.getUserPreferences('user-1');

      expect(result).toEqual(mockPreferences);
      expect(prisma.notificationPreference.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        orderBy: [
          { notificationType: 'asc' },
          { channel: 'asc' }
        ]
      });
    });
  });

  describe('getPreference', () => {
    it('should return specific preference', async () => {
      const mockPreference = {
        id: 'pref-1',
        userId: 'user-1',
        notificationType: NotificationTypeEnum.REVIEW_ASSIGNED,
        channel: NotificationChannel.EMAIL,
        enabled: true,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      vi.mocked(prisma.notificationPreference.findUnique).mockResolvedValue(mockPreference);

      const result = await preferenceService.getPreference(
        'user-1',
        NotificationTypeEnum.REVIEW_ASSIGNED,
        NotificationChannel.EMAIL
      );

      expect(result).toEqual(mockPreference);
      expect(prisma.notificationPreference.findUnique).toHaveBeenCalledWith({
        where: {
          user_notification_channel_unique: {
            userId: 'user-1',
            notificationType: NotificationTypeEnum.REVIEW_ASSIGNED,
            channel: NotificationChannel.EMAIL
          }
        }
      });
    });

    it('should return null when preference not found', async () => {
      vi.mocked(prisma.notificationPreference.findUnique).mockResolvedValue(null);

      const result = await preferenceService.getPreference(
        'user-1',
        NotificationTypeEnum.REVIEW_ASSIGNED,
        NotificationChannel.EMAIL
      );

      expect(result).toBeNull();
    });
  });

  describe('updatePreference', () => {
    it('should update preference when not system-critical', async () => {
      const mockPreference = {
        id: 'pref-1',
        userId: 'user-1',
        notificationType: NotificationTypeEnum.REVIEW_ASSIGNED,
        channel: NotificationChannel.EMAIL,
        enabled: false,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      vi.mocked(prisma.notificationPreference.upsert).mockResolvedValue(mockPreference);

      const result = await preferenceService.updatePreference(
        'user-1',
        NotificationTypeEnum.REVIEW_ASSIGNED,
        NotificationChannel.EMAIL,
        false
      );

      expect(result).toEqual(mockPreference);
      expect(prisma.notificationPreference.upsert).toHaveBeenCalledWith({
        where: {
          user_notification_channel_unique: {
            userId: 'user-1',
            notificationType: NotificationTypeEnum.REVIEW_ASSIGNED,
            channel: NotificationChannel.EMAIL
          }
        },
        update: { enabled: false },
        create: {
          userId: 'user-1',
          notificationType: NotificationTypeEnum.REVIEW_ASSIGNED,
          channel: NotificationChannel.EMAIL,
          enabled: false
        }
      });
    });

    it('should throw error when trying to disable system-critical type', async () => {
      const { isSystemCritical } = await import('../../utils/notificationPreferences');
      vi.mocked(isSystemCritical).mockReturnValue(true);

      await expect(
        preferenceService.updatePreference(
          'user-1',
          NotificationTypeEnum.REVIEW_ASSIGNED,
          NotificationChannel.EMAIL,
          false
        )
      ).rejects.toThrow('Cannot disable system-critical notification type');
    });

    it('should allow enabling system-critical type', async () => {
      const { isSystemCritical } = await import('../../utils/notificationPreferences');
      vi.mocked(isSystemCritical).mockReturnValue(true);

      const mockPreference = {
        id: 'pref-1',
        userId: 'user-1',
        notificationType: NotificationTypeEnum.REVIEW_ASSIGNED,
        channel: NotificationChannel.EMAIL,
        enabled: true,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      vi.mocked(prisma.notificationPreference.upsert).mockResolvedValue(mockPreference);

      const result = await preferenceService.updatePreference(
        'user-1',
        NotificationTypeEnum.REVIEW_ASSIGNED,
        NotificationChannel.EMAIL,
        true
      );

      expect(result).toEqual(mockPreference);
    });
  });

  describe('bulkUpdatePreferences', () => {
    it('should update multiple preferences', async () => {
      const updates = [
        {
          notificationType: NotificationTypeEnum.REVIEW_ASSIGNED,
          channel: NotificationChannel.EMAIL,
          enabled: false
        },
        {
          notificationType: NotificationTypeEnum.DECISION_MADE,
          channel: NotificationChannel.IN_APP,
          enabled: true
        }
      ];

      const mockResults = [
        {
          id: 'pref-1',
          userId: 'user-1',
          notificationType: NotificationTypeEnum.REVIEW_ASSIGNED,
          channel: NotificationChannel.EMAIL,
          enabled: false,
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          id: 'pref-2',
          userId: 'user-1',
          notificationType: NotificationTypeEnum.DECISION_MADE,
          channel: NotificationChannel.IN_APP,
          enabled: true,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ];

      vi.mocked(prisma.$transaction).mockResolvedValue(mockResults);

      const result = await preferenceService.bulkUpdatePreferences('user-1', updates);

      expect(result).toBe(2);
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('should filter out system-critical types being disabled', async () => {
      const { isSystemCritical } = await import('../../utils/notificationPreferences');
      vi.mocked(isSystemCritical).mockImplementation(
        (type) => type === NotificationTypeEnum.REVIEW_ASSIGNED
      );

      const updates = [
        {
          notificationType: NotificationTypeEnum.REVIEW_ASSIGNED,
          channel: NotificationChannel.EMAIL,
          enabled: false // Should be filtered out
        },
        {
          notificationType: NotificationTypeEnum.DECISION_MADE,
          channel: NotificationChannel.EMAIL,
          enabled: false // Should be included
        }
      ];

      const mockResults = [
        {
          id: 'pref-2',
          userId: 'user-1',
          notificationType: NotificationTypeEnum.DECISION_MADE,
          channel: NotificationChannel.EMAIL,
          enabled: false,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ];

      vi.mocked(prisma.$transaction).mockResolvedValue(mockResults);

      const result = await preferenceService.bulkUpdatePreferences('user-1', updates);

      expect(result).toBe(1); // Only one update should go through
    });
  });

  describe('initializeDefaultPreferences', () => {
    it('should create all default preferences', async () => {
      vi.mocked(prisma.notificationPreference.createMany).mockResolvedValue({ count: 18 });

      const result = await preferenceService.initializeDefaultPreferences('user-1');

      expect(result).toBe(18); // 9 types × 2 channels
      expect(prisma.notificationPreference.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            userId: 'user-1',
            enabled: true
          })
        ]),
        skipDuplicates: true
      });
    });

    it('should create preferences for all notification types and channels', async () => {
      vi.mocked(prisma.notificationPreference.createMany).mockResolvedValue({ count: 18 });

      await preferenceService.initializeDefaultPreferences('user-1');

      const call = vi.mocked(prisma.notificationPreference.createMany).mock.calls[0][0];
      const data = call.data as any[];

      // Should have 9 notification types × 2 channels = 18 preferences
      expect(data.length).toBe(18);

      // All should be enabled by default
      expect(data.every((pref: any) => pref.enabled === true)).toBe(true);

      // Should have both channels for each type
      const emailCount = data.filter((p: any) => p.channel === NotificationChannel.EMAIL).length;
      const inAppCount = data.filter((p: any) => p.channel === NotificationChannel.IN_APP).length;
      expect(emailCount).toBe(9);
      expect(inAppCount).toBe(9);
    });
  });

  describe('shouldSendNotification', () => {
    it('should return true for system-critical types', async () => {
      const { isSystemCritical } = await import('../../utils/notificationPreferences');
      vi.mocked(isSystemCritical).mockReturnValue(true);

      const result = await preferenceService.shouldSendNotification(
        'user-1',
        NotificationTypeEnum.REVIEW_ASSIGNED,
        NotificationChannel.EMAIL
      );

      expect(result).toBe(true);
      // Should not query database for system-critical types
      expect(prisma.notificationPreference.findUnique).not.toHaveBeenCalled();
    });

    it('should return preference enabled value when preference exists', async () => {
      const { isSystemCritical } = await import('../../utils/notificationPreferences');
      vi.mocked(isSystemCritical).mockReturnValue(false);

      vi.mocked(prisma.notificationPreference.findUnique).mockResolvedValue({
        id: 'pref-1',
        userId: 'user-1',
        notificationType: NotificationTypeEnum.REVIEW_ASSIGNED,
        channel: NotificationChannel.EMAIL,
        enabled: false,
        createdAt: new Date(),
        updatedAt: new Date()
      });

      const result = await preferenceService.shouldSendNotification(
        'user-1',
        NotificationTypeEnum.REVIEW_ASSIGNED,
        NotificationChannel.EMAIL
      );

      expect(result).toBe(false);
    });

    it('should default to true when no preference exists', async () => {
      const { isSystemCritical } = await import('../../utils/notificationPreferences');
      vi.mocked(isSystemCritical).mockReturnValue(false);

      vi.mocked(prisma.notificationPreference.findUnique).mockResolvedValue(null);

      const result = await preferenceService.shouldSendNotification(
        'user-1',
        NotificationTypeEnum.REVIEW_ASSIGNED,
        NotificationChannel.EMAIL
      );

      expect(result).toBe(true);
    });

    it('should return true when preference is enabled', async () => {
      const { isSystemCritical } = await import('../../utils/notificationPreferences');
      vi.mocked(isSystemCritical).mockReturnValue(false);

      vi.mocked(prisma.notificationPreference.findUnique).mockResolvedValue({
        id: 'pref-1',
        userId: 'user-1',
        notificationType: NotificationTypeEnum.REVIEW_ASSIGNED,
        channel: NotificationChannel.EMAIL,
        enabled: true,
        createdAt: new Date(),
        updatedAt: new Date()
      });

      const result = await preferenceService.shouldSendNotification(
        'user-1',
        NotificationTypeEnum.REVIEW_ASSIGNED,
        NotificationChannel.EMAIL
      );

      expect(result).toBe(true);
    });
  });

  describe('getPreferencesGroupedByType', () => {
    it('should group preferences by notification type', async () => {
      const mockPreferences = [
        {
          id: 'pref-1',
          userId: 'user-1',
          notificationType: NotificationTypeEnum.REVIEW_ASSIGNED,
          channel: NotificationChannel.EMAIL,
          enabled: true,
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          id: 'pref-2',
          userId: 'user-1',
          notificationType: NotificationTypeEnum.REVIEW_ASSIGNED,
          channel: NotificationChannel.IN_APP,
          enabled: false,
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          id: 'pref-3',
          userId: 'user-1',
          notificationType: NotificationTypeEnum.DECISION_MADE,
          channel: NotificationChannel.EMAIL,
          enabled: true,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ];

      vi.mocked(prisma.notificationPreference.findMany).mockResolvedValue(mockPreferences);

      const result = await preferenceService.getPreferencesGroupedByType('user-1');

      expect(result.size).toBe(2); // Two notification types
      expect(result.get(NotificationTypeEnum.REVIEW_ASSIGNED)?.size).toBe(2); // Two channels
      expect(result.get(NotificationTypeEnum.REVIEW_ASSIGNED)?.get(NotificationChannel.EMAIL)).toBe(true);
      expect(result.get(NotificationTypeEnum.REVIEW_ASSIGNED)?.get(NotificationChannel.IN_APP)).toBe(false);
      expect(result.get(NotificationTypeEnum.DECISION_MADE)?.get(NotificationChannel.EMAIL)).toBe(true);
    });

    it('should return empty map when user has no preferences', async () => {
      vi.mocked(prisma.notificationPreference.findMany).mockResolvedValue([]);

      const result = await preferenceService.getPreferencesGroupedByType('user-1');

      expect(result.size).toBe(0);
    });
  });
});
