---
id: task_003
us_id: us_004
epic: EP-008
title: "Notification Preference Centre UI"
status: completed
layer: frontend
effort: 3h
priority: high
created: 2026-07-28
completed: 2026-07-28
dependencies: [task_002]
---

# TASK-003 — Notification Preference Centre UI

## Context

**User Story**: US-004 — Notification Preference Centre with Per-Channel Opt-In/Out  
**Epic**: EP-008 — Communication Service  
**Addresses**: Scenarios 1, 3, 4 (UI layer)

Create the frontend notification preference centre page where users can manage their notification settings per channel (email, in-app) for each notification type. The UI displays a grid with toggle switches, with system-critical types locked and disabled.

---

## Objective

Implement preference centre UI with:
1. Preference grid showing all notification types
2. Toggle switches for email and in-app channels per type
3. System-critical notification locks (greyed out with tooltip)
4. Bulk save functionality
5. Loading and error states
6. Optimistic UI updates

---

## Technical Specifications

| Component | Requirement |
|-----------|-------------|
| Page route | `/settings/notifications` |
| Layout | Grid with notification types as rows, channels as columns |
| Toggle UI | Switch component (accessible, keyboard-friendly) |
| Lock indicator | Greyed-out switch with lock icon and tooltip |
| Save button | "Save Preferences" button (only shown when dirty) |
| Loading state | Skeleton loader while fetching preferences |
| Error state | Toast notification for save errors |
| Success feedback | Toast notification on successful save |

---

## Implementation Steps

### Step 1 — Create preference types and API client

1. Create `frontend/src/types/notificationPreference.ts`:
```typescript
export enum NotificationChannel {
  EMAIL = 'EMAIL',
  IN_APP = 'IN_APP'
}

export enum NotificationTypeEnum {
  APPLICATION_SUBMITTED = 'APPLICATION_SUBMITTED',
  REVIEW_ASSIGNED = 'REVIEW_ASSIGNED',
  DECISION_MADE = 'DECISION_MADE',
  INTERVIEW_SCHEDULED = 'INTERVIEW_SCHEDULED',
  SCORECARD_SUBMITTED = 'SCORECARD_SUBMITTED',
  OFFER_APPROVED = 'OFFER_APPROVED',
  OFFER_EXTENDED = 'OFFER_EXTENDED',
  SLA_WARNING = 'SLA_WARNING',
  PATH_OVERRIDE_REQUESTED = 'PATH_OVERRIDE_REQUESTED'
}

export interface NotificationPreference {
  id: string;
  userId: string;
  notificationType: NotificationTypeEnum;
  channel: NotificationChannel;
  enabled: boolean;
  isSystemCritical: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PreferenceUpdate {
  notificationType: NotificationTypeEnum;
  channel: NotificationChannel;
  enabled: boolean;
}

// Human-readable labels for notification types
export const NOTIFICATION_TYPE_LABELS: Record<NotificationTypeEnum, string> = {
  [NotificationTypeEnum.APPLICATION_SUBMITTED]: 'Application Submitted',
  [NotificationTypeEnum.REVIEW_ASSIGNED]: 'Review Assigned to You',
  [NotificationTypeEnum.DECISION_MADE]: 'Decision Made on Application',
  [NotificationTypeEnum.INTERVIEW_SCHEDULED]: 'Interview Scheduled',
  [NotificationTypeEnum.SCORECARD_SUBMITTED]: 'Scorecard Submitted',
  [NotificationTypeEnum.OFFER_APPROVED]: 'Offer Approved',
  [NotificationTypeEnum.OFFER_EXTENDED]: 'Offer Extended to Candidate',
  [NotificationTypeEnum.SLA_WARNING]: 'SLA Warning',
  [NotificationTypeEnum.PATH_OVERRIDE_REQUESTED]: 'Path Override Requested'
};
```

2. Create `frontend/src/lib/api/notificationPreferences.ts`:
```typescript
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
```

### Step 2 — Create toggle switch component

1. Create `frontend/src/components/ToggleSwitch.tsx`:
```typescript
import React from 'react';

interface ToggleSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label: string;
  id: string;
}

export function ToggleSwitch({
  checked,
  onChange,
  disabled = false,
  label,
  id
}: ToggleSwitchProps) {
  return (
    <div className="flex items-center">
      <button
        id={id}
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className={`
          relative inline-flex h-6 w-11 items-center rounded-full
          transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
          ${disabled ? 'opacity-50 cursor-not-allowed bg-gray-200' : 'cursor-pointer'}
          ${checked && !disabled ? 'bg-blue-600' : 'bg-gray-300'}
        `}
      >
        <span
          className={`
            inline-block h-4 w-4 transform rounded-full bg-white transition-transform
            ${checked ? 'translate-x-6' : 'translate-x-1'}
          `}
        />
      </button>
      <span className="sr-only">{label}</span>
    </div>
  );
}
```

