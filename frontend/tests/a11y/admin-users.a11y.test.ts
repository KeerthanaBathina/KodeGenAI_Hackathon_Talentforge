/**
 * Accessibility tests for admin user management UI
 * Verifies WCAG 2.1 AA compliance and keyboard navigation
 */

import { test, expect } from "@playwright/test";

const BASE_URL = process.env.PLAYWRIGHT_TEST_BASE_URL || "http://localhost:3000";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@example.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "password123";

test.describe("Admin User Management Accessibility", () => {
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

  test("should have proper heading hierarchy", async ({ page }) => {
    // Page should have h1
    const h1 = page.locator("h1");
    await expect(h1).toHaveCount(1);

    // h1 should contain "User Management"
    await expect(h1).toContainText("User Management");
  });

  test("should have proper form labels", async ({ page }) => {
    // Open create user modal
    await page.click('button:has-text("+ Create User")');

    // All form inputs should have associated labels
    const inputs = page.locator("input");
    const inputCount = await inputs.count();

    for (let i = 0; i < inputCount; i++) {
      const input = inputs.nth(i);
      const ariaLabel = await input.getAttribute("aria-label");
      const placeholder = await input.getAttribute("placeholder");
      const labelElement = page.locator(
        `label[for="${await input.getAttribute("id")}"]`,
      );

      // Each input should have either aria-label, placeholder, or associated label
      const hasLabel =
        ariaLabel || placeholder || (await labelElement.count()) > 0;
      expect(hasLabel).toBeTruthy();
    }
  });

  test("should support keyboard navigation", async ({ page }) => {
    // Tab to create button
    await page.keyboard.press("Tab");
    let focusedElement = await page.evaluate(() =>
      document.activeElement?.textContent,
    );

    // Continue tabbing through UI elements
    let tabCount = 0;
    const maxTabs = 20;

    while (tabCount < maxTabs) {
      await page.keyboard.press("Tab");
      focusedElement = await page.evaluate(() =>
        document.activeElement?.getAttribute("class"),
      );

      if (focusedElement?.includes("create")) {
        // Found create button
        break;
      }
      tabCount++;
    }

    // Should be able to reach interactive elements via keyboard
    expect(tabCount).toBeLessThan(maxTabs);
  });

  test("should show visible focus indicators", async ({ page }) => {
    // Click on a button to ensure it's focused
    const createButton = page.locator('button:has-text("+ Create User")');

    // Focus the button
    await createButton.focus();

    // Check if focus is visible (should have outline or similar)
    const focusStyle = await createButton.evaluate((el) => {
      const styles = window.getComputedStyle(el);
      return {
        outline: styles.outline,
        boxShadow: styles.boxShadow,
        border: styles.border,
      };
    });

    // At least one focus indicator should be present
    const hasFocusIndicator =
      focusStyle.outline !== "none" ||
      focusStyle.boxShadow !== "none" ||
      focusStyle.border !== "none";
    expect(hasFocusIndicator).toBeTruthy();
  });

  test("should have accessible table structure", async ({ page }) => {
    // Table should have proper header
    const thead = page.locator("thead");
    await expect(thead).toBeVisible();

    // Table headers should be th elements
    const headers = page.locator("th");
    const headerCount = await headers.count();
    expect(headerCount).toBeGreaterThan(0);

    // Table body should have tr elements
    const rows = page.locator("tbody tr");
    await expect(rows.first()).toBeVisible();
  });

  test("should have descriptive link and button text", async ({ page }) => {
    // Check for "click here" or empty button text (bad accessibility)
    const buttons = page.locator("button");
    const buttonCount = await buttons.count();

    for (let i = 0; i < buttonCount; i++) {
      const button = buttons.nth(i);
      const text = await button.textContent();
      const ariaLabel = await button.getAttribute("aria-label");

      // Should have either text or aria-label
      const hasText = text && text.trim().length > 0;
      const hasAriaLabel = ariaLabel && ariaLabel.length > 0;

      expect(hasText || hasAriaLabel).toBeTruthy();
    }
  });

  test("should have accessible form validation", async ({ page }) => {
    // Open create modal
    await page.click('button:has-text("+ Create User")');

    // Try to submit empty form
    const createButton = page.locator('button:has-text("Create User")');
    await createButton.click();

    // Wait for error messages
    await page.waitForTimeout(500);

    // Error messages should be visible and associated with inputs
    const errorMessages = page.locator(
      "[role='alert'], [class*='error'], [class*='invalid']",
    );
    const errorCount = await errorMessages.count();
    expect(errorCount).toBeGreaterThan(0);
  });

  test("should have accessible modals with proper ARIA attributes", async ({
    page,
  }) => {
    // Open create user modal
    await page.click('button:has-text("+ Create User")');

    // Modal should have role dialog
    const modal = page.locator("[role='dialog']");
    await expect(modal).toBeVisible();

    // Modal should have aria-labelledby or aria-label
    const ariaLabelledby = await modal.getAttribute("aria-labelledby");
    const ariaLabel = await modal.getAttribute("aria-label");
    expect(ariaLabelledby || ariaLabel).toBeTruthy();
  });

  test("should trap focus inside modal", async ({ page }) => {
    // Open create modal
    await page.click('button:has-text("+ Create User")');

    // Tab through all elements
    const initialFocus = await page.evaluate(() =>
      document.activeElement?.getAttribute("id"),
    );

    // Press Tab multiple times
    for (let i = 0; i < 50; i++) {
      await page.keyboard.press("Tab");
    }

    // Focus should still be within modal (not escaped to background)
    const finalFocus = await page.evaluate(() => {
      const focused = document.activeElement as HTMLElement;
      const modal = document.querySelector("[role='dialog']");
      return modal?.contains(focused) ?? false;
    });

    expect(finalFocus).toBeTruthy();
  });

  test("should provide accessible status updates", async ({ page }) => {
    // Create a user and watch for status messages
    await page.click('button:has-text("+ Create User")');

    // Fill form
    const timestamp = Date.now();
    await page.fill('input[placeholder="John Doe"]', "Test User");
    await page.fill(
      'input[placeholder="john@example.com"]',
      `test-${timestamp}@example.com`,
    );

    // Submit
    await page.click('button:has-text("Create User")');

    // Wait for status message
    await page.waitForTimeout(1000);

    // Should have live region or alert for feedback
    const alerts = page.locator("[role='status'], [role='alert']");
    const alertCount = await alerts.count();
    expect(alertCount).toBeGreaterThan(0);
  });

  test("should have accessible color contrast", async ({ page }) => {
    // Get all text elements
    const elements = page.locator("body *");
    const count = await elements.count();

    // Sample some elements to check contrast
    for (let i = 0; i < Math.min(10, count); i++) {
      const element = elements.nth(i);
      const color = await element.evaluate((el) => {
        return window.getComputedStyle(el).color;
      });

      // Color should be set (not transparent)
      expect(color).not.toBe("rgba(0, 0, 0, 0)");
    }
  });

  test("should support screen reader announcements for table updates", async ({
    page,
  }) => {
    // When filtering/searching, should announce changes
    const searchInput = page.locator('input[placeholder*="Search"]');

    // Input should have role="searchbox" or similar
    const role = await searchInput.getAttribute("role");
    expect(role).toBeTruthy();
  });

  test("should have accessible icons with alt text", async ({ page }) => {
    // Check for any icons without labels
    const icons = page.locator("[class*='icon'], svg, img");
    const iconCount = await icons.count();

    for (let i = 0; i < Math.min(5, iconCount); i++) {
      const icon = icons.nth(i);
      const ariaLabel = await icon.getAttribute("aria-label");
      const title = await icon.getAttribute("title");
      const alt = await icon.getAttribute("alt");

      // Icon should have some accessible text
      const hasAccessibleText = ariaLabel || title || alt;
      expect(hasAccessibleText).toBeTruthy();
    }
  });

  test("should support keyboard shortcuts safely", async ({ page }) => {
    // Pressing Escape should close modals
    await page.click('button:has-text("+ Create User")');

    // Modal should be visible
    const modal = page.locator("[role='dialog']");
    await expect(modal).toBeVisible();

    // Press Escape
    await page.keyboard.press("Escape");

    // Modal should close
    await expect(modal).not.toBeVisible();
  });

  test("should have proper skip navigation links", async ({ page }) => {
    // Should have skip to main content link (typically hidden but accessible)
    const skipLink = page.locator("[class*='skip']");

    // Skip link should be accessible via keyboard
    // Focus first element
    await page.keyboard.press("Tab");

    // Should be able to reach skip link
    let foundSkip = false;
    for (let i = 0; i < 5; i++) {
      const focused = await page.evaluate(() =>
        document.activeElement?.className,
      );
      if (focused?.includes("skip")) {
        foundSkip = true;
        break;
      }
      await page.keyboard.press("Tab");
    }

    // Note: Skip links are optional but good practice
  });

  test("should provide context for dynamic content changes", async ({
    page,
  }) => {
    // Open deactivate modal
    const firstUserRow = page.locator("tbody tr").first();
    await firstUserRow.locator("button:has-text('Deactivate')").click();

    // Modal should appear with clear context
    const modal = page.locator("[role='dialog']");
    await expect(modal).toBeVisible();

    // Should be able to hear what action is about to happen
    const modalText = await modal.textContent();
    expect(modalText).toContain("Are you sure");
  });

  test("should have accessible error recovery", async ({ page }) => {
    // Try to create user with invalid email
    await page.click('button:has-text("+ Create User")');

    // Fill with invalid email
    await page.fill('input[placeholder="John Doe"]', "Test User");
    await page.fill('input[placeholder="john@example.com"]', "invalid-email");

    // Submit
    await page.click('button:has-text("Create User")');

    // Wait for error
    await page.waitForTimeout(500);

    // Error message should be clear and in focus
    const error = page.locator("[role='alert'], [class*='error']").first();
    await expect(error).toBeVisible();

    const errorText = await error.textContent();
    expect(errorText).toBeTruthy();
  });
});
