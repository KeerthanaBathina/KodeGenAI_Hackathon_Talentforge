---
id: task_001
us_id: us_003
epic: EP-001
title: "Add Account Lockout Schema and Login Attempt Tracking"
status: done
layer: backend
effort: 3h
priority: critical
created: 2026-07-24
completed: 2026-07-24
---

# TASK-001 — Add Account Lockout Schema and Login Attempt Tracking

## Context

**User Story**: US-003 — Login with Role-Based Routing, Account Lockout, and SSO  
**Epic**: EP-001 — Candidate Onboarding and Identity  
**Addresses Acceptance Criteria**: Scenario 2 (account locked after 5 failed attempts)

To enforce account lockout after 5 consecutive failed login attempts, the database must track login failures per user and maintain lockout state with expiry timestamps. This schema change is a prerequisite for the login service implementation.

---

## Objective

Extend the User/Candidate data model to support:
- Consecutive failed login attempt counter
- Account lockout timestamp (when locked) and expiry (when it auto-unlocks)
- Last login attempt timestamp for rate limiting
- Integration with existing audit_events table for security monitoring

---

## Technical Specifications

| Entity | Change | Constraint |
|--------|--------|------------|
| `users` or `candidates` | add `failed_login_attempts` | integer, default 0 |
| `users` or `candidates` | add `locked_until` | timestamp, nullable (null = not locked) |
| `users` or `candidates` | add `last_login_attempt_at` | timestamp, nullable |
| `users` or `candidates` | add `last_successful_login_at` | timestamp, nullable |
| `audit_events` | verify login events | ensure `event_type` supports 'login_success', 'login_failed', 'account_locked' |

**Lockout Logic**:
- After 5th failed attempt: set `locked_until = now() + 30 minutes`
- On successful login: reset `failed_login_attempts = 0`, clear `locked_until`
- On unlock expiry: automatic (checked on next login attempt)

---

## Implementation Steps

### Step 1 — Review Current User Schema

Check if the project uses a `users` table or extends `candidates` for authentication:

```bash
cd backend
grep -r "model User" prisma/schema.prisma
grep -r "model Candidate" prisma/schema.prisma
```

Determine which model handles authentication and role management.

### Step 2 — Update Prisma Schema

Edit `backend/prisma/schema.prisma` to add lockout fields to the appropriate model:

```prisma
model Candidate {
  // ... existing fields ...
  
  // Account Security & Lockout
  failedLoginAttempts  Int       @default(0) @map("failed_login_attempts")
  lockedUntil          DateTime? @map("locked_until")
  lastLoginAttemptAt   DateTime? @map("last_login_attempt_at")
  lastSuccessfulLoginAt DateTime? @map("last_successful_login_at")
  
  @@index([email, lockedUntil]) // Query optimization for login checks
  
  // ... existing relations ...
}
```

**Or if using separate `User` model**:

```prisma
model User {
  id                    String    @id @default(uuid())
  email                 String    @unique
  passwordHash          String?   @map("password_hash") // null for OAuth-only users
  role                  UserRole
  
  // Account Security & Lockout
  failedLoginAttempts   Int       @default(0) @map("failed_login_attempts")
  lockedUntil           DateTime? @map("locked_until")
  lastLoginAttemptAt    DateTime? @map("last_login_attempt_at")
  lastSuccessfulLoginAt DateTime? @map("last_successful_login_at")
  
  // Timestamps
  createdAt             DateTime  @default(now()) @map("created_at")
  updatedAt             DateTime  @updatedAt @map("updated_at")
  
  @@index([email, lockedUntil])
  @@map("users")
}

enum UserRole {
  candidate
  hr
  recruiter
  admin
}
```

### Step 3 — Create Migration

Generate migration:

```bash
cd backend
npx prisma migrate dev --name add_account_lockout_fields
```

Review the generated SQL to ensure:
- Columns created with correct defaults
- Existing records have `failed_login_attempts = 0` and `locked_until = NULL`
- Index created for efficient lockout checks

### Step 4 — Verify Audit Events Schema

Ensure `audit_events` table supports login event tracking:

```prisma
model AuditEvent {
  id            String    @id @default(uuid())
  eventType     String    @map("event_type") // 'login_success', 'login_failed', 'account_locked', 'account_unlocked'
  userId        String?   @map("user_id")
  actorId       String?   @map("actor_id")
  ipAddress     String?   @map("ip_address")
  userAgent     String?   @map("user_agent")
  metadata      Json?     // { email, reason, lockExpiry, etc. }
  createdAt     DateTime  @default(now()) @map("created_at")
  
  @@index([eventType, createdAt])
  @@index([userId, createdAt])
  @@map("audit_events")
}
```

If changes needed, include in migration.

### Step 5 — Update Seed Data (Optional)

If seed scripts create test users, ensure they have lockout fields initialized:

```typescript
// backend/prisma/seed.ts or seed.dev.ts
await prisma.user.createMany({
  data: [
    {
      email: 'candidate@example.com',
      passwordHash: await hashPassword('password123'),
      role: 'candidate',
      failedLoginAttempts: 0,
      lockedUntil: null,
    },
    // ... more users
  ],
});
```

### Step 6 — Validate Migration

```bash
cd backend
npm run migrate:status
npm run migrate:diff
```

Expected output:
- No pending migrations
- No schema drift
- Database schema matches Prisma schema

---

## Validation

| Check | Method | Expected Result |
|-------|--------|-----------------|
| Fields exist | Query database | `failed_login_attempts`, `locked_until`, `last_login_attempt_at` columns present |
| Default values | Insert new user without specifying lockout fields | `failed_login_attempts = 0`, `locked_until = NULL` |
| Index created | Check DB indexes | Composite index on `(email, locked_until)` exists |
| Audit events support login types | Check enum/constraints | 'login_success', 'login_failed', 'account_locked' allowed |

---

## Dependencies

- EP-DATA baseline data model
- Prisma migration framework

## Security Constraints

- **OWASP A07 (Identification and Authentication Failures)**: Lockout mechanism must be resistant to timing attacks (constant-time comparison where possible)
- **OWASP A09 (Security Logging)**: All lockout events must be logged to `audit_events` for forensic analysis

---

## Definition of Done

- [ ] Lockout fields added to User/Candidate model in Prisma schema
- [ ] Migration created and applied cleanly to development database
- [ ] Composite index on `(email, locked_until)` created for performance
- [ ] Audit events table verified to support login event types
- [ ] Seed data updated (if applicable) with lockout field defaults
- [ ] `npm run migrate:status` and `npm run migrate:diff` pass with no drift

## Traceability

- **US**: US-003 — Login with Role-Based Routing, Account Lockout, and SSO
- **Epic**: EP-001 — Candidate Onboarding and Identity
- **AC**: Scenario 2 (account lockout after 5 failures)
