import React from 'react';
import { Notification } from '../types/notification';
import { getRelativeTimeString } from '../utils/dateUtils';
import { useNotifications } from '../contexts/NotificationContext';

/**
 * NotificationItem Props
 */
interface NotificationItemProps {
  notification: Notification;
  onClick?: () => void;
}

/**
 * NotificationItem Component
 * 
 * Displays a single notification with title, message, and relative timestamp.
 * Marks notification as read when clicked.
 * Navigates to actionUrl if provided.
 */
export function NotificationItem({ notification, onClick }: NotificationItemProps) {
  const { markAsRead } = useNotifications();
  const isUnread = !notification.readAt;

  const handleClick = async () => {
    // Mark as read if unread
    if (isUnread) {
      await markAsRead(notification.id);
    }
    
    // Call optional onClick handler (e.g., to close panel)
    if (onClick) {
      onClick();
    }
    
    // Navigate to entity if actionUrl provided
    if (notification.payload.actionUrl) {
      window.location.href = notification.payload.actionUrl;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick();
    }
  };

  return (
    <div
      onClick={handleClick}
      className={`
        px-4 py-3 border-b border-gray-200 cursor-pointer
        hover:bg-gray-50 transition-colors
        ${isUnread ? 'bg-blue-50 border-l-4 border-l-blue-500' : ''}
      `}
      role="button"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      aria-label={`${notification.payload.title}. ${isUnread ? 'Unread.' : 'Read.'}`}
    >
      <div className="flex justify-between items-start mb-1">
        <h4 className="font-semibold text-sm text-gray-900">
          {notification.payload.title}
        </h4>
        {isUnread && (
          <span 
            className="ml-2 w-2 h-2 bg-blue-500 rounded-full flex-shrink-0" 
            aria-label="Unread"
          />
        )}
      </div>
      
      <p className="text-sm text-gray-600 mb-1 line-clamp-2">
        {notification.payload.message}
      </p>
      
      <span className="text-xs text-gray-500">
        {getRelativeTimeString(notification.createdAt)}
      </span>
    </div>
  );
}
