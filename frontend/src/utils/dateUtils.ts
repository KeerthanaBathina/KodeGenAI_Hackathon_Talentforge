import { Notification } from '../types/notification';

/**
 * Get relative time string for a timestamp
 * 
 * Returns human-readable relative time like "Just now", "5 min ago", "2 hours ago"
 * 
 * @param timestamp - ISO timestamp string
 * @returns Relative time string
 */
export function getRelativeTimeString(timestamp: string): string {
  const now = new Date();
  const date = new Date(timestamp);
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) {
    return 'Just now';
  } else if (diffMin < 60) {
    return `${diffMin} min ago`;
  } else if (diffHour < 24) {
    return diffHour === 1 ? '1 hour ago' : `${diffHour} hours ago`;
  } else if (diffDay === 1) {
    return 'Yesterday';
  } else if (diffDay < 7) {
    return `${diffDay} days ago`;
  } else {
    return date.toLocaleDateString();
  }
}

/**
 * Get date group for a timestamp
 * 
 * Groups notifications into time-based categories
 * 
 * @param timestamp - ISO timestamp string
 * @returns Date group category
 */
export function getDateGroup(timestamp: string): 'Today' | 'Yesterday' | 'This Week' | 'Older' {
  const now = new Date();
  const date = new Date(timestamp);
  
  // Reset time to midnight for accurate day comparison
  const nowMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dateMidnight = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  
  const diffMs = nowMidnight.getTime() - dateMidnight.getTime();
  const diffDay = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDay === 0) return 'Today';
  if (diffDay === 1) return 'Yesterday';
  if (diffDay < 7) return 'This Week';
  return 'Older';
}

/**
 * Group notifications by date category
 * 
 * @param notifications - Array of notifications
 * @returns Object with notifications grouped by date
 */
export function groupNotificationsByDate(notifications: Notification[]): Record<string, Notification[]> {
  const groups: Record<string, Notification[]> = {
    'Today': [],
    'Yesterday': [],
    'This Week': [],
    'Older': []
  };

  for (const notification of notifications) {
    const group = getDateGroup(notification.createdAt);
    groups[group].push(notification);
  }

  return groups;
}
