'use client';

import { format } from 'date-fns';

interface WorkerHealthProps {
  workers: Array<{
    workerName: string;
    status: 'online' | 'degraded' | 'offline';
    lastHeartbeat: string | null;
    minutesSinceHeartbeat: number | null;
  }>;
}

/**
 * Worker Health Status Section
 * Displays health status for all workers with visual indicators
 */
export function WorkerHealthSection({ workers }: WorkerHealthProps) {
  return (
    <section className="rounded-2xl border border-[var(--admin-color-border)] bg-[var(--admin-color-surface-0)] p-5 shadow-[var(--admin-shadow-sm)]">
      <h2 className="admin-heading mb-4 text-xl font-semibold tracking-tight text-[var(--admin-color-ink-primary)]">Worker Health Status</h2>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {workers.map((worker) => (
          <WorkerCard key={worker.workerName} worker={worker} />
        ))}

        {workers.length === 0 && (
          <div className="col-span-full rounded-lg border border-dashed border-[var(--admin-color-border)] bg-[var(--admin-color-surface-1)] px-4 py-6 text-center text-sm text-[var(--admin-color-ink-secondary)]">
            No worker health data available.
          </div>
        )}
      </div>
    </section>
  );
}

/**
 * Individual Worker Card
 * Shows worker name, status with color coding, and heartbeat info
 */
function WorkerCard({ worker }: { worker: WorkerHealthProps['workers'][0] }) {
  const statusConfig = {
    online: {
      bg: 'bg-emerald-50',
      border: 'border-emerald-200',
      text: 'text-emerald-900',
      badge: 'border-emerald-200 bg-emerald-100 text-emerald-800',
      dotColor: 'bg-emerald-500',
    },
    degraded: {
      bg: 'bg-amber-50',
      border: 'border-amber-200',
      text: 'text-amber-900',
      badge: 'border-amber-200 bg-amber-100 text-amber-800',
      dotColor: 'bg-amber-500',
    },
    offline: {
      bg: 'bg-rose-50',
      border: 'border-red-200',
      text: 'text-rose-900',
      badge: 'border-rose-200 bg-rose-100 text-rose-800',
      dotColor: 'bg-rose-500',
    },
  };

  const config = statusConfig[worker.status];

  return (
    <div className={`${config.bg} ${config.border} rounded-xl border p-4`}>
      <div className="mb-3 flex items-center justify-between">
        <h3 className={`pr-2 text-sm font-semibold ${config.text}`}>{worker.workerName}</h3>
        <span className={`${config.badge} whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-semibold`}>
          {worker.status.toUpperCase()}
        </span>
      </div>

      <div className="mb-2 flex items-center gap-2">
        <div className={`${config.dotColor} h-2 w-2 rounded-full`}></div>
        <span className="text-xs text-[var(--admin-color-ink-secondary)]">
          Status: <span className="font-medium">{worker.status}</span>
        </span>
      </div>

      {worker.lastHeartbeat ? (
        <div className="space-y-1 text-sm">
          <p className="text-[var(--admin-color-ink-secondary)]">
            <span className="text-[var(--admin-color-ink-tertiary)]">Last beat:</span> {worker.minutesSinceHeartbeat} min ago
          </p>
          <p className="text-xs text-[var(--admin-color-ink-tertiary)]">{format(new Date(worker.lastHeartbeat), 'p')}</p>
        </div>
      ) : (
        <p className="text-sm italic text-[var(--admin-color-ink-secondary)]">No heartbeat detected</p>
      )}
    </div>
  );
}
