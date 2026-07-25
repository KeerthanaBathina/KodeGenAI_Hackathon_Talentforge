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

function createRows(): QueueItem[] {
  return [
    {
      id: 'app-shortlist',
      candidateId: 'cand-shortlist',
      candidateName: 'Taylor Shortlist',
      candidateEmail: 'taylor.shortlist@example.com',
      requisitionId: 'req-eng-1',
      requisitionTitle: 'Backend Engineer',
      requisitionDepartment: 'Engineering',
      status: 'pending_review',
      manualReviewReason: 'low_confidence',
      submittedAt: '2026-07-25T00:00:00.000Z',
      screeningScore: 87,
      screeningConfidence: 0.88,
      slaDeadlineAt: '2026-07-27T00:00:00.000Z',
      slaRemainingSeconds: 3600,
      slaElapsedPercent: 72,
      slaSeverity: 'amber',
      isUrgent: false,
      canShortlist: true,
      canReject: true,
      decisionLocked: false,
    },
    {
      id: 'app-reject',
      candidateId: 'cand-reject',
      candidateName: 'Jordan Reject',
      candidateEmail: 'jordan.reject@example.com',
      requisitionId: 'req-eng-2',
      requisitionTitle: 'Platform Engineer',
      requisitionDepartment: 'Engineering',
      status: 'pending_review',
      manualReviewReason: 'flagged',
      submittedAt: '2026-07-25T00:00:00.000Z',
      screeningScore: 61,
      screeningConfidence: 0.67,
      slaDeadlineAt: '2026-07-27T00:00:00.000Z',
      slaRemainingSeconds: 2200,
      slaElapsedPercent: 78,
      slaSeverity: 'amber',
      isUrgent: false,
      canShortlist: true,
      canReject: true,
      decisionLocked: false,
    },
  ];
}

function buildQueueResponse(filteredRows: QueueItem[]) {
  return {
    items: filteredRows,
    total: filteredRows.length,
    page: 1,
    limit: 20,
    totalPages: 1,
  };
}

test.describe('US-002 E2E: Decision reason code flow', () => {
  test.beforeEach(async ({ page }) => {
    const rows = createRows();

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
          departments: ['Engineering'],
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
            { id: 'req-eng-1', title: 'Backend Engineer' },
            { id: 'req-eng-2', title: 'Platform Engineer' },
          ],
        }),
      });
    });

    await page.route('**/api/manual-review-queue/stats', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          totalCount: rows.length,
          byReason: {
            low_confidence: 1,
            flagged: 1,
          },
          oldestApplicationAgeHours: 8,
        }),
      });
    });

    await page.route('**/api/manual-review-queue/reason-codes**', async (route) => {
      const requestUrl = new URL(route.request().url());
      const decision = requestUrl.searchParams.get('decision');

      if (decision === 'shortlisted') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            items: [
              {
                code: 'strong_skills_match',
                displayText: 'Strong skills match',
                category: 'decision',
              },
            ],
          }),
        });
        return;
      }

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
    });

    await page.route('**/api/manual-review-queue/*/review', async (route) => {
      const requestBody = JSON.parse(route.request().postData() || '{}') as {
        decision?: string;
        reasonCode?: string;
      };

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          message: `Application ${requestBody.decision}`,
          decision: {
            applicationId: 'mock-app-id',
            status: requestBody.decision,
            decision: requestBody.decision,
            reasonCode: requestBody.reasonCode,
            communicationId: 'comm-mock',
            correlationId: 'corr-mock',
            reviewedAt: '2026-07-25T15:00:00.000Z',
          },
        }),
      });
    });

    await page.route('**/api/manual-review-queue**', async (route) => {
      if (route.request().method() !== 'GET') {
        await route.fallback();
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(buildQueueResponse(rows)),
      });
    });
  });

  test('reject flow blocks confirm without reason and allows submit after reason selection', async ({ page }) => {
    await page.goto('/hr/manual-review');

    await expect(page.getByText('Jordan Reject')).toBeVisible();

    await page.getByRole('button', { name: 'Reject Jordan Reject' }).click();

    await expect(page.getByText('A reason code is required before rejecting.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Confirm Reject' })).toBeDisabled();

    await page.getByLabel('Decision reason code').selectOption('insufficient_experience');
    await expect(page.getByRole('button', { name: 'Confirm Reject' })).toBeEnabled();

    await page.getByRole('button', { name: 'Confirm Reject' }).click();

    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('shortlist flow submits selected reason code and closes decision dialog', async ({ page }) => {
    await page.goto('/hr/manual-review');

    await expect(page.getByText('Taylor Shortlist')).toBeVisible();

    await page.getByRole('button', { name: 'Shortlist Taylor Shortlist' }).click();

    await page.getByLabel('Decision reason code').selectOption('strong_skills_match');

    await page.getByRole('button', { name: 'Confirm Shortlist' }).click();

    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
});
