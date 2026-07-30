import React, { useMemo, useState } from 'react';
import type { NoShowTrendData } from '@/services/noShowAnalyticsService';

interface NoShowSparklineProps {
  trend30d: NoShowTrendData[];
  loading: boolean;
  error: string | null;
}

interface ChartPoint extends NoShowTrendData {
  x: number;
  y: number;
}

const CHART_WIDTH = 640;
const CHART_HEIGHT = 160;
const CHART_PADDING_X = 14;
const CHART_PADDING_Y = 14;
const MAX_POINTS = 30;

function formatPercent(value: number): string {
  return `${value.toFixed(2)}%`;
}

function formatDate(value: string): string {
  const parsed = new Date(`${value}T00:00:00Z`);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric'
  });
}

function toChronologicalPoints(trend30d: NoShowTrendData[]): NoShowTrendData[] {
  return [...trend30d]
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .slice(-MAX_POINTS);
}

function buildChartPoints(data: NoShowTrendData[]): ChartPoint[] {
  if (data.length === 0) {
    return [];
  }

  const usableWidth = CHART_WIDTH - CHART_PADDING_X * 2;
  const usableHeight = CHART_HEIGHT - CHART_PADDING_Y * 2;

  return data.map((point, index) => {
    const x = data.length === 1 ? CHART_WIDTH / 2 : CHART_PADDING_X + (usableWidth * index) / (data.length - 1);
    const clampedRate = Math.max(0, Math.min(100, point.noShowRatePct));
    const y = CHART_HEIGHT - CHART_PADDING_Y - (clampedRate / 100) * usableHeight;

    return {
      ...point,
      x,
      y
    };
  });
}

function buildPath(points: ChartPoint[]): string {
  if (points.length === 0) {
    return '';
  }

  return points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(' ');
}

function Skeleton() {
  return (
    <article className="rounded-lg border border-gray-200 bg-white p-4 animate-pulse" aria-hidden="true">
      <div className="h-4 w-40 bg-gray-200 rounded" />
      <div className="h-24 bg-gray-200 rounded mt-4" />
      <div className="h-3 w-56 bg-gray-200 rounded mt-4" />
    </article>
  );
}

export function NoShowSparkline({ trend30d, loading, error }: NoShowSparklineProps) {
  const [activePointIndex, setActivePointIndex] = useState<number | null>(null);

  const chronological = useMemo(() => toChronologicalPoints(trend30d), [trend30d]);
  const chartPoints = useMemo(() => buildChartPoints(chronological), [chronological]);
  const path = useMemo(() => buildPath(chartPoints), [chartPoints]);

  if (loading) {
    return (
      <section role="status" aria-live="polite" aria-label="Loading no-show trend chart">
        <Skeleton />
      </section>
    );
  }

  if (error) {
    return (
      <article className="rounded-lg border border-red-200 bg-red-50 p-4" role="alert" data-testid="no-show-sparkline-error">
        <p className="text-sm font-semibold text-red-800">Unable to load no-show trend</p>
        <p className="text-sm text-red-700 mt-1">{error}</p>
      </article>
    );
  }

  if (chartPoints.length === 0) {
    return (
      <article className="rounded-lg border border-gray-200 bg-white p-4" data-testid="no-show-sparkline-empty">
        <h2 className="text-sm font-semibold text-gray-900">30-Day No-Show Trend</h2>
        <p className="text-sm text-gray-500 mt-2">No no-show trend data available.</p>
      </article>
    );
  }

  const fallbackIndex = chartPoints.length - 1;
  const safeActiveIndex = activePointIndex !== null && chartPoints[activePointIndex] ? activePointIndex : fallbackIndex;
  const activePoint = chartPoints[safeActiveIndex];
  const activeSummary = `${formatDate(activePoint.date)}: ${formatPercent(activePoint.noShowRatePct)} (${activePoint.noShowCount} of ${activePoint.scheduledCount})`;

  return (
    <article className="rounded-lg border border-gray-200 bg-white p-4" aria-label="No-show trend sparkline">
      <h2 className="text-sm font-semibold text-gray-900">30-Day No-Show Trend</h2>
      <p className="text-xs text-gray-500 mt-1">Daily rate sequence in chronological order</p>

      <div className="mt-4 overflow-x-auto" role="img" aria-label="No-show rate sparkline chart">
        <svg
          viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
          className="h-36 w-full min-w-[320px]"
          data-testid="no-show-sparkline-svg"
        >
          <path d={path} fill="none" stroke="#2563eb" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />

          {chartPoints.map((point, index) => {
            const isActive = index === safeActiveIndex;

            return (
              <circle
                key={point.date}
                cx={point.x}
                cy={point.y}
                r={isActive ? 4 : 3}
                fill={isActive ? '#1d4ed8' : '#2563eb'}
                tabIndex={0}
                role="button"
                aria-label={`No-show rate ${formatPercent(point.noShowRatePct)} on ${point.date}`}
                onMouseEnter={() => setActivePointIndex(index)}
                onFocus={() => setActivePointIndex(index)}
                data-testid="no-show-sparkline-point"
                data-date={point.date}
              >
                <title>{`${point.date}: ${formatPercent(point.noShowRatePct)}`}</title>
              </circle>
            );
          })}
        </svg>
      </div>

      <p className="mt-3 text-sm text-gray-700" aria-live="polite" data-testid="no-show-sparkline-hover-value">
        {activeSummary}
      </p>
    </article>
  );
}
