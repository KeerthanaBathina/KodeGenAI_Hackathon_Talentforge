'use client';

import React, { useState, useEffect } from 'react';
import { NotificationPreferenceGrid } from '../../../components/NotificationPreferenceGrid';
import { NotificationPreference, PreferenceUpdate } from '../../../types/notificationPreference';
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
