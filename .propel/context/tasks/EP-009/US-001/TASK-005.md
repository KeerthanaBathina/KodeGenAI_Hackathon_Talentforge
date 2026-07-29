---
id: TASK-005
user_story: US-001
title: "Frontend - Admin User Management UI"
status: completed
priority: high
assigned_to: frontend-team
estimated_hours: 12
layer: frontend
dependencies: [TASK-001, TASK-002, TASK-003]
completed_date: 2026-07-29
---

# TASK-005 — Frontend - Admin User Management UI

## Objective

Build comprehensive admin interface for managing platform users including creation, role management, and deactivation.

## Scope

Create responsive user management dashboard with CRUD operations, filtering, and status management.

## Technical Requirements

### 1. Page Structure

Create `/frontend/src/app/admin/users/page.tsx`:

- Protected route (admin role required)
- Server component for initial data load
- Client components for interactive features

### 2. User List View

Component: `UserListTable.tsx`

**Features:**

- Display all users in paginated table
- Columns: Name, Email, Role, Status (Active/Inactive), Created Date, Actions
- Filters:
  - Role dropdown (all roles from UserRole enum)
  - Status toggle (Active/Inactive/All)
  - Search by name or email
- Sorting by name, email, created date
- Pagination (20 users per page)
- Loading states with skeleton UI
- Empty state when no users found

**Table Structure:**

```typescript
<table>
  <thead>
    <tr>
      <th>Full Name</th>
      <th>Email</th>
      <th>Role</th>
      <th>Status</th>
      <th>Created</th>
      <th>Actions</th>
    </tr>
  </thead>
  <tbody>
    {users.map(user => (
      <UserRow key={user.id} user={user} />
    ))}
  </tbody>
</table>
```

### 3. Create User Modal/Form

Component: `CreateUserModal.tsx`

**Fields:**

- Full Name (text, required, min 2 chars)
- Email (email, required, unique validation)
- Role (dropdown, required)
  - candidate
  - recruiter
  - hr_reviewer
  - hr_manager
  - tech_interviewer
  - admin
- Timezone (dropdown with common timezones, default: UTC)

**Validation:**

- Client-side validation with react-hook-form or similar
- Email format validation
- Unique email check (show error from API)
- All required fields must be filled

**Success Flow:**

1. Form submitted → Loading spinner
2. API call to POST /api/admin/users
3. Success toast: "User created successfully. Onboarding email sent to {email}"
4. Display temporary password in modal (one-time view)
5. "Copy to Clipboard" button for password
6. Warning: "Save this password - it won't be shown again"
7. Modal closes → User list refreshes

**Temporary Password Display:**

```typescript
<div className="bg-yellow-50 border border-yellow-200 p-4 rounded">
  <p className="font-medium">Temporary Password</p>
  <code className="bg-gray-100 px-2 py-1 rounded">{temporaryPassword}</code>
  <button onClick={copyToClipboard}>Copy Password</button>
  <p className="text-sm text-gray-600 mt-2">
    ⚠️ Save this password now. It will not be shown again.
  </p>
</div>
```

### 4. Edit Role Modal

Component: `EditUserRoleModal.tsx`

**Fields:**

- Display current role (read-only)
- New role (dropdown, required)
- Confirmation checkbox: "I understand this will take effect on user's next login"

**Validation:**

- New role must be different from current role
- Require confirmation checkbox before submit

**Success Flow:**

1. API call to PATCH /api/admin/users/{id}/role
2. Success toast: "Role updated to {newRole}. Changes will take effect on next login."
3. Modal closes → User list refreshes

### 5. Deactivate User Confirmation

Component: `DeactivateUserModal.tsx`

**Content:**

```
Are you sure you want to deactivate {user.fullName}?

This user will:
- Be immediately logged out on their next API call
- Be unable to log in until reactivated
- Remain in the system with all historical data preserved

This action can be reversed by reactivating the account.
```

**Buttons:**

- "Cancel" (secondary)
- "Deactivate User" (danger, primary)

**Success Flow:**

1. API call to PATCH /api/admin/users/{id}/deactivate
2. Success toast: "User deactivated successfully"
3. Modal closes → User list refreshes

**Error Handling:**

- If attempting to deactivate own account: Show error modal
  - "You cannot deactivate your own account"
  - Only "Close" button

### 6. Reactivate User

Component: Inline button in user row

**Action:**

- Single-click action with confirmation toast
- "User {name} has been reactivated"
- User list refreshes

### 7. API Integration

Create `/frontend/src/services/adminUserService.ts`:

```typescript
export const adminUserService = {
  // GET /api/admin/users?role=&active=&search=
  async getUsers(filters?: UserFilters): Promise<User[]> {
    // Implementation
  },

  // GET /api/admin/users/:id
  async getUserById(id: string): Promise<User> {
    // Implementation
  },

  // POST /api/admin/users
  async createUser(data: CreateUserInput): Promise<CreateUserResponse> {
    // Returns { user, temporaryPassword }
  },

  // PATCH /api/admin/users/:id/role
  async updateUserRole(userId: string, newRole: UserRole): Promise<User> {
    // Implementation
  },

  // PATCH /api/admin/users/:id/deactivate
  async deactivateUser(userId: string): Promise<User> {
    // Implementation
  },

  // PATCH /api/admin/users/:id/reactivate
  async reactivateUser(userId: string): Promise<User> {
    // Implementation
  },
};
```

