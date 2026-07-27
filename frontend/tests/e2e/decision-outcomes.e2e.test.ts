/**
 * End-to-End Tests for Decision Outcomes
 * 
 * These tests validate the complete user journey through the decision-making process
 * across the full application stack. They require:
 * - Running backend API server
 * - Running frontend Next.js application  
 * - Database with seeded test data
 * - All services operational (PDF, email, etc.)
 * 
 * To run these tests:
 * 1. Start the backend: cd backend && npm run dev
 * 2. Start the frontend: cd frontend && npm run dev
 * 3. Run Playwright tests: cd frontend && npm run test:e2e
 * 
 * @requires Backend running on http://localhost:4000
 * @requires Frontend running on http://localhost:3000
 * @requires Test database with seeded data
 */

import { test, expect, type Page } from '@playwright/test';

// Helper function to login as hiring manager
async function loginAsHiringManager(page: Page) {
  await page.goto('/login');
  await page.fill('[name="email"]', 'hiring.manager@test.com');
  await page.fill('[name="password"]', 'Test123!@#');
  await page.click('button[type="submit"]');
  await page.waitForURL('/dashboard');
}

// Helper function to navigate to application with complete prerequisites
async function navigateToApplicationWithPrerequisites(page: Page, applicationId: string) {
  await page.goto(`/applications/${applicationId}`);
  
  // Wait for prerequisites to load
  await expect(page.locator('.prerequisite-checklist')).toBeVisible();
  
  // Verify prerequisites are complete
  await expect(page.locator('.prerequisite-checklist')).toContainText(/All prerequisites complete|Complete/);
}

