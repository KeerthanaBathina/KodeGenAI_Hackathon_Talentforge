import { expect, test } from '@playwright/test';

if (process.platform === 'win32') {
  test.use({ channel: 'msedge' });
}

interface MockListParams {
  page: number;
  pageSize: number;
  totalItems: number;
  actorEmail: string | null;
  eventTypes: string[];
}

function buildAuditListResponse(params: MockListParams) {
  const { page, pageSize, totalItems, actorEmail, eventTypes } = params;
  const totalPages = Math.ceil(totalItems / pageSize);
  const start = (page - 1) * pageSize + 1;
  const count = Math.max(0, Math.min(pageSize, totalItems - start + 1));

  return {
    items: Array.from({ length: count }, (_, index) => {
      const sequence = start + index;
      return {
        id: `evt-${sequence}`,
        actorId: null,
        actorEmail: actorEmail || `actor-${sequence}@example.com`,
        eventType: eventTypes[index % Math.max(eventTypes.length, 1)] || 'auth.login',
        entityType: 'session',
        entityId: `entity-${sequence}`,
        payload: {
          sequence,
          source: 'playwright'
        },
        ipAddress: '127.0.0.1',
        userAgent: 'Playwright/1.0',
        createdAt: `2026-07-30T10:${String(index).padStart(2, '0')}:00.000Z`
      };
    }),
    page,
    pageSize,
    totalItems,
    totalPages,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1
  };
}

test.describe('Audit log viewer flow', () => {
  test('applies filters, keeps URL pagination, and exports filtered csv', async ({ page, context }) => {
    const listRequestUrls: URL[] = [];
    const exportRequestUrls: URL[] = [];

    let allowExportResponse: (() => void) | null = null;
    const exportGate = new Promise<void>((resolve) => {
      allowExportResponse = resolve;
    });

    await context.addCookies([
      {
        name: 'authToken',
        value: 'admin-token',
        domain: '127.0.0.1',
        path: '/'
      }
    ]);

    await page.route('**/api/admin/audit-log?**', async (route) => {
      const requestUrl = new URL(route.request().url());
      listRequestUrls.push(requestUrl);

      const actorEmail = requestUrl.searchParams.get('actorEmail');
      const eventTypes = (requestUrl.searchParams.get('eventTypes') || '')
        .split(',')
        .map((value) => value.trim())
        .filter((value) => value.length > 0);

      const pageParam = Number.parseInt(requestUrl.searchParams.get('page') || '1', 10);
      const pageSize = Number.parseInt(requestUrl.searchParams.get('pageSize') || '50', 10);
      const isFiltered = actorEmail === 'auditor@example.com' && eventTypes.length > 0;
      const totalItems = isFiltered ? 75 : 170;

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(
          buildAuditListResponse({
            page: pageParam,
            pageSize,
            totalItems,
            actorEmail,
            eventTypes
          })
        )
      });
    });

    await page.route('**/api/admin/audit-log/export.csv?**', async (route) => {
      const requestUrl = new URL(route.request().url());
      exportRequestUrls.push(requestUrl);

      await exportGate;

      await route.fulfill({
        status: 200,
        contentType: 'text/csv; charset=utf-8',
        headers: {
          'content-disposition': 'attachment; filename="audit-log.csv"'
        },
        body: [
          'event_id,event_type,entity_type,entity_id,created_at,actor_id,actor_email,ip_address,user_agent,payload_json',
          'evt-1,auth.login,session,entity-1,2026-07-30T10:00:00.000Z,,,127.0.0.1,Playwright/1.0,"{""source"":""playwright""}"'
        ].join('\n')
      });
    });

    await page.goto('/admin/audit-log?page=3');

    await expect(page.getByRole('heading', { name: 'Audit Log Viewer' })).toBeVisible();
    await expect(page.getByText('Showing 101-150 of 170 events')).toBeVisible();

    await page.getByTestId('audit-filter-actor-email').fill(' Auditor@Example.com ');
    await page.getByTestId('audit-filter-entity-type').selectOption('session');
    await page.getByTestId('audit-filter-event-types').selectOption(['auth.login', 'auth.logout']);

    const applyRequestPromise = page.waitForRequest((request) => {
      if (!request.url().includes('/api/admin/audit-log?')) {
        return false;
      }

      const requestUrl = new URL(request.url());
      return (
        requestUrl.searchParams.get('page') === '1' &&
        requestUrl.searchParams.get('actorEmail') === 'auditor@example.com' &&
        requestUrl.searchParams.get('eventTypes') === 'auth.login,auth.logout' &&
        requestUrl.searchParams.get('entityType') === 'session'
      );
    });

    await page.getByRole('button', { name: 'Apply Filters' }).click();
    await applyRequestPromise;

    await expect(page).toHaveURL(
      /\/admin\/audit-log\?page=1&actorEmail=auditor%40example.com&eventTypes=auth.login%2Cauth.logout&entityType=session/
    );
    await expect(page.getByText('Showing 1-50 of 75 events')).toBeVisible();

    const nextPageRequestPromise = page.waitForRequest((request) => {
      if (!request.url().includes('/api/admin/audit-log?')) {
        return false;
      }

      const requestUrl = new URL(request.url());
      return (
        requestUrl.searchParams.get('page') === '2' &&
        requestUrl.searchParams.get('actorEmail') === 'auditor@example.com' &&
        requestUrl.searchParams.get('eventTypes') === 'auth.login,auth.logout' &&
        requestUrl.searchParams.get('entityType') === 'session'
      );
    });

    await page.getByRole('button', { name: 'Next' }).click();
    await nextPageRequestPromise;

    await expect(page).toHaveURL(
      /\/admin\/audit-log\?page=2&actorEmail=auditor%40example.com&eventTypes=auth.login%2Cauth.logout&entityType=session/
    );
    await expect(page.getByTestId('audit-pagination-current-page')).toHaveText('2');

    const exportRequestPromise = page.waitForRequest((request) => {
      if (!request.url().includes('/api/admin/audit-log/export.csv?')) {
        return false;
      }

      const requestUrl = new URL(request.url());
      return (
        requestUrl.searchParams.get('page') === '1' &&
        requestUrl.searchParams.get('pageSize') === '50' &&
        requestUrl.searchParams.get('actorEmail') === 'auditor@example.com' &&
        requestUrl.searchParams.get('eventTypes') === 'auth.login,auth.logout' &&
        requestUrl.searchParams.get('entityType') === 'session'
      );
    });

    await page.getByRole('button', { name: 'Export CSV' }).click();
    await expect(page.getByRole('button', { name: 'Exporting CSV...' })).toBeDisabled();
    await exportRequestPromise;

    allowExportResponse?.();

    await expect(page.getByRole('button', { name: 'Export CSV' })).toBeEnabled();
    expect(exportRequestUrls).toHaveLength(1);
    expect(listRequestUrls.length).toBeGreaterThanOrEqual(3);
  });
});