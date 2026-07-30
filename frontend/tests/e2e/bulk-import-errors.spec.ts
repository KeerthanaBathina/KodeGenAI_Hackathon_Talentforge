import { expect, test } from '@playwright/test';

test.describe('Bulk Import Error Handling', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[name="email"]', process.env.RECRUITER_EMAIL || 'recruiter@example.com');
    await page.fill('input[name="password"]', process.env.RECRUITER_PASSWORD || 'password');
    await page.click('button[type="submit"]');
    await page.goto('/requisitions/bulk-import');
  });

  test('should display column validation error', async ({ page }) => {
    const csvMissingColumn = `role_title,department,location,slots,job_family
Senior Engineer,Engineering,Remote,2,Software Development`;

    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Select File' }).click();
    const fileChooser = await fileChooserPromise;

    await fileChooser.setFiles({
      name: 'invalid.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(csvMissingColumn)
    });

    await page.getByRole('button', { name: 'Upload and Import' }).click();

    await expect(page.getByTestId('toast')).toContainText('Missing required column: job_type', {
      timeout: 10000
    });
  });

  test('should show validation errors in results', async ({ page }) => {
    const csvWithErrors = `role_title,department,location,job_type,slots,job_family
Senior Engineer,Engineering,Remote,full_time,2,Software Development
,Marketing,New York,invalid_type,abc,Non-Existent Family`;

    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Select File' }).click();
    const fileChooser = await fileChooserPromise;

    await fileChooser.setFiles({
      name: 'errors.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(csvWithErrors)
    });

    await page.getByRole('button', { name: 'Upload and Import' }).click();

    await expect(page.getByText('Imported')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Invalid')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Download Error Report' })).toBeVisible();
  });

  test('should handle network error gracefully', async ({ page }) => {
    await page.route('**/api/requisitions/bulk-import', async (route) => {
      await route.abort('failed');
    });

    const csv = `role_title,department,location,job_type,slots,job_family
Senior Engineer,Engineering,Remote,full_time,2,Software Development`;

    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Select File' }).click();
    const fileChooser = await fileChooserPromise;

    await fileChooser.setFiles({
      name: 'requisitions.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(csv)
    });

    await page.getByRole('button', { name: 'Upload and Import' }).click();

    await expect(page.getByTestId('toast')).toContainText('Upload failed', { timeout: 10000 });
  });
});
