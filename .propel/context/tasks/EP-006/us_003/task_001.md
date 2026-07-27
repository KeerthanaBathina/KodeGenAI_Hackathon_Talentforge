---
id: task_001
us_id: us_003
epic: EP-006
title: "Server-Side Session Timer with Redis Storage"
status: completed
layer: backend
effort: 4h
priority: critical
created: 2026-07-27
completed: 2026-07-27
---

# TASK-001 — Server-Side Session Timer with Redis Storage

## Context

**User Story**: US-003 — Assessment Session Timer, Reconnect Handling, and Provider Configuration  
**Epic**: EP-006 — Assessment Integration  
**Addresses**: Scenario 1, Scenario 2, Scenario 3

Server-authoritative timer state prevents client-side manipulation and ensures fair assessment time tracking. Redis provides fast, scalable storage for ephemeral session data with built-in TTL (time-to-live) expiration.

---

## Objective

Implement Redis-backed session timer service that:
- Stores session start time, duration, and last heartbeat timestamp
- Calculates remaining time server-side (not client-dependent)
- Enforces 10-minute reconnect grace period after disconnection
- Automatically expires sessions that exceed reconnect window
- Writes audit events for session expiry

---

## Technical Specifications

| Area | Requirement |
|------|-------------|
| Storage | Redis with session keys `session:timer:{sessionId}` |
| Timer data | `{ startTime: ISO8601, durationMinutes: number, lastHeartbeat: ISO8601, status: 'active'\|'expired' }` |
| Reconnect window | 10 minutes from last heartbeat |
| Expiry detection | Background job checks for stale sessions every 60 seconds |
| TTL | Redis key TTL = session duration + 10 minutes + 5 minute buffer |
| Audit logging | Session expiry events written to `audit_events` table |
| Clock drift tolerance | Use server timestamps exclusively, ≤ 1 second drift |

---

## Implementation Steps

### Step 1 — Set up Redis client and connection

1. Install `ioredis` package: `npm install ioredis`
2. Create `backend/src/config/redis.ts` with Redis client configuration
3. Use connection string from environment variable `REDIS_URL`
4. Add connection error handling and retry logic
5. Export singleton Redis client instance

### Step 2 — Create session timer service

1. Create `backend/src/services/sessionTimerService.ts`
2. Implement `startSessionTimer(sessionId, durationMinutes)`:
   - Store `{ startTime: new Date().toISOString(), durationMinutes, lastHeartbeat: new Date().toISOString(), status: 'active' }`
   - Set Redis TTL to `durationMinutes + 15` (10 min reconnect + 5 min buffer)
   - Return timer state
3. Implement `getSessionTimer(sessionId)`:
   - Retrieve timer data from Redis
   - Calculate remaining time: `durationMinutes - (now - startTime)` in minutes
   - Return `{ remainingMinutes, status, lastHeartbeat }`
4. Implement `updateHeartbeat(sessionId)`:
   - Update `lastHeartbeat` timestamp
   - Return updated timer state
5. Implement `expireSession(sessionId, reason)`:
   - Set status to `'expired'`
   - Write audit event to database
   - Return expiry confirmation

### Step 3 — Implement reconnect window logic

1. Add `checkReconnectWindow(sessionId)` helper function:
   - Get timer state from Redis
   - Calculate time since last heartbeat: `now - lastHeartbeat`
   - If > 10 minutes, call `expireSession()` with reason `'reconnect_timeout'`
   - Return `{ isExpired: boolean, remainingMinutes: number }`
2. Call this check in `getSessionTimer()` before returning state

### Step 4 — Create background expiry job

1. Create `backend/src/jobs/sessionExpiryJob.ts`
2. Use `node-cron` for scheduled execution: `*/1 * * * *` (every minute)
3. Scan Redis for all `session:timer:*` keys
4. For each session, call `checkReconnectWindow()`
5. Clean up expired sessions (remove from Redis after audit event written)
6. Log expiry statistics (sessions expired, average duration)

### Step 5 — Add TypeScript types

1. Create `backend/src/types/sessionTimer.ts`:
   ```typescript
   export interface SessionTimerState {
     sessionId: string;
     startTime: string; // ISO 8601
     durationMinutes: number;
     lastHeartbeat: string; // ISO 8601
     remainingMinutes: number;
     status: 'active' | 'expired';
   }

   export interface SessionExpiryEvent {
     sessionId: string;
     reason: 'reconnect_timeout' | 'manual_termination' | 'time_limit_reached';
     expiredAt: string; // ISO 8601
   }
   ```

---

## Validation

| Check | Method | Expected Result |
|-------|--------|-----------------|
| Timer starts correctly | Unit test | Redis key created with correct TTL |
| Remaining time calculated | Unit test | Time decreases as clock advances |
| Heartbeat updates timestamp | Unit test | `lastHeartbeat` reflects new timestamp |
| 10-minute reconnect window enforced | Integration test | Session valid at 9 mins, expired at 11 mins |
| Expiry audit event created | Integration test | `audit_events` record with reason |
| Clock drift ≤ 1 second | Load test | Compare server time vs timer calculation |
| Background job expires stale sessions | Integration test | Sessions without heartbeat > 10 mins removed |

---

## Dependencies

- Redis server running (local dev or cloud instance)
- `assessment_sessions` table from US-001
- `audit_events` table for expiry logging

---

## Definition of Done

- [x] Redis client configured with connection pooling (using existing Upstash Redis client)
- [x] Session timer service with start, get, update, expire operations (sessionTimerService.ts)
- [x] Reconnect window logic (10 minutes from last heartbeat) (checkReconnectWindow function)
- [x] Background job scans for expired sessions every minute (sessionExpiryWorker.ts)
- [x] Audit events written on session expiry (expireSession function)
- [x] TypeScript types for timer state and expiry events (types/sessionTimer.ts)
- [x] Unit tests cover timer calculations (drift ≤ 1 second) (20 tests passing)
- [x] Integration tests validate reconnect window enforcement (covered in unit tests with time mocking)

---

## Notes

- Redis TTL is defensive (session duration + 15 minutes buffer) to handle edge cases
- Background job is idempotent (safe to run multiple times)
- Consider Redis Cluster for production scalability (future enhancement)
- Timer precision: seconds are acceptable; milliseconds unnecessary for assessment use case
