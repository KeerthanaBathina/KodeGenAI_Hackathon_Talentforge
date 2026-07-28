import React from 'react';
import { useNotifications } from '../contexts/NotificationContext';
import { groupNotificationsByDate } from '../utils/dateUtils';
import { NotificationItem } from './NotificationItem';

/**
 * NotificationPanel Props
 */
interface NotificationPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * NotificationPanel Component
 * 
 * Dropdown panel that displays notification list grouped by date.
 * Includes mark all as read button, empty state, and loading state.
 */
export function NotificationPanel({ isOpen, onClose }: NotificationPanelProps) {
  const { notifications, unreadCount, isLoading, markAllAsRead } = useNotifications();
  const groupedNotifications = groupNotificationsByDate(notifications);

  if (!isOpen) return null;

  const handleMarkAllAsRead = async () => {
    await markAllAsRead();
  };

  return (
    <>
      {/* Backdrop - transparent overlay to catch clicks outside panel */}
      <div
        className="fixed inset-0 bg-transparent z-40"
        onClick={onClose}
        aria-hidden="true"
      />
      
      {/* Panel */}
      <div
        className="absolute right-0 top-full mt-2 w-96 max-w-[calc(100vw-2rem)] max-h-[600px] bg-white rounded-lg shadow-xl border border-gray-200 z-50 flex flex-col"
        role="dialog"
        aria-label="Notifications"
        aria-modal="true"
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-gray-200 flex justify-between items-center flex-shrink-0">
          <h3 className="font-bold text-lg">
            Notifications
            {unreadCount > 0 && (
              <span className="ml-2 text-sm text-gray-600 font-normal">
                ({unreadCount} unread)
              </span>
            )}
          </h3>
          
          {unreadCount > 0 && (
            <button
              onClick={handleMarkAllAsRead}
              className="text-sm text-blue-600 hover:text-blue-800 font-medium transition-colors"
              aria-label={`Mark all ${unreadCount} notifications as read`}
            >
              Mark all as read
            </button>
          )}
        </div>

        {/* Content */}
        <div className="overflow-y-auto flex-1">
          {/* Loading State */}
          {isLoading && (
            <div className="flex justify-center items-center py-8">
              <div 
                className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"
                role="status"
                aria-label="Loading notifications"
              />
            </div>
          )}

          {/* Empty State */}
          {!isLoading && notifications.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-gray-500">
              <svg 
                className="w-16 h-16 mb-2 text-gray-400" 
                fill="none" 
                viewBox="0 0 24 24" 
                stroke="currentColor"
                aria-hidden="true"
              >
                <path 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                  strokeWidth={1.5} 
                  d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" 
                />
              </svg>
              <p className="text-sm text-center">No notifications yet</p>
              <p className="text-xs text-center mt-1 text-gray-400">
                You'll see updates here when they arrive
              </p>
            </div>
          )}

          {/* Notification List */}
          {!isLoading && notifications.length > 0 && (
            <div>
              {(['Today', 'Yesterday', 'This Week', 'Older'] as const).map(group => {
                const groupNotifications = groupedNotifications[group] || [];
                if (groupNotifications.length === 0) return null;

                return (
                  <div key={group}>
                    {/* Group Header */}
                    <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 sticky top-0">
                      <h4 className="text-xs font-semibold text-gray-600 uppercase">
                        {group}
                      </h4>
                    </div>
                    
                    {/* Group Notifications */}
                    {groupNotifications.map(notification => (
                      <NotificationItem
                        key={notification.id}
                        notification={notification}
                        onClick={onClose}
                      />
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
