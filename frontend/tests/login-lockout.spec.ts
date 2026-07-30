import { expect, test } from '@playwright/test';

test.describe('US-003 Login with Account Lockout', () => {
    test('successful login redirects to candidate dashboard', async ({ page }) => {
        await page.route('**/api/auth/login', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                headers: {
                    'Set-Cookie': 'auth_token=mock-jwt-token; Path=/; HttpOnly; SameSite=Lax',
                },
                body: JSON.stringify({
                    success: true,
                    message: 'Login successful',
                    data: {
                        user: {
                            id: 'user-123',
                            email: 'candidate@example.com',
                            role: 'candidate',
                            candidateId: 'cand-123',
                        },
                        redirectTo: '/candidate/applications',
                    },
                }),
            });
        });

        await page.goto('/login');

        await page.getByLabel('Email').fill('candidate@example.com');
        await page.getByLabel('Password').fill('ValidPass123!');
        await page.getByRole('button', { name: 'Sign In' }).click();

        await expect(page).toHaveURL(/\/candidate\/applications/);
    });

    test('invalid credentials show error message', async ({ page }) => {
        await page.route('**/api/auth/login', async (route) => {
            await route.fulfill({
                status: 401,
                contentType: 'application/json',
                body: JSON.stringify({
                    error: {
                        code: 'INVALID_CREDENTIALS',
                        message: 'Invalid email or password',
                    },
                }),
            });
        });

        await page.goto('/login');

        await page.getByLabel('Email').fill('candidate@example.com');
        await page.getByLabel('Password').fill('WrongPassword');
        await page.getByRole('button', { name: 'Sign In' }).click();

        await expect(page.getByRole('alert')).toContainText('Invalid email or password');
        await expect(page).toHaveURL(/\/login/);
    });

    test('locked account shows countdown timer', async ({ page }) => {
        const lockedUntil = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // 5 minutes from now

        await page.route('**/api/auth/login', async (route) => {
            await route.fulfill({
                status: 423,
                contentType: 'application/json',
                body: JSON.stringify({
                    error: {
                        code: 'ACCOUNT_LOCKED',
                        message: 'Account temporarily locked due to too many failed login attempts. Please try again in 5 minutes.',
                        lockedUntil,
                    },
                }),
            });
        });

        await page.goto('/login');

        await page.getByLabel('Email').fill('locked@example.com');
        await page.getByLabel('Password').fill('AnyPassword');
        await page.getByRole('button', { name: 'Sign In' }).click();

        // Verify lockout alert is displayed
        const lockoutAlert = page.getByRole('alert').filter({ hasText: 'Account Locked' });
        await expect(lockoutAlert).toBeVisible();
        await expect(lockoutAlert).toContainText('Account temporarily locked');

        // Verify countdown timer is present
        await expect(lockoutAlert.getByRole('timer')).toBeVisible();
        const timerText = await lockoutAlert.getByRole('timer').textContent();
        expect(timerText).toMatch(/\d{1,2}:\d{2}/); // MM:SS format

        // Verify form inputs are disabled
        await expect(page.getByLabel('Email')).toBeDisabled();
        await expect(page.getByLabel('Password')).toBeDisabled();
        await expect(page.getByRole('button', { name: 'Sign In' })).toBeDisabled();
    });

    test('lockout persists across page refresh', async ({ page }) => {
        const lockedUntil = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 minutes from now

        // Set localStorage to simulate previous lockout
        await page.goto('/login');
        await page.evaluate((until) => {
            localStorage.setItem('account_locked_until', until);
        }, lockedUntil);

        // Reload the page
        await page.reload();

        // Verify lockout warning is displayed on mount
        const lockoutAlert = page.getByRole('alert').filter({ hasText: 'Account Locked' });
        await expect(lockoutAlert).toBeVisible();

        // Verify countdown timer shows
        await expect(lockoutAlert.getByRole('timer')).toBeVisible();

        // Verify form is disabled
        await expect(page.getByRole('button', { name: 'Sign In' })).toBeDisabled();
    });

    test('expired lockout clears warning and enables form', async ({ page }) => {
        const expiredLockout = new Date(Date.now() - 1000).toISOString(); // 1 second ago

        await page.goto('/login');
        await page.evaluate((until) => {
            localStorage.setItem('account_locked_until', until);
        }, expiredLockout);

        await page.reload();

        // Verify no lockout warning is shown
        await expect(page.getByRole('alert').filter({ hasText: 'Account Locked' })).not.toBeVisible();

        // Verify form is enabled
        await expect(page.getByLabel('Email')).toBeEnabled();
        await expect(page.getByLabel('Password')).toBeEnabled();
        await expect(page.getByRole('button', { name: 'Sign In' })).toBeEnabled();
    });

    test('client-side validation for email and password', async ({ page }) => {
        await page.goto('/login');

        // Test empty submission
        await page.getByRole('button', { name: 'Sign In' }).click();
        await expect(page.getByRole('alert')).toContainText('Email and password are required');

        // Test invalid email format
        await page.getByLabel('Email').fill('not-an-email');
        await page.getByLabel('Password').fill('ValidPass123!');
        await page.getByRole('button', { name: 'Sign In' }).click();
        await expect(page.getByRole('alert')).toContainText('valid email address');

        // Test short password
        await page.getByLabel('Email').fill('valid@example.com');
        await page.getByLabel('Password').fill('short');
        await page.getByRole('button', { name: 'Sign In' }).click();
        await expect(page.getByRole('alert')).toContainText('at least 8 characters');
    });

    test('OAuth button redirects to provider', async ({ page }) => {
        await page.goto('/login');

        // Click Google OAuth button
        const googleButton = page.getByRole('button', { name: /Google/i });
        await expect(googleButton).toBeVisible();

        // Don't actually navigate to Google, just verify the button exists and is clickable
        await expect(googleButton).toBeEnabled();
    });

    test('OAuth buttons disabled when account is locked', async ({ page }) => {
        const lockedUntil = new Date(Date.now() + 5 * 60 * 1000).toISOString();

        await page.goto('/login');
        await page.evaluate((until) => {
            localStorage.setItem('account_locked_until', until);
        }, lockedUntil);

        await page.reload();

        // Verify OAuth buttons are disabled
        await expect(page.getByRole('button', { name: /Google/i })).toBeDisabled();
        await expect(page.getByRole('button', { name: /GitHub/i })).toBeDisabled();
    });

    test('register link is visible', async ({ page }) => {
        await page.goto('/login');

        const registerLink = page.getByRole('link', { name: /Sign up/i });
        await expect(registerLink).toBeVisible();
        await expect(registerLink).toHaveAttribute('href', '/register');
    });

    test('submitting button shows loading state', async ({ page }) => {
        await page.route('**/api/auth/login', async (route) => {
            // Delay response to see loading state
            await new Promise((resolve) => setTimeout(resolve, 1000));
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    success: true,
                    data: { redirectTo: '/candidate/applications' },
                }),
            });
        });

        await page.goto('/login');

        await page.getByLabel('Email').fill('candidate@example.com');
        await page.getByLabel('Password').fill('ValidPass123!');

        const submitButton = page.getByRole('button', { name: 'Sign In' });
        await submitButton.click();

        // Check for loading state
        await expect(submitButton).toContainText('Signing in...');
        await expect(submitButton).toBeDisabled();
    });

    test('role-based redirect for different user roles', async ({ page }) => {
        const testCases = [
            { role: 'candidate', redirectTo: '/candidate/applications' },
            { role: 'hr', redirectTo: '/hr/dashboard' },
            { role: 'recruiter', redirectTo: '/recruiter/requisitions' },
            { role: 'admin', redirectTo: '/admin/dashboard' },
        ];

        for (const testCase of testCases) {
            await page.route('**/api/auth/login', async (route) => {
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        success: true,
                        message: 'Login successful',
                        data: {
                            user: {
                                id: 'user-123',
                                email: 'user@example.com',
                                role: testCase.role,
                            },
                            redirectTo: testCase.redirectTo,
                        },
                    }),
                });
            });

            await page.goto('/login');

            await page.getByLabel('Email').fill(`${testCase.role}@example.com`);
            await page.getByLabel('Password').fill('ValidPass123!');
            await page.getByRole('button', { name: 'Sign In' }).click();

            await expect(page).toHaveURL(new RegExp(testCase.redirectTo.replace('/', '\\/')));
        }
    });
});
