/**
 * Tests for PrerequisiteChecklist WebSocket Integration
 * 
 * Tests real-time updates via WebSocket events:
 * - Connection status indicator
 * - Stage completion events
 * - Assessment completion events
 * - Polling fallback when disconnected
 * - Visual feedback (highlight effect)
 * - Screen reader announcements
 */

import React, { createRef } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { PrerequisiteChecklist, type PrerequisiteChecklistHandle } from '../PrerequisiteChecklist';
import * as prerequisitesApi from '@/lib/api/prerequisites';
import type { PrerequisiteStatus } from '@/lib/api/prerequisites';
import type { StageCompletedEvent, AssessmentCompletedEvent } from '@/types/applicationEvents';

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

// Mock the WebSocket hook
let mockWebSocketHandlers: {
  onStageCompleted?: (data: StageCompletedEvent) => void;
  onAssessmentCompleted?: (data: AssessmentCompletedEvent) => void;
} = {};

const mockUseApplicationWebSocket = vi.fn(() => ({
  connected: true,
  error: null
}));

vi.mock('@/hooks/useApplicationWebSocket', () => ({
  useApplicationWebSocket: (applicationId: string, handlers: typeof mockWebSocketHandlers) => {
    // Capture handlers so tests can trigger events
    mockWebSocketHandlers = handlers;
    return mockUseApplicationWebSocket();
  }
}));

