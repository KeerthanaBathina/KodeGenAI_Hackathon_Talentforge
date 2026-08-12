'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { buildApiUrl } from '@/lib/api/url';

type AdminSection = {
  href?: string;
  label: string;
  description: string;
  group: 'Overview' | 'Management' | 'Monitoring';
  shortCode: string;
  comingSoon?: boolean;
};

const ADMIN_SECTIONS: AdminSection[] = [
  {
    label: 'Dashboard',
    description: 'Executive system summary',
    group: 'Overview',
    shortCode: 'DB',
    comingSoon: true,
  },
  {
    href: '/admin/users',
    label: 'Users',
    description: 'Accounts and permissions',
    group: 'Management',
    shortCode: 'USR',
  },
  {
    href: '/admin/policies?tab=scoring',
    label: 'Business Rules',
    description: 'Global operating controls',
    group: 'Management',
    shortCode: 'BR',
  },
  {
    href: '/admin/policies?tab=screening',
    label: 'Thresholds',
    description: 'AI and score thresholds',
    group: 'Management',
    shortCode: 'TH',
  },
  {
    href: '/admin/templates',
    label: 'Templates',
    description: 'Email messaging content',
    group: 'Management',
    shortCode: 'TPL',
  },
  {
    href: '/admin/policies?tab=approval',
    label: 'Approval Matrix',
    description: 'Compensation approval flow',
    group: 'Management',
    shortCode: 'AP',
  },
  {
    href: '/admin/audit-log',
    label: 'Audit Log',
    description: 'Traceability and exports',
    group: 'Monitoring',
    shortCode: 'AUD',
  },
  {
    href: '/admin/health',
    label: 'System Health',
    description: 'Queues and service health',
    group: 'Monitoring',
    shortCode: 'HLT',
  },
];

type AdminPageShellProps = {
  title: string;
  description: string;
  actions?: ReactNode;
  children: ReactNode;
};

function isSectionActive(pathname: string, href: string): boolean {
  const [path] = href.split('?');
  if (!(pathname === path || pathname.startsWith(`${path}/`))) {
    return false;
  }

  return true;
}

function isSectionQueryMatch(searchParams: { get(name: string): string | null }, href: string): boolean {
  const [, queryString] = href.split('?');
  if (!queryString) {
    return true;
  }

  const expectedParams = new URLSearchParams(queryString);
  for (const [key, value] of expectedParams.entries()) {
    if (searchParams.get(key) !== value) {
      return false;
    }
  }

  return true;
}

