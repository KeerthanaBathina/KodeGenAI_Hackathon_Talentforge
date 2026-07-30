import { NotificationPreference, PreferenceUpdate } from '../../types/notificationPreference';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export async function getNotificationPreferences(): Promise<NotificationPreference[]> {
  const response = await fetch(`${API_BASE}/api/notification-preferences`, {
    credentials: 'include'
  });

  if (!response.ok) {
    throw new Error('Failed to fetch notification preferences');
  }

  const data = await response.json();
  return data.preferences;
}

export async function bulkUpdatePreferences(
  updates: PreferenceUpdate[]
): Promise<number> {
  const response = await fetch(`${API_BASE}/api/notification-preferences/bulk`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ preferences: updates })
  });

  if (!response.ok) {
    throw new Error('Failed to update preferences');
  }

  const data = await response.json();
  return data.updatedCount;
}

export async function resetPreferences(): Promise<number> {
  const response = await fetch(`${API_BASE}/api/notification-preferences/reset`, {
    method: 'POST',
    credentials: 'include'
  });

  if (!response.ok) {
    throw new Error('Failed to reset preferences');
  }

  const data = await response.json();
  return data.createdCount;
}
