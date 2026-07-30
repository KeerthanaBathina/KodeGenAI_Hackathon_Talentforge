import React from 'react';
import type { NoShowAnalyticsData } from '@/services/noShowAnalyticsService';

interface NoShowKpiCardProps {
  data: NoShowAnalyticsData | null;
  loading: boolean;
  error: string | null;
}

function formatPercent(value: number): string {
  return `${value.toFixed(2)}%`;
}

function SkeletonCard() {
  return (
    <article className="rounded-lg border border-gray-200 bg-white p-4 animate-pulse" aria-hidden="true">
      <div className="h-3 w-32 bg-gray-200 rounded" />
      <div className="h-8 w-44 bg-gray-200 rounded mt-3" />
      <div className="h-3 w-36 bg-gray-200 rounded mt-3" />
    </article>
  );
}

export function NoShowKpiCard({ data, loading, error }: NoShowKpiCardProps) {
  if (loading) {
    return (
      <section role="status" aria-live="polite" aria-label="Loading no-show KPI card">
        <SkeletonCard />
      </section>
    );
  }

  if (error) {
    return (
      <article className="rounded-lg border border-red-200 bg-red-50 p-4" role="alert" data-testid="no-show-kpi-error">
        <p className="text-sm font-semibold text-red-800">Unable to load no-show KPI</p>
        <p className="text-sm text-red-700 mt-1">{error}</p>
      </article>
    );
  }

  const noShowRatePct = data?.noShowRatePct ?? 0;
  const noShowCount = data?.noShowCount ?? 0;
  const scheduledCount = data?.scheduledCount ?? 0;
  const summaryText = `${formatPercent(noShowRatePct)} (${noShowCount} of ${scheduledCount})`;

  return (
    <article className="rounded-lg border border-gray-200 bg-white p-4" aria-label="No-show KPI card">
      <p className="text-sm font-medium text-gray-600">No-Show Rate</p>
      <p className="text-2xl font-semibold text-gray-900 mt-2" data-testid="no-show-kpi-summary">
        {summaryText}
      </p>
      <p className="text-xs text-gray-500 mt-2">Rolling 7-day window</p>
    </article>
  );
}
