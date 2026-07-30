import { expect, test } from '@playwright/test';

function buildTrend30dDescending(): Array<{
  date: string;
  scheduledCount: number;
  noShowCount: number;
  noShowRatePct: number;
}> {
  const start = new Date('2026-07-30T00:00:00.000Z');

  return Array.from({ length: 30 }, (_, index) => {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() - index);

    const scheduledCount = 20 + index;
    const noShowCount = index % 5;

    return {
      date: date.toISOString().slice(0, 10),
      scheduledCount,
      noShowCount,
      noShowRatePct: Number(((noShowCount / scheduledCount) * 100).toFixed(2))
    };
  });
}

async function mockSharedAnalyticsRoutes(page: import('@playwright/test').Page): Promise<void> {
  await page.context().addCookies([
    {
      name: 'authToken',
      value: 'mock-recruiter-token',
      domain: '127.0.0.1',
      path: '/'
    }
  ]);

  await Promise.all([
    page.route('**/api/requisitions?page=1&pageSize=100&status=open', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [{ id: 'req-1', title: 'Backend Engineer' }]
        })
      });
    }),
    page.route('**/api/analytics/pipeline**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          totalApplications: 120,
          shortlistRatePct: 41.67,
          avgTimeToHireDays: 14.25,
          offerAcceptanceRatePct: 66.67,
          lastRefreshedAt: '2026-07-30T08:00:00.000Z',
          generatedAt: '2026-07-30T08:00:01.000Z'
        })
      });
    }),
    page.route('**/api/analytics/funnel**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          stages: [
            {
              stageName: 'applications',
              stageCount: 100,
              conversionRatePct: 100,
              dropCount: 0,
              dropRatePct: 0,
              isLargestDropTransition: false
            }
          ],
          largestDropTransition: null,
          lastRefreshedAt: '2026-07-30T08:00:00.000Z',
          generatedAt: '2026-07-30T08:00:01.000Z'
        })
      });
    }),
    page.route('**/api/analytics/confusion-matrix**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          truePositives: 10,
          falsePositives: 2,
          trueNegatives: 8,
          falseNegatives: 1,
          precision: 0.8333,
          recall: 0.9091,
          f1Score: 0.8696,
          accuracy: 0.8571,
          lastRefreshedAt: '2026-07-30T08:00:00.000Z',
          generatedAt: '2026-07-30T08:00:01.000Z'
        })
      });
    })
  ]);
}

test.describe('US-003 E2E: No-show analytics digest validation', () => {
  test('renders no-show KPI summary and 30-point sparkline', async ({ page }) => {
    await mockSharedAnalyticsRoutes(page);

    await page.route('**/api/analytics/no-show**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          noShowRatePct: 20,
          noShowCount: 4,
          scheduledCount: 20,
          trend30d: buildTrend30dDescending(),
          lastRefreshedAt: '2026-07-30T08:00:00.000Z',
          generatedAt: '2026-07-30T08:00:01.000Z'
        })
      });
    });

    await page.goto('/analytics/pipeline');

    await expect(page.getByTestId('no-show-kpi-summary')).toHaveText('20.00% (4 of 20)');
    await expect(page.getByTestId('no-show-sparkline-point')).toHaveCount(30);

    await page.getByTestId('no-show-sparkline-point').first().focus();
    await expect(page.getByTestId('no-show-sparkline-hover-value')).toContainText('of');
  });

  test('shows no-show empty state when trend has no points', async ({ page }) => {
    await mockSharedAnalyticsRoutes(page);

    await page.route('**/api/analytics/no-show**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          noShowRatePct: 0,
          noShowCount: 0,
          scheduledCount: 0,
          trend30d: [],
          lastRefreshedAt: '2026-07-30T08:00:00.000Z',
          generatedAt: '2026-07-30T08:00:01.000Z'
        })
      });
    });

    await page.goto('/analytics/pipeline');

    await expect(page.getByTestId('no-show-sparkline-empty')).toBeVisible();
    await expect(page.getByText('No no-show trend data available.')).toBeVisible();
  });

  test('shows no-show error state when API request fails', async ({ page }) => {
    await mockSharedAnalyticsRoutes(page);

    await page.route('**/api/analytics/no-show**', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Failed to retrieve no-show analytics'
          }
        })
      });
    });

    await page.goto('/analytics/pipeline');

    await expect(page.getByTestId('no-show-kpi-error')).toBeVisible();
    await expect(page.getByText('Failed to retrieve no-show analytics')).toBeVisible();
  });
});
