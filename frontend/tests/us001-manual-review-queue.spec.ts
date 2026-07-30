import { test, expect } from '@playwright/test';

interface QueueItem {
  id: string;
  candidateId: string;
  candidateName: string;
  candidateEmail: string;
  requisitionId: string;
  requisitionTitle: string;
  requisitionDepartment: string;
  status: string;
  manualReviewReason: string | null;
  submittedAt: string;
  screeningScore: number;
  screeningConfidence: number;
  slaDeadlineAt: string;
  slaRemainingSeconds: number;
  slaElapsedPercent: number;
  slaSeverity: 'normal' | 'amber' | 'red';
  isUrgent: boolean;
  canShortlist: boolean;
  canReject: boolean;
  decisionLocked: boolean;
}

const rows: QueueItem[] = [
  {
    id: 'app-red-eng',
    candidateId: 'cand-red',
    candidateName: 'Alex Red',
    candidateEmail: 'alex.red@example.com',
    requisitionId: 'req-eng',
    requisitionTitle: 'Backend Engineer',
    requisitionDepartment: 'Engineering',
    status: 'pending_review',
    manualReviewReason: 'low_confidence',
    submittedAt: '2026-07-25T00:00:00.000Z',
    screeningScore: 91,
    screeningConfidence: 0.91,
    slaDeadlineAt: '2026-07-27T00:00:00.000Z',
    slaRemainingSeconds: 1200,
    slaElapsedPercent: 90,
    slaSeverity: 'red',
    isUrgent: true,
    canShortlist: true,
    canReject: true,
    decisionLocked: false,
  },
  {
    id: 'app-amber-eng',
    candidateId: 'cand-amber',
    candidateName: 'Blair Amber',
    candidateEmail: 'blair.amber@example.com',
    requisitionId: 'req-eng-2',
    requisitionTitle: 'QA Engineer',
    requisitionDepartment: 'Engineering',
    status: 'pending_review',
    manualReviewReason: 'flagged',
    submittedAt: '2026-07-25T00:00:00.000Z',
    screeningScore: 72,
    screeningConfidence: 0.7,
    slaDeadlineAt: '2026-07-27T00:00:00.000Z',
    slaRemainingSeconds: 7200,
    slaElapsedPercent: 60,
    slaSeverity: 'amber',
    isUrgent: false,
    canShortlist: true,
    canReject: true,
    decisionLocked: false,
  },
  {
    id: 'app-normal-design',
    candidateId: 'cand-normal',
    candidateName: 'Casey Normal',
    candidateEmail: 'casey.normal@example.com',
    requisitionId: 'req-design',
    requisitionTitle: 'Product Designer',
    requisitionDepartment: 'Design',
    status: 'pending_review',
    manualReviewReason: 'screening_failed',
    submittedAt: '2026-07-25T00:00:00.000Z',
    screeningScore: 64,
    screeningConfidence: 0.66,
    slaDeadlineAt: '2026-07-27T00:00:00.000Z',
    slaRemainingSeconds: 20000,
    slaElapsedPercent: 42,
    slaSeverity: 'normal',
    isUrgent: false,
    canShortlist: true,
    canReject: true,
    decisionLocked: false,
  },
];

function buildQueueResponse(filteredRows: QueueItem[]) {
  return {
    items: filteredRows,
    total: filteredRows.length,
    page: 1,
    limit: 20,
    totalPages: 1,
  };
}

