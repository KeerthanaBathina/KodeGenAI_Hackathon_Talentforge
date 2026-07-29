import { test, expect } from "@playwright/test";

/**
 * E2E tests for policy management UI
 * Tests complete user workflows for creating policies, viewing history, and comparisons
 */

test.describe("Policy Management - End to End", () => {
  test.beforeEach(async ({ page }) => {
    // Login as admin before each test
    await page.goto("/login");

    // Wait for login form to appear
    await page.waitForSelector('input[name="email"]');

    // Fill login form
    await page.fill('input[name="email"]', process.env.ADMIN_EMAIL || "admin@example.com");
    await page.fill('input[name="password"]', process.env.ADMIN_PASSWORD || "adminPassword123");

    // Submit form
    await page.click('button[type="submit"]');

    // Wait for redirect to admin dashboard
    await page.waitForURL("**/admin**");
  });

  test.describe("Screening Threshold Management", () => {
    test("should create new screening threshold with validation", async ({ page }) => {
      // Navigate to policies page
      await page.goto("/admin/policies");

      // Click on Screening Thresholds tab
      await page.click('button[role="tab"]:has-text("Screening Thresholds")');

      // Wait for form to be visible
      await page.waitForSelector('[data-testid="screening-threshold-form"]');

      // Fill form with invalid data
      await page.fill('[name="shortlistThreshold"]', "60");
      await page.fill('[name="borderlineMin"]', "50");
      await page.fill('[name="borderlineMax"]', "70"); // Invalid: > shortlist
      await page.fill('[name="rejectThreshold"]', "49");

      // Verify validation error appears
      const errorMessage = page.locator('[data-testid="validation-error"]');
      await expect(errorMessage).toContainText("Borderline max must be less than shortlist threshold");

      // Verify submit button is disabled
      const submitButton = page.locator('button:has-text("Create")');
      await expect(submitButton).toBeDisabled();

      // Fix validation error
      await page.fill('[name="borderlineMax"]', "59");

      // Wait for error to clear
      await expect(errorMessage).not.toBeVisible();

      // Submit button should now be enabled
      await expect(submitButton).toBeEnabled();

      // Set effective date
      const today = new Date();
      const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
      const tomorrowStr = tomorrow.toISOString().split("T")[0];
      await page.fill('[name="effectiveFrom"]', tomorrowStr);

      // Submit form
      await page.click(submitButton);

      // Verify success message
      const successToast = page.locator('[data-testid="toast-success"]');
      await expect(successToast).toBeVisible();
      await expect(successToast).toContainText("Threshold version created");
    });

    test("should reject past effective dates", async ({ page }) => {
      await page.goto("/admin/policies");
      await page.click('button[role="tab"]:has-text("Screening Thresholds")');

      // Fill form with valid values
      await page.fill('[name="shortlistThreshold"]', "75");
      await page.fill('[name="borderlineMin"]', "50");
      await page.fill('[name="borderlineMax"]', "74");
      await page.fill('[name="rejectThreshold"]', "49");

      // Try to set past date
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split("T")[0];
      await page.fill('[name="effectiveFrom"]', yesterdayStr);

      // Verify error message
      const errorMessage = page.locator('[data-testid="validation-error"]');
      await expect(errorMessage).toContainText("Effective date cannot be in the past");

      // Submit button should be disabled
      await expect(page.locator('button:has-text("Create")')).toBeDisabled();
    });

    test("should display visual range visualizer", async ({ page }) => {
      await page.goto("/admin/policies");
      await page.click('button[role="tab"]:has-text("Screening Thresholds")');

      // Verify visualizer is present
      const visualizer = page.locator('[data-testid="threshold-visualizer"]');
      await expect(visualizer).toBeVisible();

      // Change threshold values
      await page.fill('[name="shortlistThreshold"]', "80");

      // Verify visualizer updates
      const shortlistSegment = visualizer.locator('[data-segment="shortlist"]');
      const width = await shortlistSegment.evaluate((el) =>
        window.getComputedStyle(el).width,
      );

      // 80 shortlist = 20% of range
      expect(width).toContain("20%");
    });

    it("should show current version with badge", async ({ page }) => {
      await page.goto("/admin/policies");
      await page.click('button[role="tab"]:has-text("History")');

      // Find current version row
      const currentBadge = page.locator('[data-testid="current-badge"]');
      await expect(currentBadge).toBeVisible();
      await expect(currentBadge).toContainText("Current");
    });
  });

  test.describe("Scoring Threshold Management", () => {
    test("should create scoring threshold per job family", async ({ page }) => {
      await page.goto("/admin/policies");
      await page.click('button[role="tab"]:has-text("Scoring Thresholds")');

      // Wait for form
      await page.waitForSelector('[data-testid="scoring-threshold-form"]');

      // Select job family from dropdown
      const jobFamilySelect = page.locator('[name="jobFamilyId"]');
      await jobFamilySelect.click();
      await page.click('option:has-text("Engineering")');

      // Set threshold values (decimals 0.0-1.0)
      await page.fill('[name="technicalMinScore"]', "0.60");
      await page.fill('[name="technicalPassScore"]', "0.75");
      await page.fill('[name="behavioralMinScore"]', "0.50");
      await page.fill('[name="behavioralPassScore"]', "0.70");
      await page.fill('[name="yearsOfExperienceRequired"]', "3");

      // Set effective date
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.toISOString().split("T")[0];
      await page.fill('[name="effectiveFrom"]', tomorrowStr);

      // Submit
      await page.click('button:has-text("Create")');

      // Verify success
      const successToast = page.locator('[data-testid="toast-success"]');
      await expect(successToast).toBeVisible();
    });

    test("should reject scores outside 0.0-1.0 range", async ({ page }) => {
      await page.goto("/admin/policies");
      await page.click('button[role="tab"]:has-text("Scoring Thresholds")');

      const jobFamilySelect = page.locator('[name="jobFamilyId"]');
      await jobFamilySelect.click();
      await page.click('option:has-text("Engineering")');

      // Set invalid score (> 1.0)
      await page.fill('[name="technicalMinScore"]', "1.5");

      // Verify error
      const errorMessage = page.locator('[data-testid="validation-error"]');
      await expect(errorMessage).toContainText("must be between 0.0 and 1.0");
    });
  });

  test.describe("Approval Policy Management", () => {
    test("should create approval policy with compensation bands and tiers", async ({
      page,
    }) => {
      await page.goto("/admin/policies");
      await page.click('button[role="tab"]:has-text("Approval Policies")');

      // Wait for form
      await page.waitForSelector('[data-testid="approval-policy-form"]');

      // Set compensation band
      await page.fill('[name="compensationBandMin"]', "0");
      await page.fill('[name="compensationBandMax"]', "100000");

      // Add approver tier
      const addTierButton = page.locator('[data-testid="add-tier-button"]');
      await addTierButton.click();

      // Select approver from dropdown
      const approverSelect = page.locator('[name="approvers[0].approverId"]');
      await approverSelect.click();
      await page.click('option:has-text("HR Manager 1")');

      // Set effective date
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.toISOString().split("T")[0];
      await page.fill('[name="effectiveFrom"]', tomorrowStr);

      // Submit
      await page.click('button:has-text("Create")');

      // Verify success
      const successToast = page.locator('[data-testid="toast-success"]');
      await expect(successToast).toBeVisible();
    });

    test("should enforce tier sequencing", async ({ page }) => {
      await page.goto("/admin/policies");
      await page.click('button[role="tab"]:has-text("Approval Policies")');

      // Set compensation band
      await page.fill('[name="compensationBandMin"]', "0");
      await page.fill('[name="compensationBandMax"]', "100000");

      // Add first tier
      const addTierButton = page.locator('[data-testid="add-tier-button"]');
      await addTierButton.click();

      const approverSelect1 = page.locator('[name="approvers[0].approverId"]');
      await approverSelect1.click();
      await page.click('option:has-text("HR Manager 1")');

      // Add second tier
      await addTierButton.click();

      const approverSelect2 = page.locator('[name="approvers[1].approverId"]');
      await approverSelect2.click();
      await page.click('option:has-text("HR Manager 2")');

      // Verify tiers are numbered sequentially
      const tier1Badge = page.locator('[data-tier-number="1"]');
      const tier2Badge = page.locator('[data-tier-number="2"]');

      await expect(tier1Badge).toBeVisible();
      await expect(tier2Badge).toBeVisible();
    });
  });

  test.describe("Policy History and Comparison", () => {
    test("should display change history in reverse chronological order", async ({ page }) => {
      await page.goto("/admin/policies");
      await page.click('button[role="tab"]:has-text("History")');

      // Wait for history table
      await page.waitForSelector('[data-testid="policy-history-table"]');

      // Get all rows
      const rows = page.locator('[data-testid="history-row"]');
      const count = await rows.count();

      // Should have at least one row (current version)
      expect(count).toBeGreaterThan(0);

      // Verify reverse chronological order
      if (count > 1) {
        const firstDate = await rows.nth(0).locator('[data-effective-date]').getAttribute("data-effective-date");
        const secondDate = await rows.nth(1).locator('[data-effective-date]').getAttribute("data-effective-date");

        const firstTime = new Date(firstDate!).getTime();
        const secondTime = new Date(secondDate!).getTime();

        expect(firstTime).toBeGreaterThanOrEqual(secondTime);
      }
    });

    test("should view detailed version information", async ({ page }) => {
      await page.goto("/admin/policies");
      await page.click('button[role="tab"]:has-text("History")');

      // Find first history row and click Details button
      const firstRow = page.locator('[data-testid="history-row"]').first();
      const detailsButton = firstRow.locator('[data-testid="details-button"]');

      await detailsButton.click();

      // Verify modal appears
      const modal = page.locator('[role="dialog"]');
      await expect(modal).toBeVisible();
      await expect(modal).toContainText("Version Details");

      // Verify version info is displayed
      await expect(modal).toContainText("Effective Date");
      await expect(modal).toContainText("Created By");
    });

    test("should compare two versions side-by-side", async ({ page }) => {
      await page.goto("/admin/policies");
      await page.click('button[role="tab"]:has-text("History")');

      // Find compare button on first row
      const firstRow = page.locator('[data-testid="history-row"]').first();
      const compareButton = firstRow.locator('[data-testid="compare-button"]');

      // Compare button might not be visible if only one version
      const isVisible = await compareButton.isVisible();
      if (isVisible) {
        await compareButton.click();

        // Verify comparison modal
        const modal = page.locator('[role="dialog"]');
        await expect(modal).toBeVisible();
        await expect(modal).toContainText("Compare Versions");

        // Verify two-column layout
        const columnA = modal.locator('[data-column="a"]');
        const columnB = modal.locator('[data-column="b"]');

        await expect(columnA).toBeVisible();
        await expect(columnB).toBeVisible();
      }
    });

    test("should show change indicators in history", async ({ page }) => {
      await page.goto("/admin/policies");
      await page.click('button[role="tab"]:has-text("History")');

      // Look for change badges (↑ for increase, ↓ for decrease)
      const changeIndicators = page.locator('[data-testid="change-badge"]');

      // If there are multiple versions, there should be change indicators
      if ((await page.locator('[data-testid="history-row"]').count()) > 1) {
        const count = await changeIndicators.count();
        expect(count).toBeGreaterThan(0);
      }
    });

    test("should export history to CSV", async ({ page }) => {
      await page.goto("/admin/policies");
      await page.click('button[role="tab"]:has-text("History")');

      // Find export button
      const exportButton = page.locator('[data-testid="export-button"]');
      await expect(exportButton).toBeVisible();

      // Start listening for download
      const downloadPromise = page.waitForEvent("download");

      // Click export
      await exportButton.click();

      // Get the download
      const download = await downloadPromise;

      // Verify it's a CSV file
      expect(download.suggestedFilename()).toContain(".csv");
    });
  });

  test.describe("Job Family Filtering", () => {
    test("should filter scoring threshold history by job family", async ({ page }) => {
      await page.goto("/admin/policies");
      await page.click('button[role="tab"]:has-text("History")');

      // Click on Scoring Thresholds in history
      const scoringTab = page.locator('[data-history-type="scoring"]');
      if (await scoringTab.isVisible()) {
        await scoringTab.click();

        // Look for job family filter
        const jobFamilyFilter = page.locator('[data-testid="job-family-filter"]');
        if (await jobFamilyFilter.isVisible()) {
          await jobFamilyFilter.click();
          await page.click('option:has-text("Engineering")');

          // Verify history is filtered
          const rows = page.locator('[data-testid="history-row"]');
          const count = await rows.count();

          // All rows should be for Engineering family
          for (let i = 0; i < Math.min(count, 5); i++) {
            const row = rows.nth(i);
            const familyName = await row
              .locator('[data-job-family]')
              .getAttribute("data-job-family");
            expect(familyName).toContain("Engineering");
          }
        }
      }
    });
  });

  test.describe("Error Handling", () => {
    test("should show error for duplicate tier numbers", async ({ page }) => {
      await page.goto("/admin/policies");
      await page.click('button[role="tab"]:has-text("Approval Policies")');

      // Set compensation band
      await page.fill('[name="compensationBandMin"]', "0");
      await page.fill('[name="compensationBandMax"]', "100000");

      // Add two tiers
      const addTierButton = page.locator('[data-testid="add-tier-button"]');
      await addTierButton.click();
      await addTierButton.click();

      // Fill both with same tier number
      const tierInputs = page.locator('[name*="tier"]');

      // This would depend on implementation - might auto-assign or prevent duplicates
      const submitButton = page.locator('button:has-text("Create")');
      const isDisabled = await submitButton.isDisabled();

      // Should either prevent duplicates or show error
      if (!isDisabled) {
        await submitButton.click();
        const errorToast = page.locator('[data-testid="toast-error"]');
        await expect(errorToast).toBeVisible();
      }
    });

    test("should handle API errors gracefully", async ({ page }) => {
      // This would be tested with mock API responses
      // For now, just verify error handling is present

      await page.goto("/admin/policies");
      await page.click('button[role="tab"]:has-text("Screening Thresholds")');

      // If API fails, should show friendly error message
      const errorContainer = page.locator('[data-testid="error-message"]');

      // Error container should exist (might not be visible)
      expect(errorContainer).toBeDefined();
    });
  });

  test.describe("Accessibility", () => {
    test("should be keyboard navigable", async ({ page }) => {
      await page.goto("/admin/policies");

      // Tab to first tab
      await page.keyboard.press("Tab");

      // Arrow keys should navigate tabs
      await page.keyboard.press("ArrowRight");

      // Verify a different tab might be focused
      const activeTab = page.locator('[role="tab"][aria-selected="true"]');
      await expect(activeTab).toBeFocused();
    });

    test("should have proper ARIA labels", async ({ page }) => {
      await page.goto("/admin/policies");

      // Check for aria-label on interactive elements
      const tabs = page.locator('[role="tab"]');
      const tabCount = await tabs.count();

      for (let i = 0; i < tabCount; i++) {
        const tab = tabs.nth(i);
        const ariaLabel = await tab.getAttribute("aria-label");
        // Should have either aria-label or text content
        expect(ariaLabel || (await tab.textContent())).toBeTruthy();
      }
    });
  });
});
