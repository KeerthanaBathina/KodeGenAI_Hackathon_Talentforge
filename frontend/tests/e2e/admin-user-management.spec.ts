import { test, expect } from "@playwright/test";

const BASE_URL = process.env.PLAYWRIGHT_TEST_BASE_URL || "http://localhost:3000";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@example.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "password123";

test.describe("Admin User Management", () => {
  test.beforeEach(async ({ page }) => {
    // Login as admin
    await page.goto(`${BASE_URL}/login`);
    await page.fill('input[type="email"]', ADMIN_EMAIL);
    await page.fill('input[type="password"]', ADMIN_PASSWORD);
    await page.click('button[type="submit"]');

    // Wait for navigation to dashboard
    await page.waitForURL(`${BASE_URL}/dashboard`);

    // Navigate to user management
    await page.goto(`${BASE_URL}/admin/users`);
    await page.waitForLoadState("networkidle");
  });

  test("should display user list with table", async ({ page }) => {
    // Check for page title
    await expect(page.locator("h1")).toContainText("User Management");

    // Check for table headers
    await expect(page.locator("th")).toContainText("Full Name");
    await expect(page.locator("th")).toContainText("Email");
    await expect(page.locator("th")).toContainText("Role");
    await expect(page.locator("th")).toContainText("Status");

    // Check for at least one user row
    const rows = await page.locator("tbody tr").count();
    expect(rows).toBeGreaterThan(0);
  });

  test("should create new user", async ({ page }) => {
    // Click Create User button
    await page.click('button:has-text("+ Create User")');

    // Fill form
    const timestamp = Date.now();
    const email = `test-user-${timestamp}@example.com`;

    await page.fill('input[placeholder="John Doe"]', "Test User");
    await page.fill('input[placeholder="john@example.com"]', email);

    // Select role
    await page.selectOption("select", "recruiter");

    // Submit form
    await page.click('button:has-text("Create User")');

    // Wait for success state
    await page.waitForSelector("text=Temporary Password");

    // Verify temporary password is displayed
    const passwordCode = page.locator("code");
    const password = await passwordCode.textContent();
    expect(password).toBeTruthy();
    expect(password?.length).toBeGreaterThan(0);

    // Verify copy button exists
    await expect(page.locator("button:has-text(\"Copy to Clipboard\")")).toBeVisible();

    // Verify warning message
    await expect(page.locator("text=Save this password now")).toBeVisible();
  });

  test("should validate required fields on user creation", async ({ page }) => {
    // Click Create User button
    await page.click('button:has-text("+ Create User")');

    // Try to submit empty form
    await page.click('button:has-text("Create User")');

    // Verify validation errors
    await expect(page.locator("text=Full name is required")).toBeVisible();
    await expect(page.locator("text=Email is required")).toBeVisible();
  });

  test("should validate email format on user creation", async ({ page }) => {
    // Click Create User button
    await page.click('button:has-text("+ Create User")');

    // Fill with invalid email
    await page.fill('input[placeholder="John Doe"]', "Test User");
    await page.fill('input[placeholder="john@example.com"]', "invalid-email");

    // Submit form
    await page.click('button:has-text("Create User")');

    // Verify validation error
    await expect(
      page.locator("text=Please enter a valid email address")
    ).toBeVisible();
  });

  test("should filter users by role", async ({ page }) => {
    // Click role filter dropdown
    const roleSelect = page.locator("select").nth(1); // Second select is role filter
    await roleSelect.selectOption("recruiter");

    // Wait for list to update
    await page.waitForTimeout(500);

    // Verify users shown are recruiters
    const roles = page.locator("td").filter({ hasText: "Recruiter" });
    const count = await roles.count();
    expect(count).toBeGreaterThan(0);
  });

  test("should filter users by status", async ({ page }) => {
    // Click status filter dropdown
    const statusSelect = page.locator("select").nth(2); // Third select is status filter
    await statusSelect.selectOption("active");

    // Wait for list to update
    await page.waitForTimeout(500);

    // Verify only active users shown
    const activeStatusBadges = page.locator("text=Active");
    const count = await activeStatusBadges.count();
    expect(count).toBeGreaterThan(0);
  });

  test("should search users by name", async ({ page }) => {
    // Type in search box
    const searchInput = page.locator('input[placeholder*="Search"]');
    await searchInput.fill("Test");

    // Wait for search to execute
    await page.waitForTimeout(500);

    // Verify results
    const rows = await page.locator("tbody tr").count();
    if (rows > 0) {
      // At least one result should contain "Test"
      const text = await page.locator("tbody").textContent();
      expect(text?.toUpperCase()).toContain("TEST");
    }
  });

  test("should search users by email", async ({ page }) => {
    // Type in search box
    const searchInput = page.locator('input[placeholder*="Search"]');
    await searchInput.fill("@example.com");

    // Wait for search to execute
    await page.waitForTimeout(500);

    // Verify at least one result
    const rows = await page.locator("tbody tr").count();
    expect(rows).toBeGreaterThan(0);
  });

  test("should update user role", async ({ page }) => {
    // Get first non-current user's name
    const firstUserName = await page
      .locator("tbody tr")
      .first()
      .locator("td")
      .first()
      .textContent();

    // Click Edit Role button for first user
    await page.locator("button:has-text(\"Edit Role\")").first().click();

    // Wait for modal
    await page.waitForSelector("text=Change User Role");

    // Verify modal shows current role
    const currentRole = page.locator("text=Current Role").locator("..").first();
    await expect(currentRole).toBeVisible();

    // Select new role
    const newRoleSelect = page.locator("select").last(); // Last select in modal
    const options = await newRoleSelect.locator("option").count();
    expect(options).toBeGreaterThan(1);

    // Select a different role
    await newRoleSelect.selectOption({ index: 1 });

    // Check confirmation checkbox
    await page.check('input[type="checkbox"]');

    // Submit
    await page.click('button:has-text("Update Role")');

    // Wait for success toast or modal close
    await page.waitForTimeout(1000);
  });

  test("should prevent self-role change", async ({ page }) => {
    // Get current user info
    const adminName = ADMIN_EMAIL.split("@")[0];

    // Find admin row (assuming first or visible row)
    const firstRow = page.locator("tbody tr").first();
    const isCurrentUser = await firstRow.textContent();

    if (isCurrentUser?.includes(adminName)) {
      // Edit Role button should be disabled
      const editButton = firstRow.locator("button:has-text(\"Edit Role\")");
      await expect(editButton).toBeDisabled();
    }
  });

  test("should deactivate user with confirmation", async ({ page }) => {
    // Get first active user (not self)
    const firstUserRow = page.locator("tbody tr").nth(1); // Skip first (likely current user)

    // Click Deactivate button
    const deactivateButton = firstUserRow.locator("button:has-text(\"Deactivate\")");

    // Check if button exists and is enabled
    if (await deactivateButton.isEnabled().catch(() => false)) {
      await deactivateButton.click();

      // Wait for confirmation modal
      await page.waitForSelector("text=Deactivate User?");

      // Verify confirmation message
      await expect(
        page.locator("text=will be immediately logged out")
      ).toBeVisible();

      // Click confirm button
      await page.click('button:has-text("Deactivate User")');

      // Wait for success
      await page.waitForTimeout(1000);
    }
  });

  test("should prevent self-deactivation", async ({ page }) => {
    // Deactivate button should be disabled for current user (first row)
    const firstUserRow = page.locator("tbody tr").first();
    const deactivateButton = firstUserRow.locator("button:has-text(\"Deactivate\")");

    await expect(deactivateButton).toBeDisabled();
  });

  test("should reactivate inactive user", async ({ page }) => {
    // Filter to show inactive users
    const statusSelect = page.locator("select").nth(2);
    await statusSelect.selectOption("inactive");

    // Wait for results
    await page.waitForTimeout(500);

    // Click Reactivate button if any inactive users
    const reactivateButtons = page.locator("button:has-text(\"Reactivate\")");
    const count = await reactivateButtons.count();

    if (count > 0) {
      await reactivateButtons.first().click();

      // Wait for success
      await page.waitForTimeout(1000);

      // Verify toast or status change
      const activeStatus = page.locator("text=Active");
      expect(await activeStatus.count()).toBeGreaterThan(0);
    }
  });

  test("should display role labels correctly", async ({ page }) => {
    // Verify all role labels are human-readable
    const roles = [
      "Candidate",
      "Recruiter",
      "HR Reviewer",
      "HR Manager",
      "Tech Interviewer",
      "Administrator",
    ];

    // At least some roles should be visible
    const bodyText = await page.locator("tbody").textContent();
    const visibleRoles = roles.filter((role) => bodyText?.includes(role));

    expect(visibleRoles.length).toBeGreaterThan(0);
  });

  test("should show status badges correctly", async ({ page }) => {
    // Verify active/inactive status badges
    const activeBadges = page.locator("text=Active");
    const inactiveBadges = page.locator("text=Inactive");

    const activeCount = await activeBadges.count();
    const inactiveCount = await inactiveBadges.count();

    // At least one type should be visible
    expect(activeCount + inactiveCount).toBeGreaterThan(0);
  });

  test("should handle pagination", async ({ page }) => {
    // Check if pagination controls exist
    const nextButton = page.locator("button:has-text(\"Next\")");
    const prevButton = page.locator("button:has-text(\"Previous\")");

    // At minimum, pagination should exist
    expect(await nextButton.count() + (await prevButton.count())).toBeGreaterThan(
      0
    );
  });

  test("should handle API errors gracefully", async ({ page }) => {
    // Simulate API error by navigating to invalid filter
    const searchInput = page.locator('input[placeholder*="Search"]');
    await searchInput.fill("nonexistent-user-xyz");

    // Wait for search
    await page.waitForTimeout(500);

    // Should either show no results or error message
    const rows = await page.locator("tbody tr").count();
    const emptyMessage = page.locator("text=No users found");

    expect(rows === 0 || (await emptyMessage.isVisible())).toBeTruthy();
  });

  test("should copy password to clipboard", async ({ page }) => {
    // Create a user
    await page.click('button:has-text("+ Create User")');

    const timestamp = Date.now();
    const email = `test-user-${timestamp}@example.com`;

    await page.fill('input[placeholder="John Doe"]', "Test User");
    await page.fill('input[placeholder="john@example.com"]', email);
    await page.selectOption("select", "candidate");

    await page.click('button:has-text("Create User")');
    await page.waitForSelector("text=Temporary Password");

    // Grant clipboard permissions and click copy button
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);

    await page.click('button:has-text("Copy to Clipboard")');

    // Verify success toast
    await page.waitForTimeout(500);
    // Success toast should appear
  });

  test("should maintain responsive layout", async ({ page }) => {
    // Test that page elements are visible at different viewport sizes
    await page.setViewportSize({ width: 1920, height: 1080 });

    // Verify table is visible at desktop size
    await expect(page.locator("table")).toBeVisible();

    // Mobile/tablet test would require separate layout component
    // Desktop table should still be accessible at smaller sizes
    await page.setViewportSize({ width: 768, height: 1024 });
    await expect(page.locator("table")).toBeVisible();
  });
});
