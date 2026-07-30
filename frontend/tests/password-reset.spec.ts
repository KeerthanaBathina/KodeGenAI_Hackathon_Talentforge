import { expect, test } from '@playwright/test';

test.describe('US-004 Password Reset Flow', () => {
    const testEmail = 'reset-test@example.com';
    const newPassword = 'NewSecurePass123';
    let mockResetToken = 'mock-reset-token-abc123';

    test('complete flow: forgot password → validate token → reset → login', async ({ page }) => {
        // Mock request-password-reset endpoint
        await page.route('**/api/auth/request-password-reset', async (route) => {
            await route.fulfill({
                status: 202,
                contentType: 'application/json',
                body: JSON.stringify({
                    message: 'If this email is registered, you will receive a password reset link',
                }),
            });
        });

        // Mock validate-reset-token endpoint (success)
        await page.route(`**/api/auth/validate-reset-token/${mockResetToken}`, async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    valid: true,
                }),
            });
        });

        // Mock reset-password endpoint
        await page.route('**/api/auth/reset-password', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    message: 'Password reset successful',
                }),
            });
        });

        // Step 1: Navigate to forgot password page
        await page.goto('/forgot-password');

        // Step 2: Submit email
        await page.getByLabel('Email').fill(testEmail);
        await page.getByRole('button', { name: 'Send Reset Link' }).click();

        // Step 3: Verify success message
        await expect(page.getByText('Check Your Email')).toBeVisible();
        await expect(page.getByText('If this email is registered, you will receive a password reset link')).toBeVisible();

        // Step 4: Navigate to reset password page with token
        await page.goto(`/reset-password?token=${mockResetToken}`);

        // Wait for token validation
        await expect(page.getByText('Validating reset link...')).toBeVisible();
        await expect(page.getByText('Validating reset link...')).not.toBeVisible({ timeout: 5000 });

        // Step 5: Fill password form
        await expect(page.getByText('Reset Password')).toBeVisible();
        await page.getByLabel('New Password').fill(newPassword);
        await page.getByLabel('Confirm Password').fill(newPassword);

        // Step 6: Submit password reset
        await page.getByRole('button', { name: 'Reset Password' }).click();

        // Step 7: Verify success and redirect
        await expect(page.getByText('Password Reset Successful')).toBeVisible();
        await expect(page).toHaveURL(/\/login/, { timeout: 5000 });
    });

    test('shows generic message for non-existent email (non-enumeration)', async ({ page }) => {
        await page.route('**/api/auth/request-password-reset', async (route) => {
            await route.fulfill({
                status: 202,
                contentType: 'application/json',
                body: JSON.stringify({
                    message: 'If this email is registered, you will receive a password reset link',
                }),
            });
        });

        await page.goto('/forgot-password');
        await page.getByLabel('Email').fill('nonexistent@example.com');
        await page.getByRole('button', { name: 'Send Reset Link' }).click();

        // Should show same success message
        await expect(page.getByText('Check Your Email')).toBeVisible();
        await expect(page.getByText('If this email is registered, you will receive a password reset link')).toBeVisible();
    });

    test('shows rate limit error with countdown timer', async ({ page }) => {
        const resetAt = Date.now() + 60 * 60 * 1000; // 1 hour from now

        await page.route('**/api/auth/request-password-reset', async (route) => {
            await route.fulfill({
                status: 429,
                contentType: 'application/json',
                headers: {
                    'Retry-After': '3600',
                },
                body: JSON.stringify({
                    error: {
                        code: 'RATE_LIMIT_EXCEEDED',
                        message: 'Too many password reset requests',
                        resetAt: new Date(resetAt).toISOString(),
                    },
                }),
            });
        });

        await page.goto('/forgot-password');
        await page.getByLabel('Email').fill(testEmail);
        await page.getByRole('button', { name: 'Send Reset Link' }).click();

        // Verify rate limit error message
        await expect(page.getByText('Too many password reset requests')).toBeVisible();

        // Verify countdown timer is present
        await expect(page.getByText(/Try again in/)).toBeVisible();
    });

    test('shows error for expired token', async ({ page }) => {
        const expiredToken = 'expired-token-xyz';

        await page.route(`**/api/auth/validate-reset-token/${expiredToken}`, async (route) => {
            await route.fulfill({
                status: 400,
                contentType: 'application/json',
                body: JSON.stringify({
                    valid: false,
                    error: 'TOKEN_EXPIRED',
                    message: 'Reset link expired',
                }),
            });
        });

        await page.goto(`/reset-password?token=${expiredToken}`);

        // Wait for validation
        await expect(page.getByText('Validating reset link...')).toBeVisible();
        await expect(page.getByText('Validating reset link...')).not.toBeVisible({ timeout: 5000 });

        // Verify error state
        await expect(page.getByText('Reset Link Invalid')).toBeVisible();
        await expect(page.getByText('Reset link expired')).toBeVisible();
        await expect(page.getByRole('link', { name: 'Request New Link' })).toBeVisible();
        await expect(page.getByRole('link', { name: 'Back to Login' })).toBeVisible();
    });

    test('shows error for used token', async ({ page }) => {
        const usedToken = 'used-token-abc';

        await page.route(`**/api/auth/validate-reset-token/${usedToken}`, async (route) => {
            await route.fulfill({
                status: 400,
                contentType: 'application/json',
                body: JSON.stringify({
                    valid: false,
                    error: 'TOKEN_USED',
                    message: 'Reset link already used',
                }),
            });
        });

        await page.goto(`/reset-password?token=${usedToken}`);

        await expect(page.getByText('Validating reset link...')).not.toBeVisible({ timeout: 5000 });

        await expect(page.getByText('Reset Link Invalid')).toBeVisible();
        await expect(page.getByText('Reset link already used')).toBeVisible();
    });

    test('shows error for invalid token', async ({ page }) => {
        const invalidToken = 'invalid-token';

        await page.route(`**/api/auth/validate-reset-token/${invalidToken}`, async (route) => {
            await route.fulfill({
                status: 400,
                contentType: 'application/json',
                body: JSON.stringify({
                    valid: false,
                    error: 'TOKEN_NOT_FOUND',
                    message: 'Invalid reset link',
                }),
            });
        });

        await page.goto(`/reset-password?token=${invalidToken}`);

        await expect(page.getByText('Validating reset link...')).not.toBeVisible({ timeout: 5000 });

        await expect(page.getByText('Reset Link Invalid')).toBeVisible();
        await expect(page.getByText('Invalid reset link')).toBeVisible();
    });

    test('shows error for missing token', async ({ page }) => {
        await page.goto('/reset-password');

        // Should immediately show error (no validation spinner)
        await expect(page.getByText('Reset Link Invalid')).toBeVisible();
        await expect(page.getByText(/Missing reset token/)).toBeVisible();
    });

    test('validates password requirements on client', async ({ page }) => {
        await page.route(`**/api/auth/validate-reset-token/${mockResetToken}`, async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ valid: true }),
            });
        });

        await page.goto(`/reset-password?token=${mockResetToken}`);

        await expect(page.getByText('Validating reset link...')).not.toBeVisible({ timeout: 5000 });

        // Verify password requirements are displayed
        await expect(page.getByText('Password must contain:')).toBeVisible();
        await expect(page.getByText('At least 8 characters')).toBeVisible();
        await expect(page.getByText(/One uppercase letter/)).toBeVisible();
        await expect(page.getByText(/One lowercase letter/)).toBeVisible();
        await expect(page.getByText(/One number/)).toBeVisible();
    });

    test('shows error when passwords do not match', async ({ page }) => {
        await page.route(`**/api/auth/validate-reset-token/${mockResetToken}`, async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ valid: true }),
            });
        });

        await page.goto(`/reset-password?token=${mockResetToken}`);
        await expect(page.getByText('Validating reset link...')).not.toBeVisible({ timeout: 5000 });

        await page.getByLabel('New Password').fill('ValidPass123');
        await page.getByLabel('Confirm Password').fill('DifferentPass456');
        await page.getByRole('button', { name: 'Reset Password' }).click();

        await expect(page.getByText('Passwords do not match')).toBeVisible();
    });

    test('shows error for weak password from server', async ({ page }) => {
        await page.route(`**/api/auth/validate-reset-token/${mockResetToken}`, async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ valid: true }),
            });
        });

        await page.route('**/api/auth/reset-password', async (route) => {
            await route.fulfill({
                status: 400,
                contentType: 'application/json',
                body: JSON.stringify({
                    error: {
                        code: 'WEAK_PASSWORD',
                        message: 'Password must contain at least one uppercase letter',
                    },
                }),
            });
        });

        await page.goto(`/reset-password?token=${mockResetToken}`);
        await expect(page.getByText('Validating reset link...')).not.toBeVisible({ timeout: 5000 });

        await page.getByLabel('New Password').fill('weakpass123');
        await page.getByLabel('Confirm Password').fill('weakpass123');
        await page.getByRole('button', { name: 'Reset Password' }).click();

        await expect(page.getByText('Password must contain at least one uppercase letter')).toBeVisible();
    });

    test('forgot password link is present on login page', async ({ page }) => {
        await page.goto('/login');

        const forgotLink = page.getByRole('link', { name: 'Forgot password?' });
        await expect(forgotLink).toBeVisible();
        await expect(forgotLink).toHaveAttribute('href', '/forgot-password');
    });

    test('back to login link works from forgot password page', async ({ page }) => {
        await page.goto('/forgot-password');

        const backLink = page.getByRole('link', { name: 'Back to Login' });
        await expect(backLink).toBeVisible();

        await backLink.click();
        await expect(page).toHaveURL(/\/login/);
    });

    test('request new link button navigates to forgot password', async ({ page }) => {
        const expiredToken = 'expired-token';

        await page.route(`**/api/auth/validate-reset-token/${expiredToken}`, async (route) => {
            await route.fulfill({
                status: 400,
                contentType: 'application/json',
                body: JSON.stringify({
                    valid: false,
                    error: 'TOKEN_EXPIRED',
                    message: 'Reset link expired',
                }),
            });
        });

        await page.goto(`/reset-password?token=${expiredToken}`);
        await expect(page.getByText('Validating reset link...')).not.toBeVisible({ timeout: 5000 });

        const requestNewLink = page.getByRole('link', { name: 'Request New Link' });
        await expect(requestNewLink).toBeVisible();

        await requestNewLink.click();
        await expect(page).toHaveURL(/\/forgot-password/);
    });
});
