import React, { createContext, useContext, ReactNode, useState, useEffect } from 'react';
import { Notification } from '../types/notification';
import { useSocketClient } from '../hooks/useSocketClient';
import { shouldShowToast, getToastType } from '../types/toast';
import { useToast } from './ToastContext';

/**
 * Notification Context Value
 * 
 * Provides notification state and actions throughout the app.
 */
interface NotificationContextValue {
  /** Array of all loaded notifications */
  notifications: Notification[];

  /** Count of unread notifications */
  unreadCount: number;

  /** Loading state for API calls */
  isLoading: boolean;

  /** Load notifications from server */
  loadNotifications: () => Promise<void>;

  /** Mark single notification as read */
  markAsRead: (notificationId: string) => Promise<void>;

  /** Mark all notifications as read */
  markAllAsRead: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextValue | undefined>(undefined);

/**
 * useNotifications Hook
 * 
 * Access notification context from any component.
 * Must be used within NotificationProvider.
 */
export function useNotifications(): NotificationContextValue {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within NotificationProvider');
  }
  return context;
}

/**
 * NotificationProvider Props
 */
interface NotificationProviderProps {
  children: ReactNode;
  authToken: string | null;
}

/**
 * NotificationProvider
 * 
 * Provides notification state and real-time updates via Socket.IO.
 * Manages notification list, badge count, and actions.
 * 
 * @param children - React children to wrap
 * @param authToken - JWT authentication token
 */
export function NotificationProvider({ children, authToken }: NotificationProviderProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  
  const socket = useSocketClient(authToken);
  const { addToast } = useToast();

  // Listen for new notifications from Socket.IO
  useEffect(() => {
    if (!socket) return;

    const handleNewNotification = (payload: { notification: Notification; unreadCount: number }) => {
      console.log('[notifications] New notification received', payload);
      
      const { notification } = payload;
      
      // Add new notification to top of list
      setNotifications(prev => [notification, ...prev]);
      
      // Update badge count from server
      setUnreadCount(payload.unreadCount);
      
      // Show toast for important events
      if (shouldShowToast(notification.eventType)) {
        const toastType = getToastType(notification.eventType);
        
        addToast({
          title: notification.payload.title,
          message: notification.payload.message,
          type: toastType,
          actionUrl: notification.payload.actionUrl
        });
      }
    };

    socket.on('notification:new', handleNewNotification);

    return () => {
      socket.off('notification:new', handleNewNotification);
    };
  }, [socket, addToast]);

  /**
   * Load initial notifications from server
   * 
   * Fetches paginated notification list and unread count.
   */
  const loadNotifications = async () => {
    if (!authToken) {
      console.warn('[notifications] Cannot load without auth token');
      return;
    }
    
    setIsLoading(true);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
      const response = await fetch(`${apiUrl}/api/notifications`, {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });
      
      if (!response.ok) {
        throw new Error(`Failed to load notifications: ${response.status}`);
      }
      
      const data = await response.json();
      setNotifications(data.notifications || []);
      setUnreadCount(data.unreadCount || 0);
      
      console.log('[notifications] Loaded', data.notifications?.length, 'notifications');
    } catch (error) {
      console.error('[notifications] Failed to load', error);
      // Don't throw - show error toast instead in UI layer
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Mark single notification as read
   * 
   * Uses optimistic update for immediate UI feedback.
   * Reverts on API error.
   * 
   * @param notificationId - UUID of notification to mark as read
   */
  const markAsRead = async (notificationId: string) => {
    if (!authToken) {
      console.warn('[notifications] Cannot mark as read without auth token');
      return;
    }
    
    // Optimistic update - update UI immediately
    const previousNotifications = [...notifications];
    const previousUnreadCount = unreadCount;
    
    setNotifications(prev =>
      prev.map(n => n.id === notificationId ? { ...n, readAt: new Date().toISOString() } : n)
    );
    setUnreadCount(prev => Math.max(0, prev - 1));
    
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
      const response = await fetch(`${apiUrl}/api/notifications/${notificationId}/read`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });
      
      if (!response.ok) {
        throw new Error(`Failed to mark as read: ${response.status}`);
      }
      
      console.log('[notifications] Marked as read', notificationId);
    } catch (error) {
      console.error('[notifications] Failed to mark as read', error);
      
      // Revert optimistic update on error
      setNotifications(previousNotifications);
      setUnreadCount(previousUnreadCount);
      
      // Optionally show error toast in UI layer
    }
  };

  /**
   * Mark all notifications as read
   * 
   * Uses optimistic update for immediate UI feedback.
   * Reverts on API error.
   */
  const markAllAsRead = async () => {
    if (!authToken) {
      console.warn('[notifications] Cannot mark all as read without auth token');
      return;
    }
    
    // Optimistic update - update UI immediately
    const previousNotifications = [...notifications];
    const previousUnreadCount = unreadCount;
    
    const now = new Date().toISOString();
    setNotifications(prev => prev.map(n => ({ ...n, readAt: n.readAt || now })));
    setUnreadCount(0);
    
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
      const response = await fetch(`${apiUrl}/api/notifications/read-all`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });
      
      if (!response.ok) {
        throw new Error(`Failed to mark all as read: ${response.status}`);
      }
      
      console.log('[notifications] Marked all as read');
    } catch (error) {
      console.error('[notifications] Failed to mark all as read', error);
      
      // Revert optimistic update on error
      setNotifications(previousNotifications);
      setUnreadCount(previousUnreadCount);
      
      // Optionally show error toast in UI layer
    }
  };

  // Load notifications on mount when auth token available
  useEffect(() => {
    if (authToken) {
      loadNotifications();
    }
  }, [authToken]);

  const value: NotificationContextValue = {
    notifications,
    unreadCount,
    isLoading,
    loadNotifications,
    markAsRead,
    markAllAsRead
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}
