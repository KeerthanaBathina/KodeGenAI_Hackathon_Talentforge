/**
 * WebSocket Client Utility
 * 
 * Manages Socket.IO connection with automatic reconnection
 * and event handling for real-time updates.
 */

import { io } from 'socket.io-client';

class WebSocketClient {
  private socket: any = null;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 5;
  private readonly reconnectionDelay = 1000;
  private readonly reconnectionDelayMax = 5000;

  /**
   * Get WebSocket server URL from environment or current origin
   */
  private getServerUrl(): string {
    // Check for explicit WebSocket URL
    if (typeof window !== 'undefined') {
      const wsUrl = process.env.NEXT_PUBLIC_WS_URL;
      if (wsUrl) {
        return wsUrl;
      }
      
      // Fall back to current origin
      return window.location.origin;
    }
    
    return '';
  }

  /**
   * Connect to WebSocket server
   * Creates a new connection or returns existing connected socket
   */
  connect(): any {
    if (this.socket?.connected) {
      return this.socket;
    }

    const serverUrl = this.getServerUrl();
    
    this.socket = io(serverUrl, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: this.reconnectionDelay,
      reconnectionDelayMax: this.reconnectionDelayMax,
      reconnectionAttempts: this.maxReconnectAttempts,
      // Use credentials for authentication
      withCredentials: true
    });

    this.setupEventHandlers();
    
    return this.socket;
  }

  /**
   * Set up global event handlers for connection lifecycle
   */
  private setupEventHandlers(): void {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      console.log('[WebSocket] Connected');
      this.reconnectAttempts = 0;
    });

    this.socket.on('disconnect', (reason) => {
      console.warn('[WebSocket] Disconnected:', reason);
    });

    this.socket.on('connect_error', (error) => {
      console.error('[WebSocket] Connection error:', error.message);
      this.reconnectAttempts++;
      
      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        console.error('[WebSocket] Max reconnection attempts reached');
      }
    });

    this.socket.on('reconnect', (attemptNumber) => {
      console.log(`[WebSocket] Reconnected after ${attemptNumber} attempts`);
      this.reconnectAttempts = 0;
    });

    this.socket.on('reconnect_attempt', (attemptNumber) => {
      console.log(`[WebSocket] Reconnection attempt ${attemptNumber}/${this.maxReconnectAttempts}`);
    });

    this.socket.on('reconnect_failed', () => {
      console.error('[WebSocket] Reconnection failed after max attempts');
    });
  }

  /**
   * Disconnect from WebSocket server
   */
  disconnect(): void {
    if (this.socket) {
      console.log('[WebSocket] Disconnecting');
      this.socket.disconnect();
      this.socket = null;
      this.reconnectAttempts = 0;
    }
  }

  /**
   * Get current socket instance
   */
  getSocket(): Socket | null {
    return this.socket;
  }

  /**
   * Check if socket is connected
   */
  isConnected(): boolean {
    return this.socket?.connected ?? false;
  }
}

// Export singleton instance
export const wsClient = new WebSocketClient();
