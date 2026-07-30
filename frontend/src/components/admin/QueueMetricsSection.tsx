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
    <section className="mb-8">
      <h2 className="text-2xl font-semibold text-gray-900 mb-4">BullMQ Queue Metrics</h2>

      <div className="bg-white rounded-lg shadow overflow-hidden border border-gray-200">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Queue Name
              </th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                Active
              </th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                Waiting
              </th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                Failed
              </th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                Delayed
              </th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                Completed (1h)
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {queues.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-4 text-center text-gray-600">
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
    <tr className={hasIssues ? 'bg-yellow-50' : 'hover:bg-gray-50 transition-colors'}>
      <td className="px-6 py-4 whitespace-nowrap">
        <div className="flex items-center">
          <div className="text-sm font-medium text-gray-900">{displayName}</div>
          {hasIssues && <span className="ml-2 text-yellow-600 text-lg">⚠</span>}
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
        <span className="text-sm font-medium text-gray-900">{queue.completed}</span>
      </td>
      <td className="px-6 py-4 text-right">
        <Link
          href={`/admin/health/queue/${queue.queueName}`}
          className="text-blue-600 hover:text-blue-800 text-sm font-medium transition-colors"
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
    success: 'bg-green-100 text-green-800 font-medium',
    error: 'bg-red-100 text-red-800 font-medium',
    warning: 'bg-yellow-100 text-yellow-800 font-medium',
    info: 'bg-blue-100 text-blue-800 font-medium',
    default: 'bg-gray-100 text-gray-800 font-medium',
  };

  return (
    <span className={`px-2.5 py-1 rounded-full text-xs ${styles[type as keyof typeof styles]}`}>
      {value}
    </span>
  );
}
