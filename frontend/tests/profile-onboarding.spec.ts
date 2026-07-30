import { expect, test } from '@playwright/test';

test.describe('US-005 Profile CRUD and Onboarding Checklist', () => {
    test.beforeEach(async ({ page }) => {
        // Mock authentication - assume user is logged in
        await page.route('**/api/profile', async (route) => {
            if (route.request().method() === 'GET') {
                await route.fulfill({
                    status: 404,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        error: { code: 'PROFILE_NOT_FOUND', message: 'Profile not found' },
                    }),
                });
            }
        });
    });

    test('complete profile creation flow with all sections', async ({ page }) => {
        let profileData: any = {};

        await page.route('**/api/profile', async (route) => {
            if (route.request().method() === 'POST') {
                profileData = JSON.parse(route.request().postData() || '{}');
                await route.fulfill({
                    status: 201,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        ...profileData,
                        id: 'profile-123',
                        candidateId: 'candidate-123',
                        profileCompletionPercentage: 80,
                        createdAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString(),
                        completionStatus: {
                            percentage: 80,
                            completedSections: ['basic_info', 'skills', 'education', 'work_history'],
                            missingFields: ['privacyConsent'],
                        },
                    }),
                });
            } else if (route.request().method() === 'GET') {
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        ...profileData,
                        profileCompletionPercentage: 80,
                    }),
                });
            }
        });

        await page.goto('/profile');

        // Fill basic information
        await page.getByLabel('Full Name').fill('Jane Doe');
        await page.getByLabel('Years of Experience').fill('5');

        // Add skills (minimum 3)
        const skillInput = page.getByPlaceholder('e.g., JavaScript, React, Node.js');
        await skillInput.fill('JavaScript');
        await page.getByRole('button', { name: 'Add' }).click();
        await skillInput.fill('TypeScript');
        await page.getByRole('button', { name: 'Add' }).click();
        await skillInput.fill('React');
        await page.getByRole('button', { name: 'Add' }).click();

        // Verify skills are displayed
        await expect(page.getByText('JavaScript')).toBeVisible();
        await expect(page.getByText('TypeScript')).toBeVisible();
        await expect(page.getByText('React')).toBeVisible();

        // Add education entry
        await page.getByRole('button', { name: '+ Add Education' }).click();
        await page.getByLabel('Institution').first().fill('MIT');
        await page.getByLabel('Degree').first().fill('BS Computer Science');
        await page.getByLabel('Field of Study').first().fill('Software Engineering');
        await page.getByLabel('Start Date').first().fill('2015-09-01');
        await page.getByLabel('End Date').first().fill('2019-06-01');

        // Add work history entry
        await page.getByRole('button', { name: '+ Add Work Experience' }).click();
        await page.getByLabel('Company').first().fill('TechCorp');
        await page.getByLabel('Job Title').first().fill('Software Engineer');
        await page.locator('input[type="date"]').filter({ hasText: /Start Date/i }).last().fill('2020-01-01');
        await page.getByLabel('Currently Working').first().check();
        await page.getByLabel('Description').first().fill('Developing scalable web applications');

        // Submit form
        await page.getByRole('button', { name: 'Save Profile' }).click();

        // Verify success message
        await expect(page.getByText('Profile saved successfully!')).toBeVisible();

        // Verify completion percentage updated
        await expect(page.getByText('Current completion: 80%')).toBeVisible();
    });

    test('validates minimum requirements before submission', async ({ page }) => {
        await page.goto('/profile');

        // Try to submit without meeting requirements
        await page.getByLabel('Full Name').fill('Jane Doe');
        await page.getByRole('button', { name: 'Save Profile' }).click();

        // Should show validation error
        await expect(page.getByText('Please add at least 3 skills')).toBeVisible();
    });

    test('can remove skills from the list', async ({ page }) => {
        await page.goto('/profile');

        // Add skills
        const skillInput = page.getByPlaceholder('e.g., JavaScript, React, Node.js');
        await skillInput.fill('JavaScript');
        await page.getByRole('button', { name: 'Add' }).click();
        await skillInput.fill('TypeScript');
        await page.getByRole('button', { name: 'Add' }).click();

        // Remove one skill
        await page.getByText('JavaScript').locator('..').getByRole('button').click();

        // JavaScript should be removed
        await expect(page.getByText('JavaScript')).not.toBeVisible();
        await expect(page.getByText('TypeScript')).toBeVisible();
    });

    test('can add and remove education entries', async ({ page }) => {
        await page.goto('/profile');

        // Add two education entries
        await page.getByRole('button', { name: '+ Add Education' }).click();
        await page.getByRole('button', { name: '+ Add Education' }).click();

        // Verify both are displayed
        await expect(page.getByText('Education #1')).toBeVisible();
        await expect(page.getByText('Education #2')).toBeVisible();

        // Remove first entry
        await page.getByText('Education #1').locator('..').getByRole('button', { name: 'Remove' }).click();

        // Only second entry should remain (renumbered to #1)
        await expect(page.getByText('Education #1')).toBeVisible();
        await expect(page.getByText('Education #2')).not.toBeVisible();
    });

    test('can add and remove work history entries', async ({ page }) => {
        await page.goto('/profile');

        // Add two work entries
        await page.getByRole('button', { name: '+ Add Work Experience' }).click();
        await page.getByRole('button', { name: '+ Add Work Experience' }).click();

        // Verify both are displayed
        await expect(page.getByText('Work Experience #1')).toBeVisible();
        await expect(page.getByText('Work Experience #2')).toBeVisible();

        // Remove second entry
        await page.getByText('Work Experience #2').locator('..').getByRole('button', { name: 'Remove' }).click();

        // Only first entry should remain
        await expect(page.getByText('Work Experience #1')).toBeVisible();
        await expect(page.getByText('Work Experience #2')).not.toBeVisible();
    });

    test('disables end date when "Currently Working" is checked', async ({ page }) => {
        await page.goto('/profile');

        await page.getByRole('button', { name: '+ Add Work Experience' }).click();

        // Check "Currently Working"
        await page.getByLabel('Currently Working').first().check();

        // End date should be disabled
        const endDateInput = page.getByLabel('End Date').first();
        await expect(endDateInput).toBeDisabled();
    });

    test('updates existing profile', async ({ page }) => {
        let updateCount = 0;

        await page.route('**/api/profile', async (route) => {
            if (route.request().method() === 'GET') {
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        fullName: 'Jane Doe',
                        experienceYears: 5,
                        skills: ['JavaScript', 'TypeScript'],
                        education: [],
                        workHistory: [],
                        profileCompletionPercentage: 40,
                        completionStatus: {
                            percentage: 40,
                            completedSections: ['basic_info', 'skills'],
                            missingFields: ['education', 'workHistory', 'privacyConsent'],
                        },
                    }),
                });
            } else if (route.request().method() === 'PUT') {
                updateCount++;
                const updates = JSON.parse(route.request().postData() || '{}');
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        fullName: 'Jane Doe',
                        experienceYears: updates.experienceYears || 5,
                        skills: updates.skills || ['JavaScript', 'TypeScript'],
                        education: [],
                        workHistory: [],
                        profileCompletionPercentage: 40,
                    }),
                });
            }
        });

        await page.goto('/profile');

        // Should show existing data
        await expect(page.getByLabel('Full Name')).toHaveValue('Jane Doe');
        await expect(page.getByLabel('Years of Experience')).toHaveValue('5');

        // Update experience
        await page.getByLabel('Years of Experience').fill('10');
        await page.getByRole('button', { name: 'Save Profile' }).click();

        // Should use PUT method
        expect(updateCount).toBe(1);
        await expect(page.getByText('Profile saved successfully!')).toBeVisible();
    });
});

