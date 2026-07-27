/**
 * Tests for PrerequisiteChecklist component
 * 
 * Covers:
 * - Loading state
 * - Error state with retry
 * - Empty state
 * - Checklist rendering (completed/pending items)
 * - Status change callbacks
 * - Imperative handle methods (updateItemStatus, refresh)
 * - Accessibility features
 */

import React, { createRef } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PrerequisiteChecklist, type PrerequisiteChecklistHandle } from '../PrerequisiteChecklist';
import * as prerequisitesApi from '@/lib/api/prerequisites';
import type { PrerequisiteStatus } from '@/lib/api/prerequisites';

// Mock the API module
vi.mock('@/lib/api/prerequisites', () => ({
  fetchPrerequisites: vi.fn(),
  PrerequisiteError: class PrerequisiteError extends Error {
    constructor(message: string, public statusCode?: number) {
      super(message);
      this.name = 'PrerequisiteError';
    }
  }
}));

describe('PrerequisiteChecklist', () => {
  const mockApplicationId = '550e8400-e29b-41d4-a716-446655440000';

  const mockIncompleteStatus: PrerequisiteStatus = {
    isComplete: false,
    items: [
      {
        id: 'stage-1',
        type: 'interview_stage',
        label: 'Technical Interview',
        status: 'completed'
      },
      {
        id: 'stage-2',
        type: 'interview_stage',
        label: 'Behavioral Interview',
        status: 'pending',
        scheduledDate: '2026-07-28T10:00:00Z'
      },
      {
        id: 'assessment-1',
        type: 'assessment',
        label: 'Coding Assessment',
        status: 'pending'
      }
    ]
  };

  const mockCompleteStatus: PrerequisiteStatus = {
    isComplete: true,
    items: [
      {
        id: 'stage-1',
        type: 'interview_stage',
        label: 'Technical Interview',
        status: 'completed'
      },
      {
        id: 'stage-2',
        type: 'interview_stage',
        label: 'Behavioral Interview',
        status: 'completed'
      },
      {
        id: 'assessment-1',
        type: 'assessment',
        label: 'Coding Assessment',
        status: 'completed'
      }
    ]
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Loading State', () => {
    it('should render loading skeleton while fetching', () => {
      vi.mocked(prerequisitesApi.fetchPrerequisites).mockImplementation(
        () => new Promise(() => {}) // Never resolves
      );

      render(<PrerequisiteChecklist applicationId={mockApplicationId} />);

      // Check for loading indicators
      const skeletons = document.querySelectorAll('.animate-pulse');
      expect(skeletons.length).toBeGreaterThan(0);
    });
  });

  describe('Error State', () => {
    it('should display error message when fetch fails', async () => {
      const errorMessage = 'Failed to fetch prerequisites';
      vi.mocked(prerequisitesApi.fetchPrerequisites).mockRejectedValue(
        new prerequisitesApi.PrerequisiteError(errorMessage, 500)
      );

      render(<PrerequisiteChecklist applicationId={mockApplicationId} />);

      await waitFor(() => {
        expect(screen.getByText('Error loading prerequisites')).toBeInTheDocument();
        expect(screen.getByText(errorMessage)).toBeInTheDocument();
      });
    });

    it('should allow retry after error', async () => {
      const user = userEvent.setup();
      
      // First call fails
      vi.mocked(prerequisitesApi.fetchPrerequisites)
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce(mockIncompleteStatus);

      render(<PrerequisiteChecklist applicationId={mockApplicationId} />);

      // Wait for error
      await waitFor(() => {
        expect(screen.getByText('Error loading prerequisites')).toBeInTheDocument();
      });

      // Click retry
      const retryButton = screen.getByRole('button', { name: /try again/i });
      await user.click(retryButton);

      // Wait for success
      await waitFor(() => {
        expect(screen.getByText('Prerequisites for Final Decision')).toBeInTheDocument();
      });
    });

    it('should display specific error for 404', async () => {
      vi.mocked(prerequisitesApi.fetchPrerequisites).mockRejectedValue(
        new prerequisitesApi.PrerequisiteError('Application not found', 404)
      );

      render(<PrerequisiteChecklist applicationId={mockApplicationId} />);

      await waitFor(() => {
        expect(screen.getByText('Application not found')).toBeInTheDocument();
      });
    });
  });

  describe('Empty State', () => {
    it('should display empty message when no prerequisites', async () => {
      vi.mocked(prerequisitesApi.fetchPrerequisites).mockResolvedValue({
        isComplete: true,
        items: []
      });

      render(<PrerequisiteChecklist applicationId={mockApplicationId} />);

      await waitFor(() => {
        expect(screen.getByText(/no prerequisites required/i)).toBeInTheDocument();
      });
    });
  });

  describe('Checklist Rendering', () => {
    it('should render all prerequisite items with correct status', async () => {
      vi.mocked(prerequisitesApi.fetchPrerequisites).mockResolvedValue(mockIncompleteStatus);

      render(<PrerequisiteChecklist applicationId={mockApplicationId} />);

      await waitFor(() => {
        expect(screen.getByText('Technical Interview')).toBeInTheDocument();
        expect(screen.getByText('Behavioral Interview')).toBeInTheDocument();
        expect(screen.getByText('Coding Assessment')).toBeInTheDocument();
      });
    });

    it('should show green tick for completed items', async () => {
      vi.mocked(prerequisitesApi.fetchPrerequisites).mockResolvedValue(mockIncompleteStatus);

      render(<PrerequisiteChecklist applicationId={mockApplicationId} />);

      await waitFor(() => {
        // Technical Interview is completed - should have filled circle SVG
        const completedItem = screen.getByText('Technical Interview').closest('li');
        const svg = completedItem?.querySelector('svg');
        expect(svg).toHaveClass('text-green-500');
      });
    });

    it('should show grey circle for pending items', async () => {
      vi.mocked(prerequisitesApi.fetchPrerequisites).mockResolvedValue(mockIncompleteStatus);

      render(<PrerequisiteChecklist applicationId={mockApplicationId} />);

      await waitFor(() => {
        // Behavioral Interview is pending - should have grey circle
        const pendingItem = screen.getByText('Behavioral Interview').closest('li');
        const svg = pendingItem?.querySelector('svg');
        expect(svg).toHaveClass('text-gray-300');
      });
    });

    it('should display scheduled date for pending items', async () => {
      vi.mocked(prerequisitesApi.fetchPrerequisites).mockResolvedValue(mockIncompleteStatus);

      render(<PrerequisiteChecklist applicationId={mockApplicationId} />);

      await waitFor(() => {
        expect(screen.getByText(/Scheduled:/)).toBeInTheDocument();
      });
    });

    it('should show completion banner when all prerequisites complete', async () => {
      vi.mocked(prerequisitesApi.fetchPrerequisites).mockResolvedValue(mockCompleteStatus);

      render(<PrerequisiteChecklist applicationId={mockApplicationId} />);

      await waitFor(() => {
        expect(
          screen.getByText(/All prerequisites complete/i)
        ).toBeInTheDocument();
      });
    });

    it('should not show completion banner when incomplete', async () => {
      vi.mocked(prerequisitesApi.fetchPrerequisites).mockResolvedValue(mockIncompleteStatus);

      render(<PrerequisiteChecklist applicationId={mockApplicationId} />);

      await waitFor(() => {
        expect(screen.getByText('Technical Interview')).toBeInTheDocument();
      });

      expect(
        screen.queryByText(/All prerequisites complete/i)
      ).not.toBeInTheDocument();
    });
  });

  describe('Status Change Callback', () => {
    it('should call onStatusChange with completion status', async () => {
      const onStatusChange = vi.fn();
      vi.mocked(prerequisitesApi.fetchPrerequisites).mockResolvedValue(mockIncompleteStatus);

      render(
        <PrerequisiteChecklist
          applicationId={mockApplicationId}
          onStatusChange={onStatusChange}
        />
      );

      await waitFor(() => {
        expect(onStatusChange).toHaveBeenCalledWith(false);
      });
    });

    it('should call onStatusChange with true when all complete', async () => {
      const onStatusChange = vi.fn();
      vi.mocked(prerequisitesApi.fetchPrerequisites).mockResolvedValue(mockCompleteStatus);

      render(
        <PrerequisiteChecklist
          applicationId={mockApplicationId}
          onStatusChange={onStatusChange}
        />
      );

      await waitFor(() => {
        expect(onStatusChange).toHaveBeenCalledWith(true);
      });
    });
  });

  describe('Imperative Handle', () => {
    it('should expose updateItemStatus method', async () => {
      const ref = createRef<PrerequisiteChecklistHandle>();
      vi.mocked(prerequisitesApi.fetchPrerequisites).mockResolvedValue(mockIncompleteStatus);

      render(
        <PrerequisiteChecklist
          ref={ref}
          applicationId={mockApplicationId}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Technical Interview')).toBeInTheDocument();
      });

      // Update item status via ref
      ref.current?.updateItemStatus('stage-2', 'completed');

      await waitFor(() => {
        const item = screen.getByText('Behavioral Interview').closest('li');
        const svg = item?.querySelector('svg');
        expect(svg).toHaveClass('text-green-500');
      });
    });

    it('should recalculate isComplete when updating items', async () => {
      const onStatusChange = vi.fn();
      const ref = createRef<PrerequisiteChecklistHandle>();
      vi.mocked(prerequisitesApi.fetchPrerequisites).mockResolvedValue(mockIncompleteStatus);

      render(
        <PrerequisiteChecklist
          ref={ref}
          applicationId={mockApplicationId}
          onStatusChange={onStatusChange}
        />
      );

      await waitFor(() => {
        expect(onStatusChange).toHaveBeenCalledWith(false);
      });

      onStatusChange.mockClear();

      // Complete remaining items
      ref.current?.updateItemStatus('stage-2', 'completed');
      ref.current?.updateItemStatus('assessment-1', 'completed');

      await waitFor(() => {
        expect(onStatusChange).toHaveBeenCalledWith(true);
      });
    });

    it('should expose refresh method', async () => {
      const ref = createRef<PrerequisiteChecklistHandle>();
      vi.mocked(prerequisitesApi.fetchPrerequisites)
        .mockResolvedValueOnce(mockIncompleteStatus)
        .mockResolvedValueOnce(mockCompleteStatus);

      render(
        <PrerequisiteChecklist
          ref={ref}
          applicationId={mockApplicationId}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Behavioral Interview')).toBeInTheDocument();
      });

      // Refresh
      await ref.current?.refresh();

      await waitFor(() => {
        expect(screen.getByText(/All prerequisites complete/i)).toBeInTheDocument();
      });
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA labels', async () => {
      vi.mocked(prerequisitesApi.fetchPrerequisites).mockResolvedValue(mockIncompleteStatus);

      render(<PrerequisiteChecklist applicationId={mockApplicationId} />);

      await waitFor(() => {
        const list = screen.getByRole('list', { name: /decision prerequisites/i });
        expect(list).toBeInTheDocument();
      });
    });

    it('should have live region for completion banner', async () => {
      vi.mocked(prerequisitesApi.fetchPrerequisites).mockResolvedValue(mockCompleteStatus);

      render(<PrerequisiteChecklist applicationId={mockApplicationId} />);

      await waitFor(() => {
        const banner = screen.getByRole('status');
        expect(banner).toHaveAttribute('aria-live', 'polite');
      });
    });

    it('should have screen reader text for item status', async () => {
      vi.mocked(prerequisitesApi.fetchPrerequisites).mockResolvedValue(mockIncompleteStatus);

      render(<PrerequisiteChecklist applicationId={mockApplicationId} />);

      await waitFor(() => {
        const srTexts = screen.getAllByText(/complete|pending/i, { selector: '.sr-only' });
        expect(srTexts.length).toBeGreaterThan(0);
      });
    });

    it('should have role=alert for error', async () => {
      vi.mocked(prerequisitesApi.fetchPrerequisites).mockRejectedValue(
        new Error('Test error')
      );

      render(<PrerequisiteChecklist applicationId={mockApplicationId} />);

      await waitFor(() => {
        const alert = screen.getByRole('alert');
        expect(alert).toBeInTheDocument();
      });
    });
  });
});
