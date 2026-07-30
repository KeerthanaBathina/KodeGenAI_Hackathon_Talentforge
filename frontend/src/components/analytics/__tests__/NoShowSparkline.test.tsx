import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { NoShowSparkline } from '../NoShowSparkline';
import type { NoShowTrendData } from '@/services/noShowAnalyticsService';

function buildTrend(count: number): NoShowTrendData[] {
  return Array.from({ length: count }, (_, index) => {
    const day = String(index + 1).padStart(2, '0');

    return {
      date: `2026-07-${day}`,
      scheduledCount: 10 + index,
      noShowCount: index % 3,
      noShowRatePct: (index % 3) * 10
    };
  });
}

describe('NoShowSparkline', () => {
  it('renders loading state when loading is true', () => {
    render(<NoShowSparkline trend30d={[]} loading error={null} />);

    expect(screen.getByRole('status', { name: 'Loading no-show trend chart' })).toBeInTheDocument();
  });

  it('renders error state when error exists', () => {
    render(<NoShowSparkline trend30d={[]} loading={false} error="Forbidden" />);

    expect(screen.getByRole('alert')).toHaveTextContent('Unable to load no-show trend');
    expect(screen.getByText('Forbidden')).toBeInTheDocument();
  });

  it('renders empty state when no trend data is available', () => {
    render(<NoShowSparkline trend30d={[]} loading={false} error={null} />);

    expect(screen.getByTestId('no-show-sparkline-empty')).toBeInTheDocument();
    expect(screen.getByText('No no-show trend data available.')).toBeInTheDocument();
  });

  it('renders exactly 30 points and normalizes order to chronological sequence', () => {
    const descendingTrend = [...buildTrend(30)].reverse();

    render(<NoShowSparkline trend30d={descendingTrend} loading={false} error={null} />);

    const points = screen.getAllByTestId('no-show-sparkline-point');
    expect(points).toHaveLength(30);
    expect(points[0]).toHaveAttribute('data-date', '2026-07-01');
    expect(points[29]).toHaveAttribute('data-date', '2026-07-30');
  });

  it('shows hover/focus value for day-level inspection', () => {
    const trend = [
      {
        date: '2026-07-01',
        scheduledCount: 20,
        noShowCount: 2,
        noShowRatePct: 10
      },
      {
        date: '2026-07-02',
        scheduledCount: 25,
        noShowCount: 5,
        noShowRatePct: 20
      }
    ];

    render(<NoShowSparkline trend30d={trend} loading={false} error={null} />);

    const points = screen.getAllByTestId('no-show-sparkline-point');
    fireEvent.focus(points[0]);

    expect(screen.getByTestId('no-show-sparkline-hover-value')).toHaveTextContent('10.00% (2 of 20)');

    fireEvent.mouseEnter(points[1]);
    expect(screen.getByTestId('no-show-sparkline-hover-value')).toHaveTextContent('20.00% (5 of 25)');
  });

  it('exposes accessible labels and keyboard focus for sparkline points', () => {
    render(<NoShowSparkline trend30d={buildTrend(2)} loading={false} error={null} />);

    const points = screen.getAllByTestId('no-show-sparkline-point');
    expect(points[0]).toHaveAttribute('role', 'button');
    expect(points[0]).toHaveAttribute('tabindex', '0');
    expect(points[0]).toHaveAttribute('aria-label');
  });
});
