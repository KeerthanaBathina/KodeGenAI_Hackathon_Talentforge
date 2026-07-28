/**
 * BellIcon Component Tests
 * 
 * Tests for notification bell icon, badge display, and panel toggling.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BellIcon } from '../BellIcon';
import * as NotificationContext from '../../contexts/NotificationContext';

// Mock the NotificationContext
vi.mock('../../contexts/NotificationContext');

describe('BellIcon', () => {
  const mockUseNotifications = {
    notifications: [],
    unreadCount: 0,
    isLoading: false,
    loadNotifications: vi.fn(),
    markAsRead: vi.fn(),
    markAllAsRead: vi.fn()
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(NotificationContext.useNotifications).mockReturnValue(mockUseNotifications);
  });

  describe('Badge display', () => {
    it('should not display badge when unread count is 0', () => {
      render(<BellIcon />);

      const bell = screen.getByRole('button', { name: /Notifications$/i });
      expect(bell).toBeInTheDocument();
      expect(screen.queryByText(/\d+/)).not.toBeInTheDocument();
    });

    it('should display badge with count when unread > 0', () => {
      vi.mocked(NotificationContext.useNotifications).mockReturnValue({
        ...mockUseNotifications,
        unreadCount: 5
      });

      render(<BellIcon />);

      expect(screen.getByText('5')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Notifications \(5 unread\)/i })).toBeInTheDocument();
    });

    it('should display "99+" when count exceeds 99', () => {
      vi.mocked(NotificationContext.useNotifications).mockReturnValue({
        ...mockUseNotifications,
        unreadCount: 150
      });

      render(<BellIcon />);

      expect(screen.getByText('99+')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Notifications \(99\+ unread\)/i })).toBeInTheDocument();
    });

    it('should display exact count between 1 and 99', () => {
      vi.mocked(NotificationContext.useNotifications).mockReturnValue({
        ...mockUseNotifications,
        unreadCount: 42
      });

      render(<BellIcon />);

      expect(screen.getByText('42')).toBeInTheDocument();
    });

    it('should update badge when unread count changes', () => {
      const { rerender } = render(<BellIcon />);

      expect(screen.queryByText(/\d+/)).not.toBeInTheDocument();

      vi.mocked(NotificationContext.useNotifications).mockReturnValue({
        ...mockUseNotifications,
        unreadCount: 3
      });

      rerender(<BellIcon />);

      expect(screen.getByText('3')).toBeInTheDocument();
    });
  });

  describe('Panel toggling', () => {
    it('should not render panel initially', () => {
      render(<BellIcon />);

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('should open panel on bell click', async () => {
      const user = userEvent.setup();
      render(<BellIcon />);

      const bell = screen.getByRole('button', { name: /Notifications/i });
      
      // Panel initially closed
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

      // Click to open
      await user.click(bell);
      
      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });
    });

    it('should close panel on second bell click', async () => {
      const user = userEvent.setup();
      render(<BellIcon />);

      const bell = screen.getByRole('button', { name: /Notifications/i });

      // Open panel
      await user.click(bell);
      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      // Close panel
      await user.click(bell);
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
    });

    it('should close panel on Escape key', async () => {
      const user = userEvent.setup();
      render(<BellIcon />);

      const bell = screen.getByRole('button', { name: /Notifications/i });

      // Open panel
      await user.click(bell);
      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      // Press Escape
      await user.keyboard('{Escape}');

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
    });

    it('should close panel when clicking backdrop', async () => {
      const user = userEvent.setup();
      render(<BellIcon />);

      const bell = screen.getByRole('button', { name: /Notifications/i });

      // Open panel
      await user.click(bell);
      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      // Click backdrop (the transparent overlay)
      const backdrop = document.querySelector('.fixed.inset-0') as HTMLElement;
      expect(backdrop).toBeInTheDocument();
      
      await user.click(backdrop);

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA attributes', () => {
      render(<BellIcon />);

      const bell = screen.getByRole('button', { name: /Notifications/i });
      
      expect(bell).toHaveAttribute('aria-haspopup', 'dialog');
      expect(bell).toHaveAttribute('aria-expanded', 'false');
    });

    it('should update aria-expanded when panel opens', async () => {
      const user = userEvent.setup();
      render(<BellIcon />);

      const bell = screen.getByRole('button', { name: /Notifications/i });
      
      expect(bell).toHaveAttribute('aria-expanded', 'false');

      await user.click(bell);

      await waitFor(() => {
        expect(bell).toHaveAttribute('aria-expanded', 'true');
      });
    });

    it('should have aria-live badge for real-time updates', () => {
      vi.mocked(NotificationContext.useNotifications).mockReturnValue({
        ...mockUseNotifications,
        unreadCount: 5
      });

      render(<BellIcon />);

      const badge = screen.getByText('5');
      expect(badge).toHaveAttribute('aria-live', 'polite');
      expect(badge).toHaveAttribute('aria-atomic', 'true');
    });

    it('should have focus ring on keyboard navigation', () => {
      render(<BellIcon />);

      const bell = screen.getByRole('button', { name: /Notifications/i });
      
      // Check for focus ring classes
      expect(bell.className).toContain('focus:ring');
    });
  });
});
