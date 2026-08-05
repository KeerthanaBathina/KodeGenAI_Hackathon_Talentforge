'use client';

import { useState } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';

interface EmailDeliveryProps {
  emailDelivery?: {
    totalAttempted: number;
    successful: number;
    failed: number;
    successRate: number;
    failedEmails: Array<{
      id: string;
      to: string;
      templateType: string;
      status: string;
      createdAt: string;
    }>;
  };
}

/**
 * Email Delivery Metrics Section
 * Displays email delivery statistics and failed emails list
 */
export function EmailDeliverySection({ emailDelivery }: EmailDeliveryProps) {
  const [showFailedEmails, setShowFailedEmails] = useState(false);

  if (!emailDelivery) return null;

  const { totalAttempted, successful, failed, successRate, failedEmails } = emailDelivery;

  return (
    <section className="rounded-2xl border border-[var(--admin-color-border)] bg-[var(--admin-color-surface-0)] p-5 shadow-[var(--admin-shadow-sm)]">
      <h2 className="admin-heading mb-4 text-xl font-semibold tracking-tight text-[var(--admin-color-ink-primary)]">Email Delivery Metrics (Last 60 min)</h2>

      {/* Metric Cards Grid */}
      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-4">
        <MetricCard
          title="Success Rate"
          value={`${successRate}%`}
          subtitle={`${successful} delivered`}
          color={successRate >= 95 ? 'green' : successRate >= 90 ? 'amber' : 'red'}
        />
        <MetricCard title="Total Attempted" value={totalAttempted} subtitle="emails sent" color="blue" />
        <MetricCard title="Successful" value={successful} subtitle="delivered" color="green" />
        <MetricCard
          title="Failed"
          value={failed}
          subtitle={failed > 0 ? 'needs attention' : 'all good'}
          color={failed > 0 ? 'red' : 'green'}
        />
      </div>

      {/* Failed Emails Expandable Section */}
      {failed > 0 && (
        <div className="overflow-hidden rounded-xl border border-[var(--admin-color-border)] bg-white">
          <button
            onClick={() => setShowFailedEmails(!showFailedEmails)}
            className="flex w-full items-center justify-between px-6 py-4 transition-colors hover:bg-[var(--admin-color-surface-1)]"
          >
            <h3 className="text-base font-semibold text-[var(--admin-color-ink-primary)]">Failed Emails ({failed})</h3>
            <span className="text-sm font-semibold text-[var(--admin-color-brand-primary)]">
              {showFailedEmails ? (
                'Hide'
              ) : (
                'View Failed'
              )}
            </span>
          </button>

          {showFailedEmails && (
            <div className="border-t border-[var(--admin-color-border)]">
              <div className="max-h-96 overflow-y-auto">
                <table className="min-w-full divide-y divide-[var(--admin-color-border)]">
                  <thead className="sticky top-0 bg-[var(--admin-color-surface-1)]">
                    <tr>
                      <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--admin-color-ink-tertiary)]">
                        To
                      </th>
                      <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--admin-color-ink-tertiary)]">
                        Template
                      </th>
                      <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--admin-color-ink-tertiary)]">
                        Status
                      </th>
                      <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--admin-color-ink-tertiary)]">
                        Created
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--admin-color-border)] bg-white">
                    {failedEmails.map((email) => (
                      <tr key={email.id} className="transition-colors hover:bg-[var(--admin-color-surface-1)]">
                        <td className="px-6 py-3 text-sm font-medium text-[var(--admin-color-ink-primary)]">{email.to}</td>
                        <td className="px-6 py-3 text-sm text-[var(--admin-color-ink-secondary)]">
                          <span className="inline-block rounded-full border border-[var(--admin-color-border)] bg-[var(--admin-color-surface-1)] px-2 py-1 text-xs font-medium text-[var(--admin-color-ink-secondary)]">
                            {email.templateType}
                          </span>
                        </td>
                        <td className="px-6 py-3">
                          <span className="inline-block rounded-full bg-rose-100 px-2 py-1 text-xs font-semibold text-rose-800">
                            {email.status}
                          </span>
                        </td>
                        <td className="px-6 py-3 text-sm text-[var(--admin-color-ink-secondary)]">
                          {format(new Date(email.createdAt), 'PPp')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="border-t border-[var(--admin-color-border)] bg-[var(--admin-color-surface-1)] px-6 py-4 text-center">
                <Link
                  href="/admin/health/email/failed"
                  className="text-sm font-semibold text-[var(--admin-color-brand-primary)] transition-colors hover:text-[var(--admin-color-brand-primary-hover)]"
                >
                  View All Failed Emails ({failed} total) →
                </Link>
              </div>
            </div>
          )}
        </div>
      )}

      {/* All Good Message */}
      {failed === 0 && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-6 text-center">
          <h3 className="text-lg font-semibold text-emerald-900">All Email Deliveries Successful</h3>
          <p className="mt-1 text-emerald-700">
            {totalAttempted} emails delivered with {successRate}% success rate
          </p>
        </div>
      )}
    </section>
  );
}

/**
 * Metric Card Component
 * Displays a single metric with color coding
 */
function MetricCard({
  title,
  value,
  subtitle,
  color,
}: {
  title: string;
  value: string | number;
  subtitle: string;
  color: 'green' | 'amber' | 'red' | 'blue';
}) {
  const colorConfig = {
    green: {
      bg: 'bg-emerald-50',
      border: 'border-emerald-200',
      text: 'text-emerald-800',
      subtitle: 'text-emerald-700',
    },
    amber: {
      bg: 'bg-amber-50',
      border: 'border-amber-200',
      text: 'text-amber-900',
      subtitle: 'text-amber-700',
    },
    red: {
      bg: 'bg-rose-50',
      border: 'border-rose-200',
      text: 'text-rose-800',
      subtitle: 'text-rose-700',
    },
    blue: {
      bg: 'bg-sky-50',
      border: 'border-sky-200',
      text: 'text-sky-900',
      subtitle: 'text-sky-700',
    },
  };

  const config = colorConfig[color];

  return (
    <div className={`${config.bg} rounded-xl border ${config.border} p-4`}>
      <h3 className={`text-xs font-semibold uppercase tracking-[0.08em] opacity-85 ${config.text}`}>{title}</h3>
      <p className={`mt-2 text-3xl font-bold ${config.text}`}>{value}</p>
      <p className={`mt-1 text-xs opacity-80 ${config.subtitle}`}>{subtitle}</p>
    </div>
  );
}
