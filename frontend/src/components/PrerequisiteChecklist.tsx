/**
 * PrerequisiteChecklist Component
 * 
 * Displays a visual checklist of evaluation stage completion status.
 * Shows green ticks for completed items and grey circles for pending items.
 * 
 * Features:
 * - Real-time status updates (via exposed update method for WebSocket integration)
 * - Loading and error states
 * - Accessibility support (ARIA labels, live regions)
 * - Status change callbacks
 */

'use client';

import React, { useState, useEffect, useCallback, useImperativeHandle, forwardRef } from 'react';
import type { PrerequisiteStatus, PrerequisiteItem } from '@/lib/api/prerequisites';
import { fetchPrerequisites, PrerequisiteError } from '@/lib/api/prerequisites';
import { useApplicationWebSocket } from '@/hooks/useApplicationWebSocket';
import type { StageCompletedEvent, AssessmentCompletedEvent } from '@/types/applicationEvents';

export interface PrerequisiteChecklistProps {
  applicationId: string;
  onStatusChange?: (isComplete: boolean) => void;
}

export interface PrerequisiteChecklistHandle {
  updateItemStatus: (itemId: string, newStatus: 'completed' | 'pending') => void;
  refresh: () => Promise<void>;
}

/**
 * PrerequisiteChecklist component with imperative handle for WebSocket updates
 */
export const PrerequisiteChecklist = forwardRef<
  PrerequisiteChecklistHandle,
  PrerequisiteChecklistProps
