---
id: TASK-006
user_story: US-001
title: "Testing - Integration and E2E Tests for User Management"
status: completed
priority: high
assigned_to: qa-team
estimated_hours: 10
layer: testing
dependencies: [TASK-001, TASK-002, TASK-003, TASK-004, TASK-005]
completed_date: 2026-07-29
---

# TASK-006 — Testing - Integration and E2E Tests for User Management

## Objective

Implement comprehensive test coverage for user management functionality across all layers.

## Scope

Create integration tests for backend APIs, unit tests for services, and end-to-end tests for the full user management workflow.

## Testing Requirements

### 1. Backend Unit Tests

#### File: `/backend/src/__tests__/services/userManagementService.test.ts`

**Test Cases:**

```typescript
describe("UserManagementService", () => {
  describe("createUser", () => {
    it("should create user with valid data", async () => {
      // Assert user created in database
      // Assert temporary password generated and hashed
      // Assert audit event logged
    });

    it("should fail with duplicate email", async () => {
      // Assert throws ConflictError
    });

    it("should set default timezone to UTC", async () => {
      // Assert timezone defaults correctly
    });

    it("should generate cryptographically secure password", async () => {
      // Assert password length and randomness
    });
  });

  describe("updateUserRole", () => {
    it("should update user role successfully", async () => {
      // Assert role updated
      // Assert audit event logged
    });

    it("should fail when updating non-existent user", async () => {
      // Assert throws NotFoundError
    });
  });

  describe("deactivateUser", () => {
    it("should set active to false", async () => {
      // Assert user.active === false
      // Assert audit event logged
    });

    it("should prevent self-deactivation", async () => {
      // Assert throws ForbiddenError when userId === actorId
    });

    it("should fail when user already deactivated", async () => {
      // Assert appropriate error
    });
  });

  describe("reactivateUser", () => {
    it("should set active to true", async () => {
      // Assert user.active === true
      // Assert audit event logged
    });
  });
});
```

### 2. Backend Integration Tests

#### File: `/backend/src/routes/__tests__/admin-users.integration.test.ts`

**Test Cases:**

```typescript
describe("POST /api/admin/users", () => {
  it("should create user and return temporary password", async () => {
    const response = await request(app)
      .post("/api/admin/users")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        email: "newuser@example.com",
        fullName: "New User",
        role: "recruiter",
      });

    expect(response.status).toBe(201);
    expect(response.body.user).toHaveProperty("id");
    expect(response.body.temporaryPassword).toBeDefined();
    expect(response.body.temporaryPassword).toMatch(/^[A-Za-z0-9]{32,}$/);
  });

  it("should require admin authentication", async () => {
    const response = await request(app).post("/api/admin/users").send({
      email: "test@example.com",
      fullName: "Test",
      role: "recruiter",
    });

    expect(response.status).toBe(401);
  });

  it("should reject request from non-admin user", async () => {
    const response = await request(app)
      .post("/api/admin/users")
      .set("Authorization", `Bearer ${recruiterToken}`)
      .send({
        email: "test@example.com",
        fullName: "Test",
        role: "recruiter",
      });

    expect(response.status).toBe(403);
  });

  it("should validate email format", async () => {
    const response = await request(app)
      .post("/api/admin/users")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        email: "invalid-email",
        fullName: "Test",
        role: "recruiter",
      });

    expect(response.status).toBe(400);
  });

  it("should prevent duplicate email", async () => {
    // Create first user
    await request(app)
      .post("/api/admin/users")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        email: "duplicate@example.com",
        fullName: "First",
        role: "recruiter",
      });

    // Attempt to create second user with same email
    const response = await request(app)
      .post("/api/admin/users")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        email: "duplicate@example.com",
        fullName: "Second",
        role: "hr_reviewer",
      });

    expect(response.status).toBe(409);
  });
});

describe("GET /api/admin/users", () => {
  it("should return all users", async () => {
    const response = await request(app)
      .get("/api/admin/users")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
  });

  it("should filter by role", async () => {
    const response = await request(app)
      .get("/api/admin/users?role=recruiter")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    response.body.forEach((user) => {
      expect(user.role).toBe("recruiter");
    });
  });

  it("should filter by active status", async () => {
    const response = await request(app)
      .get("/api/admin/users?active=false")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    response.body.forEach((user) => {
      expect(user.active).toBe(false);
    });
  });
});

describe("PATCH /api/admin/users/:id/role", () => {
  it("should update user role", async () => {
    const user = await createTestUser({ role: "recruiter" });

    const response = await request(app)
      .patch(`/api/admin/users/${user.id}/role`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ role: "hr_reviewer" });

    expect(response.status).toBe(200);
    expect(response.body.role).toBe("hr_reviewer");
  });

  it("should prevent changing own role", async () => {
    const response = await request(app)
      .patch(`/api/admin/users/${adminUserId}/role`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ role: "recruiter" });

    expect(response.status).toBe(403);
  });
});

describe("PATCH /api/admin/users/:id/deactivate", () => {
  it("should deactivate user", async () => {
    const user = await createTestUser({ active: true });

    const response = await request(app)
      .patch(`/api/admin/users/${user.id}/deactivate`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body.active).toBe(false);
  });

  it("should prevent self-deactivation", async () => {
    const response = await request(app)
      .patch(`/api/admin/users/${adminUserId}/deactivate`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(response.status).toBe(403);
    expect(response.body.message).toContain(
      "cannot deactivate their own account",
    );
  });
});
```

