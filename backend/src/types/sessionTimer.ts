/**
 * Session timer types for server-authoritative time tracking
 */

/**
 * Session timer state stored in Redis
 */
export interface SessionTimerState {
  sessionId: string;
  startTime: string; // ISO 8601
  durationMinutes: number;
  lastHeartbeat: string; // ISO 8601
  remainingMinutes: number;
  status: 'active' | 'expired';
}

/**
 * Session expiry event for audit logging
 */
export interface SessionExpiryEvent {
  sessionId: string;
  reason: 'reconnect_timeout' | 'manual_termination' | 'time_limit_reached';
  expiredAt: string; // ISO 8601
}

/**
 * Internal timer data stored in Redis
 */
export interface SessionTimerData {
  startTime: string; // ISO 8601
  durationMinutes: number;
  lastHeartbeat: string; // ISO 8601
  status: 'active' | 'expired';
}

/**
 * Result of reconnect window check
 */
export interface ReconnectWindowCheck {
  isExpired: boolean;
  remainingMinutes: number;
}