describe('PrerequisiteChecklist - WebSocket Integration', () => {
  const mockApplicationId = '550e8400-e29b-41d4-a716-446655440000';

  const mockIncompleteStatus: PrerequisiteStatus = {
    isComplete: false,
    items: [
      {
        id: 'stage-1',
        type: 'interview_stage',
        label: 'Technical Interview',
        status: 'pending'
      },
      {
        id: 'stage-2',
        type: 'interview_stage',
        label: 'Behavioral Interview',
        status: 'pending'
      },
      {
        id: 'assessment-1',
        type: 'assessment',
        label: 'Coding Assessment',
        status: 'pending'
      }
    ]
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockWebSocketHandlers = {};
    
    // Default: WebSocket connected
    mockUseApplicationWebSocket.mockReturnValue({
      connected: true,
      error: null
    });
    
    // Default: Return incomplete status
    vi.mocked(prerequisitesApi.fetchPrerequisites).mockResolvedValue(mockIncompleteStatus);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Connection Status Indicator', () => {
    it('should show "Live updates active" when WebSocket is connected', async () => {
      mockUseApplicationWebSocket.mockReturnValue({
        connected: true,
        error: null
      });

      render(<PrerequisiteChecklist applicationId={mockApplicationId} />);

      await waitFor(() => {
        expect(screen.getByText('Live updates active')).toBeInTheDocument();
      });
    });

    it('should show "Checking for updates..." when WebSocket is disconnected', async () => {
      mockUseApplicationWebSocket.mockReturnValue({
        connected: false,
        error: null
      });

      render(<PrerequisiteChecklist applicationId={mockApplicationId} />);

      await waitFor(() => {
        expect(screen.getByText('Checking for updates...')).toBeInTheDocument();
      });
    });

    it('should show error message when WebSocket has an error', async () => {
      mockUseApplicationWebSocket.mockReturnValue({
        connected: false,
        error: 'Connection timeout'
      });

      render(<PrerequisiteChecklist applicationId={mockApplicationId} />);

      await waitFor(() => {
        expect(screen.getByText(/WebSocket: Connection timeout/)).toBeInTheDocument();
      });
    });

    it('should display animated pulse dot when connected', async () => {
      mockUseApplicationWebSocket.mockReturnValue({
        connected: true,
        error: null
      });

      const { container } = render(<PrerequisiteChecklist applicationId={mockApplicationId} />);

      await waitFor(() => {
        const pulsingDot = container.querySelector('.animate-pulse.bg-green-400');
        expect(pulsingDot).toBeInTheDocument();
      });
    });

    it('should display grey dot when disconnected', async () => {
      mockUseApplicationWebSocket.mockReturnValue({
        connected: false,
        error: null
      });

      const { container } = render(<PrerequisiteChecklist applicationId={mockApplicationId} />);

      await waitFor(() => {
        const greyDot = container.querySelector('.bg-gray-300');
        expect(greyDot).toBeInTheDocument();
      });
    });
  });

  describe('Stage Completion Events', () => {
    it('should update checklist when stage:completed event is received', async () => {
      const onStatusChange = vi.fn();
      
      render(
        <PrerequisiteChecklist 
          applicationId={mockApplicationId} 
          onStatusChange={onStatusChange}
        />
      );

      // Wait for initial load
      await waitFor(() => {
        expect(screen.getByText('Technical Interview')).toBeInTheDocument();
      });

      // Trigger stage completion event
      const event: StageCompletedEvent = {
        applicationId: mockApplicationId,
        stageId: 'stage-1',
        stageType: 'technical',
        completedAt: '2026-07-27T10:00:00Z',
        completedBy: 'user-123'
      };

      mockWebSocketHandlers.onStageCompleted?.(event);

      // Should update status to completed (green checkmark appears)
      await waitFor(() => {
        const technicalStage = screen.getByText('Technical Interview').closest('li');
        const checkmark = technicalStage?.querySelector('svg.text-green-500');
        expect(checkmark).toBeInTheDocument();
      });
    });

    it('should call onStatusChange when stage completion changes overall status', async () => {
      const onStatusChange = vi.fn();
      
      // Start with all but one stage completed
      const nearlyCompleteStatus: PrerequisiteStatus = {
        isComplete: false,
        items: [
          { id: 'stage-1', type: 'interview_stage', label: 'Technical Interview', status: 'completed' },
          { id: 'stage-2', type: 'interview_stage', label: 'Behavioral Interview', status: 'pending' },
          { id: 'assessment-1', type: 'assessment', label: 'Coding Assessment', status: 'completed' }
        ]
      };

      vi.mocked(prerequisitesApi.fetchPrerequisites).mockResolvedValue(nearlyCompleteStatus);

      render(
        <PrerequisiteChecklist 
          applicationId={mockApplicationId} 
          onStatusChange={onStatusChange}
        />
      );

      // Wait for initial load
      await waitFor(() => {
        expect(onStatusChange).toHaveBeenLastCalledWith(false);
      });

      // Complete the last stage
      const event: StageCompletedEvent = {
        applicationId: mockApplicationId,
        stageId: 'stage-2',
        stageType: 'behavioral',
        completedAt: '2026-07-27T10:00:00Z',
        completedBy: 'user-123'
      };

      mockWebSocketHandlers.onStageCompleted?.(event);

      // Should call onStatusChange with true (all complete)
      await waitFor(() => {
        expect(onStatusChange).toHaveBeenLastCalledWith(true);
      });
    });

    it('should ignore events for different applicationId', async () => {
      const onStatusChange = vi.fn();
      
      render(
        <PrerequisiteChecklist 
          applicationId={mockApplicationId} 
          onStatusChange={onStatusChange}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Technical Interview')).toBeInTheDocument();
      });

      const initialCallCount = onStatusChange.mock.calls.length;

      // Event for different application
      const event: StageCompletedEvent = {
        applicationId: 'different-app-id',
        stageId: 'stage-1',
        stageType: 'technical',
        completedAt: '2026-07-27T10:00:00Z',
        completedBy: 'user-123'
      };

      mockWebSocketHandlers.onStageCompleted?.(event);

      // Should not call onStatusChange again
      await waitFor(() => {
        expect(onStatusChange.mock.calls.length).toBe(initialCallCount);
      });
    });

    it('should match stage by type in label (case-insensitive)', async () => {
      render(<PrerequisiteChecklist applicationId={mockApplicationId} />);

      await waitFor(() => {
        expect(screen.getByText('Technical Interview')).toBeInTheDocument();
      });

      const event: StageCompletedEvent = {
        applicationId: mockApplicationId,
        stageId: 'any-id',
        stageType: 'technical', // Should match "Technical Interview"
        completedAt: '2026-07-27T10:00:00Z',
        completedBy: 'user-123'
      };

      mockWebSocketHandlers.onStageCompleted?.(event);

      await waitFor(() => {
        const technicalStage = screen.getByText('Technical Interview').closest('li');
        const checkmark = technicalStage?.querySelector('svg.text-green-500');
        expect(checkmark).toBeInTheDocument();
      });
    });
  });

  describe('Assessment Completion Events', () => {
    it('should update checklist when assessment:completed event is received', async () => {
      render(<PrerequisiteChecklist applicationId={mockApplicationId} />);

      await waitFor(() => {
        expect(screen.getByText('Coding Assessment')).toBeInTheDocument();
      });

      const event: AssessmentCompletedEvent = {
        applicationId: mockApplicationId,
        assessmentId: 'assessment-1',
        score: 85,
        completedAt: '2026-07-27T10:00:00Z'
      };

      mockWebSocketHandlers.onAssessmentCompleted?.(event);

      await waitFor(() => {
        const assessment = screen.getByText('Coding Assessment').closest('li');
        const checkmark = assessment?.querySelector('svg.text-green-500');
        expect(checkmark).toBeInTheDocument();
      });
    });

    it('should call onStatusChange when assessment completion changes overall status', async () => {
      const onStatusChange = vi.fn();
      
      const nearlyCompleteStatus: PrerequisiteStatus = {
        isComplete: false,
        items: [
          { id: 'stage-1', type: 'interview_stage', label: 'Technical Interview', status: 'completed' },
          { id: 'assessment-1', type: 'assessment', label: 'Coding Assessment', status: 'pending' }
        ]
      };

      vi.mocked(prerequisitesApi.fetchPrerequisites).mockResolvedValue(nearlyCompleteStatus);

      render(
        <PrerequisiteChecklist 
          applicationId={mockApplicationId} 
          onStatusChange={onStatusChange}
        />
      );

      await waitFor(() => {
        expect(onStatusChange).toHaveBeenLastCalledWith(false);
      });

      const event: AssessmentCompletedEvent = {
        applicationId: mockApplicationId,
        assessmentId: 'assessment-1',
        score: 85,
        completedAt: '2026-07-27T10:00:00Z'
      };

      mockWebSocketHandlers.onAssessmentCompleted?.(event);

      await waitFor(() => {
        expect(onStatusChange).toHaveBeenLastCalledWith(true);
      });
    });
  });

  describe('Visual Feedback', () => {
    it('should highlight item when updated via WebSocket', async () => {
      const { container } = render(<PrerequisiteChecklist applicationId={mockApplicationId} />);

      await waitFor(() => {
        expect(screen.getByText('Technical Interview')).toBeInTheDocument();
      });

      const event: StageCompletedEvent = {
        applicationId: mockApplicationId,
        stageId: 'stage-1',
        stageType: 'technical',
        completedAt: '2026-07-27T10:00:00Z',
        completedBy: 'user-123'
      };

      mockWebSocketHandlers.onStageCompleted?.(event);

      // Should add highlight class
      await waitFor(() => {
        const highlightedItem = container.querySelector('li.bg-green-50');
        expect(highlightedItem).toBeInTheDocument();
      });
    });

    it('should remove highlight after 3 seconds', async () => {
      vi.useFakeTimers();
      
      const { container } = render(<PrerequisiteChecklist applicationId={mockApplicationId} />);

      await waitFor(() => {
        expect(screen.getByText('Technical Interview')).toBeInTheDocument();
      });

      const event: StageCompletedEvent = {
        applicationId: mockApplicationId,
        stageId: 'stage-1',
        stageType: 'technical',
        completedAt: '2026-07-27T10:00:00Z',
        completedBy: 'user-123'
      };

      mockWebSocketHandlers.onStageCompleted?.(event);

      // Initially highlighted
      await waitFor(() => {
        const highlightedItem = container.querySelector('li.bg-green-50');
        expect(highlightedItem).toBeInTheDocument();
      }, { timeout: 10000 });

      // Fast-forward 3 seconds
      vi.runAllTimers();

      // Highlight should be removed - wait with longer timeout
      await waitFor(() => {
        const highlightedItem = container.querySelector('li.bg-green-50');
        expect(highlightedItem).not.toBeInTheDocument();
      }, { timeout: 10000 });

      vi.useRealTimers();
    }, 15000); // Increase test timeout
  });

  describe('Polling Fallback', () => {
    it('should poll for updates when WebSocket is disconnected', async () => {
      vi.useFakeTimers();

      mockUseApplicationWebSocket.mockReturnValue({
        connected: false,
        error: null
      });

      render(<PrerequisiteChecklist applicationId={mockApplicationId} />);

      // Wait for initial load
      await waitFor(() => {
        expect(prerequisitesApi.fetchPrerequisites).toHaveBeenCalledTimes(1);
      });

      // Fast-forward 30 seconds and run all pending timers
      vi.advanceTimersByTime(30000);
      await vi.runAllTimersAsync();

      // Should poll for updates
      await waitFor(() => {
        expect(prerequisitesApi.fetchPrerequisites).toHaveBeenCalledTimes(2);
      }, { timeout: 10000 });

      vi.useRealTimers();
    }, 15000);

    it('should not poll when WebSocket is connected', async () => {
      vi.useFakeTimers();

      mockUseApplicationWebSocket.mockReturnValue({
        connected: true,
        error: null
      });

      render(<PrerequisiteChecklist applicationId={mockApplicationId} />);

      // Wait for initial load
      await waitFor(() => {
        expect(prerequisitesApi.fetchPrerequisites).toHaveBeenCalledTimes(1);
      });

      // Fast-forward 30 seconds
      vi.advanceTimersByTime(30000);
      await vi.runAllTimersAsync();

      // Should NOT poll (WebSocket is active)
      expect(prerequisitesApi.fetchPrerequisites).toHaveBeenCalledTimes(1);

      vi.useRealTimers();
    }, 15000);

    it('should stop polling when WebSocket reconnects', async () => {
      vi.useFakeTimers();

      // Start disconnected
      const mockReturn = { connected: false, error: null };
      mockUseApplicationWebSocket.mockReturnValue(mockReturn);

      const { rerender } = render(<PrerequisiteChecklist applicationId={mockApplicationId} />);

      await waitFor(() => {
        expect(prerequisitesApi.fetchPrerequisites).toHaveBeenCalledTimes(1);
      });

      // Fast-forward 30 seconds - should poll
      vi.advanceTimersByTime(30000);
      await vi.runAllTimersAsync();
      
      await waitFor(() => {
        expect(prerequisitesApi.fetchPrerequisites).toHaveBeenCalledTimes(2);
      }, { timeout: 10000 });

      // Reconnect WebSocket
      mockReturn.connected = true;
      rerender(<PrerequisiteChecklist applicationId={mockApplicationId} />);
      
      // Clear the call count check
      const callsBeforeReconnect = prerequisitesApi.fetchPrerequisites.mock.calls.length;

      // Fast-forward another 30 seconds - should NOT poll
      vi.advanceTimersByTime(30000);
      await vi.runAllTimersAsync();
      
      expect(prerequisitesApi.fetchPrerequisites).toHaveBeenCalledTimes(callsBeforeReconnect);

      vi.useRealTimers();
    }, 20000);
  });

  describe('Accessibility', () => {
    it('should announce stage completion to screen readers', async () => {
      render(<PrerequisiteChecklist applicationId={mockApplicationId} />);

      await waitFor(() => {
        expect(screen.getByText('Technical Interview')).toBeInTheDocument();
      });

      const event: StageCompletedEvent = {
        applicationId: mockApplicationId,
        stageId: 'stage-1',
        stageType: 'technical',
        completedAt: '2026-07-27T10:00:00Z',
        completedBy: 'user-123'
      };

      mockWebSocketHandlers.onStageCompleted?.(event);

      // Check that announcement was made (status role element added)
      await waitFor(() => {
        const statusElements = document.querySelectorAll('[role="status"]');
        const hasAnnouncement = Array.from(statusElements).some(
          el => el.textContent?.includes('Technical Interview completed')
        );
        expect(hasAnnouncement).toBe(true);
      }, { timeout: 10000 });
    }, 15000); // Increase test timeout

    it('should announce assessment completion to screen readers', async () => {
      render(<PrerequisiteChecklist applicationId={mockApplicationId} />);

      await waitFor(() => {
        expect(screen.getByText('Coding Assessment')).toBeInTheDocument();
      });

      const event: AssessmentCompletedEvent = {
        applicationId: mockApplicationId,
        assessmentId: 'assessment-1',
        score: 85,
        completedAt: '2026-07-27T10:00:00Z'
      };

      mockWebSocketHandlers.onAssessmentCompleted?.(event);

      await waitFor(() => {
        const statusElements = document.querySelectorAll('[role="status"]');
        const hasAnnouncement = Array.from(statusElements).some(
          el => el.textContent?.includes('Coding Assessment completed')
        );
        expect(hasAnnouncement).toBe(true);
      }, { timeout: 10000 });
    }, 15000); // Increase test timeout
  });
});