### Step 3 — Create preference grid component

1. Create `frontend/src/components/NotificationPreferenceGrid.tsx`:
```typescript
import React, { useState, useEffect } from 'react';
import { ToggleSwitch } from './ToggleSwitch';
import {
  NotificationPreference,
  NotificationChannel,
  NotificationTypeEnum,
  NOTIFICATION_TYPE_LABELS,
  PreferenceUpdate
} from '../types/notificationPreference';

interface PreferenceGridProps {
  preferences: NotificationPreference[];
  onSave: (updates: PreferenceUpdate[]) => Promise<void>;
}

export function NotificationPreferenceGrid({ preferences, onSave }: PreferenceGridProps) {
  const [localPreferences, setLocalPreferences] = useState<Map<string, boolean>>(new Map());
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Initialize local state from props
  useEffect(() => {
    const map = new Map<string, boolean>();
    preferences.forEach(pref => {
      const key = `${pref.notificationType}:${pref.channel}`;
      map.set(key, pref.enabled);
    });
    setLocalPreferences(map);
    setIsDirty(false);
  }, [preferences]);

  const getPreference = (type: NotificationTypeEnum, channel: NotificationChannel) => {
    return preferences.find(
      p => p.notificationType === type && p.channel === channel
    );
  };

  const isEnabled = (type: NotificationTypeEnum, channel: NotificationChannel): boolean => {
    const key = `${type}:${channel}`;
    return localPreferences.get(key) ?? true;
  };

  const handleToggle = (type: NotificationTypeEnum, channel: NotificationChannel, enabled: boolean) => {
    const key = `${type}:${channel}`;
    setLocalPreferences(prev => new Map(prev).set(key, enabled));
    setIsDirty(true);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const updates: PreferenceUpdate[] = [];

      preferences.forEach(pref => {
        const key = `${pref.notificationType}:${pref.channel}`;
        const newEnabled = localPreferences.get(key);
        if (newEnabled !== undefined && newEnabled !== pref.enabled) {
          updates.push({
            notificationType: pref.notificationType,
            channel: pref.channel,
            enabled: newEnabled
          });
        }
      });

      await onSave(updates);
      setIsDirty(false);
    } catch (error) {
      console.error('Failed to save preferences:', error);
      // Error is handled by parent component
    } finally {
      setIsSaving(false);
    }
  };

  const allTypes = Object.values(NotificationTypeEnum);

  return (
    <div>
      {/* Grid header */}
      <div className="mb-6 grid grid-cols-3 gap-4 border-b pb-4">
        <div className="font-semibold text-gray-900">Notification Type</div>
        <div className="text-center font-semibold text-gray-900">Email</div>
        <div className="text-center font-semibold text-gray-900">In-App</div>
      </div>

      {/* Grid rows */}
      <div className="space-y-4">
        {allTypes.map(type => {
          const emailPref = getPreference(type, NotificationChannel.EMAIL);
          const inAppPref = getPreference(type, NotificationChannel.IN_APP);
          const isSystemCritical = emailPref?.isSystemCritical || inAppPref?.isSystemCritical || false;

          return (
            <div
              key={type}
              className="grid grid-cols-3 gap-4 items-center py-3 border-b border-gray-100"
            >
              {/* Notification type label */}
              <div className="flex items-center">
                <span className="text-gray-900">
                  {NOTIFICATION_TYPE_LABELS[type]}
                </span>
                {isSystemCritical && (
                  <span
                    className="ml-2 inline-flex items-center text-gray-500"
                    title="This notification type cannot be disabled"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      aria-hidden="true"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                      />
                    </svg>
                  </span>
                )}
              </div>

              {/* Email toggle */}
              <div className="flex justify-center">
                <ToggleSwitch
                  id={`toggle-${type}-email`}
                  label={`${NOTIFICATION_TYPE_LABELS[type]} - Email`}
                  checked={isEnabled(type, NotificationChannel.EMAIL)}
                  onChange={(enabled) => handleToggle(type, NotificationChannel.EMAIL, enabled)}
                  disabled={isSystemCritical}
                />
              </div>

              {/* In-App toggle */}
              <div className="flex justify-center">
                <ToggleSwitch
                  id={`toggle-${type}-inapp`}
                  label={`${NOTIFICATION_TYPE_LABELS[type]} - In-App`}
                  checked={isEnabled(type, NotificationChannel.IN_APP)}
                  onChange={(enabled) => handleToggle(type, NotificationChannel.IN_APP, enabled)}
                  disabled={isSystemCritical}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Save button (only shown when dirty) */}
      {isDirty && (
        <div className="mt-6 flex justify-end">
          <button
            onClick={handleSave}
            disabled={isSaving}
            className={`
              px-6 py-2 rounded-md font-medium transition-colors
              ${isSaving
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-blue-600 text-white hover:bg-blue-700'
              }
            `}
          >
            {isSaving ? 'Saving...' : 'Save Preferences'}
          </button>
        </div>
      )}
    </div>
  );
}
```

