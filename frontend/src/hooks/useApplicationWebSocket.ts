/**
 * useApplicationWebSocket Hook
 * 
 * React hook for subscribing to application-specific WebSocket events.
 * Automatically joins the application room on mount and cleans up on unmount.
 */

import { useEffect, useState, useRef } from 'react';
import { wsClient } from '@/lib/websocket/client';
import type { StageCompletedEvent, AssessmentCompletedEvent } from '@/types/applicationEvents';

export interface ApplicationEventHandlers {
  onStageCompleted?: (data: StageCompletedEvent) => void;
  onAssessmentCompleted?: (data: AssessmentCompletedEvent) => void;
}

export interface UseApplicationWebSocketReturn {
  connected: boolean;
  error: string | null;
}

/**
 * Hook to subscribe to application-specific WebSocket events
 * 
 * @param applicationId - The application ID to subscribe to
 * @param handlers - Event handler callbacks
 * @returns Connection state and error information
 */
export function useApplicationWebSocket(
  applicationId: string,
  handlers: ApplicationEventHandlers
): UseApplicationWebSocketReturn {
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<any>(null);

  // Use refs to avoid recreating effect when handlers change
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!applicationId) {
      setError('Application ID is required');
      return;
    }

    let socket: any = null;

    try {
      // Connect to WebSocket server
      socket = wsClient.connect();
      socketRef.current = socket;

      // Set initial connection state
      setConnected(socket.connected);
      setError(null);

      // Join application-specific room
      console.log(`[WebSocket] Joining application room: ${applicationId}`);
      socket.emit('join:application', applicationId);

      // Handle room join confirmation
      const handleJoined = (data: { applicationId: string }) => {
        console.log(`[WebSocket] Joined application room: ${data.applicationId}`);
      };

      // Handle stage completion events
      const handleStageCompleted = (data: StageCompletedEvent) => {
        console.log('[WebSocket] Stage completed:', data);
        
        // Only process events for this application
        if (data.applicationId === applicationId) {
          handlersRef.current.onStageCompleted?.(data);
        }
      };

      // Handle assessment completion events
      const handleAssessmentCompleted = (data: AssessmentCompletedEvent) => {
        console.log('[WebSocket] Assessment completed:', data);
        
        // Only process events for this application
        if (data.applicationId === applicationId) {
          handlersRef.current.onAssessmentCompleted?.(data);
        }
      };

      // Handle connection state changes
      const handleConnect = () => {
        console.log('[WebSocket] Connected in hook');
        setConnected(true);
        setError(null);
        
        // Rejoin room after reconnection
        if (socket && applicationId) {
          console.log(`[WebSocket] Rejoining application room: ${applicationId}`);
          socket.emit('join:application', applicationId);
        }
      };

      const handleDisconnect = (reason: string) => {
        console.log('[WebSocket] Disconnected in hook:', reason);
        setConnected(false);
      };

      const handleError = (err: Error) => {
        console.error('[WebSocket] Error in hook:', err);
        setError(err.message || 'WebSocket connection error');
      };

      // Subscribe to events
      socket.on('joined:application', handleJoined);
      socket.on('stage:completed', handleStageCompleted);
      socket.on('assessment:completed', handleAssessmentCompleted);
      socket.on('connect', handleConnect);
      socket.on('disconnect', handleDisconnect);
      socket.on('connect_error', handleError);

      // Cleanup function
      return () => {
        if (socket) {
          console.log(`[WebSocket] Leaving application room: ${applicationId}`);
          
          // Leave the room
          socket.emit('leave:application', applicationId);
          
          // Unsubscribe from events
          socket.off('joined:application', handleJoined);
          socket.off('stage:completed', handleStageCompleted);
          socket.off('assessment:completed', handleAssessmentCompleted);
          socket.off('connect', handleConnect);
          socket.off('disconnect', handleDisconnect);
          socket.off('connect_error', handleError);
        }
        
        socketRef.current = null;
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'WebSocket connection failed';
      console.error('[WebSocket] Setup error:', errorMessage);
      setError(errorMessage);
      setConnected(false);
    }
  }, [applicationId]); // Only re-run when applicationId changes

  return { connected, error };
}
