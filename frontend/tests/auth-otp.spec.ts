import { expect, test } from '@playwright/test';

test.describe('US-001 registration and OTP verification', () => {
  test('happy path redirects from register to verify to onboarding', async ({ page }) => {
    await page.route('**/api/auth/register', async (route) => {
      await route.fulfill({
        status: 202,
        contentType: 'application/json',
        body: JSON.stringify({
          message: 'If this email is new to us, you will receive a verification code'
        })
      });
    });

    await page.route('**/api/auth/verify-otp', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          message: 'Verification successful',
          redirectTo: '/onboarding/profile'
        })
      });
    });

    await page.goto('/register');

    await page.getByLabel('Email').fill('candidate@example.com');
    await page.getByLabel('Password').fill('ValidPass1');
    await page.getByRole('button', { name: 'Register' }).click();

    await expect(page).toHaveURL(/\/verify-otp\?email=candidate%40example\.com/);

    await page.getByLabel('One-time passcode').fill('123456');
    await page.getByRole('button', { name: 'Verify code' }).click();

    await expect(page).toHaveURL(/\/onboarding\/profile/);
  });

  test('expired OTP shows required message and resend option', async ({ page }) => {
    await page.route('**/api/auth/verify-otp', async (route) => {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          message: 'Code expired - please request a new one',
          canResend: true
        })
      });
    });

    await page.goto('/verify-otp?email=candidate@example.com');
    await page.getByLabel('Email').fill('candidate@example.com');
    await page.getByLabel('One-time passcode').fill('123456');
    await page.getByRole('button', { name: 'Verify code' }).click();

    await expect(page.getByText('Code expired - please request a new one')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Resend code' })).toBeVisible();
  });
});
