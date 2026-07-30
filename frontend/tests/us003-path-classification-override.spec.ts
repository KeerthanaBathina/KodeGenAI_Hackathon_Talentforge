import { expect, test } from '@playwright/test';

function setupAuthAndCommonRoutes(page: import('@playwright/test').Page) {
  return Promise.all([
    page.route('**/api/auth/login', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: {
          'Set-Cookie': 'auth_token=mock-hr-token; Path=/; HttpOnly; SameSite=Lax',
        },
        body: JSON.stringify({
          success: true,
          data: {
            user: {
              id: 'hr-1',
              email: 'hr@example.com',
              role: 'hr_reviewer',
            },
            redirectTo: '/hr/manual-review',
          },
        }),
      });
    }),
    page.route('**/api/admin/system-status/fallback-mode', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ active: false }),
      });
    }),
    page.route('**/api/requisitions/filters', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ departments: ['Engineering'] }),
      });
    }),
    page.route('**/api/requisitions?page=1&pageSize=100&status=open', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [{ id: 'req-1', title: 'Backend Engineer' }],
        }),
      });
    }),
    page.route('**/api/manual-review-queue/stats', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          totalCount: 1,
          byReason: { low_confidence: 1 },
          oldestApplicationAgeHours: 2,
        }),
      });
    }),
    page.route('**/api/manual-review-queue/reason-codes?decision=shortlisted', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [{ code: 'strong_skills_match', displayText: 'Strong skills match', category: 'decision' }],
        }),
      });
    }),
    page.route('**/api/manual-review-queue/reason-codes?decision=rejected', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [{ code: 'insufficient_experience', displayText: 'Insufficient experience', category: 'rejection' }],
        }),
      });
    }),
  ]);
}

test.describe('US-003 E2E: Path Classification and Recruiter Override', () => {
  test('shows classified path and enforces min-20 justification before override submit', async ({ page }) => {
    await setupAuthAndCommonRoutes(page);

    let overrideRequestCount = 0;

    await page.route('**/api/manual-review-queue?**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [
            {
              id: 'app-1',
              candidateId: 'cand-1',
              candidateName: 'Alex Jordan',
              candidateEmail: 'alex@example.com',
              requisitionId: 'req-1',
              requisitionTitle: 'Backend Engineer',
              requisitionDepartment: 'Engineering',
              status: 'pending_review',
              manualReviewReason: 'low_confidence',
              submittedAt: '2026-07-25T10:00:00.000Z',
              screeningScore: 84,
              screeningConfidence: 0.8,
              path: 'fresher',
              pathOverridden: false,
              slaDeadlineAt: '2026-07-27T10:00:00.000Z',
              slaRemainingSeconds: 7200,
              slaElapsedPercent: 60,
              slaSeverity: 'amber',
              isUrgent: false,
              canShortlist: true,
              canReject: true,
              decisionLocked: false,
            },
          ],
          total: 1,
          page: 1,
          limit: 20,
          totalPages: 1,
        }),
      });
    });

    await page.route('**/api/manual-review-queue/app-1/path-override', async (route) => {
      overrideRequestCount += 1;
      const payload = route.request().postDataJSON() as {
        newPath: 'fresher' | 'experienced';
        justification: string;
      };

      expect(payload.newPath).toBe('experienced');
      expect(payload.justification.length).toBeGreaterThanOrEqual(20);

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          message: 'Application path overridden',
          override: {
            applicationId: 'app-1',
            originalPath: 'fresher',
            newPath: 'experienced',
            justification: payload.justification,
            overriddenAt: '2026-07-25T16:00:00.000Z',
          },
        }),
      });
    });

    await page.goto('/login');
    await page.getByLabel('Email').fill('hr@example.com');
    await page.getByLabel('Password').fill('TestPassword123!');
    await page.locator('button[type="submit"]:has-text("Sign In")').click();
    await expect(page).toHaveURL(/\/hr\/manual-review/);

    await expect(page.getByLabel('Interview path fresher')).toBeVisible();

    await page.getByRole('button', { name: 'Override path for Alex Jordan' }).click();
    await expect(page.getByRole('dialog', { name: 'Override interview path form' })).toBeVisible();

    const confirmOverride = page.getByRole('button', { name: 'Confirm path override' });
    await expect(confirmOverride).toBeDisabled();

    const justification = page.getByLabel('Path override justification');
    await justification.fill('too short');
    await expect(page.getByText('Justification must be at least 20 characters.')).toBeVisible();
    await expect(confirmOverride).toBeDisabled();
    expect(overrideRequestCount).toBe(0);

    await justification.fill('Candidate has demonstrated production-level backend experience.');
    await expect(confirmOverride).toBeEnabled();

    await confirmOverride.click();

    await expect.poll(() => overrideRequestCount).toBe(1);
  });
});
