/**
 * NotificationPanel Component Tests
 * 
 * Tests for notification panel display, grouping, and actions.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NotificationPanel } from '../NotificationPanel';
import * as NotificationContext from '../../contexts/NotificationContext';
import type { Notification } from '../../types/notification';

// Mock the NotificationContext
vi.mock('../../contexts/NotificationContext');

describe('NotificationPanel', () => {
  const mockNotification: Notification = {
    id: 'notif-1',
    userId: 'user-1',
    eventType: 'review_assigned',
    payload: {
      title: 'New Review',
      message: 'You have been assigned a review',
      entityType: 'review',
      entityId: 'review-1'
    },
    readAt: null,
    createdAt: new Date().toISOString()
  };

  const mockUseNotifications = {
    notifications: [],
    unreadCount: 0,
    isLoading: false,
    loadNotifications: vi.fn(),
    markAsRead: vi.fn(),
    markAllAsRead: vi.fn()
  };

  const mockOnClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(NotificationContext.useNotifications).mockReturnValue(mockUseNotifications);
  });

  describe('Visibility', () => {
    it('should not render when isOpen is false', () => {
      render(<NotificationPanel isOpen={false} onClose={mockOnClose} />);

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('should render when isOpen is true', () => {
      render(<NotificationPanel isOpen={true} onClose={mockOnClose} />);

      expect(screen.getByRole('dialog', { name: /Notifications/i })).toBeInTheDocument();
    });
  });

  describe('Empty state', () => {
    it('should display empty state when no notifications', () => {
      render(<NotificationPanel isOpen={true} onClose={mockOnClose} />);

      expect(screen.getByText(/No notifications yet/i)).toBeInTheDocument();
      expect(screen.getByText(/You'll see updates here when they arrive/i)).toBeInTheDocument();
    });

    it('should not display empty state when notifications exist', () => {
      vi.mocked(NotificationContext.useNotifications).mockReturnValue({
        ...mockUseNotifications,
        notifications: [mockNotification]
      });

      render(<NotificationPanel isOpen={true} onClose={mockOnClose} />);

      expect(screen.queryByText(/No notifications yet/i)).not.toBeInTheDocument();
    });
  });

  describe('Loading state', () => {
    it('should display loading spinner when isLoading is true', () => {
      vi.mocked(NotificationContext.useNotifications).mockReturnValue({
        ...mockUseNotifications,
        isLoading: true
      });

      render(<NotificationPanel isOpen={true} onClose={mockOnClose} />);

      expect(screen.getByRole('status', { name: /Loading notifications/i })).toBeInTheDocument();
    });

    it('should not display content when loading', () => {
      vi.mocked(NotificationContext.useNotifications).mockReturnValue({
        ...mockUseNotifications,
        isLoading: true,
        notifications: [mockNotification]
      });

      render(<NotificationPanel isOpen={true} onClose={mockOnClose} />);

      expect(screen.queryByText(mockNotification.payload.title)).not.toBeInTheDocument();
    });
  });

  describe('Notification list', () => {
    it('should display notifications', () => {
      vi.mocked(NotificationContext.useNotifications).mockReturnValue({
        ...mockUseNotifications,
        notifications: [mockNotification]
      });

      render(<NotificationPanel isOpen={true} onClose={mockOnClose} />);

      expect(screen.getByText(mockNotification.payload.title)).toBeInTheDocument();
      expect(screen.getByText(mockNotification.payload.message)).toBeInTheDocument();
    });

    it('should group notifications by date', () => {
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      const notifications: Notification[] = [
        { ...mockNotification, id: 'notif-1', payload: { ...mockNotification.payload, title: 'Today notification' }, createdAt: today.toISOString() },
        { ...mockNotification, id: 'notif-2', payload: { ...mockNotification.payload, title: 'Yesterday notification' }, createdAt: yesterday.toISOString() }
      ];

      vi.mocked(NotificationContext.useNotifications).mockReturnValue({
        ...mockUseNotifications,
        notifications
      });

      render(<NotificationPanel isOpen={true} onClose={mockOnClose} />);

      // Check for group headings (they're in h4 tags with uppercase class)
      const todayHeading = screen.getAllByText('Today').find(el => el.tagName === 'H4');
      const yesterdayHeading = screen.getAllByText('Yesterday').find(el => el.tagName === 'H4');
      
      expect(todayHeading).toBeInTheDocument();
      expect(yesterdayHeading).toBeInTheDocument();
      
      // Check both notifications are rendered
      expect(screen.getByText('Today notification')).toBeInTheDocument();
      expect(screen.getByText('Yesterday notification')).toBeInTheDocument();
    });

    it('should not display empty groups', () => {
      const today = new Date();
      
      vi.mocked(NotificationContext.useNotifications).mockReturnValue({
        ...mockUseNotifications,
        notifications: [
          { ...mockNotification, createdAt: today.toISOString() }
        ]
      });

      render(<NotificationPanel isOpen={true} onClose={mockOnClose} />);

      expect(screen.getByText('Today')).toBeInTheDocument();
      expect(screen.queryByText('Yesterday')).not.toBeInTheDocument();
      expect(screen.queryByText('This Week')).not.toBeInTheDocument();
      expect(screen.queryByText('Older')).not.toBeInTheDocument();
    });
  });

  describe('Unread count', () => {
    it('should display unread count in header', () => {
      vi.mocked(NotificationContext.useNotifications).mockReturnValue({
        ...mockUseNotifications,
        notifications: [mockNotification],
        unreadCount: 5
      });

      render(<NotificationPanel isOpen={true} onClose={mockOnClose} />);

      expect(screen.getByText(/5 unread/i)).toBeInTheDocument();
    });

    it('should not display unread count when 0', () => {
      vi.mocked(NotificationContext.useNotifications).mockReturnValue({
        ...mockUseNotifications,
        notifications: [mockNotification],
        unreadCount: 0
      });

      render(<NotificationPanel isOpen={true} onClose={mockOnClose} />);

      expect(screen.queryByText(/unread/i)).not.toBeInTheDocument();
    });
  });

  describe('Mark all as read', () => {
    it('should display "Mark all as read" button when unread > 0', () => {
      vi.mocked(NotificationContext.useNotifications).mockReturnValue({
        ...mockUseNotifications,
        notifications: [mockNotification],
        unreadCount: 3
      });

      render(<NotificationPanel isOpen={true} onClose={mockOnClose} />);

      expect(screen.getByRole('button', { name: /Mark all.*as read/i })).toBeInTheDocument();
    });

    it('should not display "Mark all as read" button when unread is 0', () => {
      vi.mocked(NotificationContext.useNotifications).mockReturnValue({
        ...mockUseNotifications,
        notifications: [mockNotification],
        unreadCount: 0
      });

      render(<NotificationPanel isOpen={true} onClose={mockOnClose} />);

      expect(screen.queryByRole('button', { name: /Mark all.*as read/i })).not.toBeInTheDocument();
    });

    it('should call markAllAsRead when button clicked', async () => {
      const user = userEvent.setup();
      const markAllAsRead = vi.fn();

      vi.mocked(NotificationContext.useNotifications).mockReturnValue({
        ...mockUseNotifications,
        notifications: [mockNotification],
        unreadCount: 3,
        markAllAsRead
      });

      render(<NotificationPanel isOpen={true} onClose={mockOnClose} />);

      const button = screen.getByRole('button', { name: /Mark all.*as read/i });
      await user.click(button);

      await waitFor(() => {
        expect(markAllAsRead).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('Backdrop interactions', () => {
    it('should call onClose when backdrop clicked', async () => {
      const user = userEvent.setup();
      render(<NotificationPanel isOpen={true} onClose={mockOnClose} />);

      const backdrop = document.querySelector('.fixed.inset-0') as HTMLElement;
      expect(backdrop).toBeInTheDocument();

      await user.click(backdrop);

      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA attributes', () => {
      render(<NotificationPanel isOpen={true} onClose={mockOnClose} />);

      const dialog = screen.getByRole('dialog', { name: /Notifications/i });
      expect(dialog).toHaveAttribute('aria-modal', 'true');
    });

    it('should have descriptive aria-label for mark all button', () => {
      vi.mocked(NotificationContext.useNotifications).mockReturnValue({
        ...mockUseNotifications,
        notifications: [mockNotification],
        unreadCount: 5
      });

      render(<NotificationPanel isOpen={true} onClose={mockOnClose} />);

      const button = screen.getByRole('button', { name: /Mark all 5 notifications as read/i });
      expect(button).toBeInTheDocument();
    });
  });
});
