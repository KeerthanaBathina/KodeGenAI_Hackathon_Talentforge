---
id: task_002
us_id: us_003
epic: EP-006
title: "Session Timer API Endpoints"
status: completed
layer: backend
effort: 3h
priority: high
created: 2026-07-27
completed: 2026-07-27
---

# TASK-002 — Session Timer API Endpoints

## Context

**User Story**: US-003 — Assessment Session Timer, Reconnect Handling, and Provider Configuration  
**Epic**: EP-006 — Assessment Integration  
**Addresses**: Scenario 1, Scenario 2, Scenario 3

Frontend timer components need RESTful API endpoints to fetch remaining time and send periodic heartbeats. These endpoints provide server-authoritative timer state and prevent client-side time manipulation.

---

## Objective

Implement REST API endpoints for session timer operations:
- GET remaining time for active sessions
- POST heartbeat to update last-seen timestamp
- Handle reconnect scenarios gracefully
- Return appropriate HTTP status codes for expired/invalid sessions

---

## Technical Specifications

| Area | Requirement |
|------|-------------|
| Endpoints | GET `/api/sessions/:sessionId/timer`, POST `/api/sessions/:sessionId/heartbeat` |
| Authentication | Session token validation (from US-001) |
| Response format | JSON with `{ remainingMinutes, status, lastHeartbeat }` |
| Error codes | 404 (session not found), 410 (session expired), 401 (unauthorized) |
| Rate limiting | 1 heartbeat per 10 seconds per session (prevent abuse) |
| CORS | Allow frontend origin for cross-origin requests |
| Logging | Correlation ID tracking for all timer operations |

---

## Implementation Steps

### Step 1 — Create timer routes file

1. Create `backend/src/routes/sessionTimer.ts`
2. Use Express Router for route definitions
3. Import session timer service from TASK-001
4. Add correlation ID middleware from existing infrastructure

### Step 2 — Implement GET /api/sessions/:sessionId/timer

1. Validate `:sessionId` parameter format (UUID)
2. Call `sessionTimerService.getSessionTimer(sessionId)`
3. Check reconnect window (may trigger expiry)
4. Return JSON response:
   ```json
   {
     "success": true,
     "data": {
       "sessionId": "uuid",
       "remainingMinutes": 42.5,
       "status": "active",
       "lastHeartbeat": "2026-07-27T14:30:00Z"
     }
   }
   ```
5. Handle error cases:
   - Session not found: HTTP 404 with `SESSION_NOT_FOUND` error code
   - Session expired: HTTP 410 with `SESSION_EXPIRED` error code
   - Server error: HTTP 500 with generic error message

### Step 3 — Implement POST /api/sessions/:sessionId/heartbeat

1. Validate `:sessionId` parameter format
2. Check rate limit (max 1 heartbeat per 10 seconds):
   - Use in-memory Map or Redis to track last heartbeat timestamp per session
   - Return HTTP 429 (Too Many Requests) if rate limit exceeded
3. Call `sessionTimerService.updateHeartbeat(sessionId)`
4. Return updated timer state:
   ```json
   {
     "success": true,
     "data": {
       "sessionId": "uuid",
       "remainingMinutes": 42.3,
       "status": "active",
       "lastHeartbeat": "2026-07-27T14:31:00Z"
     }
   }
   ```
5. Handle expired sessions gracefully (return 410 instead of updating)

### Step 4 — Add authentication middleware

1. Create `validateSessionToken` middleware:
   - Extract session token from `Authorization` header or query param
   - Verify token matches database record for `:sessionId`
   - Return HTTP 401 if token invalid or missing
2. Apply to both GET and POST endpoints

### Step 5 — Add request validation middleware

1. Use Zod schema for session ID validation:
   ```typescript
   const SessionIdParamSchema = z.object({
     sessionId: z.string().uuid()
   });
   ```
2. Return HTTP 400 for invalid session ID format

### Step 6 — Integrate routes into Express app

1. Mount timer routes at `/api/sessions` prefix
2. Add CORS configuration for frontend origin
3. Register routes in `backend/src/app.ts`

---

## API Specifications

### GET /api/sessions/:sessionId/timer

**Request**
```http
GET /api/sessions/550e8400-e29b-41d4-a716-446655440000/timer HTTP/1.1
Authorization: Bearer <session_token>
```

**Response (Success - 200 OK)**
```json
{
  "success": true,
  "data": {
    "sessionId": "550e8400-e29b-41d4-a716-446655440000",
    "remainingMinutes": 42.5,
    "status": "active",
    "lastHeartbeat": "2026-07-27T14:30:00Z"
  }
}
```

**Response (Session Expired - 410 Gone)**
```json
{
  "success": false,
  "error": {
    "code": "SESSION_EXPIRED",
    "message": "Your session has expired. Please contact HR to reschedule."
  }
}
```

### POST /api/sessions/:sessionId/heartbeat

**Request**
```http
POST /api/sessions/550e8400-e29b-41d4-a716-446655440000/heartbeat HTTP/1.1
Authorization: Bearer <session_token>
Content-Type: application/json
```

**Response (Success - 200 OK)**
```json
{
  "success": true,
  "data": {
    "sessionId": "550e8400-e29b-41d4-a716-446655440000",
    "remainingMinutes": 42.3,
    "status": "active",
    "lastHeartbeat": "2026-07-27T14:31:00Z"
  }
}
```

**Response (Rate Limited - 429 Too Many Requests)**
```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Heartbeat rate limit exceeded. Try again in 10 seconds.",
    "retryAfter": 8
  }
}
```

---

## Validation

| Check | Method | Expected Result |
|-------|--------|-----------------|
| GET timer returns remaining time | Integration test | HTTP 200 with accurate remaining minutes |
| POST heartbeat updates timestamp | Integration test | HTTP 200, lastHeartbeat updated |
| Expired session returns 410 | Integration test | HTTP 410 with SESSION_EXPIRED |
| Invalid session ID returns 404 | Integration test | HTTP 404 with SESSION_NOT_FOUND |
| Missing auth token returns 401 | Integration test | HTTP 401 with UNAUTHORIZED |
| Rate limit enforced on heartbeat | Integration test | HTTP 429 after multiple rapid requests |
| Correlation ID tracked | Integration test | Logs contain correlation ID for all requests |

---

## Dependencies

- TASK-001 (session timer service with Redis storage)
- Session token authentication from US-001
- Existing middleware infrastructure (correlation IDs, error handling)

---

## Definition of Done

- [x] GET `/api/sessions/:sessionId/timer` endpoint implemented (sessionTimer.ts)
- [x] POST `/api/sessions/:sessionId/heartbeat` endpoint implemented (sessionTimer.ts)
- [x] Session token authentication middleware applied (validateSessionToken middleware)
- [x] Rate limiting (1 heartbeat per 10 seconds) enforced (in-memory Map-based rate limiter)
- [x] Zod schema validation for session ID parameter (SessionIdParamSchema)
- [x] HTTP status codes: 200 (success), 401 (auth), 404 (not found), 410 (expired), 429 (rate limit)
- [x] Integration tests cover all endpoints and error cases (18 tests in sessionTimer.integration.test.ts)
- [x] API documentation with request/response examples (inline JSDoc in routes file)

---

## Notes

- Heartbeat rate limiting prevents client abuse (e.g., excessive polling)
- HTTP 410 (Gone) is semantically correct for expired resources vs 404 (Not Found)
- Consider WebSocket upgrade for real-time timer sync in future iteration (optional enhancement)