test.describe('US-005 Privacy Consent Flow', () => {
    test('accepts privacy consent', async ({ page }) => {
        await page.route('**/api/consent', async (route) => {
            if (route.request().method() === 'GET') {
                await route.fulfill({
                    status: 404,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        error: { code: 'CONSENT_NOT_FOUND' },
                    }),
                });
            }
        });

        await page.route('**/api/consent/accept', async (route) => {
            await route.fulfill({
                status: 201,
                contentType: 'application/json',
                body: JSON.stringify({
                    id: 'consent-123',
                    candidateId: 'candidate-123',
                    policyVersion: '1.0',
                    acceptedAt: new Date().toISOString(),
                    ipAddress: '127.0.0.1',
                    userAgent: 'Test',
                    revokedAt: null,
                }),
            });
        });

        await page.goto('/consent');

        // Should show privacy policy
        await expect(page.getByRole('heading', { name: 'Privacy Policy' })).toBeVisible();
        await expect(page.getByText('Data Collection and Usage')).toBeVisible();

        // Accept consent
        await page.getByRole('button', { name: 'I Accept' }).click();

        // Should show success state
        await expect(page.getByText('Privacy Consent Accepted')).toBeVisible();
        await expect(page.getByText('Policy Version: 1.0')).toBeVisible();
    });

    test('shows already accepted consent', async ({ page }) => {
        await page.route('**/api/consent', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    id: 'consent-123',
                    candidateId: 'candidate-123',
                    policyVersion: '1.0',
                    acceptedAt: new Date('2026-07-01').toISOString(),
                    ipAddress: '127.0.0.1',
                    revokedAt: null,
                }),
            });
        });

        await page.goto('/consent');

        // Should show accepted state
        await expect(page.getByText('Privacy Consent Accepted')).toBeVisible();
        await expect(page.getByText('Policy Version: 1.0')).toBeVisible();
        await expect(page.getByRole('button', { name: 'Continue to Profile' })).toBeVisible();
    });

    test('can decline and navigate back', async ({ page }) => {
        await page.route('**/api/consent', async (route) => {
            await route.fulfill({
                status: 404,
                contentType: 'application/json',
                body: JSON.stringify({
                    error: { code: 'CONSENT_NOT_FOUND' },
                }),
            });
        });

        await page.goto('/consent');

        // Click decline
        await page.getByRole('button', { name: 'Decline' }).click();

        // Should navigate to profile without recording consent
        await expect(page).toHaveURL(/\/profile/);
    });
});

