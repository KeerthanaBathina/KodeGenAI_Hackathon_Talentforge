import React from 'react';
import type { PipelineAnalyticsData } from '@/services/pipelineAnalyticsService';

interface PipelineKpiCardsProps {
  data: PipelineAnalyticsData | null;
  loading: boolean;
  error: string | null;
}

function formatPercent(value: number): string {
  return `${value.toFixed(2)}%`;
}

function formatDays(value: number): string {
  return `${value.toFixed(2)} days`;
}

function SkeletonCard() {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 animate-pulse" aria-hidden="true">
      <div className="h-3 w-24 bg-gray-200 rounded" />
      <div className="h-7 w-28 bg-gray-200 rounded mt-3" />
    </div>
  );
}

function KpiCard({ label, value, description }: { label: string; value: string; description: string }) {
  return (
    <article className="rounded-lg border border-gray-200 bg-white p-4" aria-label={label}>
      <p className="text-sm font-medium text-gray-600">{label}</p>
      <p className="text-2xl font-semibold text-gray-900 mt-2">{value}</p>
      <p className="text-xs text-gray-500 mt-2">{description}</p>
    </article>
  );
}

export function PipelineKpiCards({ data, loading, error }: PipelineKpiCardsProps) {
  if (loading) {
    return (
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4" role="status" aria-live="polite">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </section>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4" role="alert" data-testid="pipeline-kpi-error">
        <p className="text-sm font-semibold text-red-800">Unable to load pipeline analytics</p>
        <p className="text-sm text-red-700 mt-1">{error}</p>
      </div>
    );
  }

  return (
    <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4" aria-label="Pipeline KPI cards">
      <KpiCard
        label="Total Applications"
        value={String(data?.totalApplications ?? 0)}
        description="All applications in selected scope"
      />
      <KpiCard
        label="Shortlist Rate"
        value={formatPercent(data?.shortlistRatePct ?? 0)}
        description="Shortlisted versus total applications"
      />
      <KpiCard
        label="Average Time-to-Hire"
        value={formatDays(data?.avgTimeToHireDays ?? 0)}
        description="Accepted offers only"
      />
      <KpiCard
        label="Offer Acceptance Rate"
        value={formatPercent(data?.offerAcceptanceRatePct ?? 0)}
        description="Accepted offers versus offers extended"
      />
    </section>
  );
}
