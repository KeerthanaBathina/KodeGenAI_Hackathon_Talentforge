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

  it('should hide save button after successful save', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<NotificationPreferenceGrid preferences={mockPreferences} onSave={onSave} />);

    // Toggle preference
    const toggle = screen.getByLabelText(/Review Assigned to You - Email/);
    fireEvent.click(toggle);

    // Click save
    const saveButton = await screen.findByText('Save Preferences');
    fireEvent.click(saveButton);

    // Wait for save to complete
    await waitFor(() => {
      expect(onSave).toHaveBeenCalled();
    });

    // Save button should be hidden after successful save
    await waitFor(() => {
      expect(screen.queryByText('Save Preferences')).not.toBeInTheDocument();
    });
  });

  it('should show Saving... text while saving', async () => {
    const onSave = vi.fn().mockImplementation(() => new Promise(resolve => setTimeout(resolve, 100)));
    render(<NotificationPreferenceGrid preferences={mockPreferences} onSave={onSave} />);

    // Toggle preference
    const toggle = screen.getByLabelText(/Review Assigned to You - Email/);
    fireEvent.click(toggle);

    // Click save
    const saveButton = await screen.findByText('Save Preferences');
    fireEvent.click(saveButton);

    // Should show Saving... text
    expect(await screen.findByText('Saving...')).toBeInTheDocument();
  });

  it('should render all notification types', () => {
    const allPreferences = Object.values(NotificationTypeEnum).flatMap(type => [
      {
        id: `${type}-email`,
        userId: 'user-1',
        notificationType: type,
        channel: NotificationChannel.EMAIL,
        enabled: true,
        isSystemCritical: false,
        createdAt: '2026-07-28T00:00:00Z',
        updatedAt: '2026-07-28T00:00:00Z'
      },
      {
        id: `${type}-inapp`,
        userId: 'user-1',
        notificationType: type,
        channel: NotificationChannel.IN_APP,
        enabled: true,
        isSystemCritical: false,
        createdAt: '2026-07-28T00:00:00Z',
        updatedAt: '2026-07-28T00:00:00Z'
      }
    ]);

    const onSave = vi.fn();
    render(<NotificationPreferenceGrid preferences={allPreferences} onSave={onSave} />);

    // Should render 9 notification types
    expect(screen.getByText('Application Submitted')).toBeInTheDocument();
    expect(screen.getByText('Review Assigned to You')).toBeInTheDocument();
    expect(screen.getByText('Decision Made on Application')).toBeInTheDocument();
    expect(screen.getByText('Interview Scheduled')).toBeInTheDocument();
    expect(screen.getByText('Scorecard Submitted')).toBeInTheDocument();
    expect(screen.getByText('Offer Approved')).toBeInTheDocument();
    expect(screen.getByText('Offer Extended to Candidate')).toBeInTheDocument();
    expect(screen.getByText('SLA Warning')).toBeInTheDocument();
    expect(screen.getByText('Path Override Requested')).toBeInTheDocument();
  });
});
