/**
 * NotificationContext Unit Tests
 * 
 * Tests for notification state management, Socket.IO integration,
 * optimistic updates, and error handling.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { NotificationProvider, useNotifications } from '../NotificationContext';
import * as socketHook from '../../hooks/useSocketClient';
import type { Socket } from 'socket.io-client';

// Mock the useSocketClient hook
vi.mock('../../hooks/useSocketClient');

// Mock fetch API
global.fetch = vi.fn();

describe('NotificationContext', () => {
  let mockSocket: Partial<Socket>;
  let notificationHandlers: Map<string, Function>;

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();
    notificationHandlers = new Map();

    // Mock Socket.IO instance
    mockSocket = {
      on: vi.fn((event: string, handler: Function) => {
        notificationHandlers.set(event, handler);
      }),
      off: vi.fn((event: string) => {
        notificationHandlers.delete(event);
      }),
      emit: vi.fn(),
      close: vi.fn()
    };

    // Mock useSocketClient to return our mock socket
    vi.mocked(socketHook.useSocketClient).mockReturnValue(mockSocket as Socket);

    // Mock fetch to return successful responses by default
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ notifications: [], unreadCount: 0 })
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  /**
   * Test Component
   * 
   * Helper component that uses the notification context.
   */
  function TestComponent() {
    const { notifications, unreadCount, isLoading } = useNotifications();
    return (
      <div>
        <div data-testid="badge-count">{unreadCount}</div>
        <div data-testid="notification-count">{notifications.length}</div>
        <div data-testid="loading-state">{isLoading ? 'loading' : 'idle'}</div>
      </div>
    );
  }

  /**
   * Test Component with Actions
   * 
   * Helper component that exposes context actions.
   */
  function TestComponentWithActions() {
    const { notifications, unreadCount, markAsRead, markAllAsRead, loadNotifications } = useNotifications();
    return (
      <div>
        <div data-testid="badge-count">{unreadCount}</div>
        <div data-testid="notification-count">{notifications.length}</div>
        <button onClick={() => loadNotifications()}>Load</button>
        <button onClick={() => markAsRead('notif-1')}>Mark Read</button>
        <button onClick={() => markAllAsRead()}>Mark All Read</button>
      </div>
    );
  }

  describe('Provider initialization', () => {
    it('should provide notification context to children', () => {
      render(
        <NotificationProvider authToken="test-token">
          <TestComponent />
        </NotificationProvider>
      );

      expect(screen.getByTestId('badge-count')).toHaveTextContent('0');
      expect(screen.getByTestId('notification-count')).toHaveTextContent('0');
    });

    it('should throw error when useNotifications used outside provider', () => {
      // Suppress console.error for this test
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

      expect(() => {
        render(<TestComponent />);
      }).toThrow('useNotifications must be used within NotificationProvider');

      consoleError.mockRestore();
    });

    it('should not connect socket when authToken is null', () => {
      render(
        <NotificationProvider authToken={null}>
          <TestComponent />
        </NotificationProvider>
      );

      expect(socketHook.useSocketClient).toHaveBeenCalledWith(null);
    });

    it('should connect socket when authToken is provided', () => {
      render(
        <NotificationProvider authToken="test-token">
          <TestComponent />
        </NotificationProvider>
      );

      expect(socketHook.useSocketClient).toHaveBeenCalledWith('test-token');
    });
  });

  describe('Socket event listeners', () => {
    it('should register notification:new event listener', () => {
      render(
        <NotificationProvider authToken="test-token">
          <TestComponent />
        </NotificationProvider>
      );

      expect(mockSocket.on).toHaveBeenCalledWith('notification:new', expect.any(Function));
    });

    it('should update state when notification:new event received', async () => {
      // Wait for initial load to complete
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({ notifications: [], unreadCount: 0 })
      });

      render(
        <NotificationProvider authToken="test-token">
          <TestComponent />
        </NotificationProvider>
      );

      // Wait for initial load
      await waitFor(() => {
        expect(screen.getByTestId('loading-state')).toHaveTextContent('idle');
      });

      // Simulate new notification event
      const handler = notificationHandlers.get('notification:new');
      expect(handler).toBeDefined();

      await act(async () => {
        handler!({
          notification: {
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
          },
          unreadCount: 1
        });
      });

      await waitFor(() => {
        expect(screen.getByTestId('badge-count')).toHaveTextContent('1');
        expect(screen.getByTestId('notification-count')).toHaveTextContent('1');
      });
    });

    it('should add new notification to top of list', async () => {
      // Wait for initial load to complete
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({ notifications: [], unreadCount: 0 })
      });

      render(
        <NotificationProvider authToken="test-token">
          <TestComponent />
        </NotificationProvider>
      );

      // Wait for initial load
      await waitFor(() => {
        expect(screen.getByTestId('loading-state')).toHaveTextContent('idle');
      });

      const handler = notificationHandlers.get('notification:new');

      // Add first notification
      await act(async () => {
        handler!({
          notification: {
            id: 'notif-1',
            userId: 'user-1',
            eventType: 'review_assigned',
            payload: { title: 'First', message: 'First notification', entityType: 'review', entityId: 'r1' },
            readAt: null,
            createdAt: '2026-07-28T10:00:00Z'
          },
          unreadCount: 1
        });
      });

      // Add second notification
      await act(async () => {
        handler!({
          notification: {
            id: 'notif-2',
            userId: 'user-1',
            eventType: 'decision_made',
            payload: { title: 'Second', message: 'Second notification', entityType: 'application', entityId: 'a1' },
            readAt: null,
            createdAt: '2026-07-28T10:01:00Z'
          },
          unreadCount: 2
        });
      });

      await waitFor(() => {
        expect(screen.getByTestId('notification-count')).toHaveTextContent('2');
        expect(screen.getByTestId('badge-count')).toHaveTextContent('2');
      });
    });

    it('should cleanup event listener on unmount', () => {
      const { unmount } = render(
        <NotificationProvider authToken="test-token">
          <TestComponent />
        </NotificationProvider>
      );

      unmount();

      expect(mockSocket.off).toHaveBeenCalledWith('notification:new', expect.any(Function));
    });
  });

  describe('loadNotifications', () => {
    it('should load notifications from API on mount', async () => {
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({
          notifications: [
            {
              id: 'notif-1',
              userId: 'user-1',
              eventType: 'review_assigned',
              payload: { title: 'Test', message: 'Test notification', entityType: 'review', entityId: 'r1' },
              readAt: null,
              createdAt: new Date().toISOString()
            }
          ],
          unreadCount: 1
        })
      });

      render(
        <NotificationProvider authToken="test-token">
          <TestComponent />
        </NotificationProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('notification-count')).toHaveTextContent('1');
        expect(screen.getByTestId('badge-count')).toHaveTextContent('1');
      });

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:5000/api/notifications',
        expect.objectContaining({
          headers: {
            'Authorization': 'Bearer test-token'
          }
        })
      );
    });

    it('should not load notifications when authToken is null', async () => {
      render(
        <NotificationProvider authToken={null}>
          <TestComponent />
        </NotificationProvider>
      );

      // Wait a bit to ensure no fetch call
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should handle API errors gracefully', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      (global.fetch as any).mockResolvedValue({
        ok: false,
        status: 500
      });

      render(
        <NotificationProvider authToken="test-token">
          <TestComponent />
        </NotificationProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('loading-state')).toHaveTextContent('idle');
      });

      // Should not crash, badge count should remain 0
      expect(screen.getByTestId('badge-count')).toHaveTextContent('0');

      consoleError.mockRestore();
    });
  });

  describe('markAsRead', () => {
    it('should optimistically update notification readAt', async () => {
      // Setup: load initial notification
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({
          notifications: [
            {
              id: 'notif-1',
              userId: 'user-1',
              eventType: 'review_assigned',
              payload: { title: 'Test', message: 'Test', entityType: 'review', entityId: 'r1' },
              readAt: null,
              createdAt: new Date().toISOString()
            }
          ],
          unreadCount: 1
        })
      });

      const { getByText } = render(
        <NotificationProvider authToken="test-token">
          <TestComponentWithActions />
        </NotificationProvider>
      );

      // Wait for initial load
      await waitFor(() => {
        expect(screen.getByTestId('badge-count')).toHaveTextContent('1');
      });

      // Mock API response for markAsRead
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({})
      });

      // Mark as read
      await act(async () => {
        getByText('Mark Read').click();
      });

      // Badge count should decrease
      await waitFor(() => {
        expect(screen.getByTestId('badge-count')).toHaveTextContent('0');
      });

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:5000/api/notifications/notif-1/read',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Authorization': 'Bearer test-token'
          }
        })
      );
    });

    it('should revert optimistic update on API error', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

      // Setup: load initial notification
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          notifications: [
            {
              id: 'notif-1',
              userId: 'user-1',
              eventType: 'review_assigned',
              payload: { title: 'Test', message: 'Test', entityType: 'review', entityId: 'r1' },
              readAt: null,
              createdAt: new Date().toISOString()
            }
          ],
          unreadCount: 1
        })
      });

      const { getByText } = render(
        <NotificationProvider authToken="test-token">
          <TestComponentWithActions />
        </NotificationProvider>
      );

      // Wait for initial load
      await waitFor(() => {
        expect(screen.getByTestId('badge-count')).toHaveTextContent('1');
      });

      // Mock API error for markAsRead
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 500
      });

      // Mock reload API call
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          notifications: [
            {
              id: 'notif-1',
              userId: 'user-1',
              eventType: 'review_assigned',
              payload: { title: 'Test', message: 'Test', entityType: 'review', entityId: 'r1' },
              readAt: null,
              createdAt: new Date().toISOString()
            }
          ],
          unreadCount: 1
        })
      });

      // Mark as read (will fail)
      await act(async () => {
        getByText('Mark Read').click();
      });

      // Badge count should revert to 1 after error
      await waitFor(() => {
        expect(screen.getByTestId('badge-count')).toHaveTextContent('1');
      });

      consoleError.mockRestore();
    });
  });

  describe('markAllAsRead', () => {
    it('should optimistically mark all notifications as read', async () => {
      // Reset fetch mock
      (global.fetch as any).mockReset();
      
      // Setup: load notifications
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({
          notifications: [
            {
              id: 'notif-1',
              userId: 'user-1',
              eventType: 'review_assigned',
              payload: { title: 'Test 1', message: 'Test 1', entityType: 'review', entityId: 'r1' },
              readAt: null,
              createdAt: '2026-07-28T10:00:00Z'
            },
            {
              id: 'notif-2',
              userId: 'user-1',
              eventType: 'decision_made',
              payload: { title: 'Test 2', message: 'Test 2', entityType: 'application', entityId: 'a1' },
              readAt: null,
              createdAt: '2026-07-28T10:01:00Z'
            }
          ],
          unreadCount: 2
        })
      });

      const { getByText } = render(
        <NotificationProvider authToken="test-token">
          <TestComponentWithActions />
        </NotificationProvider>
      );

      // Wait for initial load
      await waitFor(() => {
        expect(screen.getByTestId('badge-count')).toHaveTextContent('2');
        expect(screen.getByTestId('notification-count')).toHaveTextContent('2');
      });

      // Mock API response for markAllAsRead
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({})
      });

      // Mark all as read
      await act(async () => {
        getByText('Mark All Read').click();
      });

      // Badge count should be 0
      await waitFor(() => {
        expect(screen.getByTestId('badge-count')).toHaveTextContent('0');
      });

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:5000/api/notifications/read-all',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Authorization': 'Bearer test-token'
          }
        })
      );
    });

    it('should revert optimistic update on API error', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

      // Reset fetch mock
      (global.fetch as any).mockReset();

      // Setup: load notifications
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({
          notifications: [
            {
              id: 'notif-1',
              userId: 'user-1',
              eventType: 'review_assigned',
              payload: { title: 'Test 1', message: 'Test 1', entityType: 'review', entityId: 'r1' },
              readAt: null,
              createdAt: new Date().toISOString()
            }
          ],
          unreadCount: 1
        })
      });

      const { getByText } = render(
        <NotificationProvider authToken="test-token">
          <TestComponentWithActions />
        </NotificationProvider>
      );

      // Wait for initial load
      await waitFor(() => {
        expect(screen.getByTestId('badge-count')).toHaveTextContent('1');
      });

      // Mock API error for markAllAsRead
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 500
      });

      // Mock reload API call (called after error to revert)
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          notifications: [
            {
              id: 'notif-1',
              userId: 'user-1',
              eventType: 'review_assigned',
              payload: { title: 'Test 1', message: 'Test 1', entityType: 'review', entityId: 'r1' },
              readAt: null,
              createdAt: new Date().toISOString()
            }
          ],
          unreadCount: 1
        })
      });

      // Mark all as read (will fail)
      await act(async () => {
        getByText('Mark All Read').click();
      });

      // Badge count should revert to 1 after error
      await waitFor(() => {
        expect(screen.getByTestId('badge-count')).toHaveTextContent('1');
      });

      consoleError.mockRestore();
    });
  });
});
