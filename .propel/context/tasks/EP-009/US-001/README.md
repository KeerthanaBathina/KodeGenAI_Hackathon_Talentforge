# US-001 Implementation Tasks

## Overview

This directory contains implementation tasks for User Story US-001: User Management — Create, Deactivate, and Role Assignment.

## Task Breakdown

### TASK-001: Backend API - User Management CRUD Operations

**Status:** Todo  
**Estimated Hours:** 8  
**Layer:** Backend  
**Dependencies:** None

Create REST API endpoints and service layer for user management CRUD operations including creation, role updates, and deactivation with self-modification prevention.

### TASK-002: Backend - Onboarding Email Notification Service

**Status:** Todo  
**Estimated Hours:** 4  
**Layer:** Backend  
**Dependencies:** TASK-001

Implement onboarding email service to send temporary passwords and welcome instructions to newly created users via the email queue system.

### TASK-003: Backend - Authentication Middleware for Deactivated Users

**Status:** Todo  
**Estimated Hours:** 6  
**Layer:** Backend  
**Dependencies:** TASK-001

Update authentication flow to check user active status at login and during JWT validation, preventing deactivated users from accessing the system.

### TASK-004: Backend - Audit Logging for User Management Actions

**Status:** Todo  
**Estimated Hours:** 3  
**Layer:** Backend  
**Dependencies:** TASK-001

Integrate audit logging for all user management operations to track administrative actions for compliance and security.

### TASK-005: Frontend - Admin User Management UI

**Status:** Todo  
**Estimated Hours:** 12  
**Layer:** Frontend  
**Dependencies:** TASK-001, TASK-002, TASK-003

Build comprehensive admin interface for managing users including list view, create form, role editing, and deactivation with appropriate confirmations.

### TASK-006: Testing - Integration and E2E Tests

**Status:** Todo  
**Estimated Hours:** 10  
**Layer:** Testing  
**Dependencies:** TASK-001, TASK-002, TASK-003, TASK-004, TASK-005

Comprehensive test coverage including unit tests, integration tests, E2E tests, and accessibility tests for all user management functionality.

## Total Effort Estimate

**Total Hours:** 43 hours  
**Sprint Capacity:** Approximately 2 sprints for full implementation

## Implementation Order

1. TASK-001 (Backend API) - Foundation for all other tasks
2. TASK-002 (Email Service) - Parallel with TASK-003
3. TASK-003 (Auth Middleware) - Parallel with TASK-002
4. TASK-004 (Audit Logging) - Can run parallel with frontend
5. TASK-005 (Frontend UI) - After backend tasks complete
6. TASK-006 (Testing) - Continuous throughout, finalize after all tasks

## Acceptance Criteria Mapping

| Acceptance Criteria                                 | Primary Task       | Supporting Tasks |
| --------------------------------------------------- | ------------------ | ---------------- |
| AC1: New user created and receives onboarding email | TASK-001, TASK-002 | -                |
| AC2: User deactivated cannot log in                 | TASK-003           | TASK-001         |
| AC3: Role assignment takes effect on next login     | TASK-003           | TASK-001         |
| AC4: Admin cannot deactivate their own account      | TASK-001           | -                |

## Technical Stack

- **Backend:** Node.js, Express, TypeScript, Prisma
- **Frontend:** Next.js 14, React, TypeScript, Tailwind CSS
- **Database:** PostgreSQL (via Prisma)
- **Authentication:** JWT
- **Email:** BullMQ queue, SMTP/Mock provider
- **Testing:** Vitest, Playwright, @testing-library/react

## Key Files to Create/Modify

### Backend

- `src/services/userManagementService.ts` (new)
- `src/routes/admin/users.ts` (new)
- `src/middleware/requireAdmin.ts` (new)
- `src/services/emailService.ts` (modify)
- `src/middleware/authenticate.ts` (modify)
- `src/routes/auth.ts` (modify)

### Frontend

- `src/app/admin/users/page.tsx` (new)
- `src/components/admin/UserListTable.tsx` (new)
- `src/components/admin/CreateUserModal.tsx` (new)
- `src/components/admin/EditUserRoleModal.tsx` (new)
- `src/components/admin/DeactivateUserModal.tsx` (new)
- `src/services/adminUserService.ts` (new)
- `src/types/user.ts` (new)

### Tests

- Multiple test files across backend and frontend
- E2E test suite for complete workflows
- Accessibility tests

## Definition of Done

- [ ] All tasks completed (TASK-001 through TASK-006)
- [ ] All acceptance criteria verified
- [ ] Code reviewed and approved
- [ ] Tests passing with minimum 80% coverage
- [ ] Documentation updated
- [ ] Deployed to staging environment
- [ ] User acceptance testing completed
- [ ] No blocking bugs
- [ ] Accessibility standards met (WCAG 2.1 AA)
- [ ] Security review completed
- [ ] Performance benchmarks met

## Notes

- This is a high-priority feature required before multi-user testing
- Self-deactivation prevention is a critical security requirement
- Audit logging is mandatory for compliance
- Email delivery should not block user creation
- Role changes take effect on next login, not immediately
- Temporary passwords must be cryptographically secure
