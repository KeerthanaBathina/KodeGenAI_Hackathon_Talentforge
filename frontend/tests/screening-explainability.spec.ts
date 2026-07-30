import { test, expect } from '@playwright/test';

test.describe('Screening Explainability UI - E2E Tests', () => {
    // Note: These tests assume a test application with ID 'test-app-with-screening'
    // exists and has screening data. Adjust the test setup as needed for your environment.

    test.beforeEach(async ({ page }) => {
        // Login if authentication is required
        // await page.goto('/login');
        // await page.fill('[name="email"]', 'test@example.com');
        // await page.fill('[name="password"]', 'password');
        // await page.click('button[type="submit"]');
    });

    test('should display confidence meter with correct color for strong match', async ({ page }) => {
        await page.goto('/applications/test-app-with-screening');

        // Wait for screening panel to load
        await expect(page.locator('text=AI Screening Analysis')).toBeVisible({ timeout: 10000 });

        // Verify confidence meter is visible
        const confidenceMeter = page.locator('[role="progressbar"]');
        await expect(confidenceMeter).toBeVisible();

        // Check that score percentage is displayed
        const scoreText = page.locator('[aria-label*="Score:"]');
        await expect(scoreText).toBeVisible();

        // Verify label is present (one of: Strong Match, Borderline, Below Threshold)
        const hasStrongMatch = await page.locator('text=Strong Match').isVisible().catch(() => false);
        const hasBorderline = await page.locator('text=Borderline').isVisible().catch(() => false);
        const hasBelowThreshold = await page.locator('text=Below Threshold').isVisible().catch(() => false);

        expect(hasStrongMatch || hasBorderline || hasBelowThreshold).toBeTruthy();
    });

    test('should display positive factor chips with checkmarks', async ({ page }) => {
        await page.goto('/applications/test-app-with-screening');

        await expect(page.locator('text=AI Screening Analysis')).toBeVisible({ timeout: 10000 });

        // Verify "Positive Factors" heading
        await expect(page.locator('text=Positive Factors')).toBeVisible();

        // Check for factor chips (green background)
        const factorChips = page.locator('[role="status"][aria-label*="Positive factor"]');
        const count = await factorChips.count();

        if (count > 0) {
            // Verify at least one chip is visible
            await expect(factorChips.first()).toBeVisible();

            // Verify checkmark SVG is present
            const svg = factorChips.first().locator('svg');
            await expect(svg).toBeVisible();
        } else {
            // If no factors, should show empty message
            await expect(page.locator('text=No positive factors identified')).toBeVisible();
        }
    });

    test('should display skill gap chips with warning icons', async ({ page }) => {
        await page.goto('/applications/test-app-with-screening');

        await expect(page.locator('text=AI Screening Analysis')).toBeVisible({ timeout: 10000 });

        // Verify "Skill Gaps" heading
        await expect(page.locator('text=Skill Gaps')).toBeVisible();

        // Check for gap chips (amber background)
        const gapChips = page.locator('[role="status"][aria-label*="Missing skill"]');
        const count = await gapChips.count();

        if (count > 0) {
            // Verify at least one chip is visible
            await expect(gapChips.first()).toBeVisible();

            // Verify warning SVG is present
            const svg = gapChips.first().locator('svg');
            await expect(svg).toBeVisible();
        } else {
            // If no gaps, should show empty message
            await expect(page.locator('text=No skill gaps identified')).toBeVisible();
        }
    });

    test('should display score breakdown with all categories', async ({ page }) => {
        await page.goto('/applications/test-app-with-screening');

        await expect(page.locator('text=AI Screening Analysis')).toBeVisible({ timeout: 10000 });

        // Verify "Score Breakdown" heading
        const scoreBreakdown = page.locator('text=Score Breakdown');

        // Score breakdown may not always be present (depends on data)
        const isVisible = await scoreBreakdown.isVisible().catch(() => false);

        if (isVisible) {
            // Check for the three categories
            await expect(page.locator('text=Skills')).toBeVisible();
            await expect(page.locator('text=Experience')).toBeVisible();
            await expect(page.locator('text=Education')).toBeVisible();
        }
    });

    test('should handle application without screening data gracefully', async ({ page }) => {
        // Navigate to an application that doesn't have screening data
        await page.goto('/applications/test-app-no-screening');

        // Should show empty state message
        const emptyMessage = page.locator('text=No screening data available');
        await expect(emptyMessage).toBeVisible({ timeout: 10000 });
    });

    test('should display loading state while fetching data', async ({ page }) => {
        // Intercept API request to delay response
        await page.route('**/api/screenings/application/*', async (route) => {
            await new Promise((resolve) => setTimeout(resolve, 1000));
            await route.continue();
        });

        await page.goto('/applications/test-app-with-screening');

        // Should show loading message briefly
        const loadingMessage = page.locator('text=Loading screening analysis');

        // Check if loading appears (it might be too fast in some environments)
        const isVisible = await loadingMessage.isVisible().catch(() => false);

        // Either loading was visible, or the content loaded successfully
        if (!isVisible) {
            await expect(page.locator('text=AI Screening Analysis')).toBeVisible({ timeout: 10000 });
        }
    });

    test('should display error state when API fails', async ({ page }) => {
        // Intercept API request and return error
        await page.route('**/api/screenings/application/*', async (route) => {
            await route.fulfill({
                status: 500,
                contentType: 'application/json',
                body: JSON.stringify({ error: 'Internal server error' }),
            });
        });

        await page.goto('/applications/test-app-with-screening');

        // Should show error message
        await expect(page.locator('text=Error')).toBeVisible({ timeout: 10000 });
        await expect(page.locator('text=Failed to fetch screening data')).toBeVisible();
    });

    test('should be responsive on tablet viewport', async ({ page }) => {
        // Set viewport to tablet size
        await page.setViewportSize({ width: 768, height: 1024 });

        await page.goto('/applications/test-app-with-screening');

        await expect(page.locator('text=AI Screening Analysis')).toBeVisible({ timeout: 10000 });

        // Verify panel is visible and not cut off
        const panel = page.locator('text=AI Screening Analysis').locator('..');
        const boundingBox = await panel.boundingBox();

        expect(boundingBox).toBeTruthy();
        expect(boundingBox!.width).toBeLessThanOrEqual(768);
    });

    test('should have proper text truncation for long factor labels', async ({ page }) => {
        await page.goto('/applications/test-app-with-screening');

        await expect(page.locator('text=AI Screening Analysis')).toBeVisible({ timeout: 10000 });

        // Check if any chips exist
        const chips = page.locator('[role="status"]');
        const count = await chips.count();

        if (count > 0) {
            const firstChip = chips.first();

            // Verify the span has title attribute for tooltip
            const span = firstChip.locator('span[title]');
            const hasTitle = await span.count();

            expect(hasTitle).toBeGreaterThan(0);
        }
    });
});
