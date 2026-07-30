import React from 'react';
import { act } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ManualReviewQueuePage from '../page';

const realtimeMocks = vi.hoisted(() => ({
  ensureRealtime: vi.fn(),
  subscribe: vi.fn(),
  newApplicationHandler: null as null | ((payload: { applicationId: string; candidateName: string; requisitionTitle: string; queuedAt: string; queueCount: number; timestamp: string }) => void),
  handler: null as null | ((payload: { pendingCount: number; urgentCount: number; timestamp: string }) => void),
}));

vi.mock('@/components/system/FallbackModeBanner', () => ({
  FallbackModeBanner: () => <div data-testid="fallback-banner" />,
}));

vi.mock('@/components/manualReview/QueueStatsSummary', () => ({
  QueueStatsSummary: () => <div data-testid="queue-stats" />,
}));

vi.mock('@/components/manualReview/ManualReviewQueueTable', () => ({
  ManualReviewQueueTable: ({ filters }: { filters: Record<string, unknown> }) => (
    <pre data-testid="queue-table-filters">{JSON.stringify(filters)}</pre>
  ),
}));

vi.mock('@/lib/reviewQueueRealtime', () => ({
  ensureReviewQueueBadgeRealtime: realtimeMocks.ensureRealtime,
  subscribeToQueueNewApplication: (handler: (payload: { applicationId: string; candidateName: string; requisitionTitle: string; queuedAt: string; queueCount: number; timestamp: string }) => void) => {
    realtimeMocks.newApplicationHandler = handler;
    realtimeMocks.subscribe(handler);
    return () => undefined;
  },
  subscribeToReviewQueueBadgeCount: (handler: (payload: { pendingCount: number; urgentCount: number; timestamp: string }) => void) => {
    realtimeMocks.handler = handler;
    realtimeMocks.subscribe(handler);
    return () => undefined;
  },
}));

function mockFilterEndpoints() {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/requisitions/filters')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ departments: ['Engineering', 'Design'] }),
        } as Response);
      }

      if (url.includes('/api/requisitions?page=1&pageSize=100&status=open')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            data: [
              { id: 'req-1', title: 'Backend Engineer' },
              { id: 'req-2', title: 'Product Designer' },
            ],
          }),
        } as Response);
      }

      return Promise.resolve({ ok: false, json: async () => ({}) } as Response);
    })
  );
}

describe('ManualReviewQueuePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    realtimeMocks.handler = null;
    realtimeMocks.newApplicationHandler = null;
    window.history.replaceState({}, '', '/hr/manual-review');
    mockFilterEndpoints();
  });

  it('updates active filter count and persists filters in query string', async () => {
    render(<ManualReviewQueuePage />);

    await waitFor(() => {
      expect(screen.getByTestId('filter-toggle-button')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('filter-toggle-button'));

    fireEvent.change(screen.getByLabelText('Department'), {
      target: { value: 'Engineering' },
    });

    fireEvent.change(screen.getByLabelText('Score Band'), {
      target: { value: 'high' },
    });

    expect(await screen.findByTestId('active-filter-count')).toHaveTextContent('2');
    expect(screen.getByTestId('queue-table-filters').textContent).toContain('Engineering');
    expect(window.location.search).toContain('department=Engineering');
    expect(window.location.search).toContain('scoreBand=high');
  });

  it('clears filters and removes active filter count badge', async () => {
    render(<ManualReviewQueuePage />);

    await waitFor(() => {
      expect(screen.getByTestId('filter-toggle-button')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('filter-toggle-button'));
    fireEvent.change(screen.getByLabelText('Status'), {
      target: { value: 'pending_review' },
    });

    expect(await screen.findByTestId('active-filter-count')).toHaveTextContent('1');

    fireEvent.click(screen.getByRole('button', { name: 'Clear Filters' }));

    await waitFor(() => {
      expect(screen.queryByTestId('active-filter-count')).not.toBeInTheDocument();
    });
    expect(window.location.search).toBe('');
  });

  it('updates navigation badge when realtime badge event arrives', async () => {
    render(<ManualReviewQueuePage />);

    await waitFor(() => {
      expect(realtimeMocks.ensureRealtime).toHaveBeenCalled();
      expect(realtimeMocks.handler).not.toBeNull();
    });

    act(() => {
      realtimeMocks.handler?.({
        pendingCount: 9,
        urgentCount: 2,
        timestamp: '2026-07-25T12:00:00.000Z',
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId('manual-review-nav-badge')).toHaveTextContent('9');
      expect(screen.getByTestId('manual-review-nav-urgent')).toHaveTextContent('2');
    });
  });

  it('shows toast and increments badge when a new application event arrives', async () => {
    render(<ManualReviewQueuePage />);

    await waitFor(() => {
      expect(realtimeMocks.ensureRealtime).toHaveBeenCalled();
      expect(realtimeMocks.newApplicationHandler).not.toBeNull();
    });

    act(() => {
      realtimeMocks.newApplicationHandler?.({
        applicationId: 'app-1',
        candidateName: 'Alex Jordan',
        requisitionTitle: 'Backend Engineer',
        queuedAt: '2026-07-25T12:00:00.000Z',
        queueCount: 4,
        timestamp: '2026-07-25T12:00:00.000Z',
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId('manual-review-nav-badge')).toHaveTextContent('4');
      expect(screen.getByTestId('toast-info')).toHaveTextContent('New application: Alex Jordan for Backend Engineer.');
    });
  });
});