### 3. Authentication Integration Tests

#### File: `/backend/src/routes/__tests__/auth-deactivation.integration.test.ts`

**Test Cases:**

```typescript
describe("Authentication with Deactivated Users", () => {
  it("should prevent login for deactivated user", async () => {
    const user = await createTestUser({
      email: "deactivated@example.com",
      active: false,
    });

    const response = await request(app).post("/api/auth/login").send({
      email: user.email,
      password: "testPassword123",
    });

    expect(response.status).toBe(401);
    expect(response.body.error).toBe("ACCOUNT_DEACTIVATED");
    expect(response.body.message).toContain(
      "deactivated — contact your administrator",
    );
  });

  it("should invalidate session on deactivation", async () => {
    const user = await createTestUser({ active: true });
    const token = generateJWT(user);

    // Deactivate user
    await prisma.user.update({
      where: { id: user.id },
      data: { active: false },
    });

    // Attempt authenticated request
    const response = await request(app)
      .get("/api/profile")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(401);
    expect(response.body.message).toContain("deactivated");
  });

  it("should include updated role in JWT after role change", async () => {
    const user = await createTestUser({ role: "recruiter" });

    // Update role
    await prisma.user.update({
      where: { id: user.id },
      data: { role: "hr_reviewer" },
    });

    // Login again
    const response = await request(app).post("/api/auth/login").send({
      email: user.email,
      password: "testPassword123",
    });

    const decoded = verifyJWT(response.body.token);
    expect(decoded.role).toBe("hr_reviewer");
  });
});
```

### 4. Email Service Tests

#### File: `/backend/src/__tests__/services/emailService.test.ts`

**Test Cases:**

```typescript
describe("Onboarding Email", () => {
  it("should queue onboarding email after user creation", async () => {
    const queueSpy = vi.spyOn(emailQueue, "add");

    await userManagementService.createUser(
      {
        email: "newuser@example.com",
        fullName: "New User",
        role: "recruiter",
      },
      adminId,
    );

    expect(queueSpy).toHaveBeenCalledWith(
      "user_onboarding",
      expect.objectContaining({
        email: "newuser@example.com",
        fullName: "New User",
        temporaryPassword: expect.any(String),
      }),
    );
  });

  it("should render onboarding email template correctly", async () => {
    const html = await renderEmailTemplate("user_onboarding", {
      fullName: "Test User",
      email: "test@example.com",
      temporaryPassword: "temp123456",
      role: "recruiter",
      loginUrl: "http://localhost:3000/login",
    });

    expect(html).toContain("Test User");
    expect(html).toContain("temp123456");
    expect(html).toContain("http://localhost:3000/login");
  });
});
```

