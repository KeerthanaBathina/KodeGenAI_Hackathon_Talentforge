---
id: TASK-004
user_story: US-001
title: "Backend - Audit Logging for User Management Actions"
status: todo
priority: medium
assigned_to: backend-team
estimated_hours: 3
layer: backend
dependencies: [TASK-001]
---

# TASK-004 — Backend - Audit Logging for User Management Actions

## Objective

Implement comprehensive audit logging for all user management operations to maintain compliance and security trail.

## Scope

Integrate existing audit logging service into user management operations to track all administrative actions.

## Technical Requirements

### 1. Audit Events to Log

Update user management service to log the following events:

#### Event: USER_CREATED

```typescript
{
  action: 'user.created',
  actorId: adminUserId,
  resourceType: 'User',
  resourceId: newUser.id,
  metadata: {
    email: newUser.email,
    role: newUser.role,
    fullName: newUser.fullName
  },
  timestamp: new Date()
}
```

#### Event: USER_ROLE_CHANGED

```typescript
{
  action: 'user.role_changed',
  actorId: adminUserId,
  resourceType: 'User',
  resourceId: userId,
  metadata: {
    previousRole: oldRole,
    newRole: updatedRole,
    email: user.email
  },
  timestamp: new Date()
}
```

#### Event: USER_DEACTIVATED

```typescript
{
  action: 'user.deactivated',
  actorId: adminUserId,
  resourceType: 'User',
  resourceId: userId,
  metadata: {
    email: user.email,
    role: user.role,
    reason: 'Administrative action'
  },
  timestamp: new Date()
}
```

#### Event: USER_REACTIVATED

```typescript
{
  action: 'user.reactivated',
  actorId: adminUserId,
  resourceType: 'User',
  resourceId: userId,
  metadata: {
    email: user.email,
    role: user.role
  },
  timestamp: new Date()
}
```

#### Event: USER_DEACTIVATION_BLOCKED

```typescript
{
  action: 'user.deactivation_blocked',
  actorId: adminUserId,
  resourceType: 'User',
  resourceId: adminUserId, // Same as actor
  metadata: {
    reason: 'Self-deactivation attempt',
    email: admin.email
  },
  timestamp: new Date()
}
```

#### Event: LOGIN_FAILED_DEACTIVATED

```typescript
{
  action: 'auth.login_failed_deactivated',
  actorId: null, // Not authenticated yet
  resourceType: 'User',
  resourceId: userId,
  metadata: {
    email: user.email,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent']
  },
  timestamp: new Date()
}
```

### 2. Integration with Audit Service

Use existing `auditService` from `/backend/src/services/auditService.ts`:

- Import and call `auditService.logEvent()` for each action
- Ensure transaction consistency (audit log within same DB transaction as main action)
- Handle audit logging failures gracefully (don't block main operation)

### 3. Service Layer Updates

Update `/backend/src/services/userManagementService.ts`:

```typescript
import { auditService } from "./auditService";

export async function createUser(
  data: CreateUserInput,
  actorId: string,
): Promise<CreateUserResult> {
  // Create user in transaction
  const user = await prisma.$transaction(async (tx) => {
    const newUser = await tx.user.create({
      data: {
        email: data.email,
        fullName: data.fullName,
        role: data.role,
        timezone: data.timezone || "UTC",
        active: true,
      },
    });

    // Log audit event
    await auditService.logEvent({
      action: "user.created",
      actorId,
      resourceType: "User",
      resourceId: newUser.id,
      metadata: {
        email: newUser.email,
        role: newUser.role,
        fullName: newUser.fullName,
      },
    });

    return newUser;
  });

  return {
    user,
    temporaryPassword: generatedPassword,
  };
}
```

### 4. Route Layer Updates

Update `/backend/src/routes/admin/users.ts`:

- Pass authenticated admin's ID to service methods
- Log failed validation attempts (optional, based on requirements)
- Ensure actor ID is always the authenticated admin user

### 5. Audit Query Support

Implement helper function for querying user management audit trail:

```typescript
export async function getUserAuditTrail(
  userId: string,
  options?: {
    startDate?: Date;
    endDate?: Date;
    actions?: string[];
    limit?: number;
  },
): Promise<AuditEvent[]> {
  return prisma.auditEvent.findMany({
    where: {
      resourceType: "User",
      resourceId: userId,
      action: options?.actions ? { in: options.actions } : undefined,
      createdAt: {
        gte: options?.startDate,
        lte: options?.endDate,
      },
    },
    include: {
      actor: {
        select: {
          id: true,
          email: true,
          fullName: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: options?.limit || 100,
  });
}
```

## Acceptance Criteria

- [ ] All user creation events logged to audit_events table
- [ ] All role change events logged with before/after values
- [ ] All deactivation/reactivation events logged
- [ ] Self-deactivation attempts logged (even though blocked)
- [ ] Failed login attempts due to deactivation logged
- [ ] Audit logs include actorId (admin who performed action)
- [ ] Audit logs include timestamp
- [ ] Audit logs include relevant metadata (email, role, etc.)
- [ ] Audit logging doesn't block main operations if log fails
- [ ] Audit trail query function available for reporting

## Testing Requirements

- Unit test: Verify audit events created for each operation
- Integration test: Check audit_events table after user operations
- Test: Audit log created even if secondary operation fails
- Test: Actor ID correctly recorded
- Test: Metadata includes all required fields
- Test: Query user audit trail function

## Files to Modify/Create

- `/backend/src/services/userManagementService.ts` (add audit calls)
- `/backend/src/routes/auth.ts` (log deactivated login attempts)
- `/backend/src/services/auditQueryService.ts` (new - audit trail queries)
- `/backend/src/__tests__/services/userManagementService.test.ts` (verify audit logs)
- `/backend/src/routes/__tests__/admin-users.integration.test.ts` (check audit trail)

## Database Schema

Ensure `audit_events` table has appropriate indexes:

```sql
CREATE INDEX IF NOT EXISTS idx_audit_events_resource
  ON audit_events(resource_type, resource_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_events_actor
  ON audit_events(actor_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_events_action
  ON audit_events(action, created_at DESC);
```

## Compliance Requirements

- Audit logs must be immutable (no UPDATE or DELETE)
- Retain audit logs for minimum 1 year (configure retention policy)
- Include sufficient detail for security investigations
- Timestamp should be UTC
- Actor must always be identifiable

## Related User Story

**US-001 Definition of Done:**

- ✅ All user management actions written to `audit_events` (This task)

## Dependencies

- TASK-001 (User management service)
- Existing auditService infrastructure
- Existing audit_events table (from Prisma schema)

## Performance Considerations

- Audit logging should be async where possible
- Use database transactions to ensure consistency
- Don't block user-facing operations on audit log writes
- Consider using background queue for audit log writes if volume is high

## Notes

- Audit logs are critical for security and compliance
- Do NOT log sensitive data (passwords, tokens) in metadata
- Temporary password should never appear in audit logs
- Focus on "who did what to whom, when" structure
- Audit logs should be queryable for security analysis and reports
