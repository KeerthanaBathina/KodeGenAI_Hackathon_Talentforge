import { test, expect } from '@playwright/test';

test.describe('Notification Preferences', () => {
  test.beforeEach(async ({ page }) => {
    // Login
    await page.goto('/login');
    await page.fill('[name="email"]', 'test@example.com');
    await page.fill('[name="password"]', 'Test123!');
    await page.click('button[type="submit"]');
    await page.waitForURL('/dashboard');
  });

  test('should display preference grid', async ({ page }) => {
    // Navigate to preferences
    await page.goto('/settings/notifications');

    // Verify grid loads
    await expect(page.locator('h1')).toHaveText('Notification Preferences');

    // Verify all notification types displayed (9 types × 2 channels = 18 toggles)
    await expect(page.locator('[id^="toggle-"]')).toHaveCount(18);
  });

  test('should toggle and save preference', async ({ page }) => {
    await page.goto('/settings/notifications');

    // Toggle email preference off
    const toggle = page.locator('#toggle-REVIEW_ASSIGNED-EMAIL');
    await toggle.click();

    // Verify save button appears
    await expect(page.locator('button:has-text("Save Preferences")')).toBeVisible();

    // Save preferences
    await page.click('button:has-text("Save Preferences")');

    // Verify success message
    await expect(page.locator('text=Preferences saved successfully')).toBeVisible({ timeout: 10000 });
  });

  test('should persist preference after logout/login', async ({ page, context }) => {
    await page.goto('/settings/notifications');

    // Toggle preference off
    const toggle = page.locator('#toggle-DECISION_MADE-EMAIL');
    await toggle.click();
    await page.click('button:has-text("Save Preferences")');
    await expect(page.locator('text=Preferences saved successfully')).toBeVisible({ timeout: 10000 });

    // Logout
    await page.click('[data-testid="user-menu"]');
    await page.click('text=Logout');

    // Login again
    await page.goto('/login');
    await page.fill('[name="email"]', 'test@example.com');
    await page.fill('[name="password"]', 'Test123!');
    await page.click('button[type="submit"]');
    await page.waitForURL('/dashboard');

    // Navigate to preferences
    await page.goto('/settings/notifications');

    // Verify toggle still off
    const toggleAfterLogin = page.locator('#toggle-DECISION_MADE-EMAIL');
    await expect(toggleAfterLogin).toHaveAttribute('aria-checked', 'false');
  });

  test('should show lock for system-critical types', async ({ page }) => {
    // Note: This test verifies lock icon rendering logic
    await page.goto('/settings/notifications');

    // If any system-critical types exist, verify lock shown
    const lockIcons = page.locator('[title="This notification type cannot be disabled"]');
    const count = await lockIcons.count();
    
    // Should be 0 with current config (no system-critical types defined yet)
    expect(count).toBe(0);
  });

  test('should reset preferences to defaults', async ({ page }) => {
    await page.goto('/settings/notifications');

    // Change some preferences
    await page.locator('#toggle-REVIEW_ASSIGNED-EMAIL').click();
    await page.locator('#toggle-DECISION_MADE-IN_APP').click();
    
    await page.click('button:has-text("Save Preferences")');
    await expect(page.locator('text=Preferences saved successfully')).toBeVisible({ timeout: 10000 });

    // Reset to defaults
    await page.click('button:has-text("Reset to Defaults")');
    
    // Confirm dialog (if any)
    page.on('dialog', dialog => dialog.accept());

    // Verify success message
    await expect(page.locator('text=Preferences reset')).toBeVisible({ timeout: 10000 });

    // Verify toggles are back to defaults (all enabled by default)
    await expect(page.locator('#toggle-REVIEW_ASSIGNED-EMAIL')).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator('#toggle-DECISION_MADE-IN_APP')).toHaveAttribute('aria-checked', 'true');
  });

  test('should disable save button when no changes', async ({ page }) => {
    await page.goto('/settings/notifications');

    // Save button should be disabled initially (no changes)
    await expect(page.locator('button:has-text("Save Preferences")')).toBeDisabled();

    // Toggle a preference
    await page.locator('#toggle-REVIEW_ASSIGNED-EMAIL').click();

    // Save button should now be enabled
    await expect(page.locator('button:has-text("Save Preferences")')).toBeEnabled();
  });

  test('should show all notification types with correct labels', async ({ page }) => {
    await page.goto('/settings/notifications');

    // Verify all 9 notification types are displayed with human-readable labels
    const expectedTypes = [
      'Application Status Change',
      'Review Assignment',
      'Decision Made',
      'Interview Scheduled',
      'Scorecard Submitted',
      'Offer Approval',
      'Offer Extended',
      'SLA Warning',
      'Path Override Request'
    ];

    for (const type of expectedTypes) {
      await expect(page.locator(`text=${type}`)).toBeVisible();
    }
  });

  test('should have Email and In-App columns', async ({ page }) => {
    await page.goto('/settings/notifications');

    // Verify column headers
    await expect(page.locator('th:has-text("Notification Type")')).toBeVisible();
    await expect(page.locator('th:has-text("Email")')).toBeVisible();
    await expect(page.locator('th:has-text("In-App")')).toBeVisible();
  });
});