### 5. Audit Logging Tests

#### File: `/backend/src/__tests__/services/auditService.test.ts`

**Test Cases:**

```typescript
describe("User Management Audit Events", () => {
  it("should log user creation event", async () => {
    await userManagementService.createUser(
      {
        email: "audit@example.com",
        fullName: "Audit Test",
        role: "recruiter",
      },
      adminId,
    );

    const auditEvent = await prisma.auditEvent.findFirst({
      where: {
        action: "user.created",
        resourceType: "User",
      },
    });

    expect(auditEvent).toBeDefined();
    expect(auditEvent.actorId).toBe(adminId);
    expect(auditEvent.metadata).toHaveProperty("email", "audit@example.com");
  });

  it("should log deactivation attempt even when blocked", async () => {
    await expect(
      userManagementService.deactivateUser(adminId, adminId),
    ).rejects.toThrow();

    const auditEvent = await prisma.auditEvent.findFirst({
      where: {
        action: "user.deactivation_blocked",
        actorId: adminId,
      },
    });

    expect(auditEvent).toBeDefined();
  });
});
```

### 6. Frontend E2E Tests

#### File: `/frontend/tests/e2e/admin-user-management.spec.ts`

**Test Cases:**

```typescript
import { test, expect } from "@playwright/test";

test.describe("Admin User Management", () => {
  test.beforeEach(async ({ page }) => {
    // Login as admin
    await page.goto("/login");
    await page.fill('input[name="email"]', "admin@example.com");
    await page.fill('input[name="password"]', "adminPassword");
    await page.click('button[type="submit"]');
    await page.waitForURL("/admin");
  });

  test("should create new user and display temporary password", async ({
    page,
  }) => {
    await page.goto("/admin/users");
    await page.click('button:has-text("Create User")');

    // Fill form
    await page.fill('input[name="fullName"]', "Test User");
    await page.fill('input[name="email"]', "testuser@example.com");
    await page.selectOption('select[name="role"]', "recruiter");

    // Submit
    await page.click('button:has-text("Create")');

    // Verify success message
    await expect(page.locator(".toast-success")).toContainText(
      "User created successfully",
    );

    // Verify temporary password display
    const passwordElement = page.locator("code:has-text(/[A-Za-z0-9]{32,}/)");
    await expect(passwordElement).toBeVisible();

    // Verify copy button works
    await page.click('button:has-text("Copy Password")');
    await expect(page.locator(".toast")).toContainText("Password copied");
  });

  test("should update user role", async ({ page }) => {
    await page.goto("/admin/users");

    // Click edit on first user
    await page.click('button[data-testid="edit-role"]:first');

    // Change role
    await page.selectOption('select[name="role"]', "hr_reviewer");
    await page.check('input[type="checkbox"]:has-text("I understand")');
    await page.click('button:has-text("Update Role")');

    // Verify success
    await expect(page.locator(".toast-success")).toContainText("Role updated");
    await expect(page.locator(".toast-success")).toContainText("next login");
  });

  test("should deactivate user with confirmation", async ({ page }) => {
    await page.goto("/admin/users");

    // Click deactivate
    await page.click('button[data-testid="deactivate"]:first');

    // Verify confirmation modal
    await expect(page.locator("text=Are you sure")).toBeVisible();

    // Confirm
    await page.click('button:has-text("Deactivate User")');

    // Verify success
    await expect(page.locator(".toast-success")).toContainText("deactivated");
  });

  test("should prevent self-deactivation", async ({ page }) => {
    await page.goto("/admin/users");

    // Try to deactivate own account (admin row)
    const adminRow = page.locator('tr:has-text("admin@example.com")');
    const deactivateButton = adminRow.locator(
      'button[data-testid="deactivate"]',
    );

    // Button should be disabled
    await expect(deactivateButton).toBeDisabled();
  });

  test("should filter users by role", async ({ page }) => {
    await page.goto("/admin/users");

    // Select recruiter filter
    await page.selectOption('select[name="roleFilter"]', "recruiter");

    // Verify all visible users have recruiter role
    const roleElements = page.locator('[data-testid="user-role"]');
    const count = await roleElements.count();
    for (let i = 0; i < count; i++) {
      await expect(roleElements.nth(i)).toContainText("recruiter");
    }
  });

  test("should search users by email", async ({ page }) => {
    await page.goto("/admin/users");

    // Search
    await page.fill('input[placeholder*="Search"]', "test@example.com");

    // Verify filtered results
    await expect(page.locator('tr:has-text("test@example.com")')).toBeVisible();
  });
});

test.describe("Deactivated User Experience", () => {
  test("should show error message on login attempt", async ({ page }) => {
    // Create and deactivate test user first
    // ... setup code ...

    await page.goto("/login");
    await page.fill('input[name="email"]', "deactivated@example.com");
    await page.fill('input[name="password"]', "password123");
    await page.click('button[type="submit"]');

    // Verify error message
    await expect(page.locator(".error-message")).toContainText(
      "Your account has been deactivated — contact your administrator",
    );
  });
});
```

