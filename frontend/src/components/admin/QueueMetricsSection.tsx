'use client';

import Link from 'next/link';

interface QueueMetricsProps {
  queues: Array<{
    queueName: string;
    active: number;
    waiting: number;
    failed: number;
    delayed: number;
    completed: number;
  }>;
}

/**
 * Queue Metrics Section
 * Displays BullMQ queue statistics in a table format
 */
export function QueueMetricsSection({ queues }: QueueMetricsProps) {
  return (
    <section className="rounded-2xl border border-[var(--admin-color-border)] bg-[var(--admin-color-surface-0)] p-5 shadow-[var(--admin-shadow-sm)]">
      <h2 className="admin-heading mb-4 text-xl font-semibold tracking-tight text-[var(--admin-color-ink-primary)]">BullMQ Queue Metrics</h2>

      <div className="overflow-hidden rounded-xl border border-[var(--admin-color-border)]">
        <table className="min-w-full divide-y divide-[var(--admin-color-border)]">
          <thead className="bg-[var(--admin-color-surface-1)]">
            <tr>
              <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--admin-color-ink-tertiary)]">
                Queue Name
              </th>
              <th className="px-6 py-3 text-center text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--admin-color-ink-tertiary)]">
                Active
              </th>
              <th className="px-6 py-3 text-center text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--admin-color-ink-tertiary)]">
                Waiting
              </th>
              <th className="px-6 py-3 text-center text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--admin-color-ink-tertiary)]">
                Failed
              </th>
              <th className="px-6 py-3 text-center text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--admin-color-ink-tertiary)]">
                Delayed
              </th>
              <th className="px-6 py-3 text-center text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--admin-color-ink-tertiary)]">
                Completed (1h)
              </th>
              <th className="px-6 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--admin-color-ink-tertiary)]">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--admin-color-border)] bg-white">
            {queues.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-6 text-center text-sm text-[var(--admin-color-ink-secondary)]">
                  No queue data available
                </td>
              </tr>
            ) : (
              queues.map((queue) => <QueueRow key={queue.queueName} queue={queue} />)
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/**
 * Individual Queue Row
 * Shows all metrics for a single queue with visual indicators
 */
function QueueRow({ queue }: { queue: QueueMetricsProps['queues'][0] }) {
  const hasIssues = queue.failed > 0 || queue.waiting > 100;
  const displayName = queue.queueName
    .replace(/-/g, ' ')
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

  return (
    <tr className={hasIssues ? 'bg-amber-50/60' : 'transition-colors hover:bg-[var(--admin-color-surface-1)]'}>
      <td className="px-6 py-4 whitespace-nowrap">
        <div className="flex items-center gap-2">
          <div className="text-sm font-semibold text-[var(--admin-color-ink-primary)]">{displayName}</div>
          {hasIssues && (
            <span className="inline-flex rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
              Issue
            </span>
          )}
        </div>
      </td>
      <td className="px-6 py-4 text-center">
        <MetricBadge value={queue.active} type="info" />
      </td>
      <td className="px-6 py-4 text-center">
        <MetricBadge value={queue.waiting} type={queue.waiting > 100 ? 'warning' : 'default'} />
      </td>
      <td className="px-6 py-4 text-center">
        <MetricBadge value={queue.failed} type={queue.failed > 0 ? 'error' : 'success'} />
      </td>
      <td className="px-6 py-4 text-center">
        <MetricBadge value={queue.delayed} type="default" />
      </td>
      <td className="px-6 py-4 text-center">
        <span className="text-sm font-semibold text-[var(--admin-color-ink-primary)]">{queue.completed}</span>
      </td>
      <td className="px-6 py-4 text-right">
        <Link
          href={`/admin/health/queue/${queue.queueName}`}
          className="text-sm font-semibold text-[var(--admin-color-brand-primary)] transition-colors hover:text-[var(--admin-color-brand-primary-hover)]"
        >
          Details →
        </Link>
      </td>
    </tr>
  );
}

/**
 * Metric Badge Component
 * Displays a metric value with color coding
 */
function MetricBadge({ value, type }: { value: number; type: string }) {
  const styles = {
    success: 'bg-emerald-100 text-emerald-800 font-semibold',
    error: 'bg-rose-100 text-rose-800 font-semibold',
    warning: 'bg-amber-100 text-amber-800 font-semibold',
    info: 'bg-indigo-100 text-indigo-800 font-semibold',
    default: 'bg-slate-100 text-slate-700 font-semibold',
  };

  return (
    <span className={`px-2.5 py-1 rounded-full text-xs ${styles[type as keyof typeof styles]}`}>
      {value}
    </span>
  );
}