>(function PrerequisiteChecklist({ applicationId, onStatusChange }, ref) {
  const [status, setStatus] = useState<PrerequisiteStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recentlyUpdated, setRecentlyUpdated] = useState<Set<string>>(new Set());

  // Load prerequisites from API
  const loadPrerequisites = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const data = await fetchPrerequisites(applicationId);
      
      setStatus(data);
      onStatusChange?.(data.isComplete);
      
    } catch (err) {
      const errorMessage = err instanceof PrerequisiteError
        ? err.message
        : 'Failed to load prerequisites';
      
      setError(errorMessage);
      
    } finally {
      setLoading(false);
    }
  }, [applicationId, onStatusChange]);

  // Initial load
  useEffect(() => {
    loadPrerequisites();
  }, [loadPrerequisites]);

  /**
   * Handle stage completion event from WebSocket
   */
  const handleStageCompleted = useCallback((event: StageCompletedEvent) => {
    console.log('[PrerequisiteChecklist] Stage completed event:', event);
    
    setStatus((prev) => {
      if (!prev) return prev;

      // Find item by matching stageType in label (e.g., "Technical Interview" contains "technical")
      const stageLabel = event.stageType.toLowerCase();
      const updatedItems = prev.items.map((item) => {
        const itemLabel = item.label.toLowerCase();
        if (itemLabel.includes(stageLabel)) {
          return { ...item, status: 'completed' as const };
        }
        return item;
      });

      const updated = {
        ...prev,
        items: updatedItems
      };

      // Recalculate overall completion
      updated.isComplete = updated.items.every((item) => item.status === 'completed');
      
      onStatusChange?.(updated.isComplete);
      
      // Announce to screen readers
      const itemLabel = updatedItems.find(item => item.label.toLowerCase().includes(stageLabel))?.label;
      if (itemLabel) {
        announceUpdate(`${itemLabel} completed`);
        
        // Highlight the updated item for 3 seconds
        const itemId = updatedItems.find(item => item.label === itemLabel)?.id;
        if (itemId) {
          setRecentlyUpdated((prev) => new Set(prev).add(itemId));
          setTimeout(() => {
            setRecentlyUpdated((prev) => {
              const next = new Set(prev);
              next.delete(itemId);
              return next;
            });
          }, 3000);
        }
      }

      return updated;
    });
  }, [onStatusChange]);

  /**
   * Handle assessment completion event from WebSocket
   */
  const handleAssessmentCompleted = useCallback((event: AssessmentCompletedEvent) => {
    console.log('[PrerequisiteChecklist] Assessment completed event:', event);
    
    setStatus((prev) => {
      if (!prev) return prev;

      // Find assessment item
      const updatedItems = prev.items.map((item) => {
        if (item.type === 'assessment') {
          return { ...item, status: 'completed' as const };
        }
        return item;
      });

      const updated = {
        ...prev,
        items: updatedItems
      };

      // Recalculate overall completion
      updated.isComplete = updated.items.every((item) => item.status === 'completed');
      
      onStatusChange?.(updated.isComplete);
      
      // Announce to screen readers
      const assessmentItem = updatedItems.find(item => item.type === 'assessment');
      if (assessmentItem) {
        announceUpdate(`${assessmentItem.label} completed`);
        
        // Highlight the updated item for 3 seconds
        setRecentlyUpdated((prev) => new Set(prev).add(assessmentItem.id));
        setTimeout(() => {
          setRecentlyUpdated((prev) => {
            const next = new Set(prev);
            next.delete(assessmentItem.id);
            return next;
          });
        }, 3000);
      }

      return updated;
    });
  }, [onStatusChange]);

  // Subscribe to WebSocket events for real-time updates
  const { connected: wsConnected, error: wsError } = useApplicationWebSocket(applicationId, {
    onStageCompleted: handleStageCompleted,
    onAssessmentCompleted: handleAssessmentCompleted
  });

  // Polling fallback when WebSocket is not connected
  useEffect(() => {
    if (wsConnected) return; // WebSocket working, skip polling

    const interval = setInterval(async () => {
      try {
        console.log('[PrerequisiteChecklist] Polling for updates (WebSocket disconnected)');
        const updated = await fetchPrerequisites(applicationId);
        setStatus(updated);
        onStatusChange?.(updated.isComplete);
      } catch (err) {
        console.error('[PrerequisiteChecklist] Polling failed:', err);
        // Don't set error state here, as it might be transient
      }
    }, 30000); // Poll every 30 seconds

    return () => clearInterval(interval);
  }, [wsConnected, applicationId, onStatusChange]);

  /**
   * Update status of a single item (called by WebSocket events)
   */
  const updateItemStatus = useCallback(
    (itemId: string, newStatus: 'completed' | 'pending') => {
      setStatus((prev) => {
        if (!prev) return prev;

        const updated = {
          ...prev,
          items: prev.items.map((item) =>
            item.id === itemId ? { ...item, status: newStatus } : item
          )
        };

        // Recalculate overall completion
        updated.isComplete = updated.items.every((item) => item.status === 'completed');
        
        onStatusChange?.(updated.isComplete);
        announceUpdate(`Prerequisite ${itemId} is now ${newStatus}`);

        // Highlight the updated item for 3 seconds
        setRecentlyUpdated((prev) => new Set(prev).add(itemId));
        setTimeout(() => {
          setRecentlyUpdated((prev) => {
            const next = new Set(prev);
            next.delete(itemId);
            return next;
          });
        }, 3000);

        return updated;
      });
    },
    [onStatusChange]
  );

  // Expose methods via ref for parent components (WebSocket integration)
  useImperativeHandle(
    ref,
    () => ({
      updateItemStatus,
      refresh: loadPrerequisites
    }),
    [updateItemStatus, loadPrerequisites]
  );

  // Announce changes to screen readers
  const announceUpdate = (message: string) => {
    const announcement = document.createElement('div');
    announcement.setAttribute('role', 'status');
    announcement.setAttribute('aria-live', 'polite');
    announcement.className = 'sr-only';
    announcement.textContent = message;
    
    document.body.appendChild(announcement);
    
    setTimeout(() => {
      document.body.removeChild(announcement);
    }, 1000);
  };

  // Render loading state
  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-6 w-64 bg-gray-200 animate-pulse rounded" />
        <div className="space-y-2">
          <div className="h-5 w-full bg-gray-100 animate-pulse rounded" />
          <div className="h-5 w-full bg-gray-100 animate-pulse rounded" />
          <div className="h-5 w-full bg-gray-100 animate-pulse rounded" />
        </div>
      </div>
    );
  }

  // Render error state
  if (error) {
    return (
      <div 
        className="text-red-600 bg-red-50 border border-red-200 rounded-lg p-4"
        role="alert"
      >
        <p className="font-medium">Error loading prerequisites</p>
        <p className="text-sm mt-1">{error}</p>
        <button
          onClick={loadPrerequisites}
          className="mt-3 text-sm font-medium text-red-700 hover:text-red-800 underline"
        >
          Try again
        </button>
      </div>
    );
  }

  // Render empty state
  if (!status || status.items.length === 0) {
    return (
      <div className="text-gray-600 bg-gray-50 border border-gray-200 rounded-lg p-4">
        <p className="text-sm">No prerequisites required for this application.</p>
      </div>
    );
  }

  // Render checklist
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">
          Prerequisites for Final Decision
        </h3>
        
        {/* WebSocket connection status indicator */}
        <div className="flex items-center gap-2 text-xs text-gray-500">
          {wsConnected ? (
            <>
              <span className="h-2 w-2 bg-green-400 rounded-full animate-pulse" aria-hidden="true"></span>
              <span>Live updates active</span>
            </>
          ) : (
            <>
              <span className="h-2 w-2 bg-gray-300 rounded-full" aria-hidden="true"></span>
              <span>Checking for updates...</span>
            </>
          )}
        </div>
      </div>

      {wsError && (
        <div className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-3 py-2">
          WebSocket: {wsError}. Using polling fallback.
        </div>
      )}

      <ul 
        className="space-y-2" 
        role="list" 
        aria-label="Decision prerequisites"
      >
        {status.items.map((item) => (
          <PrerequisiteItem 
            key={item.id} 
            item={item} 
            isRecentlyUpdated={recentlyUpdated.has(item.id)}
          />
        ))}
      </ul>

      {status.isComplete && (
        <div
          className="bg-green-50 border border-green-200 rounded-lg p-3 mt-4"
          role="status"
          aria-live="polite"
        >
          <div className="flex items-start gap-2">
            <svg
              className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5"
              fill="currentColor"
              viewBox="0 0 20 20"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clipRule="evenodd"
              />
            </svg>
            <p className="text-sm text-green-800">
              All prerequisites complete. You may proceed with the final decision.
            </p>
          </div>
        </div>
      )}
    </div>
  );
});

