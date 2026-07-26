import { test, expect } from '@playwright/test';

test.describe('US-001 E2E: Interview scheduling and conflict handling', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/interviews/availability**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            panelMemberId: 'panel-1',
            panelMemberName: 'Arun Menon',
            timezone: 'UTC',
            slots: [
              {
                startAt: '2026-07-26T09:00:00.000Z',
                endAt: '2026-07-26T09:45:00.000Z',
                available: false,
                label: '09:00 UTC',
              },
              {
                startAt: '2026-07-26T10:00:00.000Z',
                endAt: '2026-07-26T10:45:00.000Z',
                available: true,
                label: '10:00 UTC',
              },
            ],
          },
        ]),
      });
    });

    await page.route('**/api/interviews', async (route) => {
      if (route.request().method() !== 'POST') {
        await route.fallback();
        return;
      }

      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          interview: {
            id: 'stage-1',
            applicationId: 'app-1',
            type: 'technical',
            scheduledAt: '2026-07-26T10:00:00.000Z',
            timezone: 'UTC',
            panelMembers: ['panel-1'],
            communicationsQueued: 3,
            reminderJobsQueued: 2,
          },
        }),
      });
    });
  });

  test('shows timezone-aware slots, disables booked slot, and confirms available interview slot', async ({ page }) => {
    await page.goto('/hr/interviews/app-1');

    await expect(page.getByText('Interview Planner')).toBeVisible();
    await expect(page.getByText(/Browser timezone:/)).toBeVisible();

    await expect(page.getByRole('button', { name: /Booked slot 09:00 UTC/i })).toBeDisabled();
    await expect(page.getByRole('button', { name: /Select slot 10:00 UTC/i })).toBeEnabled();

    await page.getByRole('button', { name: /Select slot 10:00 UTC/i }).click();
    await page.getByRole('button', { name: /Confirm Interview/i }).click();

    await expect(page.getByTestId('toast-success')).toContainText('Interview scheduled for');
  });

  test('shows conflict warning and blocks confirmation when backend reports panelist conflict', async ({ page }) => {
    await page.route('**/api/interviews', async (route) => {
      if (route.request().method() !== 'POST') {
        await route.fallback();
        return;
      }

      await route.fulfill({
        status: 422,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'Conflict detected',
          conflicts: [
            {
              panelMemberId: 'panel-1',
              panelMemberName: 'Arun Menon',
              interviewStageId: 'stage-2',
              interviewType: 'hr',
              requisitionTitle: 'System Design Interview',
              scheduledAt: '2026-07-26T10:15:00.000Z',
              timezone: 'UTC',
            },
          ],
        }),
      });
    });

    await page.goto('/hr/interviews/app-1');

    await page.getByRole('button', { name: /Select slot 10:00 UTC/i }).click();
    await page.getByRole('button', { name: /Confirm Interview/i }).click();

    await expect(page.getByRole('dialog', { name: /Panelist conflict warning/i })).toBeVisible();
    await expect(page.getByTestId('toast-info')).toContainText('Panelist conflict detected. Select a different slot or panelist.');
    await expect(page.getByText(/Arun Menon is unavailable: System Design Interview at/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /Confirm Interview/i })).toBeDisabled();
  });
});
