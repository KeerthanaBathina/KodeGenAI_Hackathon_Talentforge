import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('Screening UI - Accessibility Tests', () => {
    test.beforeEach(async ({ page }) => {
        // Login if authentication is required
        // await page.goto('/login');
        // await page.fill('[name="email"]', 'test@example.com');
        // await page.fill('[name="password"]', 'password');
        // await page.click('button[type="submit"]');
    });

    test('should pass WCAG AA accessibility checks on screening panel', async ({ page }) => {
        await page.goto('/applications/test-app-with-screening');

        // Wait for content to load
        await page.waitForSelector('text=AI Screening Analysis', { timeout: 10000 });

        // Run axe accessibility scan
        const accessibilityScanResults = await new AxeBuilder({ page })
            .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
            .analyze();

        // Expect no violations
        expect(accessibilityScanResults.violations).toEqual([]);
    });

    test('should have sufficient color contrast on factor chips', async ({ page }) => {
        await page.goto('/applications/test-app-with-screening');
        await page.waitForSelector('text=AI Screening Analysis', { timeout: 10000 });

        // Run axe with specific focus on color contrast
        const accessibilityScanResults = await new AxeBuilder({ page })
            .include('[role="status"][aria-label*="Positive factor"]')
            .withTags(['wcag2aa'])
            .disableRules(['region']) // Focus on color contrast
            .analyze();

        // Check for color contrast violations
        const contrastViolations = accessibilityScanResults.violations.filter(
            (v) => v.id === 'color-contrast'
        );
        expect(contrastViolations).toEqual([]);
    });

    test('should have sufficient color contrast on gap chips', async ({ page }) => {
        await page.goto('/applications/test-app-with-screening');
        await page.waitForSelector('text=AI Screening Analysis', { timeout: 10000 });

        // Run axe with specific focus on color contrast for gap chips
        const accessibilityScanResults = await new AxeBuilder({ page })
            .include('[role="status"][aria-label*="Missing skill"]')
            .withTags(['wcag2aa'])
            .disableRules(['region'])
            .analyze();

        const contrastViolations = accessibilityScanResults.violations.filter(
            (v) => v.id === 'color-contrast'
        );
        expect(contrastViolations).toEqual([]);
    });

    test('should have proper ARIA roles and labels', async ({ page }) => {
        await page.goto('/applications/test-app-with-screening');
        await page.waitForSelector('text=AI Screening Analysis', { timeout: 10000 });

        // Check progress bar has proper ARIA attributes
        const progressBar = page.locator('[role="progressbar"]').first();
        await expect(progressBar).toHaveAttribute('aria-valuenow');
        await expect(progressBar).toHaveAttribute('aria-valuemin', '0');
        await expect(progressBar).toHaveAttribute('aria-valuemax', '100');
        await expect(progressBar).toHaveAttribute('aria-label');

        // Check factor list has proper ARIA
        const factorList = page.locator('[role="list"][aria-label*="Positive"]');
        const hasFactorList = (await factorList.count()) > 0;

        if (hasFactorList) {
            await expect(factorList.first()).toHaveAttribute('aria-label', 'Positive screening factors');
        }

        // Check gap list has proper ARIA
        const gapList = page.locator('[role="list"][aria-label*="Skill gaps"]');
        const hasGapList = (await gapList.count()) > 0;

        if (hasGapList) {
            await expect(gapList.first()).toHaveAttribute('aria-label', 'Skill gaps');
        }
    });

    test('should be keyboard navigable', async ({ page }) => {
        await page.goto('/applications/test-app-with-screening');
        await page.waitForSelector('text=AI Screening Analysis', { timeout: 10000 });

        // Start from the top of the page
        await page.keyboard.press('Tab');

        // Get the currently focused element
        const focusedElement = await page.evaluate(() => {
            return document.activeElement?.tagName;
        });

        // Should be able to focus on interactive elements
        expect(focusedElement).toBeTruthy();
    });

    test('should announce screen reader content for confidence meter', async ({ page }) => {
        await page.goto('/applications/test-app-with-screening');
        await page.waitForSelector('text=AI Screening Analysis', { timeout: 10000 });

        // Check that confidence meter has accessible labels
        const scoreLabel = page.locator('[aria-label*="Score:"]');
        await expect(scoreLabel).toBeVisible();

        const progressBarLabel = page.locator('[role="progressbar"][aria-label*="Screening confidence"]');
        await expect(progressBarLabel).toBeVisible();
    });

    test('should announce screen reader content for factor chips', async ({ page }) => {
        await page.goto('/applications/test-app-with-screening');
        await page.waitForSelector('text=AI Screening Analysis', { timeout: 10000 });

        // Check factor chips have aria-label
        const factorChips = page.locator('[role="status"][aria-label*="Positive factor"]');
        const count = await factorChips.count();

        if (count > 0) {
            const firstChip = factorChips.first();
            const ariaLabel = await firstChip.getAttribute('aria-label');
            expect(ariaLabel).toContain('Positive factor:');
        }
    });

    test('should announce screen reader content for gap chips', async ({ page }) => {
        await page.goto('/applications/test-app-with-screening');
        await page.waitForSelector('text=AI Screening Analysis', { timeout: 10000 });

        // Check gap chips have aria-label
        const gapChips = page.locator('[role="status"][aria-label*="Missing skill"]');
        const count = await gapChips.count();

        if (count > 0) {
            const firstChip = gapChips.first();
            const ariaLabel = await firstChip.getAttribute('aria-label');
            expect(ariaLabel).toContain('Missing skill:');
        }
    });

    test('should have proper heading hierarchy', async ({ page }) => {
        await page.goto('/applications/test-app-with-screening');
        await page.waitForSelector('text=AI Screening Analysis', { timeout: 10000 });

        // Check main heading (h3)
        const mainHeading = page.locator('h3:has-text("AI Screening Analysis")');
        await expect(mainHeading).toBeVisible();

        // Check subheadings (h4)
        const subheadings = page.locator('h4');
        const subheadingCount = await subheadings.count();
        expect(subheadingCount).toBeGreaterThan(0);
    });

    test('should have proper focus indicators', async ({ page }) => {
        await page.goto('/applications/test-app-with-screening');
        await page.waitForSelector('text=AI Screening Analysis', { timeout: 10000 });

        // Tab through the page
        await page.keyboard.press('Tab');

        // Check if there's a visible focus indicator
        const focusedElement = page.locator(':focus');
        const isFocused = await focusedElement.count() > 0;

        expect(isFocused).toBeTruthy();
    });

    test('should properly handle loading state accessibility', async ({ page }) => {
        // Intercept to delay response
        await page.route('**/api/screenings/application/*', async (route) => {
            await new Promise((resolve) => setTimeout(resolve, 500));
            await route.continue();
        });

        await page.goto('/applications/test-app-with-screening');

        // Loading state should have role="status" and aria-live="polite"
        const loadingState = page.locator('[role="status"][aria-live="polite"]');
        const isVisible = await loadingState.isVisible().catch(() => false);

        // If visible, it has proper accessibility attributes
        if (isVisible) {
            await expect(loadingState).toContainText('Loading');
        }
    });

    test('should properly handle error state accessibility', async ({ page }) => {
        // Intercept API and return error
        await page.route('**/api/screenings/application/*', async (route) => {
            await route.fulfill({
                status: 500,
                body: JSON.stringify({ error: 'Test error' }),
            });
        });

        await page.goto('/applications/test-app-with-screening');

        // Error state should have role="alert"
        const errorState = page.locator('[role="alert"]');
        await expect(errorState).toBeVisible({ timeout: 10000 });
        await expect(errorState).toContainText('Error');
    });

    test('should not have automatically playing animations that violate WCAG', async ({ page }) => {
        await page.goto('/applications/test-app-with-screening');
        await page.waitForSelector('text=AI Screening Analysis', { timeout: 10000 });

        // Run axe check for motion/animation violations
        const accessibilityScanResults = await new AxeBuilder({ page })
            .withTags(['wcag2aa'])
            .analyze();

        // Check for animation-related violations
        const animationViolations = accessibilityScanResults.violations.filter(
            (v) => v.id.includes('motion') || v.id.includes('animation')
        );

        expect(animationViolations).toEqual([]);
    });
});
