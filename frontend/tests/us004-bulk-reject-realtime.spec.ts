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

let queueRows: QueueItem[] = [
  {
    id: 'app-001',
    candidateId: 'cand-001',
    candidateName: 'Avery Stone',
    candidateEmail: 'avery.stone@example.com',
    requisitionId: 'req-001',
    requisitionTitle: 'Backend Engineer',
    requisitionDepartment: 'Engineering',
    status: 'pending_review',
    manualReviewReason: 'low_confidence',
    submittedAt: '2026-07-25T08:00:00.000Z',
    screeningScore: 91,
    screeningConfidence: 0.91,
    slaDeadlineAt: '2026-07-27T08:00:00.000Z',
    slaRemainingSeconds: 3600,
    slaElapsedPercent: 80,
    slaSeverity: 'red',
    isUrgent: true,
    canShortlist: true,
    canReject: true,
    decisionLocked: false,
  },
  {
    id: 'app-002',
    candidateId: 'cand-002',
    candidateName: 'Blake Orbit',
    candidateEmail: 'blake.orbit@example.com',
    requisitionId: 'req-002',
    requisitionTitle: 'QA Engineer',
    requisitionDepartment: 'Engineering',
    status: 'pending_review',
    manualReviewReason: 'flagged',
    submittedAt: '2026-07-25T08:05:00.000Z',
    screeningScore: 68,
    screeningConfidence: 0.72,
    slaDeadlineAt: '2026-07-27T08:05:00.000Z',
    slaRemainingSeconds: 5400,
    slaElapsedPercent: 55,
    slaSeverity: 'amber',
    isUrgent: false,
    canShortlist: true,
    canReject: true,
    decisionLocked: false,
  },
  {
    id: 'app-003',
    candidateId: 'cand-003',
    candidateName: 'Cora Finch',
    candidateEmail: 'cora.finch@example.com',
    requisitionId: 'req-003',
    requisitionTitle: 'Data Analyst',
    requisitionDepartment: 'Analytics',
    status: 'pending_review',
    manualReviewReason: 'screening_failed',
    submittedAt: '2026-07-25T08:10:00.000Z',
    screeningScore: 64,
    screeningConfidence: 0.61,
    slaDeadlineAt: '2026-07-27T08:10:00.000Z',
    slaRemainingSeconds: 7200,
    slaElapsedPercent: 40,
    slaSeverity: 'normal',
    isUrgent: false,
    canShortlist: true,
    canReject: true,
    decisionLocked: false,
  },
  {
    id: 'app-004',
    candidateId: 'cand-004',
    candidateName: 'Drew Vale',
    candidateEmail: 'drew.vale@example.com',
    requisitionId: 'req-004',
    requisitionTitle: 'Product Designer',
    requisitionDepartment: 'Design',
    status: 'pending_review',
    manualReviewReason: 'manual_flag',
    submittedAt: '2026-07-25T08:15:00.000Z',
    screeningScore: 77,
    screeningConfidence: 0.79,
    slaDeadlineAt: '2026-07-27T08:15:00.000Z',
    slaRemainingSeconds: 8100,
    slaElapsedPercent: 35,
    slaSeverity: 'normal',
    isUrgent: false,
    canShortlist: true,
    canReject: true,
    decisionLocked: false,
  },
  {
    id: 'app-005',
    candidateId: 'cand-005',
    candidateName: 'Eli North',
    candidateEmail: 'eli.north@example.com',
    requisitionId: 'req-005',
    requisitionTitle: 'Frontend Engineer',
    requisitionDepartment: 'Engineering',
    status: 'pending_review',
    manualReviewReason: 'low_confidence',
    submittedAt: '2026-07-25T08:20:00.000Z',
    screeningScore: 84,
    screeningConfidence: 0.83,
    slaDeadlineAt: '2026-07-27T08:20:00.000Z',
    slaRemainingSeconds: 9600,
    slaElapsedPercent: 20,
    slaSeverity: 'amber',
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

test.describe('US-004 E2E: bulk reject and realtime queue notifications', () => {
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
          departments: ['Engineering', 'Analytics', 'Design'],
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
            { id: 'req-001', title: 'Backend Engineer' },
            { id: 'req-002', title: 'QA Engineer' },
            { id: 'req-003', title: 'Data Analyst' },
            { id: 'req-004', title: 'Product Designer' },
            { id: 'req-005', title: 'Frontend Engineer' },
          ],
        }),
      });
    });

    await page.route('**/api/manual-review-queue/stats', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          totalCount: 5,
          byReason: {
            low_confidence: 2,
            flagged: 1,
            screening_failed: 1,
            manual_flag: 1,
          },
          oldestApplicationAgeHours: 18,
        }),
      });
    });

    await page.route('**/api/manual-review-queue/reason-codes**', async (route) => {
      const url = new URL(route.request().url());
      const decision = url.searchParams.get('decision');

      if (decision === 'rejected') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            items: [
              {
                code: 'insufficient_experience',
                displayText: 'Insufficient experience',
                category: 'rejection',
              },
            ],
          }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [] }),
      });
    });

    await page.route('**/api/manual-review-queue/bulk-reject', async (route) => {
      const body = route.request().postDataJSON() as {
        applicationIds: string[];
        reasonCode: string;
        comment?: string;
      };

      queueRows = queueRows.filter((row) => !body.applicationIds.includes(row.id));

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          message: 'Bulk reject action completed',
          result: {
            processedCount: body.applicationIds.length,
            rejectedIds: body.applicationIds,
            skipped: [],
            reasonCode: body.reasonCode,
            correlationId: 'corr-bulk-001',
            communicationsQueued: body.applicationIds.length,
          },
        }),
      });
    });

    await page.route('**/api/manual-review-queue**', async (route) => {
      const requestUrl = new URL(route.request().url());
      const department = requestUrl.searchParams.get('department');
      const scoreBand = requestUrl.searchParams.get('scoreBand');

      const filtered = queueRows.filter((row) => {
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

  test('bulk rejects five selected applications and reacts to realtime notification payloads', async ({ page }) => {
    await page.goto('/hr/manual-review');

    await expect(page.getByTestId('manual-review-nav-badge')).toContainText('0');
    await expect(page.getByText('Avery Stone')).toBeVisible();
    await expect(page.getByText('Eli North')).toBeVisible();

    await page.getByLabel('Select all visible applications').check();
    await expect(page.getByLabel('Select Avery Stone for bulk action')).toBeChecked();
    await expect(page.getByLabel('Select Blake Orbit for bulk action')).toBeChecked();
    await expect(page.getByLabel('Select Cora Finch for bulk action')).toBeChecked();
    await expect(page.getByLabel('Select Drew Vale for bulk action')).toBeChecked();
    await expect(page.getByLabel('Select Eli North for bulk action')).toBeChecked();

    await page.getByRole('button', { name: 'Bulk reject selected applications' }).click();
    await expect(page.getByRole('dialog', { name: 'Bulk reject applications form' })).toBeVisible();

    await page.getByLabel('Bulk reject reason code').selectOption('insufficient_experience');
    await page.getByLabel('Bulk reject comment').fill('Bulk reject for criteria mismatch.');
    await page.getByRole('button', { name: 'Confirm bulk reject' }).click();

    await expect(page.getByText('Avery Stone')).not.toBeVisible();
    await expect(page.getByText('Blake Orbit')).not.toBeVisible();
    await expect(page.getByText('Cora Finch')).not.toBeVisible();
    await expect(page.getByText('Drew Vale')).not.toBeVisible();
    await expect(page.getByText('Eli North')).not.toBeVisible();

    await expect(page.getByTestId('manual-review-nav-badge')).toContainText('0');

    const toastStart = Date.now();
    await page.evaluate(() => {
      window.dispatchEvent(
        new CustomEvent('queue:new_application', {
          detail: {
            applicationId: 'app-new-001',
            candidateName: 'Nova Lane',
            requisitionTitle: 'Backend Engineer',
            queuedAt: '2026-07-25T12:00:00.000Z',
            queueCount: 1,
            timestamp: '2026-07-25T12:00:00.000Z',
          },
        })
      );
    });

    await expect(page.getByTestId('manual-review-nav-badge')).toContainText('1');
    await expect(page.getByTestId('toast-info')).toContainText('New application: Nova Lane for Backend Engineer.');
    await expect(Date.now() - toastStart).toBeLessThanOrEqual(1000);
  });
});