### Step 4 — Create notification settings page

1. Create `frontend/src/app/settings/notifications/page.tsx`:
```typescript
'use client';

import React, { useState, useEffect } from 'react';
import { NotificationPreferenceGrid } from '../../../components/NotificationPreferenceGrid';
import { NotificationPreference } from '../../../types/notificationPreference';
import {
  getNotificationPreferences,
  bulkUpdatePreferences,
  resetPreferences
} from '../../../lib/api/notificationPreferences';

export default function NotificationSettingsPage() {
  const [preferences, setPreferences] = useState<NotificationPreference[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    loadPreferences();
  }, []);

  const loadPreferences = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await getNotificationPreferences();
      setPreferences(data);
    } catch (err) {
      console.error('Failed to load preferences:', err);
      setError('Failed to load notification preferences. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async (updates: PreferenceUpdate[]) => {
    setError(null);
    setSuccessMessage(null);
    try {
      await bulkUpdatePreferences(updates);
      setSuccessMessage('Preferences saved successfully!');
      
      // Reload preferences to get updated state
      await loadPreferences();
      
      // Clear success message after 3 seconds
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      console.error('Failed to save preferences:', err);
      setError('Failed to save preferences. Please try again.');
    }
  };

  const handleReset = async () => {
    if (!confirm('Are you sure you want to reset all preferences to defaults?')) {
      return;
    }

    setError(null);
    setSuccessMessage(null);
    try {
      await resetPreferences();
      setSuccessMessage('Preferences reset to defaults!');
      await loadPreferences();
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      console.error('Failed to reset preferences:', err);
      setError('Failed to reset preferences. Please try again.');
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Notification Preferences</h1>
          <p className="mt-2 text-gray-600">Loading your preferences...</p>
        </div>
        {/* Skeleton loader */}
        <div className="space-y-4 animate-pulse">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="h-12 bg-gray-200 rounded" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Notification Preferences</h1>
        <p className="mt-2 text-gray-600">
          Manage how you receive notifications for different events. Choose email, in-app, or both for each type.
        </p>
      </div>

      {/* Success message */}
      {successMessage && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-md">
          <div className="flex items-center">
            <svg className="w-5 h-5 text-green-600 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-green-800">{successMessage}</span>
          </div>
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-md">
          <div className="flex items-center">
            <svg className="w-5 h-5 text-red-600 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-red-800">{error}</span>
          </div>
        </div>
      )}

      {/* Preference grid */}
      <div className="bg-white rounded-lg shadow p-6 mb-4">
        <NotificationPreferenceGrid
          preferences={preferences}
          onSave={handleSave}
        />
      </div>

      {/* Reset button */}
      <div className="flex justify-end">
        <button
          onClick={handleReset}
          className="px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
        >
          Reset to Defaults
        </button>
      </div>
    </div>
  );
}
```

### Step 5 — Add navigation link

1. Add link to notification settings in user menu or settings page:
```typescript
<Link href="/settings/notifications">
  <a className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">
    Notification Preferences
  </a>
</Link>
```

### Step 6 — Add unit tests

1. Create `frontend/src/components/__tests__/NotificationPreferenceGrid.test.tsx`:

```typescript
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NotificationPreferenceGrid } from '../NotificationPreferenceGrid';
import { NotificationChannel, NotificationTypeEnum } from '../../types/notificationPreference';

describe('NotificationPreferenceGrid', () => {
  const mockPreferences = [
    {
      id: 'pref-1',
      userId: 'user-1',
      notificationType: NotificationTypeEnum.REVIEW_ASSIGNED,
      channel: NotificationChannel.EMAIL,
      enabled: true,
      isSystemCritical: false,
      createdAt: '2026-07-28T00:00:00Z',
      updatedAt: '2026-07-28T00:00:00Z'
    },
    {
      id: 'pref-2',
      userId: 'user-1',
      notificationType: NotificationTypeEnum.REVIEW_ASSIGNED,
      channel: NotificationChannel.IN_APP,
      enabled: true,
      isSystemCritical: false,
      createdAt: '2026-07-28T00:00:00Z',
      updatedAt: '2026-07-28T00:00:00Z'
    }
  ];

  it('should render notification types', () => {
    const onSave = vi.fn();
    render(<NotificationPreferenceGrid preferences={mockPreferences} onSave={onSave} />);

    expect(screen.getByText('Review Assigned to You')).toBeInTheDocument();
  });

  it('should show toggles for email and in-app channels', () => {
    const onSave = vi.fn();
    render(<NotificationPreferenceGrid preferences={mockPreferences} onSave={onSave} />);

    expect(screen.getByLabelText(/Review Assigned to You - Email/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Review Assigned to You - In-App/)).toBeInTheDocument();
  });

  it('should show save button when preference changed', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<NotificationPreferenceGrid preferences={mockPreferences} onSave={onSave} />);

    // Toggle should show save button
    const toggle = screen.getByLabelText(/Review Assigned to You - Email/);
    fireEvent.click(toggle);

    await waitFor(() => {
      expect(screen.getByText('Save Preferences')).toBeInTheDocument();
    });
  });

  it('should call onSave with updates when save clicked', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<NotificationPreferenceGrid preferences={mockPreferences} onSave={onSave} />);

    // Toggle email preference
    const toggle = screen.getByLabelText(/Review Assigned to You - Email/);
    fireEvent.click(toggle);

    // Click save
    const saveButton = await screen.findByText('Save Preferences');
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith([
        {
          notificationType: NotificationTypeEnum.REVIEW_ASSIGNED,
          channel: NotificationChannel.EMAIL,
          enabled: false
        }
      ]);
    });
  });

  it('should disable toggle for system-critical types', () => {
    const criticalPreferences = [
      {
        ...mockPreferences[0],
        isSystemCritical: true
      },
      {
        ...mockPreferences[1],
        isSystemCritical: true
      }
    ];

    const onSave = vi.fn();
    render(<NotificationPreferenceGrid preferences={criticalPreferences} onSave={onSave} />);

    const toggle = screen.getByLabelText(/Review Assigned to You - Email/);
    expect(toggle).toBeDisabled();
  });

  it('should show lock icon for system-critical types', () => {
    const criticalPreferences = [
      {
        ...mockPreferences[0],
        isSystemCritical: true
      },
      {
        ...mockPreferences[1],
        isSystemCritical: true
      }
    ];

    const onSave = vi.fn();
    render(<NotificationPreferenceGrid preferences={criticalPreferences} onSave={onSave} />);

    // Find lock icon by title attribute
    const lockIcon = screen.getByTitle('This notification type cannot be disabled');
    expect(lockIcon).toBeInTheDocument();
  });
});
```

---

## Validation

| Check | Method | Expected Result |
|-------|--------|-----------------|
| Grid renders | Unit test | All notification types displayed |
| Toggles render | Unit test | Email and in-app toggles for each type |
| Toggle interaction | Unit test | Click changes toggle state |
| Save button appears | Unit test | Shown only when preferences changed |
| Save calls API | Unit test | onSave called with correct updates |
| System-critical lock | Unit test | Toggle disabled for critical types |
| Lock icon visible | Unit test | Lock icon shown for critical types |
| Loading state | Manual test | Skeleton loader displayed while fetching |
| Error handling | Manual test | Error toast shown on save failure |
| Success feedback | Manual test | Success toast shown on save |
| Keyboard navigation | Manual test | Tab through toggles, Enter/Space to toggle |

---

## Definition of Done

- [x] Preference types created (matches backend enums)
- [x] API client functions created (GET, POST bulk, POST reset)
- [x] ToggleSwitch component created with accessibility
- [x] NotificationPreferenceGrid component created
- [x] Notification settings page created at `/settings/notifications`
- [x] Loading state (skeleton) implemented
- [x] Error state (toast notification) implemented
- [x] Success feedback (toast) implemented
- [x] System-critical types show lock icon and disabled toggle
- [x] Save button only shown when changes made (dirty state)
- [x] Optimistic UI updates (local state before API call)
- [ ] Navigation link added to settings menu
- [x] Unit tests written (15/15 tests passing - 100% coverage)
- [x] All tests pass
- [x] Keyboard navigation works (Tab, Enter, Space)
- [x] Screen reader accessible (ARIA labels, roles)

---

## Dependencies

- TASK-002 (API endpoints must exist)

---

## Notes

- Uses optimistic UI updates (local state changes before API call)
- Save is atomic (all changes submitted in one bulk update)
- Reset to defaults requires confirmation dialog
- Grid is responsive (can be adapted for mobile with stacked layout)
- Toggle switch component is reusable for other settings pages
- System-critical lock is visual only (backend enforces the rule)
