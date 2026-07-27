/**
 * Tests for useApplicationWebSocket hook
 * 
 * Tests WebSocket connection, event subscription, and cleanup.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useApplicationWebSocket } from '../useApplicationWebSocket';
import type { StageCompletedEvent, AssessmentCompletedEvent } from '@/types/applicationEvents';

// Mock the WebSocket client
const mockSocket = {
  connected: false,
  connect: vi.fn(),
  disconnect: vi.fn(),
  emit: vi.fn(),
  on: vi.fn(),
  off: vi.fn()
};

vi.mock('@/lib/websocket/client', () => ({
  wsClient: {
    connect: vi.fn(() => mockSocket),
    disconnect: vi.fn(),
    getSocket: vi.fn(() => mockSocket),
    isConnected: vi.fn(() => mockSocket.connected)
  }
}));

describe('useApplicationWebSocket', () => {
  const applicationId = 'test-app-123';
  let eventHandlers: Record<string, Function>;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Reset mock socket state
    mockSocket.connected = true;
    eventHandlers = {};
    
    // Capture event handlers when they're registered
    mockSocket.on.mockImplementation((event: string, handler: Function) => {
      eventHandlers[event] = handler;
    });
  });

  afterEach(() => {
    eventHandlers = {};
  });

  it('should connect to WebSocket on mount', () => {
    const handlers = {
      onStageCompleted: vi.fn(),
      onAssessmentCompleted: vi.fn()
    };

    renderHook(() => useApplicationWebSocket(applicationId, handlers));

    // Should join the application room
    expect(mockSocket.emit).toHaveBeenCalledWith('join:application', applicationId);
  });

  it('should return connected status', async () => {
    const handlers = {
      onStageCompleted: vi.fn(),
      onAssessmentCompleted: vi.fn()
    };

    const { result } = renderHook(() => useApplicationWebSocket(applicationId, handlers));

    await waitFor(() => {
      expect(result.current.connected).toBe(true);
    });
    
    expect(result.current.error).toBeNull();
  });

  it('should subscribe to stage:completed events', () => {
    const handlers = {
      onStageCompleted: vi.fn(),
      onAssessmentCompleted: vi.fn()
    };

    renderHook(() => useApplicationWebSocket(applicationId, handlers));

    expect(mockSocket.on).toHaveBeenCalledWith('stage:completed', expect.any(Function));
  });

  it('should subscribe to assessment:completed events', () => {
    const handlers = {
      onStageCompleted: vi.fn(),
      onAssessmentCompleted: vi.fn()
    };

    renderHook(() => useApplicationWebSocket(applicationId, handlers));

    expect(mockSocket.on).toHaveBeenCalledWith('assessment:completed', expect.any(Function));
  });

  it('should call onStageCompleted handler when event is received', async () => {
    const onStageCompleted = vi.fn();
    const handlers = {
      onStageCompleted,
      onAssessmentCompleted: vi.fn()
    };

    renderHook(() => useApplicationWebSocket(applicationId, handlers));

    // Simulate receiving a stage:completed event
    const event: StageCompletedEvent = {
      applicationId,
      stageId: 'stage-1',
      stageType: 'technical',
      completedAt: '2026-07-27T10:00:00Z',
      completedBy: 'user-123'
    };

    eventHandlers['stage:completed'](event);

    await waitFor(() => {
      expect(onStageCompleted).toHaveBeenCalledWith(event);
    });
  });

  it('should call onAssessmentCompleted handler when event is received', async () => {
    const onAssessmentCompleted = vi.fn();
    const handlers = {
      onStageCompleted: vi.fn(),
      onAssessmentCompleted
    };

    renderHook(() => useApplicationWebSocket(applicationId, handlers));

    // Simulate receiving an assessment:completed event
    const event: AssessmentCompletedEvent = {
      applicationId,
      assessmentId: 'assessment-1',
      score: 85,
      completedAt: '2026-07-27T10:00:00Z'
    };

    eventHandlers['assessment:completed'](event);

    await waitFor(() => {
      expect(onAssessmentCompleted).toHaveBeenCalledWith(event);
    });
  });

  it('should only process events for the correct applicationId', async () => {
    const onStageCompleted = vi.fn();
    const handlers = {
      onStageCompleted,
      onAssessmentCompleted: vi.fn()
    };

    renderHook(() => useApplicationWebSocket(applicationId, handlers));

    // Event for different application
    const wrongEvent: StageCompletedEvent = {
      applicationId: 'different-app',
      stageId: 'stage-1',
      stageType: 'technical',
      completedAt: '2026-07-27T10:00:00Z',
      completedBy: 'user-123'
    };

    eventHandlers['stage:completed'](wrongEvent);

    // Should not call handler for different applicationId
    await waitFor(() => {
      expect(onStageCompleted).not.toHaveBeenCalled();
    });
  });

  it('should leave application room on unmount', () => {
    const handlers = {
      onStageCompleted: vi.fn(),
      onAssessmentCompleted: vi.fn()
    };

    const { unmount } = renderHook(() => useApplicationWebSocket(applicationId, handlers));

    unmount();

    expect(mockSocket.emit).toHaveBeenCalledWith('leave:application', applicationId);
  });

  it('should unsubscribe from events on unmount', () => {
    const handlers = {
      onStageCompleted: vi.fn(),
      onAssessmentCompleted: vi.fn()
    };

    const { unmount } = renderHook(() => useApplicationWebSocket(applicationId, handlers));

    unmount();

    expect(mockSocket.off).toHaveBeenCalledWith('stage:completed', expect.any(Function));
    expect(mockSocket.off).toHaveBeenCalledWith('assessment:completed', expect.any(Function));
    expect(mockSocket.off).toHaveBeenCalledWith('connect', expect.any(Function));
    expect(mockSocket.off).toHaveBeenCalledWith('disconnect', expect.any(Function));
  });

  it('should rejoin room after reconnection', async () => {
    const handlers = {
      onStageCompleted: vi.fn(),
      onAssessmentCompleted: vi.fn()
    };

    renderHook(() => useApplicationWebSocket(applicationId, handlers));

    // Clear previous calls
    mockSocket.emit.mockClear();

    // Simulate reconnection
    eventHandlers['connect']();

    await waitFor(() => {
      expect(mockSocket.emit).toHaveBeenCalledWith('join:application', applicationId);
    });
  });

  it('should update connected state on disconnect', async () => {
    const handlers = {
      onStageCompleted: vi.fn(),
      onAssessmentCompleted: vi.fn()
    };

    const { result } = renderHook(() => useApplicationWebSocket(applicationId, handlers));

    // Initially connected
    await waitFor(() => {
      expect(result.current.connected).toBe(true);
    });

    // Simulate disconnect
    eventHandlers['disconnect']('transport close');

    await waitFor(() => {
      expect(result.current.connected).toBe(false);
    });
  });

  it('should set error state on connection error', async () => {
    const handlers = {
      onStageCompleted: vi.fn(),
      onAssessmentCompleted: vi.fn()
    };

    const { result } = renderHook(() => useApplicationWebSocket(applicationId, handlers));

    // Simulate connection error
    const error = new Error('Connection failed');
    eventHandlers['connect_error'](error);

    await waitFor(() => {
      expect(result.current.error).toBe('Connection failed');
    });
  });

  it('should handle missing applicationId', () => {
    const handlers = {
      onStageCompleted: vi.fn(),
      onAssessmentCompleted: vi.fn()
    };

    const { result } = renderHook(() => useApplicationWebSocket('', handlers));

    expect(result.current.error).toBe('Application ID is required');
    expect(mockSocket.emit).not.toHaveBeenCalled();
  });

  it('should handle handler updates without reconnecting', async () => {
    const initialHandler = vi.fn();
    const updatedHandler = vi.fn();

    const { rerender } = renderHook(
      ({ handlers }) => useApplicationWebSocket(applicationId, handlers),
      {
        initialProps: {
          handlers: {
            onStageCompleted: initialHandler,
            onAssessmentCompleted: vi.fn()
          }
        }
      }
    );

    // Get initial call count
    const initialCallCount = mockSocket.emit.mock.calls.length;

    // Update handlers
    rerender({
      handlers: {
        onStageCompleted: updatedHandler,
        onAssessmentCompleted: vi.fn()
      }
    });

    // Should not reconnect or rejoin room
    expect(mockSocket.emit.mock.calls.length).toBe(initialCallCount);

    // New handler should be called
    const event: StageCompletedEvent = {
      applicationId,
      stageId: 'stage-1',
      stageType: 'technical',
      completedAt: '2026-07-27T10:00:00Z',
      completedBy: 'user-123'
    };

    eventHandlers['stage:completed'](event);

    await waitFor(() => {
      expect(updatedHandler).toHaveBeenCalledWith(event);
      expect(initialHandler).not.toHaveBeenCalled();
    });
  });
});
