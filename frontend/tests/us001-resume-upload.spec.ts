import { test, expect, type Page } from '@playwright/test';
import path from 'path';

test.describe('US-001: Secure Resume Upload via Presigned URL with Malware Scanning', () => {
    let page: Page;

    test.beforeEach(async ({ page: p }) => {
        page = p;
        // Navigate to application submission page (replace with actual route)
        // await page.goto('/apply/[requisitionId]');
    });

    test('should upload valid PDF resume successfully', async () => {
        // Create a test PDF file
        const testFilePath = path.join(__dirname, '../fixtures/test-resume.pdf');

        // Locate the file input (it's hidden, so we use locator directly)
        const fileInput = page.locator('input[type="file"]');

        // Upload the file
        await fileInput.setInputFiles(testFilePath);

        // Wait for upload button to show "Uploading..."
        await expect(page.getByText('Uploading...')).toBeVisible({ timeout: 5000 });

        // Wait for success message
        await expect(page.getByText(/Resume uploaded successfully!/)).toBeVisible({
            timeout: 15000,
        });

        // Verify progress bar reached 100%
        await expect(page.locator('.progress-bar')).toContainText('100%');

        // Button should show "Resume Uploaded" and be disabled
        const uploadButton = page.getByRole('button', { name: /Resume Uploaded/ });
        await expect(uploadButton).toBeDisabled();
    });

    test('should reject file exceeding size limit', async () => {
        // Attempt to upload a large file (11 MB)
        const largeFilePath = path.join(__dirname, '../fixtures/large-file.pdf');

        const fileInput = page.locator('input[type="file"]');
        await fileInput.setInputFiles(largeFilePath);

        // Should show error message
        await expect(page.getByText(/File size must not exceed 10 MB/)).toBeVisible({
            timeout: 2000,
        });

        // Button should show "Try Again"
        await expect(page.getByRole('button', { name: /Try Again/ })).toBeVisible();
    });

    test('should reject invalid file type', async () => {
        const invalidFilePath = path.join(__dirname, '../fixtures/test-document.txt');

        const fileInput = page.locator('input[type="file"]');
        await fileInput.setInputFiles(invalidFilePath);

        // Should show error message
        await expect(page.getByText(/Only PDF and DOCX files are accepted/)).toBeVisible({
            timeout: 2000,
        });
    });

    test('should allow retry after upload failure', async () => {
        // Mock API to fail on first attempt
        await page.route('**/api/resumes/presigned-url', async (route, request) => {
            if (request.method() === 'POST') {
                await route.fulfill({
                    status: 500,
                    json: { error: { message: 'Server error' } },
                });
            }
        });

        const testFilePath = path.join(__dirname, '../fixtures/test-resume.pdf');
        const fileInput = page.locator('input[type="file"]');

        await fileInput.setInputFiles(testFilePath);

        // Should show error
        await expect(page.getByText(/Upload failed|Server error/)).toBeVisible({ timeout: 5000 });

        // Should show "Try Again" button
        const retryButton = page.getByRole('button', { name: /Try Again/ });
        await expect(retryButton).toBeVisible();
        await expect(retryButton).not.toBeDisabled();

        // Remove the route mock for retry
        await page.unroute('**/api/resumes/presigned-url');

        // Click Try Again and upload should work
        await retryButton.click();
        await fileInput.setInputFiles(testFilePath);

        await expect(page.getByText(/Resume uploaded successfully!/)).toBeVisible({
            timeout: 15000,
        });
    });

    test('should display format information to user', async () => {
        // Verify that format requirements are displayed
        await expect(page.getByText(/Accepted formats:/)).toBeVisible();
        await expect(page.getByText(/PDF, DOCX/)).toBeVisible();
        await expect(page.getByText(/Maximum file size:/)).toBeVisible();
        await expect(page.getByText(/10 MB/)).toBeVisible();
    });
});
