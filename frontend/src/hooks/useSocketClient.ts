import React, { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { resolveSocketBaseUrl } from '@/lib/api/url';

/**
 * Socket.IO Client Hook
 * 
 * Creates and manages a Socket.IO client connection with authentication.
 * Automatically connects/disconnects based on auth token availability.
 * 
 * @param authToken - JWT authentication token (null if not authenticated)
 * @returns Socket instance or null if not connected
 */
export function useSocketClient(authToken: string | null): Socket | null {
  const socketRef = useRef<Socket | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    // Don't connect if no auth token
    if (!authToken) {
      return;
    }

    // Create Socket.IO client
    const socketClient = io(resolveSocketBaseUrl(), {
      auth: { token: authToken },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5
    });

    // Connection event handlers
    socketClient.on('connected', (data) => {
      console.log('[socket] Connected', data);
    });

    socketClient.on('connect_error', (error) => {
      console.error('[socket] Connection error', error);
    });

    socketClient.on('disconnect', (reason) => {
      console.log('[socket] Disconnected', reason);
    });

    socketRef.current = socketClient;
    setSocket(socketClient);

    // Cleanup on unmount or auth token change
    return () => {
      console.log('[socket] Closing connection');
      socketClient.close();
      socketRef.current = null;
      setSocket(null);
    };
  }, [authToken]);

  return socket;
}
