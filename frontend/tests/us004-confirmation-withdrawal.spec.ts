import { test, expect } from '@playwright/test';

/**
 * E2E Tests for US-004: Application Submission Confirmation and Pre-Review Withdrawal
 * 
 * Scenarios:
 * 1. Success page displays reference ID and tracking link after submission
 * 2. Tracking page shows 5-stage status timeline
 * 3. Withdrawal button visible only when status is 'submitted'
 * 4. Withdrawal confirmation dialog with Confirm/Cancel buttons
 * 5. Withdrawal blocked for non-submitted statuses
 * 6. Withdrawn/rejected status displays appropriate messages
 */

test.describe('US-004 E2E: Confirmation and Withdrawal', () => {
    const testUser = {
        email: `withdrawal-e2e-${Date.now()}@example.com`,
        password: 'TestPassword123!',
        fullName: 'Withdrawal Test User',
    };

    test.beforeAll(async ({ request }) => {
        // Register and verify test user
        const registerResponse = await request.post('/api/auth/register/candidate', {
            data: {
                email: testUser.email,
                password: testUser.password,
            },
        });

        expect(registerResponse.ok()).toBeTruthy();

        // Get OTP from response (in mock mode)
        const registerData = await registerResponse.json();
        const otp = registerData.otp || '123456';

        // Verify email with OTP
        await request.post('/api/auth/verify-otp', {
            data: {
                email: testUser.email,
                otp,
            },
        });
    });

    test('should display reference ID and tracking link on success page', async ({ page }) => {
        // Login
        await page.goto('/login');
        await page.fill('input[name="email"]', testUser.email);
        await page.fill('input[name="password"]', testUser.password);
        await page.click('button[type="submit"]');
        await page.waitForURL('/dashboard');

        // Browse jobs and select first open position
        await page.goto('/jobs');
        await page.waitForSelector('[data-testid="requisition-card"]');
        const firstCard = page.locator('[data-testid="requisition-card"]').first();
        const jobTitle = await firstCard.locator('h3').textContent();
        await firstCard.click();

        // Complete application
        await page.waitForURL(/\/jobs\/.*\/apply/);

        // Step 1: Personal Info
        await page.fill('input[name="fullName"]', testUser.fullName);
        await page.fill('input[name="email"]', testUser.email);
        await page.fill('input[name="phone"]', '+1234567890');
        await page.click('button:has-text("Next")');

        // Step 2: Experience
        await page.fill('input[name="yearsExperience"]', '3');
        await page.fill('input[name="currentRole"]', 'Software Engineer');
        await page.fill('input[name="currentCompany"]', 'Tech Corp');
        await page.click('button:has-text("Next")');

        // Step 3: Cover Letter
        await page.fill('textarea[name="coverLetter"]', 'This is my test cover letter with sufficient content to meet the minimum character requirement for submission. I am very interested in this position and believe I would be a great fit.');
        await page.click('button:has-text("Next")');

        // Step 4: Submit
        await page.click('button:has-text("Submit Application")');

        // Wait for success page
        await page.waitForURL(/\/jobs\/.*\/application-success/);

        // Verify success message
        await expect(page.locator('h1:has-text("Application Submitted Successfully")')).toBeVisible();

        // Verify job title is displayed
        await expect(page.locator(`text=${jobTitle}`)).toBeVisible();

        // Verify reference ID is displayed (8 uppercase characters)
        const referenceIdElement = page.locator('p:has-text("Reference ID")').locator('+ p');
        await expect(referenceIdElement).toBeVisible();
        const referenceId = await referenceIdElement.textContent();
        expect(referenceId).toMatch(/^[A-Z0-9]{8}$/);

        // Verify email confirmation notice
        await expect(page.locator('text=confirmation email has been sent')).toBeVisible();

        // Verify "Track My Application" button exists
        const trackButton = page.locator('[data-testid="track-application-button"]');
        await expect(trackButton).toBeVisible();
        await expect(trackButton).toHaveText('Track My Application');

        // Verify "Browse More Jobs" link exists
        await expect(page.locator('text=Browse More Jobs')).toBeVisible();
    });

    test('should display 5-stage status timeline on tracking page', async ({ page }) => {
        // Login
        await page.goto('/login');
        await page.fill('input[name="email"]', testUser.email);
        await page.fill('input[name="password"]', testUser.password);
        await page.click('button[type="submit"]');
        await page.waitForURL('/dashboard');

        // Navigate to jobs and find submitted application
        await page.goto('/jobs');
        await page.waitForSelector('[data-testid="requisition-card"]');

        // Find card with "Application In Progress" (submitted application)
        const submittedCard = page.locator('[data-testid="requisition-card"]:has-text("Application In Progress")').first();
        await submittedCard.click();

        // Navigate to application success page (should have tracking link)
        await page.waitForURL(/\/jobs\/.*/);
        await page.goto(page.url().replace('/jobs/', '/jobs/') + '/application-success');

        // Click "Track My Application"
        await page.click('[data-testid="track-application-button"]');
        await page.waitForURL(/\/applications\/track\/.*/);

        // Verify tracking page header
        await expect(page.locator('h1:has-text("Track Your Application")')).toBeVisible();

        // Verify reference ID is displayed
        await expect(page.locator('text=Reference ID')).toBeVisible();

        // Verify 5-stage timeline exists
        await expect(page.locator('text=Submitted')).toBeVisible();
        await expect(page.locator('text=Screening')).toBeVisible();
        await expect(page.locator('text=Under Review')).toBeVisible();
        await expect(page.locator('text=Interviewing')).toBeVisible();
        await expect(page.locator('text=Offer Extended')).toBeVisible();

        // Verify first stage (Submitted) is completed (has checkmark)
        const submittedStage = page.locator('text=Submitted').locator('..');
        await expect(submittedStage.locator('text=✓')).toBeVisible();

        // Verify "Application Status" section exists
        await expect(page.locator('h2:has-text("Application Status")')).toBeVisible();
    });

    test('should show withdrawal button only for submitted status', async ({ page }) => {
        // Login
        await page.goto('/login');
        await page.fill('input[name="email"]', testUser.email);
        await page.fill('input[name="password"]', testUser.password);
        await page.click('button[type="submit"]');
        await page.waitForURL('/dashboard');

        // Navigate to tracking page via jobs listing
        await page.goto('/jobs');
        await page.waitForSelector('[data-testid="requisition-card"]');
        const submittedCard = page.locator('[data-testid="requisition-card"]:has-text("Application In Progress")').first();
        await submittedCard.click();

        await page.waitForURL(/\/jobs\/.*/);
        await page.goto(page.url() + '/application-success');
        await page.click('[data-testid="track-application-button"]');
        await page.waitForURL(/\/applications\/track\/.*/);

        // Verify withdrawal section exists
        await expect(page.locator('h2:has-text("Withdraw Application")')).toBeVisible();

        // Verify withdrawal button is visible
        const withdrawButton = page.locator('[data-testid="withdraw-button"]');
        await expect(withdrawButton).toBeVisible();
        await expect(withdrawButton).toHaveText('Withdraw Application');

        // Verify warning text about cooling period
        await expect(page.locator('text=90 days before reapplying')).toBeVisible();
    });

    test('should show confirmation dialog when withdrawing application', async ({ page }) => {
        // Login
        await page.goto('/login');
        await page.fill('input[name="email"]', testUser.email);
        await page.fill('input[name="password"]', testUser.password);
        await page.click('button[type="submit"]');
        await page.waitForURL('/dashboard');

        // Navigate to tracking page
        await page.goto('/jobs');
        await page.waitForSelector('[data-testid="requisition-card"]');
        const submittedCard = page.locator('[data-testid="requisition-card"]:has-text("Application In Progress")').first();
        await submittedCard.click();
        await page.waitForURL(/\/jobs\/.*/);
        await page.goto(page.url() + '/application-success');
        await page.click('[data-testid="track-application-button"]');
        await page.waitForURL(/\/applications\/track\/.*/);

        // Click withdraw button
        await page.click('[data-testid="withdraw-button"]');

        // Verify confirmation dialog appears
        await expect(page.locator('h2:has-text("Confirm Withdrawal")')).toBeVisible();
        await expect(page.locator('text=Are you sure you want to withdraw')).toBeVisible();
        await expect(page.locator('text=This action cannot be undone')).toBeVisible();

        // Verify both buttons exist
        const cancelButton = page.locator('[data-testid="cancel-withdrawal-button"]');
        const confirmButton = page.locator('[data-testid="confirm-withdrawal-button"]');
        await expect(cancelButton).toBeVisible();
        await expect(confirmButton).toBeVisible();

        // Click cancel - dialog should close
        await cancelButton.click();
        await expect(page.locator('h2:has-text("Confirm Withdrawal")')).not.toBeVisible();

        // Withdrawal button should still be visible
        await expect(page.locator('[data-testid="withdraw-button"]')).toBeVisible();
    });

    test('should successfully withdraw application and show withdrawn status', async ({ page }) => {
        // Login
        await page.goto('/login');
        await page.fill('input[name="email"]', testUser.email);
        await page.fill('input[name="password"]', testUser.password);
        await page.click('button[type="submit"]');
        await page.waitForURL('/dashboard');

        // Navigate to tracking page
        await page.goto('/jobs');
        await page.waitForSelector('[data-testid="requisition-card"]');
        const submittedCard = page.locator('[data-testid="requisition-card"]:has-text("Application In Progress")').first();
        await submittedCard.click();
        await page.waitForURL(/\/jobs\/.*/);
        await page.goto(page.url() + '/application-success');
        await page.click('[data-testid="track-application-button"]');
        await page.waitForURL(/\/applications\/track\/.*/);

        // Click withdraw and confirm
        await page.click('[data-testid="withdraw-button"]');
        await page.click('[data-testid="confirm-withdrawal-button"]');

        // Wait for withdrawal to complete and page to update
        await page.waitForTimeout(1000);

        // Verify withdrawn status banner appears
        await expect(page.locator('text=Application Withdrawn')).toBeVisible();
        await expect(page.locator('text=You withdrew this application')).toBeVisible();
        await expect(page.locator('text=cooling period')).toBeVisible();

        // Verify withdrawal button is gone
        await expect(page.locator('[data-testid="withdraw-button"]')).not.toBeVisible();

        // Verify status timeline is hidden (application withdrawn)
        await expect(page.locator('h2:has-text("Application Status")')).not.toBeVisible();
    });

    test('should show blocking message for non-withdrawable status', async ({ page, request }) => {
        // This test would require setting up an application with status other than 'submitted'
        // For now, we'll simulate by checking the UI logic

        // Note: In a real scenario, you'd need to:
        // 1. Create an application with status 'screening' or 'pending_review'
        // 2. Navigate to its tracking page
        // 3. Verify "Withdrawal Not Available" message appears
        // 4. Verify no withdraw button exists

        // Placeholder - requires admin/system API to change application status
        test.skip('Requires admin API to set application status to non-submitted');
    });
});