test.describe('US-001 E2E: Manual Review Queue Filters and SLA UX', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/admin/system-status/fallback-mode', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ active: false }),
      });
    });

    await page.route('**/api/requisitions/filters', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          departments: ['Engineering', 'Design'],
          locations: [],
          jobTypes: ['full_time'],
        }),
      });
    });

    await page.route('**/api/requisitions**', async (route) => {
      const url = route.request().url();
      if (!url.includes('/api/requisitions?page=1&pageSize=100&status=open')) {
        await route.fallback();
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [
            { id: 'req-eng', title: 'Backend Engineer' },
            { id: 'req-eng-2', title: 'QA Engineer' },
            { id: 'req-design', title: 'Product Designer' },
          ],
        }),
      });
    });

    await page.route('**/api/manual-review-queue/stats', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          totalCount: 3,
          byReason: {
            low_confidence: 1,
            flagged: 1,
            screening_failed: 1,
          },
          oldestApplicationAgeHours: 12,
        }),
      });
    });

    await page.route('**/api/manual-review-queue**', async (route) => {
      const requestUrl = new URL(route.request().url());
      const department = requestUrl.searchParams.get('department');
      const scoreBand = requestUrl.searchParams.get('scoreBand');

      const filtered = rows.filter((row) => {
        if (department && row.requisitionDepartment !== department) {
          return false;
        }

        if (scoreBand === 'high' && row.screeningScore <= 75) {
          return false;
        }

        if (scoreBand === 'medium' && (row.screeningScore < 50 || row.screeningScore > 75)) {
          return false;
        }

        if (scoreBand === 'low' && row.screeningScore >= 50) {
          return false;
        }

        return true;
      });

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(buildQueueResponse(filtered)),
      });
    });
  });

  test('filters by Engineering + High score and updates active filter badge', async ({ page }) => {
    await page.goto('/hr/manual-review');

    await expect(page.getByText('Alex Red')).toBeVisible();
    await expect(page.getByText('Blair Amber')).toBeVisible();

    await page.getByTestId('filter-toggle-button').click();

    await page.getByLabel('Department').selectOption('Engineering');
    await page.getByLabel('Score Band').selectOption('high');

    await expect(page.getByTestId('active-filter-count')).toHaveText('2');
    await expect(page.getByText('Alex Red')).toBeVisible();
    await expect(page.getByText('Blair Amber')).not.toBeVisible();
    await expect(page.getByText('Casey Normal')).not.toBeVisible();
  });

  test('renders SLA severity chips and urgent badge behavior', async ({ page }) => {
    await page.goto('/hr/manual-review');

    const redChip = page.getByTestId('sla-chip-app-red-eng');
    const amberChip = page.getByTestId('sla-chip-app-amber-eng');

    await expect(redChip).toHaveText('00:20:00');
    await expect(amberChip).toHaveText('02:00:00');

    await expect(page.getByTestId('urgent-badge-app-red-eng')).toBeVisible();
    await expect(page.getByTestId('urgent-badge-app-amber-eng')).toHaveCount(0);

    await expect(redChip).toHaveCSS('background-color', 'rgb(254, 242, 242)');
    await expect(amberChip).toHaveCSS('background-color', 'rgb(255, 251, 235)');
  });

  test('updates queue nav badge from realtime badge event payload', async ({ page }) => {
    await page.goto('/hr/manual-review');

    await expect(page.getByTestId('manual-review-nav-badge')).toContainText('0');
    await page.waitForTimeout(250);

    await page.evaluate(() => {
      window.dispatchEvent(
        new CustomEvent('review-queue:badge-count', {
          detail: {
            pendingCount: 7,
            urgentCount: 2,
            timestamp: '2026-07-25T12:00:00.000Z',
          },
        })
      );
    });

    // Dispatch one more event to avoid race conditions during hydration/effect startup.
    await page.waitForTimeout(50);
    await page.evaluate(() => {
      window.dispatchEvent(
        new CustomEvent('review-queue:badge-count', {
          detail: {
            pendingCount: 7,
            urgentCount: 2,
            timestamp: '2026-07-25T12:00:00.000Z',
          },
        })
      );
    });

    await expect(page.getByTestId('manual-review-nav-badge')).toContainText('7');
    await expect(page.getByTestId('manual-review-nav-urgent')).toHaveText('2');
  });
});
