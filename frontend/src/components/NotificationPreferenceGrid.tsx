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
