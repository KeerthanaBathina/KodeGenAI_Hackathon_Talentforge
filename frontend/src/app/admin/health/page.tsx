'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { WorkerHealthSection } from '@/components/admin/WorkerHealthSection';
import { QueueMetricsSection } from '@/components/admin/QueueMetricsSection';
import { EmailDeliverySection } from '@/components/admin/EmailDeliverySection';

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
      const response = await fetch('/api/admin/health', {
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
   * Auto-refresh every 60 seconds
   */
  useEffect(() => {
    if (!autoRefresh) return;

    const intervalId = setInterval(() => {
      fetchHealthData();
    }, 60000); // 60 seconds

    return () => clearInterval(intervalId);
  }, [autoRefresh]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600 font-medium">Loading health metrics...</p>
        </div>
      </div>
    );
  }

  if (error && !healthData) {
    return (
      <div className="p-8 max-w-7xl mx-auto">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <h2 className="text-red-800 font-semibold text-lg">Error Loading Health Data</h2>
          <p className="text-red-600 mt-2">{error}</p>
          <button
            onClick={fetchHealthData}
            className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="p-8 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-start mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Platform Health Dashboard</h1>
            <p className="text-gray-600 mt-1">Real-time system health and operational metrics</p>
          </div>

          <div className="flex items-center gap-4">
            {/* Auto-refresh toggle */}
            <label className="flex items-center gap-2 cursor-pointer px-3 py-2 rounded-lg bg-white border border-gray-200 hover:border-gray-300">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="rounded w-4 h-4"
              />
              <span className="text-sm text-gray-700 font-medium">Auto-refresh (60s)</span>
            </label>

            {/* Manual refresh button */}
            <button
              onClick={fetchHealthData}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium flex items-center gap-2"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              Refresh Now
            </button>
          </div>
        </div>

        {/* Last Updated Timestamp */}
        {lastUpdated && (
          <div className="mb-6 text-sm text-gray-600 bg-white px-4 py-3 rounded-lg border border-gray-200">
            Last updated: <span className="font-medium">{format(lastUpdated, 'PPpp')}</span>
            {healthData?.meta?.collectionTimeMs && (
              <span className="ml-2 text-gray-500">
                (collected in {healthData.meta.collectionTimeMs}ms)
              </span>
            )}
          </div>
        )}

        {/* Error banner if available */}
        {error && healthData && (
          <div className="mb-6 bg-amber-50 border border-amber-200 rounded-lg p-4">
            <p className="text-amber-800 text-sm">
              ⚠ Warning: {error}. Displaying cached data.
            </p>
          </div>
        )}

        {/* Worker Health Status */}
        <WorkerHealthSection workers={healthData?.workers || []} />

        {/* Queue Metrics */}
        <QueueMetricsSection queues={healthData?.queues || []} />

        {/* Email Delivery Metrics */}
        <EmailDeliverySection emailDelivery={healthData?.emailDelivery} />
      </div>
    </div>
  );
}
