'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

type HrSidebarShellProps = {
  children: ReactNode;
};

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function HrSidebarShell({ children }: HrSidebarShellProps) {
  const pathname = usePathname() || '';

  const navItems = [
    { href: '/hr/dashboard', label: 'Dashboard' },
    { href: '/hr/manual-review', label: 'Manual Review' },
    { href: '/requisitions/bulk-import', label: 'Requisitions' },
  ];

  return (
    <div
      style={{
        backgroundColor: '#F8FAFC',
        minHeight: '100vh',
        display: 'flex',
      }}
    >
      <aside
        style={{
          width: '224px',
          backgroundColor: '#FFFFFF',
          borderRight: '1px solid #E2E8F0',
          flexShrink: 0,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            borderBottom: '1px solid #E2E8F0',
            padding: '14px 12px',
          }}
        >
          <span
            style={{
              width: '28px',
              height: '28px',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '8px',
              backgroundColor: '#6366F1',
              color: '#FFFFFF',
              fontSize: '11px',
              fontWeight: 700,
            }}
          >
            TF
          </span>
          <span style={{ color: '#4F46E5', fontWeight: 700, fontSize: '15px' }}>TalentForge</span>
        </div>

        <nav aria-label="HR navigation" style={{ padding: '10px 8px' }}>
          <p
            style={{
              margin: '4px 8px 8px',
              color: '#94A3B8',
              fontSize: '11px',
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
            }}
          >
            Main
          </p>
          {navItems.map((item) => {
            const active = isActive(pathname, item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  borderRadius: '8px',
                  padding: '10px 10px',
                  marginBottom: '4px',
                  textDecoration: 'none',
                  fontSize: '13px',
                  fontWeight: 600,
                  color: active ? '#4338CA' : '#64748B',
                  backgroundColor: active ? '#EEF2FF' : 'transparent',
                }}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
    </div>
  );
}
