import React, { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';

/**
 * Socket.IO Client Hook
 * 
 * Creates and manages a Socket.IO client connection with authentication.
 * Automatically connects/disconnects based on auth token availability.
 * 
 * @param authToken - JWT authentication token (null if not authenticated)
 * @returns Socket instance or null if not connected
 */
export function useSocketClient(authToken: string | null): any {
  const socketRef = useRef<any>(null);

  useEffect(() => {
    // Don't connect if no auth token
    if (!authToken) {
      return;
    }

    // Create Socket.IO client
    const socket = io(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000', {
      auth: { token: authToken },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5
    });

    // Connection event handlers
    socket.on('connected', (data) => {
      console.log('[socket] Connected', data);
    });

    socket.on('connect_error', (error) => {
      console.error('[socket] Connection error', error);
    });

    socket.on('disconnect', (reason) => {
      console.log('[socket] Disconnected', reason);
    });

    socketRef.current = socket;

    // Cleanup on unmount or auth token change
    return () => {
      console.log('[socket] Closing connection');
      (socket as any).close();
      socketRef.current = null;
    };
  }, [authToken]);

  return socketRef.current;
}
