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
    <section className="mb-8">
      <h2 className="text-2xl font-semibold text-gray-900 mb-4">Worker Health Status</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {workers.map((worker) => (
          <WorkerCard key={worker.workerName} worker={worker} />
        ))}
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
      bg: 'bg-green-50',
      border: 'border-green-200',
      text: 'text-green-800',
      badge: 'bg-green-100 text-green-800',
      icon: '✓',
      dotColor: 'bg-green-500',
    },
    degraded: {
      bg: 'bg-amber-50',
      border: 'border-amber-200',
      text: 'text-amber-800',
      badge: 'bg-amber-100 text-amber-800',
      icon: '⚠',
      dotColor: 'bg-amber-500',
    },
    offline: {
      bg: 'bg-red-50',
      border: 'border-red-200',
      text: 'text-red-800',
      badge: 'bg-red-100 text-red-800',
      icon: '✗',
      dotColor: 'bg-red-500',
    },
  };

  const config = statusConfig[worker.status];

  return (
    <div className={`${config.bg} ${config.border} border rounded-lg p-4`}>
      <div className="flex items-center justify-between mb-3">
        <h3 className={`font-semibold ${config.text} text-sm pr-2`}>{worker.workerName}</h3>
        <span className={`${config.badge} px-2 py-1 rounded text-xs font-medium whitespace-nowrap`}>
          {config.icon} {worker.status.toUpperCase()}
        </span>
      </div>

      <div className="flex items-center gap-2 mb-2">
        <div className={`${config.dotColor} w-2 h-2 rounded-full animate-pulse`}></div>
        <span className="text-xs text-gray-600">
          Status: <span className="font-medium">{worker.status}</span>
        </span>
      </div>

      {worker.lastHeartbeat ? (
        <div className="text-sm space-y-1">
          <p className="text-gray-700">
            <span className="text-gray-600">Last beat:</span> {worker.minutesSinceHeartbeat} min ago
          </p>
          <p className="text-xs text-gray-500">{format(new Date(worker.lastHeartbeat), 'p')}</p>
        </div>
      ) : (
        <p className="text-sm text-gray-600 italic">No heartbeat detected</p>
      )}
    </div>
  );
}
