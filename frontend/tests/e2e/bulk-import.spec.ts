import { test, expect } from '@playwright/test';

test.describe('Bulk Import', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[name="email"]', process.env.RECRUITER_EMAIL || 'recruiter@example.com');
    await page.fill('input[name="password"]', process.env.RECRUITER_PASSWORD || 'password');
    await page.click('button[type="submit"]');
  });

  test('should display bulk import page', async ({ page }) => {
    await page.goto('/requisitions/bulk-import');

    await expect(page.getByRole('heading', { level: 1 })).toContainText('Bulk Import Requisitions');
    await expect(page.getByRole('button', { name: 'Download CSV Template' })).toBeVisible();
  });

  test('should upload valid CSV and show success', async ({ page }) => {
    await page.goto('/requisitions/bulk-import');

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

    await expect(page.getByText('Successfully imported')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Imported')).toBeVisible();
  });

  test('should show error report button for invalid rows', async ({ page }) => {
    await page.goto('/requisitions/bulk-import');

    const csvWithErrors = `role_title,department,location,job_type,slots,job_family
Senior Engineer,Engineering,Remote,full_time,2,Software Development
,Marketing,New York,full_time,1,Product Management`;

    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Select File' }).click();
    const fileChooser = await fileChooserPromise;

    await fileChooser.setFiles({
      name: 'requisitions.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(csvWithErrors)
    });

    await page.getByRole('button', { name: 'Upload and Import' }).click();

    await expect(page.getByRole('button', { name: 'Download Error Report' })).toBeVisible({
      timeout: 15000
    });
  });

  test('should reject non-CSV files', async ({ page }) => {
    await page.goto('/requisitions/bulk-import');

    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Select File' }).click();
    const fileChooser = await fileChooserPromise;

    await fileChooser.setFiles({
      name: 'document.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('This is not a CSV')
    });

    await expect(page.getByTestId('toast')).toContainText('Invalid file type');
  });

  test('should start template download', async ({ page }) => {
    await page.goto('/requisitions/bulk-import');

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download CSV Template' }).click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toContain('.csv');
  });
});
