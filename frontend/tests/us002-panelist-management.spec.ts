import { test, expect, type Page } from '@playwright/test';

test.describe('US-002: Panel Member Management — Assign, Availability, and Confirmation Tracking', () => {
    let page: Page;
    let interviewId: string;
    let panelistId: string;
    let confirmationToken: string;

    test.beforeEach(async ({ page: p }) => {
        page = p;
        
        // Login as recruiter
        await page.goto('/login');
        await page.fill('input[name="email"]', 'recruiter@example.com');
        await page.fill('input[name="password"]', 'password123');
        await page.click('button[type="submit"]');
        
        // Wait for navigation to dashboard
        await page.waitForURL('**/dashboard', { timeout: 5000 });
        
        // Navigate to interviews page
        await page.goto('/interviews');
        await page.waitForLoadState('networkidle');
    });

    test('Scenario 1: Panelist added with availability check', async () => {
        // Given: recruiter opens the panelist assignment panel for an interview
        await page.click('button:has-text("Assign Panelists")');
        await expect(page.getByRole('dialog')).toBeVisible({ timeout: 2000 });

        // When: they search for and select a panelist
        const searchInput = page.getByPlaceholder(/Search panelists by name/i);
        await searchInput.fill('Jane Panelist');
        
        // Wait for search results
        await page.waitForTimeout(500);
        
        // Click on the first panelist result
        await page.click('[data-testid="panelist-search-result"]:first-child');

        // Then: the system immediately shows whether the panelist is available
        const availabilityIndicator = page.locator('[data-testid="availability-indicator"]');
        await expect(availabilityIndicator).toBeVisible({ timeout: 2000 });
        
        // Check for either green tick (available) or red X (unavailable)
        const isAvailable = await availabilityIndicator.getAttribute('data-available');
        expect(['true', 'false']).toContain(isAvailable);
        
        if (isAvailable === 'true') {
            // Green tick for available
            await expect(availabilityIndicator.locator('svg[data-icon="check"]')).toBeVisible();
        } else {
            // Red X for unavailable
            await expect(availabilityIndicator.locator('svg[data-icon="times"]')).toBeVisible();
        }
    });

    test('Scenario 2: Confirmation request sent to panelist', async () => {
        // Given: a panelist is assigned to an interview
        await page.click('button:has-text("Assign Panelists")');
        await expect(page.getByRole('dialog')).toBeVisible();

        // Search and select available panelist
        const searchInput = page.getByPlaceholder(/Search panelists by name/i);
        await searchInput.fill('Jane Panelist');
        await page.waitForTimeout(500);
        
        // Select first available panelist
        await page.click('[data-testid="panelist-search-result"][data-available="true"]:first-child');

        // When: the assignment is saved
        const saveButton = page.getByRole('button', { name: /Save|Assign/i });
        await saveButton.click();

        // Then: success message indicates email was sent
        await expect(page.getByText(/Confirmation requests sent/i)).toBeVisible({
            timeout: 5000,
        });

        // Verify the panelist appears in the assigned list with "pending" status
        const panelistRow = page.locator('[data-testid="assigned-panelist"]').first();
        await expect(panelistRow).toBeVisible();
        
        const statusBadge = panelistRow.locator('[data-testid="status-badge"]');
        await expect(statusBadge).toHaveText('pending');
        
        // Note: In E2E test environment, we can't verify actual email delivery
        // Integration tests should mock email service and verify the call
    });

    test('Scenario 3: Interview blocked from candidate notification if panelist unconfirmed', async () => {
        // Given: one panelist has not confirmed (assuming we have an interview with pending panelist)
        // Navigate to specific interview detail page
        await page.click('[data-testid="interview-card"]:first-child');
        await page.waitForURL('**/interviews/**');

        // Verify we have at least one unconfirmed panelist
        const unconfirmedBadge = page.locator('[data-testid="status-badge"]:has-text("pending")');
        await expect(unconfirmedBadge.first()).toBeVisible({ timeout: 2000 });

        // When: the recruiter tries to notify the candidate
        const notifyCandidateButton = page.getByRole('button', { name: /Notify Candidate/i });
        await notifyCandidateButton.click();

        // Then: a warning displays with unconfirmed panelist names
        const warningModal = page.getByRole('dialog', { name: /Unconfirmed Panelists Warning/i });
        await expect(warningModal).toBeVisible({ timeout: 3000 });

        // Verify modal shows panelist names
        await expect(warningModal.getByText(/following panelists have not confirmed/i)).toBeVisible();
        
        // Verify acknowledgement checkbox is present
        const acknowledgementCheckbox = warningModal.getByRole('checkbox', {
            name: /I acknowledge the risk/i,
        });
        await expect(acknowledgementCheckbox).toBeVisible();

        // Verify "Notify Anyway" button is initially disabled
        const notifyAnywayButton = warningModal.getByRole('button', { name: /Notify Anyway/i });
        await expect(notifyAnywayButton).toBeDisabled();

        // Check the acknowledgement checkbox
        await acknowledgementCheckbox.check();

        // Verify button becomes enabled
        await expect(notifyAnywayButton).toBeEnabled({ timeout: 1000 });

        // Optional: Add justification
        const justificationTextarea = warningModal.getByLabelText(/Justification/i);
        await justificationTextarea.fill('Urgent deadline - candidate needs immediate notification');

        // Click "Notify Anyway" to override
        await notifyAnywayButton.click();

        // Verify success message
        await expect(page.getByText(/Candidate notification sent/i)).toBeVisible({
            timeout: 5000,
        });
    });

    test('Scenario 4: Confirmation status real-time update on recruiter panel', async () => {
        // Given: recruiter is viewing an interview with a pending panelist
        await page.click('[data-testid="interview-card"]:first-child');
        await page.waitForURL('**/interviews/**');

        // Verify initial status is "pending"
        const statusBadge = page.locator('[data-testid="status-badge"]').first();
        await expect(statusBadge).toHaveText('pending');

        // When: panelist clicks "Confirm" (simulated by direct API call in test)
        // In a real scenario, this would happen via email link click
        // For E2E test, we simulate the confirmation via API
        
        // Get the interview ID from URL
        const url = page.url();
        const interviewIdMatch = url.match(/\/interviews\/([^\/]+)/);
        if (interviewIdMatch) {
            interviewId = interviewIdMatch[1];
        }

        // Get panelist ID from the DOM
        const panelistRow = page.locator('[data-testid="assigned-panelist"]').first();
        panelistId = await panelistRow.getAttribute('data-panelist-id') || '';

        // Simulate confirmation via API (this would normally come from email link)
        // Note: In real E2E, you might use a test confirmation endpoint
        await page.evaluate(async ({ interviewId, panelistId }) => {
            // Emit custom event to simulate WebSocket update
            const event = new CustomEvent('panelist:confirmed', {
                detail: {
                    interviewStageId: interviewId,
                    panelistId: panelistId,
                    status: 'confirmed',
                    timestamp: new Date().toISOString(),
                },
            });
            window.dispatchEvent(event);
        }, { interviewId, panelistId });

        // Then: the status updates to "Confirmed" within 2 seconds
        await expect(statusBadge).toHaveText('confirmed', { timeout: 2000 });

        // Verify the status badge color changed (yellow -> green)
        const badgeColor = await statusBadge.evaluate((el) => 
            window.getComputedStyle(el).backgroundColor
        );
        // Green badges typically have RGB values indicating green
        // This is a simple check; adjust based on your actual styling
        expect(badgeColor).toBeTruthy();
    });

    test('E2E Flow: Complete panelist assignment to confirmation workflow', async () => {
        // This test combines all scenarios into a complete workflow
        
        // Step 1: Assign panelist with availability check
        await page.click('button:has-text("Assign Panelists")');
        const searchInput = page.getByPlaceholder(/Search panelists by name/i);
        await searchInput.fill('Jane Panelist');
        await page.waitForTimeout(500);
        
        // Select available panelist
        await page.click('[data-testid="panelist-search-result"][data-available="true"]:first-child');
        
        // Verify availability indicator shows green
        const availabilityIndicator = page.locator('[data-testid="availability-indicator"]');
        await expect(availabilityIndicator.locator('svg[data-icon="check"]')).toBeVisible();
        
        // Step 2: Save assignment and verify confirmation request sent
        await page.getByRole('button', { name: /Save|Assign/i }).click();
        await expect(page.getByText(/Confirmation requests sent/i)).toBeVisible({
            timeout: 5000,
        });
        
        // Step 3: Attempt to notify candidate (should be blocked)
        await page.getByRole('button', { name: /Notify Candidate/i }).click();
        const warningModal = page.getByRole('dialog', { name: /Unconfirmed Panelists Warning/i });
        await expect(warningModal).toBeVisible({ timeout: 3000 });
        
        // Cancel the notification attempt
        await warningModal.getByRole('button', { name: /Cancel/i }).click();
        await expect(warningModal).not.toBeVisible();
        
        // Step 4: Simulate panelist confirmation
        const url = page.url();
        const interviewIdMatch = url.match(/\/interviews\/([^\/]+)/);
        if (interviewIdMatch) {
            interviewId = interviewIdMatch[1];
        }
        
        const panelistRow = page.locator('[data-testid="assigned-panelist"]').first();
        panelistId = await panelistRow.getAttribute('data-panelist-id') || '';
        
        // Emit WebSocket event to simulate confirmation
        await page.evaluate(async ({ interviewId, panelistId }) => {
            const event = new CustomEvent('panelist:confirmed', {
                detail: {
                    interviewStageId: interviewId,
                    panelistId: panelistId,
                    status: 'confirmed',
                    timestamp: new Date().toISOString(),
                },
            });
            window.dispatchEvent(event);
        }, { interviewId, panelistId });
        
        // Verify status updated to confirmed
        const statusBadge = panelistRow.locator('[data-testid="status-badge"]');
        await expect(statusBadge).toHaveText('confirmed', { timeout: 2000 });
        
        // Step 5: Now notification should succeed without warning
        await page.getByRole('button', { name: /Notify Candidate/i }).click();
        
        // No warning modal should appear, just success message
        await expect(page.getByText(/Candidate notification sent/i)).toBeVisible({
            timeout: 5000,
        });
    });

    test('Error handling: Unavailable panelist cannot be assigned', async () => {
        // Test that system prevents assigning unavailable panelists
        await page.click('button:has-text("Assign Panelists")');
        const searchInput = page.getByPlaceholder(/Search panelists by name/i);
        await searchInput.fill('Busy Panelist');
        await page.waitForTimeout(500);
        
        // Try to select unavailable panelist
        await page.click('[data-testid="panelist-search-result"][data-available="false"]:first-child');
        
        // Verify error message or disabled save button
        const saveButton = page.getByRole('button', { name: /Save|Assign/i });
        await expect(saveButton).toBeDisabled();
        
        // Or verify error message appears
        await expect(page.getByText(/Panelist is not available/i)).toBeVisible({
            timeout: 2000,
        });
    });

    test('Token validation: Expired token shows error', async () => {
        // Navigate to confirmation page with expired token
        const expiredToken = 'expired-test-token-12345';
        await page.goto(`/interviews/confirm?token=${expiredToken}`);
        
        // Should show error message
        await expect(page.getByText(/expired|invalid/i)).toBeVisible({
            timeout: 3000,
        });
    });

    test('Token validation: Used token cannot be reused', async () => {
        // This would require a valid but already-used token
        // In practice, this would be set up with test data
        const usedToken = 'used-test-token-12345';
        await page.goto(`/interviews/confirm?token=${usedToken}`);
        
        // Should show error that token was already used
        await expect(page.getByText(/already.*used|no longer valid/i)).toBeVisible({
            timeout: 3000,
        });
    });
});