/**
 * Individual prerequisite item component
 */
interface PrerequisiteItemProps {
  item: PrerequisiteItem;
  isRecentlyUpdated?: boolean;
}

function PrerequisiteItem({ item, isRecentlyUpdated = false }: PrerequisiteItemProps) {
  const isComplete = item.status === 'completed';

  return (
    <li 
      className={`flex items-center gap-3 transition-all duration-300 ${
        isRecentlyUpdated ? 'bg-green-50 rounded-lg p-2 -mx-2' : ''
      }`}
    >
      {/* Status icon */}
      {isComplete ? (
        <svg
          className="h-5 w-5 text-green-500 flex-shrink-0"
          fill="currentColor"
          viewBox="0 0 20 20"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
            clipRule="evenodd"
          />
        </svg>
      ) : (
        <svg
          className="h-5 w-5 text-gray-300 flex-shrink-0"
          fill="none"
          viewBox="0 0 20 20"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <circle cx="10" cy="10" r="8" />
        </svg>
      )}

      {/* Label */}
      <span
        className={
          isComplete
            ? 'text-gray-900 font-medium'
            : 'text-gray-500'
        }
      >
        {item.label}
      </span>

      {/* Scheduled date (if pending) */}
      {item.scheduledDate && !isComplete && (
        <span className="text-xs text-gray-400">
          (Scheduled: {new Date(item.scheduledDate).toLocaleDateString()})
        </span>
      )}

      {/* Screen reader status */}
      <span className="sr-only">
        {isComplete ? 'Complete' : 'Pending'}
      </span>
    </li>
  );
}
