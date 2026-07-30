import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { NoShowKpiCard } from '../NoShowKpiCard';

describe('NoShowKpiCard', () => {
  it('renders loading state when loading is true', () => {
    render(<NoShowKpiCard data={null} loading error={null} />);

    expect(screen.getByRole('status', { name: 'Loading no-show KPI card' })).toBeInTheDocument();
  });

  it('renders error state when error exists', () => {
    render(<NoShowKpiCard data={null} loading={false} error="Unauthorized" />);

    expect(screen.getByRole('alert')).toHaveTextContent('Unable to load no-show KPI');
    expect(screen.getByText('Unauthorized')).toBeInTheDocument();
  });

  it('renders formatted KPI summary text', () => {
    render(
      <NoShowKpiCard
        loading={false}
        error={null}
        data={{
          noShowRatePct: 20,
          noShowCount: 4,
          scheduledCount: 20,
          trend30d: [],
          lastRefreshedAt: '2026-07-30T10:00:00.000Z',
          generatedAt: '2026-07-30T10:00:01.000Z'
        }}
      />
    );

    expect(screen.getByTestId('no-show-kpi-summary')).toHaveTextContent('20.00% (4 of 20)');
    expect(screen.getByText('Rolling 7-day window')).toBeInTheDocument();
  });

  it('falls back to zero values when data is null', () => {
    render(<NoShowKpiCard data={null} loading={false} error={null} />);

    expect(screen.getByTestId('no-show-kpi-summary')).toHaveTextContent('0.00% (0 of 0)');
  });
});