export function AdminPageShell({
  title,
  description,
  actions,
  children,
}: AdminPageShellProps) {
  const router = useRouter();
  const pathname = usePathname() || '';
  const searchParams = useSearchParams();
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);

    try {
      await fetch(buildApiUrl('/api/auth/logout'), {
        method: 'POST',
        credentials: 'include',
      });
    } catch (error) {
      console.error('Admin logout request failed:', error);
    } finally {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('auth_role');
        localStorage.removeItem('auth_email');
      }

      router.replace('/login');
    }
  }

  const groupedSections: Array<AdminSection['group']> = ['Overview', 'Management', 'Monitoring'];

  return (
    <div className="admin-theme min-h-screen">
      <div className="mx-auto flex min-h-screen w-full max-w-[1680px] flex-col lg:flex-row">
        <aside className="w-full border-b border-[var(--admin-color-border)] bg-[var(--admin-color-surface-0)] lg:w-[220px] lg:border-b-0 lg:border-r">
          <div className="border-b border-[var(--admin-color-border)] px-4 py-4">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-[var(--admin-color-brand-primary)] text-[11px] font-bold text-white">
                TF
              </span>
              <span className="admin-heading text-sm font-bold text-[var(--admin-color-brand-primary)]">
                TalentForge
              </span>
            </div>
            <p className="mt-2 text-[11px] text-[var(--admin-color-ink-tertiary)]">System Administration</p>
          </div>

          <nav aria-label="Admin sections" className="px-2 py-3">
            {groupedSections.map((group) => {
              const sections = ADMIN_SECTIONS.filter((section) => section.group === group);
              if (sections.length === 0) {
                return null;
              }

              return (
                <div key={group} className="mb-3 last:mb-0">
                  <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--admin-color-ink-tertiary)]">
                    {group}
                  </p>
                  <ul className="space-y-1">
                    {sections.map((section) => {
                      const active = section.href
                        ? isSectionActive(pathname, section.href) &&
                          isSectionQueryMatch(searchParams, section.href)
                        : false;

                      if (!section.href || section.comingSoon) {
                        return (
                          <li key={`${group}-${section.label}`}>
                            <span className="flex min-h-[44px] cursor-not-allowed items-center gap-2 rounded-md border border-[var(--admin-color-border)] bg-[var(--admin-color-surface-1)] px-2.5 py-2 text-[13px] text-[var(--admin-color-ink-tertiary)]">
                              <span className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-[var(--admin-color-border)] bg-[var(--admin-color-surface-0)] text-[10px] font-semibold">
                                {section.shortCode}
                              </span>
                              <span className="min-w-0">
                                <span className="block truncate font-medium">{section.label}</span>
                                <span className="block truncate text-[11px]">{section.description}</span>
                              </span>
                              <span className="ml-auto rounded-full bg-[var(--admin-color-surface-2)] px-2 py-0.5 text-[10px] font-semibold text-[var(--admin-color-ink-secondary)]">
                                Soon
                              </span>
                            </span>
                          </li>
                        );
                      }

                      return (
                        <li key={section.href}>
                          <Link
                            href={section.href}
                            aria-current={active ? 'page' : undefined}
                            className={`group flex min-h-[44px] items-center gap-2 rounded-md border px-2.5 py-2 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--admin-color-brand-primary)] ${
                              active
                                ? 'border-transparent bg-indigo-50 text-[var(--admin-color-brand-primary)]'
                                : 'border-transparent text-[var(--admin-color-ink-secondary)] hover:border-[var(--admin-color-border)] hover:bg-[var(--admin-color-surface-1)]'
                            }`}
                          >
                            <span
                              className={`inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md border text-[10px] font-semibold ${
                                active
                                  ? 'border-indigo-200 bg-white text-[var(--admin-color-brand-primary)]'
                                  : 'border-[var(--admin-color-border)] bg-[var(--admin-color-surface-0)] text-[var(--admin-color-ink-tertiary)]'
                              }`}
                            >
                              {section.shortCode}
                            </span>
                            <span className="min-w-0">
                              <span className="block truncate text-[13px] font-semibold leading-tight">
                                {section.label}
                              </span>
                              <span className={`block truncate text-[11px] ${active ? 'text-indigo-500' : 'text-[var(--admin-color-ink-tertiary)]'}`}>
                                {section.description}
                              </span>
                            </span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </nav>
        </aside>

        <div className="flex min-h-screen flex-1 flex-col">
          <header className="border-b border-[var(--admin-color-border)] bg-[var(--admin-color-surface-0)] shadow-[var(--admin-shadow-xs)]">
            <div className="flex min-h-[52px] flex-wrap items-center justify-between gap-3 px-4 py-2 sm:px-6 lg:px-7">
              <div className="flex min-w-0 items-center gap-3">
                <h1 className="admin-heading truncate text-lg font-bold text-[var(--admin-color-ink-primary)]">
                  {title}
                </h1>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {actions}
                <button
                  type="button"
                  onClick={handleLogout}
                  disabled={loggingOut}
                  className="inline-flex min-h-[36px] items-center rounded-md border border-[var(--admin-color-border)] bg-[var(--admin-color-surface-0)] px-3 text-sm font-semibold text-[var(--admin-color-ink-secondary)] transition hover:bg-[var(--admin-color-surface-1)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loggingOut ? 'Logging out...' : 'Logout'}
                </button>
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-slate-800 text-[11px] font-bold text-white">
                  SA
                </span>
              </div>
            </div>
          </header>

          <main className="flex-1 px-4 pb-8 pt-5 sm:px-6 lg:px-7">
            <div className="mb-5 rounded-2xl border border-[var(--admin-color-border)] bg-[var(--admin-color-surface-0)] px-5 py-4 shadow-[var(--admin-shadow-sm)]">
              <p className="text-sm text-[var(--admin-color-ink-secondary)]">{description}</p>
            </div>
            <div className="space-y-5">{children}</div>
          </main>
        </div>
      </div>
    </div>
  );
}
