'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { WorkerHealthSection } from '@/components/admin/WorkerHealthSection';
import { QueueMetricsSection } from '@/components/admin/QueueMetricsSection';
import { EmailDeliverySection } from '@/components/admin/EmailDeliverySection';
import { AdminPageShell } from '@/components/admin/AdminPageShell';
import { buildApiUrl } from '@/lib/api/url';

interface QueueMetric {
  queueName: string;
  active: number;
  waiting: number;
  failed: number;
  delayed: number;
  completed: number;
}

interface WorkerHealth {
  workerName: string;
  status: 'online' | 'degraded' | 'offline';
  lastHeartbeat: string | null;
  minutesSinceHeartbeat: number | null;
}

interface EmailDeliveryMetrics {
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
}

interface HealthData {
  queues: QueueMetric[];
  workers: WorkerHealth[];
  emailDelivery: EmailDeliveryMetrics;
  timestamp: string;
  meta?: {
    collectionTimeMs: number;
  };
}

/**
 * Admin Health Dashboard Page
 * Displays real-time system health metrics with auto-refresh
 */
export default function HealthDashboardPage() {
  const router = useRouter();
  const [healthData, setHealthData] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  /**
   * Fetch health metrics from API
   */
  const fetchHealthData = async () => {
    try {
      setError(null);
      const response = await fetch(buildApiUrl('/api/admin/health'), {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      });

      if (response.status === 401) {
        router.push('/login');
        return;
      }

      if (!response.ok) {
        throw new Error(`Failed to fetch health metrics: ${response.status}`);
      }

      const data = await response.json();
      setHealthData(data);
      setLastUpdated(new Date());
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      console.error('Failed to fetch health data:', err);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Initial fetch on component mount
   */
  useEffect(() => {
    fetchHealthData();
  }, []);

  /**
   * Auto-refresh every 30 seconds
   */
  useEffect(() => {
    if (!autoRefresh) return;

    const intervalId = setInterval(() => {
      fetchHealthData();
    }, 30000); // 30 seconds

    return () => clearInterval(intervalId);
  }, [autoRefresh]);

  if (loading) {
    return (
      <AdminPageShell
        title="Platform Health Dashboard"
        description="Real-time service status and infrastructure metrics across workers, queues, and outbound delivery."
      >
        <div className="flex min-h-[280px] items-center justify-center rounded-2xl border border-[var(--admin-color-border)] bg-[var(--admin-color-surface-0)] shadow-[var(--admin-shadow-sm)]">
          <div className="text-center">
            <div className="mx-auto h-12 w-12 animate-spin rounded-full border-b-2 border-[var(--admin-color-brand-primary)]"></div>
            <p className="mt-4 text-sm font-medium text-[var(--admin-color-ink-secondary)]">Loading health metrics...</p>
          </div>
        </div>
      </AdminPageShell>
    );
  }

  if (error && !healthData) {
    return (
      <AdminPageShell
        title="Platform Health Dashboard"
        description="Monitor workers, queues, and outbound delivery performance from one operational dashboard."
      >
        <div className="rounded-xl border border-red-200 bg-red-50 p-6">
          <h2 className="text-lg font-semibold text-red-900">Error loading health data</h2>
          <p className="mt-2 text-sm text-red-700">{error}</p>
          <button
            onClick={fetchHealthData}
            className="mt-4 rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-800"
          >
            Retry
          </button>
        </div>
      </AdminPageShell>
    );
  }

  return (
    <AdminPageShell
      title="Platform Health Dashboard"
      description="Real-time service status and infrastructure metrics with optional auto-refresh and failure visibility."
      actions={
        <>
          <label className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-[var(--admin-color-border)] bg-white px-3 py-2 text-sm font-medium text-[var(--admin-color-ink-secondary)] shadow-sm">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="h-4 w-4 rounded border-slate-400 text-[var(--admin-color-brand-primary)] focus:ring-[var(--admin-color-brand-primary)]"
            />
            Auto-refresh (30s)
          </label>

          <button
            onClick={fetchHealthData}
            className="inline-flex min-h-[44px] items-center rounded-lg bg-[var(--admin-color-brand-primary)] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[var(--admin-color-brand-primary-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--admin-color-brand-primary)]"
          >
            Refresh now
          </button>
        </>
      }
    >
      {/* Last Updated Timestamp */}
      {lastUpdated && (
        <div className="rounded-xl border border-[var(--admin-color-border)] bg-[var(--admin-color-surface-0)] px-4 py-3 text-sm text-[var(--admin-color-ink-secondary)] shadow-[var(--admin-shadow-sm)]">
          Last updated: <span className="font-semibold text-[var(--admin-color-ink-primary)]">{format(lastUpdated, 'PPpp')}</span>
          {healthData?.meta?.collectionTimeMs && (
            <span className="ml-2 text-[var(--admin-color-ink-tertiary)]">
              (collected in {healthData.meta.collectionTimeMs}ms)
            </span>
          )}
        </div>
      )}

      {/* Error banner if available */}
      {error && healthData && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4" role="alert">
          <p className="text-sm text-amber-800">
            Warning: {error}. Displaying cached data.
          </p>
        </div>
      )}

      {/* Worker Health Status */}
      <WorkerHealthSection workers={healthData?.workers || []} />

      {/* Queue Metrics */}
      <QueueMetricsSection queues={healthData?.queues || []} />

      {/* Email Delivery Metrics */}
      <EmailDeliverySection emailDelivery={healthData?.emailDelivery} />
    </AdminPageShell>
  );
}
