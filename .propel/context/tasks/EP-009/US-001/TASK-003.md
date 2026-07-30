---
id: TASK-003
user_story: US-001
title: "Backend - Authentication Middleware for Deactivated Users"
status: completed
priority: high
assigned_to: backend-team
estimated_hours: 6
layer: backend
dependencies: [TASK-001]
completed_date: 2026-07-29
---

# TASK-003 — Backend - Authentication Middleware for Deactivated Users

## Objective

Update authentication and authorization middleware to prevent deactivated users from logging in and invalidate existing sessions.

## Scope

Enhance authentication flow to check user active status at login and during JWT validation.

## Technical Requirements

### 1. Login Endpoint Updates

Update `/backend/src/routes/auth.ts` login handler:

- After password validation, check `user.active` status
- If `user.active === false`, return HTTP 401 with specific message
- Do NOT create JWT or session for deactivated users
- Log failed login attempt due to deactivation in audit_events

**Error Response for Deactivated User:**

```typescript
{
  error: "ACCOUNT_DEACTIVATED",
  message: "Your account has been deactivated — contact your administrator",
  statusCode: 401
}
```

### 2. JWT Middleware Enhancement

Update `/backend/src/middleware/authenticate.ts` (or auth middleware):

- After JWT verification, fetch full user record from database
- Check `user.active` status
- If user is deactivated, return 401 and clear any session cookies
- Ensure check happens on EVERY authenticated request

```typescript
// Middleware logic
export async function authenticate(req, res, next) {
  try {
    // Extract and verify JWT
    const token = extractToken(req);
    const decoded = verifyJwt(token);

    // Fetch current user state from database
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
    });

    // Check if user exists and is active
    if (!user || !user.active) {
      return res.status(401).json({
        error: "UNAUTHORIZED",
        message:
          user && !user.active
            ? "Your account has been deactivated — contact your administrator"
            : "Authentication required",
      });
    }

    // Attach user to request
    req.user = user;
    next();
  } catch (error) {
    // Handle JWT errors
    return res.status(401).json({
      error: "INVALID_TOKEN",
      message: "Invalid or expired token",
    });
  }
}
```

### 3. Role Change Implementation

Update JWT generation to include role:

- Ensure JWT payload includes `role` field
- Role should be read from database, not cached
- On login, generate JWT with current role from user record

**JWT Payload Structure:**

```typescript
{
  userId: string;
  email: string;
  role: UserRole;
  iat: number;
  exp: number;
}
```

### 4. Session Invalidation

For active sessions when user is deactivated:

- Next authenticated request will fail due to active=false check
- Consider implementing token blacklist for immediate invalidation (optional)
- Document that deactivation takes effect on next API call (not instant)

### 5. Frontend Redirect Logic

Return role information in login response:

```typescript
{
  token: string;
  user: {
    id: string;
    email: string;
    fullName: string;
    role: UserRole;
    active: boolean;
  }
}
```

Frontend can use role to determine dashboard redirect:

- `admin` → `/admin`
- `hr` → `/hr`
- `recruiter` → `/applications`
- etc.

## Acceptance Criteria

- [ ] Deactivated users cannot log in (401 with specific message)
- [ ] Authenticated requests fail if user.active = false
- [ ] Login error message: "Your account has been deactivated — contact your administrator"
- [ ] JWT contains role information
- [ ] Role is read from database on every request (not cached from JWT)
- [ ] Role changes take effect on next login (new JWT issued)
- [ ] Active sessions for deactivated users fail on next API call
- [ ] Failed login attempts due to deactivation are audited
- [ ] Login response includes role for dashboard routing

## Testing Requirements

- Integration test: Login with deactivated account returns 401
- Integration test: Authenticated request with deactivated user fails
- Integration test: Role change reflected in JWT after re-login
- Unit test: authenticate middleware checks active status
- E2E test: User deactivation prevents future API calls
- Test: Verify exact error message matches requirement

## Files to Modify

- `/backend/src/routes/auth.ts` (login handler)
- `/backend/src/middleware/authenticate.ts` (or equivalent auth middleware)
- `/backend/src/utils/jwt.ts` (ensure role included in payload)
- `/backend/src/__tests__/middleware/authenticate.test.ts`
- `/backend/src/routes/__tests__/auth.integration.test.ts`

## Security Considerations

- Database check on every authenticated request ensures real-time status
- Slight performance trade-off for security (acceptable)
- Consider caching user status with short TTL (5-10 seconds) if performance becomes issue
- Failed login attempts should be rate-limited

## Edge Cases

- User deactivated while logged in: Next API call will fail
- Immediate invalidation: Would require token blacklist or WebSocket notification
- Token expiry: JWT should have reasonable expiration (e.g., 24h)
- Concurrent sessions: All sessions will fail on next request after deactivation

## Related User Story

**US-001 Acceptance Criteria:**

- ✅ Scenario 2: User deactivated cannot log in (This task)
- ✅ Scenario 3: Role assignment takes effect on next login (This task)

## Dependencies

- TASK-001 (User deactivation API must be complete)
- Existing JWT infrastructure
- Existing authentication middleware

## Performance Considerations

- Database query on every authenticated request
- Use indexed query on user.id (primary key - already indexed)
- Consider Redis caching with 10-second TTL if scale becomes issue
- Monitor query performance in production

## Notes

- The requirement states role change takes effect "on next login"
- This means: logout → login → new JWT with updated role
- Active sessions with old role continue until token expires or user logs out
- Deactivation is more strict: takes effect on next API call (not next login)
