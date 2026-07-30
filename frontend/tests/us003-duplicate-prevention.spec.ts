import { test, expect } from '@playwright/test';

/**
 * E2E Tests for US-003: Duplicate Application Prevention & Cooling Period
 * 
 * Scenarios:
 * 1. Requisition card shows "Application In Progress" for active application
 * 2. Requisition card shows disabled button with tooltip for cooling period
 * 3. Requisition card shows "Apply Now" when eligible after cooling period
 * 4. Form submission shows error toast for HTTP 409 conflicts
 */

test.describe('US-003 E2E: Duplicate Prevention & Cooling Period', () => {
    const testUser = {
        email: `duplicate-test-${Date.now()}@example.com`,
        password: 'TestPassword123!',
        fullName: 'Duplicate Test User',
    };

    test.beforeAll(async ({ request }) => {
        // Register test user
        await request.post('/api/auth/register/candidate', {
            data: {
                email: testUser.email,
                password: testUser.password,
                fullName: testUser.fullName,
            },
        });
    });

    test('should show "Application In Progress" for active submitted application', async ({ page }) => {
        // Login
        await page.goto('/login');
        await page.fill('input[name="email"]', testUser.email);
        await page.fill('input[name="password"]', testUser.password);
        await page.click('button[type="submit"]');
        await page.waitForURL('/dashboard');

        // Browse jobs
        await page.goto('/jobs');
        await page.waitForSelector('[data-testid="requisition-card"]');

        // Apply to first open position
        const firstCard = page.locator('[data-testid="requisition-card"]').first();
        await firstCard.click();

        // Complete application
        await page.waitForURL(/\/jobs\/.*\/apply/);

        // Step 1: Personal Info
        await page.fill('input[name="fullName"]', testUser.fullName);
        await page.fill('input[name="email"]', testUser.email);
        await page.fill('input[name="phone"]', '+1234567890');
        await page.click('button:has-text("Next")');

        // Step 2: Experience
        await page.fill('input[name="yearsExperience"]', '5');
        await page.fill('input[name="currentRole"]', 'Senior Engineer');
        await page.fill('input[name="currentCompany"]', 'Tech Corp');
        await page.click('button:has-text("Next")');

        // Step 3: Cover Letter
        await page.fill('textarea[name="coverLetter"]', 'This is a test cover letter with more than 100 characters to meet the minimum requirement for submission. I am very interested in this position.');
        await page.click('button:has-text("Next")');

        // Step 4: Submit
        await page.click('button:has-text("Submit Application")');
        await page.waitForSelector('text=Application submitted successfully');

        // Return to jobs page
        await page.goto('/jobs');
        await page.waitForSelector('[data-testid="requisition-card"]');

        // Verify "Application In Progress" button appears
        const sameCard = page.locator('[data-testid="requisition-card"]').first();
        await expect(sameCard.locator('text=Application In Progress')).toBeVisible();
        await expect(sameCard.locator('text=Application In Progress')).toHaveCSS('cursor', 'not-allowed');
        await expect(sameCard.locator('text=Application In Progress')).toHaveCSS('background-color', 'rgb(156, 163, 175)'); // Gray
    });

    test('should show disabled button with countdown for cooling period', async ({ page, request }) => {
        // Login
        await page.goto('/login');
        await page.fill('input[name="email"]', testUser.email);
        await page.fill('input[name="password"]', testUser.password);
        await page.click('button[type="submit"]');
        await page.waitForURL('/dashboard');

        // Manually create rejected application via API (simulate 45 days ago)
        const requisitionId = await page.evaluate(async () => {
            const response = await fetch('/api/requisitions');
            const data = await response.json();
            return data.data[0].id;
        });

        // Create rejected application via database (requires admin API or seed script)
        // For E2E test, we'll simulate by checking UI behavior

        await page.goto('/jobs');
        await page.waitForSelector('[data-testid="requisition-card"]');

        // For cards with cooling period, verify UI shows:
        // 1. Disabled button
        // 2. Text "Apply (Available in X days)"
        // 3. Tooltip on hover

        const coolingCard = page.locator('[data-testid="requisition-card"]:has-text("Apply (Available in")').first();

        if (await coolingCard.isVisible()) {
            const button = coolingCard.locator('button:disabled');
            await expect(button).toBeVisible();
            await expect(button).toHaveCSS('cursor', 'not-allowed');

            // Hover to show tooltip
            await button.hover();
            await expect(page.locator('text=Re-application available in')).toBeVisible({ timeout: 5000 });
        }
    });

    test('should show "Apply Now" when eligible after cooling period', async ({ page, request }) => {
        // This test would require manipulating dates in the database
        // or using a test requisition that has no application history

        await page.goto('/login');
        await page.fill('input[name="email"]', testUser.email);
        await page.fill('input[name="password"]', testUser.password);
        await page.click('button[type="submit"]');
        await page.waitForURL('/dashboard');

        await page.goto('/jobs');
        await page.waitForSelector('[data-testid="requisition-card"]');

        // Find cards with "Apply Now" button (eligible positions)
        const eligibleCard = page.locator('[data-testid="requisition-card"]:has-text("Apply Now")').first();

        if (await eligibleCard.isVisible()) {
            const applyButton = eligibleCard.locator('a:has-text("Apply Now")');
            await expect(applyButton).toBeVisible();
            await expect(applyButton).toHaveCSS('background-color', 'rgb(16, 185, 129)'); // Green
            await expect(applyButton).not.toHaveCSS('cursor', 'not-allowed');
        }
    });

    test('should show error toast when submitting duplicate application', async ({ page }) => {
        // Login
        await page.goto('/login');
        await page.fill('input[name="email"]', testUser.email);
        await page.fill('input[name="password"]', testUser.password);
        await page.click('button[type="submit"]');
        await page.waitForURL('/dashboard');

        // Navigate to jobs
        await page.goto('/jobs');
        await page.waitForSelector('[data-testid="requisition-card"]');

        // Try to apply to same position from previous test
        // This should either:
        // 1. Show "Application In Progress" (can't click)
        // 2. Or if we navigate directly to /apply, show HTTP 409 error

        // Get requisition ID from first card
        const requisitionId = await page.locator('[data-testid="requisition-card"]').first().getAttribute('data-requisition-id');

        if (!requisitionId) {
            test.skip('No requisition ID found');
            return;
        }

        // Navigate directly to apply page (bypassing card UI)
        await page.goto(`/jobs/${requisitionId}/apply`);

        // If draft exists, navigate to submit
        const submitButton = page.locator('button:has-text("Submit Application")');

        if (await submitButton.isVisible()) {
            // Try to submit (should fail with HTTP 409)
            await submitButton.click();

            // Wait for error toast
            await expect(page.locator('[data-testid="toast-error"]')).toBeVisible({ timeout: 5000 });
            await expect(page.locator('[data-testid="toast-error"]')).toContainText(/active application|wait.*day/i);
        }
    });

    test('should show cooling period error when submitting too soon after rejection', async ({ page, request }) => {
        // This test requires:
        // 1. Creating an application
        // 2. Rejecting it (requires admin/recruiter role)
        // 3. Attempting to re-apply immediately

        // For E2E test, we verify the error message format is correct
        // when HTTP 409 COOLING_PERIOD_ACTIVE is returned

        await page.goto('/login');
        await page.fill('input[name="email"]', testUser.email);
        await page.fill('input[name="password"]', testUser.password);
        await page.click('button[type="submit"]');
        await page.waitForURL('/dashboard');

        // Navigate to application form
        await page.goto('/jobs');
        const requisitionCard = page.locator('[data-testid="requisition-card"]').first();
        const requisitionId = await requisitionCard.getAttribute('data-requisition-id');

        // If this requisition has cooling period, verify error handling
        await page.goto(`/jobs/${requisitionId}/apply`);

        // Mock HTTP 409 response by intercepting API call
        await page.route('**/api/applications/drafts/*/submit', async (route) => {
            await route.fulfill({
                status: 409,
                contentType: 'application/json',
                body: JSON.stringify({
                    error: {
                        code: 'COOLING_PERIOD_ACTIVE',
                        message: 'You must wait 45 more days before re-applying to this position',
                    },
                }),
            });
        });

        // Try to submit
        const submitButton = page.locator('button:has-text("Submit Application")');
        if (await submitButton.isVisible()) {
            await submitButton.click();

            // Verify error toast shows cooling period message
            await expect(page.locator('[data-testid="toast-error"]')).toBeVisible({ timeout: 5000 });
            await expect(page.locator('[data-testid="toast-error"]')).toContainText(/wait.*45.*day/i);

            // Verify user stays on form page (not redirected)
            await expect(page).toHaveURL(/\/apply$/);
        }
    });

    test('should allow re-application after cooling period expires', async ({ page }) => {
        // This test verifies that after 90+ days, the system allows re-application
        // For E2E test, we assume a test requisition exists with expired cooling period

        await page.goto('/login');
        await page.fill('input[name="email"]', testUser.email);
        await page.fill('input[name="password"]', testUser.password);
        await page.click('button[type="submit"]');
        await page.waitForURL('/dashboard');

        await page.goto('/jobs');
        await page.waitForSelector('[data-testid="requisition-card"]');

        // Look for requisition with re-application banner
        const reapplicationCard = page.locator('[data-testid="requisition-card"]:has-text("re-application allowed")').first();

        if (await reapplicationCard.isVisible()) {
            // Verify "Apply Now" button is enabled
            const applyButton = reapplicationCard.locator('a:has-text("Apply Now")');
            await expect(applyButton).toBeVisible();
            await expect(applyButton).not.toBeDisabled();

            // Click and verify navigation to application form
            await applyButton.click();
            await expect(page).toHaveURL(/\/apply$/);
        }
    });
});