### 8. Type Definitions

Create `/frontend/src/types/user.ts`:

```typescript
export enum UserRole {
  candidate = "candidate",
  recruiter = "recruiter",
  hr_reviewer = "hr_reviewer",
  hr_manager = "hr_manager",
  tech_interviewer = "tech_interviewer",
  admin = "admin",
}

export interface User {
  id: string;
  email: string;
  role: UserRole;
  fullName: string;
  timezone: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateUserInput {
  email: string;
  fullName: string;
  role: UserRole;
  timezone?: string;
}

export interface CreateUserResponse {
  user: User;
  temporaryPassword: string;
}

export interface UserFilters {
  role?: UserRole;
  active?: boolean;
  search?: string;
}
```

### 9. Toast Notifications

Use existing ToastContext for notifications:

- Success: Green toast with checkmark
- Error: Red toast with error icon
- Info: Blue toast for informational messages
- Auto-dismiss after 5 seconds

### 10. Error Handling

Handle common API errors:

- 403 Forbidden → "You don't have permission to perform this action"
- 409 Conflict → "A user with this email already exists"
- 404 Not Found → "User not found"
- 400 Bad Request → Display validation errors
- 500 Server Error → "An error occurred. Please try again."

### 11. Accessibility

- Semantic HTML (table, form elements)
- ARIA labels for icons and actions
- Keyboard navigation support
- Focus management in modals
- Screen reader announcements for state changes

### 12. Responsive Design

- Desktop: Full table view
- Tablet: Condensed table with wrapped columns
- Mobile: Card-based list view instead of table

## Acceptance Criteria

- [ ] Admin can view list of all users with pagination
- [ ] Admin can filter users by role and active status
- [ ] Admin can search users by name or email
- [ ] Admin can create new user with required fields
- [ ] Temporary password displayed once after user creation
- [ ] Copy to clipboard button works for temporary password
- [ ] Onboarding email confirmation shown in success message
- [ ] Admin can change user role with confirmation
- [ ] Role change notice: "Takes effect on next login"
- [ ] Admin can deactivate users with confirmation modal
- [ ] Deactivate button disabled for own account
- [ ] Error shown when attempting self-deactivation
- [ ] Admin can reactivate deactivated users
- [ ] User list auto-refreshes after operations
- [ ] Loading states shown during API calls
- [ ] Error states handled gracefully with user-friendly messages
- [ ] Page is responsive (desktop, tablet, mobile)
- [ ] All interactive elements are keyboard accessible

## Testing Requirements

- Unit tests for all components
- Integration tests for API service methods
- E2E tests using Playwright:
  - Create user flow
  - Edit role flow
  - Deactivate user flow
  - Reactivate user flow
  - Filter and search functionality
  - Self-deactivation prevention
- Accessibility tests with axe-core
- Responsive design tests (mobile, tablet, desktop)

## Files to Create

- `/frontend/src/app/admin/users/page.tsx`
- `/frontend/src/components/admin/UserListTable.tsx`
- `/frontend/src/components/admin/CreateUserModal.tsx`
- `/frontend/src/components/admin/EditUserRoleModal.tsx`
- `/frontend/src/components/admin/DeactivateUserModal.tsx`
- `/frontend/src/services/adminUserService.ts`
- `/frontend/src/types/user.ts`
- `/frontend/src/components/__tests__/admin/UserListTable.test.tsx`
- `/frontend/tests/e2e/admin-user-management.spec.ts`

## UI/UX Considerations

- Clear visual distinction between active/inactive users
- Confirmation required for destructive actions (deactivate)
- Inline feedback for form validation
- Persistent notification that temporary password won't be shown again
- Disabled state for self-deactivation
- Loading spinners for async operations
- Optimistic UI updates where appropriate

## Security Considerations

- Admin role check on page load
- Redirect non-admin users to unauthorized page
- Client-side prevention of self-deactivation (backed by API)
- Temporary password only shown once, never stored client-side
- HTTPS required for password transmission

## Related User Story

**US-001 Definition of Done:**

- ✅ Admin user management page: create, edit role, deactivate (This task)

## Dependencies

- TASK-001 (Backend API)
- TASK-002 (Email service - for confirmation message)
- TASK-003 (Authentication updates)
- Existing ToastContext
- Existing admin layout and navigation

## Design System

- Follow existing design system patterns
- Use consistent button styles (primary, secondary, danger)
- Match color scheme with rest of application
- Use existing modal/dialog component if available
- Consistent spacing and typography

## Notes

- Temporary password should be shown in monospace font for clarity
- Consider adding "View Audit Trail" button for each user (future enhancement)
- Role labels should be human-readable (e.g., "HR Reviewer" not "hr_reviewer")
- Active/Inactive status badge should use color coding (green/gray)
