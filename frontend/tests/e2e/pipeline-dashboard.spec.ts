import { expect, test } from '@playwright/test';

test.describe('Pipeline Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/requisitions?page=1&pageSize=100&status=open', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [
            { id: 'req-1', title: 'Senior Backend Engineer - London' },
            { id: 'req-2', title: 'Product Manager - Remote' }
          ]
        })
      });
    });

    await page.route('**/api/analytics/pipeline**', async (route) => {
      const requestUrl = new URL(route.request().url());
      const requisitionId = requestUrl.searchParams.get('requisitionId');

      const payload = requisitionId === 'req-1'
        ? {
            totalApplications: 21,
            shortlistRatePct: 33.33,
            avgTimeToHireDays: 10.5,
            offerAcceptanceRatePct: 60,
            lastRefreshedAt: '2026-07-29T10:05:00.000Z',
            generatedAt: '2026-07-29T10:05:01.000Z'
          }
        : {
            totalApplications: 120,
            shortlistRatePct: 41.67,
            avgTimeToHireDays: 14.25,
            offerAcceptanceRatePct: 66.67,
            lastRefreshedAt: '2026-07-29T10:00:00.000Z',
            generatedAt: '2026-07-29T10:00:01.000Z'
          };

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(payload)
      });
    });

    await page.goto('/analytics/pipeline');
  });

  test('shows KPI cards and freshness metadata', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Pipeline Dashboard' })).toBeVisible();
    await expect(page.getByLabel('Total Applications')).toContainText('120');
    await expect(page.getByLabel('Shortlist Rate')).toContainText('41.67%');
    await expect(page.getByLabel('Average Time-to-Hire')).toContainText('14.25 days');
    await expect(page.getByLabel('Offer Acceptance Rate')).toContainText('66.67%');
    await expect(page.getByTestId('last-updated-label')).toContainText('Last updated:');
  });

  test('recalculates all KPI values when requisition filter changes', async ({ page }) => {
    await expect(page.getByLabel('Total Applications')).toContainText('120');

    await page.getByLabel('Requisition selection').selectOption('req-1');

    await expect(page.getByLabel('Total Applications')).toContainText('21');
    await expect(page.getByLabel('Shortlist Rate')).toContainText('33.33%');
    await expect(page.getByLabel('Average Time-to-Hire')).toContainText('10.50 days');
    await expect(page.getByLabel('Offer Acceptance Rate')).toContainText('60.00%');
  });

  test('supports clearing requisition filter back to global KPIs', async ({ page }) => {
    await page.getByLabel('Requisition selection').selectOption('req-1');
    await expect(page.getByLabel('Total Applications')).toContainText('21');

    await page.getByRole('button', { name: 'Clear Filter' }).click();

    await expect(page.getByLabel('Total Applications')).toContainText('120');
  });
});
