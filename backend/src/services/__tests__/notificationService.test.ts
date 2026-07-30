import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import * as notificationService from '../notificationService';
import { prisma } from '../../db/prisma';
import { NotificationEventType } from '../../types/notification';
import logger from '../../utils/logger';

// Mock dependencies
vi.mock('../../db/prisma', () => ({
  prisma: {
    notification: {
      create: vi.fn(),
      count: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn()
    }
  }
}));

vi.mock('../../utils/logger', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

describe('notificationService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('createNotification', () => {
    it('should create notification with correct data', async () => {
      const mockNotification = {
        id: 'notif-1',
        userId: 'user-1',
        eventType: NotificationEventType.REVIEW_ASSIGNED,
        payload: {
          title: 'New Review Assigned',
          message: 'You have been assigned a new review',
          entityType: 'application',
          entityId: 'app-1'
        },
        readAt: null,
        createdAt: new Date()
      };

      vi.mocked(prisma.notification.create).mockResolvedValue(mockNotification as any);

      const result = await notificationService.createNotification(
        'user-1',
        NotificationEventType.REVIEW_ASSIGNED,
        {
          title: 'New Review Assigned',
          message: 'You have been assigned a new review',
          entityType: 'application',
          entityId: 'app-1'
        }
      );

      expect(result).toEqual(mockNotification);
      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          eventType: NotificationEventType.REVIEW_ASSIGNED,
          payload: expect.any(Object)
        }
      });
      expect(logger.info).toHaveBeenCalledWith(
        { userId: 'user-1', eventType: NotificationEventType.REVIEW_ASSIGNED, notificationId: 'notif-1' },
        '[notificationService] Notification created'
      );
    });

    it('should create notification with actionUrl', async () => {
      const mockNotification = {
        id: 'notif-2',
        userId: 'user-2',
        eventType: NotificationEventType.OFFER_APPROVED,
        payload: {
          title: 'Offer Approved',
          message: 'Your offer has been approved',
          entityType: 'offer',
          entityId: 'offer-1',
          actionUrl: '/offers/offer-1'
        },
        readAt: null,
        createdAt: new Date()
      };

      vi.mocked(prisma.notification.create).mockResolvedValue(mockNotification as any);

      const result = await notificationService.createNotification(
        'user-2',
        NotificationEventType.OFFER_APPROVED,
        {
          title: 'Offer Approved',
          message: 'Your offer has been approved',
          entityType: 'offer',
          entityId: 'offer-1',
          actionUrl: '/offers/offer-1'
        }
      );

      expect(result.payload).toHaveProperty('actionUrl', '/offers/offer-1');
    });

    it('should handle all event types', async () => {
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
        const mockNotification = {
          id: `notif-${eventType}`,
          userId: 'user-1',
          eventType,
          payload: {
            title: 'Test',
            message: 'Test message',
            entityType: 'application',
            entityId: 'app-1'
          },
          readAt: null,
          createdAt: new Date()
        };

        vi.mocked(prisma.notification.create).mockResolvedValue(mockNotification as any);

        await notificationService.createNotification(
          'user-1',
          eventType,
          {
            title: 'Test',
            message: 'Test message',
            entityType: 'application',
            entityId: 'app-1'
          }
        );

        expect(prisma.notification.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              eventType
            })
          })
        );
      }
    });
  });

  describe('getUnreadCount', () => {
    it('should return count of unread notifications', async () => {
      vi.mocked(prisma.notification.count).mockResolvedValue(5);

      const count = await notificationService.getUnreadCount('user-1');

      expect(count).toBe(5);
      expect(prisma.notification.count).toHaveBeenCalledWith({
        where: {
          userId: 'user-1',
          readAt: null
        }
      });
    });

    it('should return 0 when no unread notifications', async () => {
      vi.mocked(prisma.notification.count).mockResolvedValue(0);

      const count = await notificationService.getUnreadCount('user-1');

      expect(count).toBe(0);
    });

    it('should return 0 when all notifications are read', async () => {
      vi.mocked(prisma.notification.count).mockResolvedValue(0);

      const count = await notificationService.getUnreadCount('user-with-read-notifs');

      expect(count).toBe(0);
      expect(prisma.notification.count).toHaveBeenCalledWith({
        where: {
          userId: 'user-with-read-notifs',
          readAt: null
        }
      });
    });
  });

  describe('getNotifications', () => {
    it('should return paginated notifications ordered by newest first', async () => {
      const mockNotifications = [
        {
          id: 'notif-3',
          userId: 'user-1',
          eventType: NotificationEventType.DECISION_MADE,
          payload: { title: 'Decision Made', message: 'A decision has been made', entityType: 'application', entityId: 'app-1' },
          readAt: null,
          createdAt: new Date('2026-07-28T10:00:00Z')
        },
        {
          id: 'notif-2',
          userId: 'user-1',
          eventType: NotificationEventType.REVIEW_ASSIGNED,
          payload: { title: 'Review Assigned', message: 'You have a new review', entityType: 'application', entityId: 'app-2' },
          readAt: new Date('2026-07-28T09:00:00Z'),
          createdAt: new Date('2026-07-28T08:00:00Z')
        },
        {
          id: 'notif-1',
          userId: 'user-1',
          eventType: NotificationEventType.APPLICATION_SUBMITTED,
          payload: { title: 'Application Submitted', message: 'Application received', entityType: 'application', entityId: 'app-3' },
          readAt: new Date('2026-07-28T07:00:00Z'),
          createdAt: new Date('2026-07-28T06:00:00Z')
        }
      ];

      vi.mocked(prisma.notification.findMany).mockResolvedValue(mockNotifications as any);

      const result = await notificationService.getNotifications('user-1');

      expect(result).toEqual(mockNotifications);
      expect(prisma.notification.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        orderBy: { createdAt: 'desc' },
        take: 50,
        skip: 0
      });
    });

    it('should respect limit parameter', async () => {
      vi.mocked(prisma.notification.findMany).mockResolvedValue([]);

      await notificationService.getNotifications('user-1', 10);

      expect(prisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 10
        })
      );
    });

    it('should respect offset parameter for pagination', async () => {
      vi.mocked(prisma.notification.findMany).mockResolvedValue([]);

      await notificationService.getNotifications('user-1', 20, 40);

      expect(prisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 20,
          skip: 40
        })
      );
    });

    it('should use default limit of 50 when not specified', async () => {
      vi.mocked(prisma.notification.findMany).mockResolvedValue([]);

      await notificationService.getNotifications('user-1');

      expect(prisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 50,
          skip: 0
        })
      );
    });

    it('should return empty array when user has no notifications', async () => {
      vi.mocked(prisma.notification.findMany).mockResolvedValue([]);

      const result = await notificationService.getNotifications('user-no-notifs');

      expect(result).toEqual([]);
    });
  });

  describe('markAsRead', () => {
    it('should mark notification as read with correct timestamp', async () => {
      const beforeCall = new Date();
      vi.mocked(prisma.notification.updateMany).mockResolvedValue({ count: 1 });

      await notificationService.markAsRead('notif-1', 'user-1');

      const afterCall = new Date();

      expect(prisma.notification.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'notif-1',
          userId: 'user-1'
        },
        data: {
          readAt: expect.any(Date)
        }
      });

      const callArgs = vi.mocked(prisma.notification.updateMany).mock.calls[0][0];
      const readAt = callArgs.data.readAt as Date;
      expect(readAt.getTime()).toBeGreaterThanOrEqual(beforeCall.getTime());
      expect(readAt.getTime()).toBeLessThanOrEqual(afterCall.getTime());

      expect(logger.info).toHaveBeenCalledWith(
        { notificationId: 'notif-1', userId: 'user-1' },
        '[notificationService] Notification marked as read'
      );
    });

    it('should not log when notification not found', async () => {
      vi.mocked(prisma.notification.updateMany).mockResolvedValue({ count: 0 });

      await notificationService.markAsRead('nonexistent', 'user-1');

      expect(logger.info).not.toHaveBeenCalled();
    });

    it('should enforce user ownership via updateMany', async () => {
      vi.mocked(prisma.notification.updateMany).mockResolvedValue({ count: 0 });

      await notificationService.markAsRead('notif-1', 'wrong-user');

      expect(prisma.notification.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'notif-1',
          userId: 'wrong-user'
        },
        data: {
          readAt: expect.any(Date)
        }
      });
      expect(logger.info).not.toHaveBeenCalled();
    });
  });

  describe('markAllAsRead', () => {
    it('should mark all unread notifications as read', async () => {
      vi.mocked(prisma.notification.updateMany).mockResolvedValue({ count: 8 });

      const count = await notificationService.markAllAsRead('user-1');

      expect(count).toBe(8);
      expect(prisma.notification.updateMany).toHaveBeenCalledWith({
        where: {
          userId: 'user-1',
          readAt: null
        },
        data: {
          readAt: expect.any(Date)
        }
      });
      expect(logger.info).toHaveBeenCalledWith(
        { userId: 'user-1', count: 8 },
        '[notificationService] All notifications marked as read'
      );
    });

    it('should return 0 when no unread notifications', async () => {
      vi.mocked(prisma.notification.updateMany).mockResolvedValue({ count: 0 });

      const count = await notificationService.markAllAsRead('user-no-unread');

      expect(count).toBe(0);
      expect(logger.info).not.toHaveBeenCalled();
    });

    it('should only update notifications for specific user', async () => {
      vi.mocked(prisma.notification.updateMany).mockResolvedValue({ count: 3 });

      await notificationService.markAllAsRead('user-2');

      expect(prisma.notification.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: 'user-2'
          })
        })
      );
    });
  });

  describe('deleteNotification', () => {
    it('should delete notification when user owns it', async () => {
      vi.mocked(prisma.notification.deleteMany).mockResolvedValue({ count: 1 });

      await notificationService.deleteNotification('notif-1', 'user-1');

      expect(prisma.notification.deleteMany).toHaveBeenCalledWith({
        where: {
          id: 'notif-1',
          userId: 'user-1'
        }
      });
      expect(logger.info).toHaveBeenCalledWith(
        { notificationId: 'notif-1', userId: 'user-1' },
        '[notificationService] Notification deleted'
      );
    });

    it('should not log when notification not found', async () => {
      vi.mocked(prisma.notification.deleteMany).mockResolvedValue({ count: 0 });

      await notificationService.deleteNotification('nonexistent', 'user-1');

      expect(logger.info).not.toHaveBeenCalled();
    });

    it('should enforce user ownership via deleteMany', async () => {
      vi.mocked(prisma.notification.deleteMany).mockResolvedValue({ count: 0 });

      await notificationService.deleteNotification('notif-1', 'wrong-user');

      expect(prisma.notification.deleteMany).toHaveBeenCalledWith({
        where: {
          id: 'notif-1',
          userId: 'wrong-user'
        }
      });
      expect(logger.info).not.toHaveBeenCalled();
    });
  });
});