### 7. Accessibility Tests

#### File: `/frontend/tests/a11y/admin-users.a11y.test.ts`

**Test Cases:**

```typescript
import { test } from "@playwright/test";
import { injectAxe, checkA11y } from "axe-playwright";

test.describe("User Management Accessibility", () => {
  test("should have no accessibility violations on users page", async ({
    page,
  }) => {
    await page.goto("/admin/users");
    await injectAxe(page);
    await checkA11y(page);
  });

  test("should have accessible create user modal", async ({ page }) => {
    await page.goto("/admin/users");
    await page.click('button:has-text("Create User")');
    await injectAxe(page);
    await checkA11y(page);
  });

  test("should support keyboard navigation", async ({ page }) => {
    await page.goto("/admin/users");

    // Tab to create button
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    // ... verify focus states ...
  });
});
```

## Test Data Setup

Create `/backend/src/__tests__/helpers/userTestData.ts`:

```typescript
export async function createTestAdmin() {
  return await prisma.user.create({
    data: {
      email: "admin@example.com",
      fullName: "Admin User",
      role: "admin",
      active: true,
    },
  });
}

export async function createTestUser(overrides = {}) {
  return await prisma.user.create({
    data: {
      email: `user-${Date.now()}@example.com`,
      fullName: "Test User",
      role: "recruiter",
      active: true,
      ...overrides,
    },
  });
}
```

## Acceptance Criteria

- [ ] All backend unit tests pass (100% coverage for userManagementService)
- [ ] All backend integration tests pass
- [ ] Authentication tests verify deactivation prevention
- [ ] Email service tests verify onboarding email
- [ ] Audit logging tests verify all events logged
- [ ] All frontend E2E tests pass
- [ ] Accessibility tests pass with no violations
- [ ] Tests cover all acceptance criteria from US-001
- [ ] CI/CD pipeline includes all tests
- [ ] Test coverage reports generated

## Related User Story

**US-001 All Acceptance Criteria Verified:**

- ✅ Scenario 1: New user created and receives onboarding email
- ✅ Scenario 2: User deactivated cannot log in
- ✅ Scenario 3: Role assignment takes effect on next login
- ✅ Scenario 4: Admin cannot deactivate their own account

## Dependencies

- All previous tasks (TASK-001 through TASK-005) must be complete
- Test infrastructure (Vitest, Playwright)
- Test database (separate from production)

## Notes

- Use test database or in-memory database for unit tests
- Clean up test data after each test
- Mock external services (email) in unit tests
- Use real services in integration tests where appropriate
- E2E tests should use isolated test environment
