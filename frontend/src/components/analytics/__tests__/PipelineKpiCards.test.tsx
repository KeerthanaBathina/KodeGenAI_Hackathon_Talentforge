import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PipelineKpiCards } from '../PipelineKpiCards';

describe('PipelineKpiCards', () => {
  it('renders loading skeleton when loading is true', () => {
    render(<PipelineKpiCards data={null} loading error={null} />);

    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('renders error alert when error exists', () => {
    render(<PipelineKpiCards data={null} loading={false} error="Boom" />);

    expect(screen.getByRole('alert')).toHaveTextContent('Unable to load pipeline analytics');
    expect(screen.getByText('Boom')).toBeInTheDocument();
  });

  it('renders KPI values with formatting', () => {
    render(
      <PipelineKpiCards
        loading={false}
        error={null}
        data={{
          totalApplications: 120,
          shortlistRatePct: 41.67,
          avgTimeToHireDays: 14.25,
          offerAcceptanceRatePct: 66.67,
          lastRefreshedAt: '2026-07-29T10:00:00.000Z',
          generatedAt: '2026-07-29T10:00:01.000Z'
        }}
      />
    );

    expect(screen.getByLabelText('Total Applications')).toHaveTextContent('120');
    expect(screen.getByLabelText('Shortlist Rate')).toHaveTextContent('41.67%');
    expect(screen.getByLabelText('Average Time-to-Hire')).toHaveTextContent('14.25 days');
    expect(screen.getByLabelText('Offer Acceptance Rate')).toHaveTextContent('66.67%');
  });
});
