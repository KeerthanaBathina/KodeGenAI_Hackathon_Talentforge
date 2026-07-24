import { expect, test } from '@playwright/test';

test.describe('US-001 Requisition Browsing and Filtering', () => {
    test.beforeEach(async ({ page }) => {
        // Mock requisitions API for consistent testing
        await page.route('**/api/requisitions/filters', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    departments: ['Engineering', 'Marketing', 'Design'],
                    locations: ['Remote', 'New York', 'San Francisco'],
                    jobTypes: ['full_time', 'part_time', 'contract', 'internship'],
                }),
            });
        });
    });

    test('loads jobs page and displays requisitions', async ({ page }) => {
        await page.route('**/api/requisitions?*', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    data: [
                        {
                            id: 'req-1',
                            title: 'Senior Backend Engineer',
                            department: 'Engineering',
                            location: 'Remote',
                            jobType: 'full_time',
                            slots: 3,
                            filledSlots: 1,
                            status: 'open',
                            eligibilityCriteria: { minYearsExperience: 5 },
                            openedAt: new Date().toISOString(),
                        },
                        {
                            id: 'req-2',
                            title: 'Frontend Developer',
                            department: 'Engineering',
                            location: 'San Francisco',
                            jobType: 'contract',
                            slots: 2,
                            filledSlots: 0,
                            status: 'open',
                            eligibilityCriteria: { minYearsExperience: 3 },
                            openedAt: new Date().toISOString(),
                        },
                    ],
                    pagination: {
                        page: 1,
                        pageSize: 20,
                        totalItems: 2,
                        totalPages: 1,
                        hasNextPage: false,
                        hasPrevPage: false,
                    },
                    filters: {},
                }),
            });
        });

        await page.goto('/jobs');

        // Verify page title
        await expect(page.getByRole('heading', { name: 'Open Positions' })).toBeVisible();

        // Verify requisition count
        await expect(page.getByText('2 open roles')).toBeVisible();

        // Verify cards are rendered
        await expect(page.getByText('Senior Backend Engineer')).toBeVisible();
        await expect(page.getByText('Frontend Developer')).toBeVisible();
        await expect(page.getByText('Engineering')).toBeVisible();
        await expect(page.getByText('Remote')).toBeVisible();
    });

    test('filters by department and shows chip', async ({ page }) => {
        let lastRequestUrl = '';

        await page.route('**/api/requisitions?*', async (route) => {
            lastRequestUrl = route.request().url();
            const url = new URL(lastRequestUrl);
            const department = url.searchParams.get('department');

            const data = department === 'Engineering'
                ? [
                    {
                        id: 'req-1',
                        title: 'Senior Backend Engineer',
                        department: 'Engineering',
                        location: 'Remote',
                        jobType: 'full_time',
                        slots: 3,
                        filledSlots: 1,
                        status: 'open',
                        eligibilityCriteria: { minYearsExperience: 5 },
                        openedAt: new Date().toISOString(),
                    },
                ]
                : [];

            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    data,
                    pagination: {
                        page: 1,
                        pageSize: 20,
                        totalItems: data.length,
                        totalPages: 1,
                        hasNextPage: false,
                        hasPrevPage: false,
                    },
                    filters: department ? { department } : {},
                }),
            });
        });

        await page.goto('/jobs');

        // Select Engineering department
        await page.selectOption('#department-filter', 'Engineering');

        // Wait for filter to apply
        await page.waitForTimeout(500);

        // Verify filter chip appears
        await expect(page.getByText('Dept: Engineering')).toBeVisible();

        // Verify URL includes filter
        expect(page.url()).toContain('department=Engineering');

        // Verify only Engineering requisitions shown
        await expect(page.getByText('Senior Backend Engineer')).toBeVisible();
    });

    test('keyword search with 300ms debounce', async ({ page }) => {
        let searchCallCount = 0;

        await page.route('**/api/requisitions?*', async (route) => {
            const url = new URL(route.request().url());
            const keyword = url.searchParams.get('keyword');

            searchCallCount++;

            const data = keyword === 'backend'
                ? [
                    {
                        id: 'req-1',
                        title: 'Senior Backend Engineer',
                        department: 'Engineering',
                        location: 'Remote',
                        jobType: 'full_time',
                        slots: 3,
                        filledSlots: 1,
                        status: 'open',
                        eligibilityCriteria: { minYearsExperience: 5 },
                        openedAt: new Date().toISOString(),
                    },
                ]
                : [];

            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    data,
                    pagination: {
                        page: 1,
                        pageSize: 20,
                        totalItems: data.length,
                        totalPages: 1,
                        hasNextPage: false,
                        hasPrevPage: false,
                    },
                    filters: keyword ? { keyword } : {},
                }),
            });
        });

        await page.goto('/jobs');

        const initialCallCount = searchCallCount;

        // Type keyword slowly (each letter triggers debounce)
        await page.fill('#keyword-search', 'b');
        await page.waitForTimeout(100);
        await page.fill('#keyword-search', 'ba');
        await page.waitForTimeout(100);
        await page.fill('#keyword-search', 'bac');
        await page.waitForTimeout(100);
        await page.fill('#keyword-search', 'back');
        await page.waitForTimeout(100);
        await page.fill('#keyword-search', 'backe');
        await page.waitForTimeout(100);
        await page.fill('#keyword-search', 'backen');
        await page.waitForTimeout(100);
        await page.fill('#keyword-search', 'backend');

        // Wait for debounce (300ms)
        await page.waitForTimeout(400);

        // Should only trigger ONE API call after debounce
        expect(searchCallCount - initialCallCount).toBeLessThanOrEqual(2);

        // Verify keyword chip appears
        await expect(page.getByText('Keyword: backend')).toBeVisible();

        // Verify search result
        await expect(page.getByText('Senior Backend Engineer')).toBeVisible();
    });

    test('pagination navigates to page 2 with URL persistence', async ({ page }) => {
        await page.route('**/api/requisitions?*', async (route) => {
            const url = new URL(route.request().url());
            const currentPage = parseInt(url.searchParams.get('page') || '1');

            const allRequisitions = Array.from({ length: 50 }, (_, i) => ({
                id: `req-${i + 1}`,
                title: `Position ${i + 1}`,
                department: 'Engineering',
                location: 'Remote',
                jobType: 'full_time',
                slots: 1,
                filledSlots: 0,
                status: 'open',
                eligibilityCriteria: { minYearsExperience: 2 },
                openedAt: new Date().toISOString(),
            }));

            const pageSize = 20;
            const start = (currentPage - 1) * pageSize;
            const end = start + pageSize;
            const data = allRequisitions.slice(start, end);

            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    data,
                    pagination: {
                        page: currentPage,
                        pageSize,
                        totalItems: 50,
                        totalPages: 3,
                        hasNextPage: currentPage < 3,
                        hasPrevPage: currentPage > 1,
                    },
                    filters: {},
                }),
            });
        });

        await page.goto('/jobs');

        // Verify page 1 content
        await expect(page.getByText('Position 1')).toBeVisible();

        // Click next page
        await page.getByRole('button', { name: 'Next →' }).click();

        // Wait for navigation
        await page.waitForTimeout(500);

        // Verify URL includes page=2
        expect(page.url()).toContain('page=2');

        // Verify page 2 content (requisitions 21-40)
        await expect(page.getByText('Position 21')).toBeVisible();

        // Verify pagination state
        await expect(page.getByRole('button', { name: '← Previous' })).toBeEnabled();
    });

    test('empty state when no results match filters', async ({ page }) => {
        await page.route('**/api/requisitions?*', async (route) => {
            const url = new URL(route.request().url());
            const department = url.searchParams.get('department');

            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    data: [],
                    pagination: {
                        page: 1,
                        pageSize: 20,
                        totalItems: 0,
                        totalPages: 0,
                        hasNextPage: false,
                        hasPrevPage: false,
                    },
                    filters: department ? { department } : {},
                }),
            });
        });

        await page.goto('/jobs');

        // Apply filter that returns no results
        await page.selectOption('#department-filter', 'Design');

        await page.waitForTimeout(500);

        // Verify empty state message
        await expect(page.getByText('No positions match your filters')).toBeVisible();
        await expect(page.getByText(/Try adjusting your search criteria/)).toBeVisible();

        // Verify Clear Filters button
        await expect(page.getByRole('button', { name: 'Clear All Filters' })).toBeVisible();
    });

    test('clear filters button resets all filters', async ({ page }) => {
        await page.route('**/api/requisitions?*', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    data: [
                        {
                            id: 'req-1',
                            title: 'Senior Backend Engineer',
                            department: 'Engineering',
                            location: 'Remote',
                            jobType: 'full_time',
                            slots: 3,
                            filledSlots: 1,
                            status: 'open',
                            eligibilityCriteria: { minYearsExperience: 5 },
                            openedAt: new Date().toISOString(),
                        },
                    ],
                    pagination: {
                        page: 1,
                        pageSize: 20,
                        totalItems: 1,
                        totalPages: 1,
                        hasNextPage: false,
                        hasPrevPage: false,
                    },
                    filters: {},
                }),
            });
        });

        await page.goto('/jobs');

        // Apply multiple filters
        await page.selectOption('#department-filter', 'Engineering');
        await page.selectOption('#location-filter', 'Remote');
        await page.fill('#keyword-search', 'backend');

        await page.waitForTimeout(500);

        // Verify chips appear
        await expect(page.getByText('Dept: Engineering')).toBeVisible();
        await expect(page.getByText('Loc: Remote')).toBeVisible();
        await expect(page.getByText('Keyword: backend')).toBeVisible();

        // Click Clear All
        await page.getByRole('button', { name: 'Clear All' }).click();

        await page.waitForTimeout(500);

        // Verify all filters cleared
        expect(await page.inputValue('#department-filter')).toBe('');
        expect(await page.inputValue('#location-filter')).toBe('');
        expect(await page.inputValue('#keyword-search')).toBe('');

        // Verify URL reset
        expect(page.url()).toBe(`${page.url().split('?')[0]}`);
    });

    test('removes individual filter chip', async ({ page }) => {
        await page.route('**/api/requisitions?*', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    data: [],
                    pagination: {
                        page: 1,
                        pageSize: 20,
                        totalItems: 0,
                        totalPages: 0,
                        hasNextPage: false,
                        hasPrevPage: false,
                    },
                    filters: {},
                }),
            });
        });

        await page.goto('/jobs');

        // Apply filters
        await page.selectOption('#department-filter', 'Engineering');
        await page.selectOption('#location-filter', 'Remote');

        await page.waitForTimeout(500);

        // Verify both chips appear
        await expect(page.getByText('Dept: Engineering')).toBeVisible();
        await expect(page.getByText('Loc: Remote')).toBeVisible();

        // Click X on department chip
        await page.getByText('Dept: Engineering').locator('..').getByRole('button').click();

        await page.waitForTimeout(500);

        // Verify department chip removed, location remains
        await expect(page.getByText('Dept: Engineering')).not.toBeVisible();
        await expect(page.getByText('Loc: Remote')).toBeVisible();
    });

    test('clicking requisition card navigates to detail page', async ({ page }) => {
        await page.route('**/api/requisitions?*', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    data: [
                        {
                            id: 'req-123',
                            title: 'Senior Backend Engineer',
                            department: 'Engineering',
                            location: 'Remote',
                            jobType: 'full_time',
                            slots: 3,
                            filledSlots: 1,
                            status: 'open',
                            eligibilityCriteria: { minYearsExperience: 5 },
                            openedAt: new Date().toISOString(),
                        },
                    ],
                    pagination: {
                        page: 1,
                        pageSize: 20,
                        totalItems: 1,
                        totalPages: 1,
                        hasNextPage: false,
                        hasPrevPage: false,
                    },
                    filters: {},
                }),
            });
        });

        await page.goto('/jobs');

        // Click on requisition card
        await page.getByText('Senior Backend Engineer').click();

        // Verify navigation to detail page
        await expect(page).toHaveURL(/\/jobs\/req-123/);
    });

    test('combined filters use AND logic', async ({ page }) => {
        await page.route('**/api/requisitions?*', async (route) => {
            const url = new URL(route.request().url());
            const department = url.searchParams.get('department');
            const location = url.searchParams.get('location');

            // Only show if BOTH filters match
            const data =
                department === 'Engineering' && location === 'Remote'
                    ? [
                        {
                            id: 'req-1',
                            title: 'Senior Backend Engineer',
                            department: 'Engineering',
                            location: 'Remote',
                            jobType: 'full_time',
                            slots: 3,
                            filledSlots: 1,
                            status: 'open',
                            eligibilityCriteria: { minYearsExperience: 5 },
                            openedAt: new Date().toISOString(),
                        },
                    ]
                    : [];

            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    data,
                    pagination: {
                        page: 1,
                        pageSize: 20,
                        totalItems: data.length,
                        totalPages: data.length > 0 ? 1 : 0,
                        hasNextPage: false,
                        hasPrevPage: false,
                    },
                    filters: {},
                }),
            });
        });

        await page.goto('/jobs');

        // Apply both filters
        await page.selectOption('#department-filter', 'Engineering');
        await page.selectOption('#location-filter', 'Remote');

        await page.waitForTimeout(500);

        // Verify both chips visible
        await expect(page.getByText('Dept: Engineering')).toBeVisible();
        await expect(page.getByText('Loc: Remote')).toBeVisible();

        // Verify result matches BOTH filters
        await expect(page.getByText('Senior Backend Engineer')).toBeVisible();
        await expect(page.getByText('Engineering')).toBeVisible();
        await expect(page.getByText('Remote')).toBeVisible();
    });
});