test.describe('US-005 Onboarding Checklist', () => {
    test('displays checklist with completion status', async ({ page }) => {
        await page.route('**/api/profile/completion', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    percentage: 60,
                    completedSections: ['basic_info', 'skills', 'education'],
                    missingFields: ['workHistory', 'privacyConsent'],
                }),
            });
        });

        await page.goto('/'); // Assuming checklist is on home/dashboard

        // Should show progress
        await expect(page.getByText('60%')).toBeVisible();

        // Should show completed items with checkmarks
        await expect(page.getByText('Basic Information')).toBeVisible();
        await expect(page.getByText('Skills (minimum 3)')).toBeVisible();
        await expect(page.getByText('Education')).toBeVisible();

        // Should show missing fields warning
        await expect(page.getByText(/Missing:/)).toBeVisible();
        await expect(page.getByText(/workHistory/)).toBeVisible();
        await expect(page.getByText(/privacyConsent/)).toBeVisible();
    });

    test('links to appropriate sections', async ({ page }) => {
        await page.route('**/api/profile/completion', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    percentage: 40,
                    completedSections: ['basic_info', 'skills'],
                    missingFields: ['education', 'workHistory', 'privacyConsent'],
                }),
            });
        });

        await page.goto('/');

        // Click on Education link
        await page.getByText('Education').click();

        // Should navigate to profile page with education anchor
        await expect(page).toHaveURL(/\/profile#education/);
    });
});

test.describe('US-005 Profile Completion Gate', () => {
    test('blocks application submission with incomplete profile', async ({ page }) => {
        await page.route('**/api/applications', async (route) => {
            await route.fulfill({
                status: 403,
                contentType: 'application/json',
                body: JSON.stringify({
                    error: {
                        code: 'PROFILE_INCOMPLETE',
                        message: 'Profile must be at least 80% complete to apply for jobs. Current completion: 60%',
                        details: {
                            currentCompletion: 60,
                            requiredCompletion: 80,
                            missingFields: ['workHistory', 'privacyConsent'],
                            completedSections: ['basic_info', 'skills', 'education'],
                        },
                        redirectTo: '/profile',
                    },
                }),
            });
        });

        await page.goto('/jobs/job-123');

        // Try to apply
        await page.getByRole('button', { name: 'Apply Now' }).click();

        // Should show error message
        await expect(page.getByText(/Profile must be at least 80% complete/)).toBeVisible();
        await expect(page.getByText(/Current completion: 60%/)).toBeVisible();
    });

    test('allows application submission with complete profile', async ({ page }) => {
        await page.route('**/api/applications', async (route) => {
            await route.fulfill({
                status: 201,
                contentType: 'application/json',
                body: JSON.stringify({
                    id: 'application-123',
                    status: 'submitted',
                }),
            });
        });

        await page.goto('/jobs/job-123');

        // Apply with 100% profile
        await page.getByRole('button', { name: 'Apply Now' }).click();

        // Should succeed
        await expect(page.getByText(/Application submitted/)).toBeVisible();
    });
});