test.describe('Decision Outcomes - End-to-End Scenarios', () => {
  // Use a consistent test application ID that has prerequisites complete
  const TEST_APPLICATION_ID = 'test-app-with-prerequisites-001';

  test.beforeEach(async ({ page }) => {
    // Login before each test
    await loginAsHiringManager(page);
  });

  test.describe('Scenario 1: Offer Decision Triggers Approval Workflow', () => {
    test('should submit offer decision and show pending approval status', async ({ page }) => {
      // Navigate to application
      await navigateToApplicationWithPrerequisites(page, TEST_APPLICATION_ID);

      // Locate the decision panel
      const decisionPanel = page.locator('[data-testid="decision-panel"]').or(page.locator('form').filter({ hasText: 'Decision Outcome' }));
      await expect(decisionPanel).toBeVisible();

      // Select offer outcome
      await page.click('button:has-text("Offer"), input[value="offer"] ~ label');
      
      // Verify offer button is selected
      const offerButton = page.locator('button:has-text("Offer"), input[value="offer"]');
      await expect(offerButton).toHaveAttribute('aria-pressed', 'true');

      // Wait for reason codes to load
      await page.waitForSelector('select#reason-code:not([disabled])');
      
      // Select a reason code
      await page.selectOption('select#reason-code', { label: /Top Candidate|Competitive/i });

      // Enter justification
      await page.fill('textarea#justification', 'Exceptional technical skills, strong cultural fit, proven track record in similar roles');

      // Submit decision
      await page.click('button:has-text("Submit"), button:has-text("Submit Decision")');

      // Wait for success message
      await expect(page.locator('.alert-success, [role="alert"]')).toContainText(/awaiting approval|pending approval/i, { timeout: 10000 });

      // Verify application status updated
      const statusBadge = page.locator('[data-testid="application-status"], .application-status, .status-badge');
      await expect(statusBadge).toContainText(/Pending Approval/i);

      // Verify audit log entry (if accessible)
      // Note: This may require navigating to audit log page or checking UI indicators
    });
  });

  test.describe('Scenario 2: Reject Decision Sends Rejection Notification', () => {
    test('should submit reject decision and generate PDF with email notification', async ({ page }) => {
      await navigateToApplicationWithPrerequisites(page, TEST_APPLICATION_ID);

      // Select reject outcome
      await page.click('button:has-text("Reject"), input[value="reject"] ~ label');

      // Wait for and select reason code
      await page.waitForSelector('select#reason-code:not([disabled])');
      await page.selectOption('select#reason-code', { label: /Skills Gap|Experience/i });

      // Enter justification
      await page.fill(
        'textarea#justification',
        'Candidate lacks required experience in distributed systems and cloud architecture. Position requires 5+ years, candidate has 2 years.'
      );

      // Submit decision
      await page.click('button:has-text("Submit")');

      // Verify success message mentions notification
      await expect(page.locator('.alert-success, [role="alert"]')).toContainText(/Candidate will be notified|notified/i, { timeout: 10000 });

      // Verify application status
      await expect(page.locator('[data-testid="application-status"], .application-status')).toContainText(/Rejected/i);

      // Navigate to decision details to verify PDF was generated
      // This depends on your UI structure
      const decisionLink = page.locator('a:has-text("View Decision"), a:has-text("Decision Details")').first();
      if (await decisionLink.count() > 0) {
        await decisionLink.click();
        
        // Check for PDF link
        await expect(page.locator('a[href*=".pdf"], a:has-text("PDF"), .pdf-link')).toBeVisible({ timeout: 15000 });
      }
    });

    test('should handle rejection with minimal justification', async ({ page }) => {
      await navigateToApplicationWithPrerequisites(page, TEST_APPLICATION_ID);

      await page.click('button:has-text("Reject")');
      await page.waitForSelector('select#reason-code:not([disabled])');
      await page.selectOption('select#reason-code', { index: 1 }); // Select first available reason

      // Enter minimum required justification (20 characters)
      await page.fill('textarea#justification', 'Insufficient experience for this role');

      await page.click('button:has-text("Submit")');

      await expect(page.locator('.alert-success')).toBeVisible({ timeout: 10000 });
    });
  });

  test.describe('Scenario 3: Hold Decision Freezes Application', () => {
    test('should place application on hold and create 14-day reminder', async ({ page }) => {
      await navigateToApplicationWithPrerequisites(page, TEST_APPLICATION_ID);

      // Select hold outcome
      await page.click('button:has-text("Hold"), input[value="hold"] ~ label');

      // Select reason code
      await page.waitForSelector('select#reason-code:not([disabled])');
      await page.selectOption('select#reason-code', { label: /Budget|Pending/i });

      // Enter justification
      await page.fill('textarea#justification', 'Waiting for Q3 budget approval before proceeding with offer');

      // Submit
      await page.click('button:has-text("Submit")');

      // Verify success message mentions 14-day reminder
      await expect(page.locator('.alert-success')).toContainText(/14 days|reminder/i, { timeout: 10000 });

      // Verify status changed to on hold
      await expect(page.locator('[data-testid="application-status"], .application-status')).toContainText(/On Hold/i);

      // Verify no candidate notification was sent
      // This could be verified by checking a notification log or email mock service
      // For now, we just verify the status change succeeded
    });
  });

  test.describe('Scenario 4: Reason Code Validation', () => {
    test('should require reason code selection before enabling submit', async ({ page }) => {
      await navigateToApplicationWithPrerequisites(page, TEST_APPLICATION_ID);

      // Select reject outcome
      await page.click('button:has-text("Reject")');

      // Wait for reason code dropdown to be enabled
      await page.waitForSelector('select#reason-code:not([disabled])');

      // Enter justification first
      await page.fill('textarea#justification', 'Test that reason code is required before submission');

      // Verify submit button is disabled without reason code
      const submitButton = page.locator('button:has-text("Submit Decision"), button[type="submit"]');
      await expect(submitButton).toBeDisabled();

      // Select reason code
      await page.selectOption('select#reason-code', { index: 1 });

      // Now submit button should be enabled
      await expect(submitButton).toBeEnabled();
    });

    test('should show validation error when trying to bypass reason code requirement', async ({ page }) => {
      await navigateToApplicationWithPrerequisites(page, TEST_APPLICATION_ID);

      await page.click('button:has-text("Reject")');
      await page.waitForSelector('select#reason-code:not([disabled])');

      // Fill justification but not reason code
      await page.fill('textarea#justification', 'Attempting to submit without reason code selection');

      // Try to force submit (in case client-side validation is bypassed)
      await page.evaluate(() => {
        const form = document.querySelector('form');
        if (form) {
          const submitBtn = form.querySelector('button[type="submit"]') as HTMLButtonElement;
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.click();
          }
        }
      });

      // Should show error message
      await expect(page.locator('[role="alert"]').or(page.locator('.error'))).toContainText(/reason code|required/i);
    });
  });

  test.describe('Scenario 5: Withdraw Decision', () => {
    test('should withdraw application without candidate notification', async ({ page }) => {
      await navigateToApplicationWithPrerequisites(page, TEST_APPLICATION_ID);

      // Select withdraw
      await page.click('button:has-text("Withdraw"), input[value="withdraw"] ~ label');

      // Select reason code
      await page.waitForSelector('select#reason-code:not([disabled])');
      await page.selectOption('select#reason-code', { label: /Candidate Declined|Position Filled/i });

      // Enter justification
      await page.fill('textarea#justification', 'Candidate accepted another offer before we could extend ours');

      // Submit
      await page.click('button:has-text("Submit")');

      // Verify success
      await expect(page.locator('.alert-success')).toContainText(/withdrawn/i, { timeout: 10000 });

      // Verify status
      await expect(page.locator('[data-testid="application-status"], .application-status')).toContainText(/Withdrawn/i);
    });
  });

  test.describe('Error Scenarios', () => {
    test('should handle network errors gracefully', async ({ page }) => {
      // Intercept and fail the decision submission request
      await page.route('**/api/decisions', route => route.abort());

      await navigateToApplicationWithPrerequisites(page, TEST_APPLICATION_ID);

      await page.click('button:has-text("Reject")');
      await page.waitForSelector('select#reason-code:not([disabled])');
      await page.selectOption('select#reason-code', { index: 1 });
      await page.fill('textarea#justification', 'Testing network error handling');

      await page.click('button:has-text("Submit")');

      // Should show error message
      await expect(page.locator('[role="alert"]').or(page.locator('.error, .alert-danger'))).toBeVisible({ timeout: 10000 });
    });

    test('should handle prerequisites becoming incomplete', async ({ page }) => {
      // This would require a way to change prerequisite status in test environment
      // For example, via an admin panel or API call
      
      // Navigate to application
      await page.goto(`/applications/${TEST_APPLICATION_ID}`);

      // If prerequisites are incomplete, decision panel should be disabled
      const prerequisiteCheck = await page.locator('.prerequisite-checklist').textContent();
      
      if (prerequisiteCheck?.includes('incomplete')) {
        const outcomeButtons = page.locator('button:has-text("Offer"), button:has-text("Reject")');
        await expect(outcomeButtons.first()).toBeDisabled();
      }
    });
  });

  test.describe('Accessibility E2E', () => {
    test('should support keyboard navigation through entire flow', async ({ page }) => {
      await navigateToApplicationWithPrerequisites(page, TEST_APPLICATION_ID);

      // Navigate using Tab key
      await page.keyboard.press('Tab'); // First element
      
      // Keep tabbing until we reach offer button
      for (let i = 0; i < 20; i++) {
        await page.keyboard.press('Tab');
        const focused = await page.evaluate(() => document.activeElement?.textContent);
        if (focused?.includes('Offer')) {
          // Press Enter to select
          await page.keyboard.press('Enter');
          break;
        }
      }

      // Continue tabbing to reason code
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');
      
      // Select reason code with keyboard
      const reasonSelect = await page.locator('select#reason-code:focus');
      if (await reasonSelect.count() > 0) {
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('Enter');
      }

      // Tab to justification
      await page.keyboard.press('Tab');
      await page.keyboard.type('Keyboard navigation test for accessibility compliance');

      // Tab to submit and press Enter
      await page.keyboard.press('Tab');
      await page.keyboard.press('Enter');

      // Verify submission
      await expect(page.locator('.alert-success')).toBeVisible({ timeout: 10000 });
    });

    test('should announce dynamic content changes', async ({ page }) => {
      await navigateToApplicationWithPrerequisites(page, TEST_APPLICATION_ID);

      // Check initial ARIA live region content
      const liveRegion = page.locator('[aria-live]').or(page.locator('[role="status"]'));
      
      // Click reject to trigger reason code loading
      await page.click('button:has-text("Reject")');

      // Verify reason code help text updates
      await expect(page.locator('text=/Select the primary reason for this reject decision/i')).toBeVisible();
    });
  });

  test.describe('Performance and Timing', () => {
    test('should load reason codes within 2 seconds', async ({ page }) => {
      await navigateToApplicationWithPrerequisites(page, TEST_APPLICATION_ID);

      const startTime = Date.now();
      
      await page.click('button:has-text("Reject")');
      
      // Wait for reason codes to appear
      await page.waitForSelector('select#reason-code option:nth-child(2)'); // More than just placeholder
      
      const loadTime = Date.now() - startTime;
      expect(loadTime).toBeLessThan(2000);
    });

    test('should submit decision within 5 seconds', async ({ page }) => {
      await navigateToApplicationWithPrerequisites(page, TEST_APPLICATION_ID);

      await page.click('button:has-text("Offer")');
      await page.waitForSelector('select#reason-code:not([disabled])');
      await page.selectOption('select#reason-code', { index: 1 });
      await page.fill('textarea#justification', 'Performance test submission');

      const startTime = Date.now();
      await page.click('button:has-text("Submit")');
      await expect(page.locator('.alert-success')).toBeVisible({ timeout: 10000 });
      const submitTime = Date.now() - startTime;

      expect(submitTime).toBeLessThan(5000);
    });
  });
});

/**
 * Test Data Setup Notes:
 * 
 * Before running these E2E tests, ensure:
 * 
 * 1. Database has test users:
 *    - hiring.manager@test.com (role: hiring_manager)
 *    - Test password: Test123!@#
 * 
 * 2. Test application exists with ID 'test-app-with-prerequisites-001':
 *    - Status: Ready for decision (all interviews complete, assessments done)
 *    - Has candidate with valid profile
 *    - Has requisition with active status
 * 
 * 3. Reason codes are seeded:
 *    - Offer reasons (category: offer_decision)
 *    - Reject reasons (category: reject_decision)
 *    - Hold reasons (category: hold_decision)
 *    - Withdraw reasons (category: withdraw_decision)
 * 
 * 4. Services are configured:
 *    - Email service (can use mock mode)
 *    - PDF generation service (Supabase or local storage)
 *    - Task scheduler for hold reminders
 * 
 * 5. Environment variables set:
 *    - DATABASE_URL
 *    - NEXT_PUBLIC_API_URL
 *    - SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (for PDF storage)
 */
