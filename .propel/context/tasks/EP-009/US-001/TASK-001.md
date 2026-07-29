---
id: TASK-001
user_story: US-001
title: "Backend API - User Management CRUD Operations"
status: todo
priority: high
assigned_to: backend-team
estimated_hours: 8
layer: backend
dependencies: []
---

# TASK-001 — Backend API - User Management CRUD Operations

## Objective

Implement REST API endpoints for user management CRUD operations with role-based access control.

## Scope

Create backend routes and services for creating, reading, updating user roles, and deactivating users.

## Technical Requirements

### 1. User Service Layer

Create `/backend/src/services/userManagementService.ts`:

- `createUser(data: CreateUserInput): Promise<User>` - Create new user with validation
- `getUserById(id: string): Promise<User | null>` - Fetch user by ID
- `getUserByEmail(email: string): Promise<User | null>` - Fetch user by email
- `getAllUsers(filters?: UserFilters): Promise<User[]>` - List all users with optional filtering
- `updateUserRole(userId: string, newRole: UserRole, actorId: string): Promise<User>` - Update user role
- `deactivateUser(userId: string, actorId: string): Promise<User>` - Set user.active = false
- `reactivateUser(userId: string, actorId: string): Promise<User>` - Set user.active = true
- Generate temporary password using crypto.randomBytes(32)
- Hash temporary password with bcrypt before storing

### 2. API Routes

Create `/backend/src/routes/admin/users.ts`:

#### POST `/api/admin/users` - Create User

**Request Body:**

```typescript
{
  email: string;
  fullName: string;
  role: UserRole;
  timezone?: string;
}
```

**Response:**

```typescript
{
  user: User;
  temporaryPassword: string; // Only returned on creation
}
```

**Validations:**

- Email format validation
- Unique email check
- Role must be valid UserRole enum value
- fullName required (min 2 chars)
  **Status Codes:** 201, 400, 409, 403

#### GET `/api/admin/users` - List Users

**Query Parameters:**

- `role?: UserRole` - Filter by role
- `active?: boolean` - Filter by active status
- `search?: string` - Search by name or email
  **Response:** Array of User objects
  **Status Codes:** 200, 403

#### GET `/api/admin/users/:id` - Get User by ID

**Response:** User object
**Status Codes:** 200, 404, 403

#### PATCH `/api/admin/users/:id/role` - Update User Role

**Request Body:**

```typescript
{
  role: UserRole;
}
```

**Response:** Updated User object
**Validations:**

- Cannot change own role
- Target user must exist
  **Status Codes:** 200, 400, 403, 404

#### PATCH `/api/admin/users/:id/deactivate` - Deactivate User

**Response:** Updated User object with active = false
**Validations:**

- Cannot deactivate own account (HTTP 403)
- Target user must exist and be active
  **Status Codes:** 200, 403, 404

#### PATCH `/api/admin/users/:id/reactivate` - Reactivate User

**Response:** Updated User object with active = true
**Status Codes:** 200, 403, 404

### 3. Middleware

- All routes require `authenticate` middleware
- All routes require `requireAdmin` middleware (role = 'admin')
- Implement self-modification check in deactivate/role change endpoints

### 4. Error Handling

- User not found → 404
- Duplicate email → 409
- Self-deactivation attempt → 403 with message "Administrators cannot deactivate their own account."
- Invalid role → 400
- Unauthorized → 403

### 5. Database Interactions

- Use existing User model from Prisma schema
- No schema changes required (active field already exists)
- Ensure timezone defaults to "UTC" if not provided

## Acceptance Criteria

- [ ] POST /api/admin/users creates user with hashed temporary password
- [ ] GET /api/admin/users returns all users with optional filters
- [ ] GET /api/admin/users/:id returns single user or 404
- [ ] PATCH /api/admin/users/:id/role updates user role
- [ ] PATCH /api/admin/users/:id/deactivate sets active=false
- [ ] Self-deactivation returns 403 with appropriate message
- [ ] All endpoints require admin authentication
- [ ] Unique email constraint enforced
- [ ] Temporary password is cryptographically random and bcrypt hashed

## Testing Requirements

- Unit tests for userManagementService methods
- Integration tests for all API endpoints
- Test self-deactivation prevention
- Test duplicate email handling
- Test role change validation
- Test authentication and authorization

## Files to Create

- `/backend/src/services/userManagementService.ts`
- `/backend/src/routes/admin/users.ts`
- `/backend/src/middleware/requireAdmin.ts` (if not exists)
- `/backend/src/__tests__/services/userManagementService.test.ts`
- `/backend/src/routes/__tests__/admin-users.integration.test.ts`

## Dependencies

- bcrypt (already in package.json)
- crypto (Node.js built-in)
- Prisma Client (already configured)

## Related User Story

**US-001 Acceptance Criteria:**

- ✅ Scenario 1: New user created and receives onboarding email (TASK-002)
- ✅ Scenario 2: User deactivated cannot log in (TASK-003)
- ✅ Scenario 3: Role assignment takes effect on next login (TASK-003)
- ✅ Scenario 4: Admin cannot deactivate their own account (This task)

## Notes

- Temporary password generation must be secure (crypto.randomBytes)
- Password should be returned ONLY in create response, never in GET requests
- Consider logging all user management actions (handled in TASK-004)
