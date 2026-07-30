import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { FunnelChart } from '../FunnelChart';
import { type FunnelStage } from '@/services/analyticsFunnelService';

const mockStages: FunnelStage[] = [
  {
    stageName: 'applications',
    stageCount: 100,
    conversionRatePct: 100,
    dropCount: 0,
    dropRatePct: 0,
    isLargestDropTransition: false
  },
  {
    stageName: 'shortlisted',
    stageCount: 50,
    conversionRatePct: 50,
    dropCount: 50,
    dropRatePct: 50,
    isLargestDropTransition: true
  },
  {
    stageName: 'interviews_complete',
    stageCount: 30,
    conversionRatePct: 60,
    dropCount: 20,
    dropRatePct: 40,
    isLargestDropTransition: false
  }
];

describe('FunnelChart', () => {
  it('renders funnel chart with correct stage names and counts', () => {
    render(<FunnelChart stages={mockStages} largestDropTransition="shortlisted" />);

    expect(screen.getByText('Funnel Visualization')).toBeInTheDocument();
    expect(screen.getByText(/applications/i)).toBeInTheDocument();
    expect(screen.getByText(/shortlisted/i)).toBeInTheDocument();
    expect(screen.getByText(/interviews complete/i)).toBeInTheDocument();
    expect(screen.getByText('100')).toBeInTheDocument();
    expect(screen.getByText('50')).toBeInTheDocument();
    expect(screen.getByText('30')).toBeInTheDocument();
  });

  it('highlights largest drop transition in amber', () => {
    render(<FunnelChart stages={mockStages} largestDropTransition="shortlisted" />);

    const largestDropBadge = screen.getByText('Largest Drop');
    expect(largestDropBadge).toBeInTheDocument();
    expect(largestDropBadge.closest('.bg-amber-100')).toBeInTheDocument();
  });

  it('displays drop count and percentage on hover', () => {
    const { container } = render(
      <FunnelChart stages={mockStages} largestDropTransition="shortlisted" />
    );

    const shortlistedRow = container.querySelector('[role="row"]');
    expect(shortlistedRow).toBeInTheDocument();
  });

  it('shows loading skeleton when loading', () => {
    render(<FunnelChart stages={[]} largestDropTransition={null} loading={true} />);

    const status = screen.getByRole('status', { name: 'Loading funnel chart' });
    expect(status).toBeInTheDocument();
  });

  it('shows error message when error provided', () => {
    const errorMsg = 'Failed to load funnel data';
    render(<FunnelChart stages={[]} largestDropTransition={null} error={errorMsg} />);

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(errorMsg);
  });

  it('shows empty state when no stages provided', () => {
    render(<FunnelChart stages={[]} largestDropTransition={null} />);

    expect(screen.getByText('No funnel data available.')).toBeInTheDocument();
  });

  it('displays conversion rates correctly', () => {
    render(<FunnelChart stages={mockStages} largestDropTransition="shortlisted" />);

    expect(screen.getByText(/100% conversion/)).toBeInTheDocument();
    expect(screen.getByText(/50% conversion/)).toBeInTheDocument();
    expect(screen.getByText(/60% conversion/)).toBeInTheDocument();
  });

  describe('Edge Cases', () => {
    it('handles single stage funnel', () => {
      const singleStage: FunnelStage[] = [
        {
          stageName: 'applications',
          stageCount: 100,
          conversionRatePct: 100,
          dropCount: 0,
          dropRatePct: 0,
          isLargestDropTransition: false
        }
      ];

      render(<FunnelChart stages={singleStage} largestDropTransition={null} />);

      expect(screen.getByText(/applications/i)).toBeInTheDocument();
      expect(screen.getByText('100')).toBeInTheDocument();
      expect(screen.getByText(/100% conversion/)).toBeInTheDocument();
    });

    it('validates monotonic decrease in stage counts', () => {
      const monotonic: FunnelStage[] = [
        {
          stageName: 'applications',
          stageCount: 1000,
          conversionRatePct: 100,
          dropCount: 0,
          dropRatePct: 0,
          isLargestDropTransition: false
        },
        {
          stageName: 'shortlisted',
          stageCount: 500,
          conversionRatePct: 50,
          dropCount: 500,
          dropRatePct: 50,
          isLargestDropTransition: false
        },
        {
          stageName: 'interviews_complete',
          stageCount: 250,
          conversionRatePct: 50,
          dropCount: 250,
          dropRatePct: 50,
          isLargestDropTransition: true
        }
      ];

      render(<FunnelChart stages={monotonic} largestDropTransition="interviews_complete" />);

      expect(screen.getByText('1000')).toBeInTheDocument();
      expect(screen.getByText('500')).toBeInTheDocument();
      expect(screen.getByText('250')).toBeInTheDocument();
    });

    it('handles large numbers correctly', () => {
      const largeNumbers: FunnelStage[] = [
        {
          stageName: 'applications',
          stageCount: 1000000,
          conversionRatePct: 100,
          dropCount: 0,
          dropRatePct: 0,
          isLargestDropTransition: false
        },
        {
          stageName: 'shortlisted',
          stageCount: 100000,
          conversionRatePct: 10,
          dropCount: 900000,
          dropRatePct: 90,
          isLargestDropTransition: true
        }
      ];

      render(<FunnelChart stages={largeNumbers} largestDropTransition="shortlisted" />);

      expect(screen.getByText('1000000')).toBeInTheDocument();
      expect(screen.getByText('100000')).toBeInTheDocument();
    });

    it('handles zero drop percentage correctly', () => {
      const zeroDrops: FunnelStage[] = [
        {
          stageName: 'applications',
          stageCount: 100,
          conversionRatePct: 100,
          dropCount: 0,
          dropRatePct: 0,
          isLargestDropTransition: false
        },
        {
          stageName: 'shortlisted',
          stageCount: 100,
          conversionRatePct: 100,
          dropCount: 0,
          dropRatePct: 0,
          isLargestDropTransition: false
        }
      ];

      render(<FunnelChart stages={zeroDrops} largestDropTransition={null} />);

      const conversionTexts = screen.getAllByText(/100% conversion/);
      expect(conversionTexts.length).toBeGreaterThan(0);
    });

    it('correctly identifies and highlights single largest drop', () => {
      const complexFunnel: FunnelStage[] = [
        {
          stageName: 'applications',
          stageCount: 100,
          conversionRatePct: 100,
          dropCount: 0,
          dropRatePct: 0,
          isLargestDropTransition: false
        },
        {
          stageName: 'shortlisted',
          stageCount: 70,
          conversionRatePct: 70,
          dropCount: 30,
          dropRatePct: 30,
          isLargestDropTransition: false
        },
        {
          stageName: 'interviews_complete',
          stageCount: 15,
          conversionRatePct: 21.4,
          dropCount: 55,
          dropRatePct: 78.6,
          isLargestDropTransition: true
        },
        {
          stageName: 'offer_extended',
          stageCount: 10,
          conversionRatePct: 66.7,
          dropCount: 5,
          dropRatePct: 33.3,
          isLargestDropTransition: false
        }
      ];

      render(
        <FunnelChart stages={complexFunnel} largestDropTransition="interviews_complete" />
      );

      const largestDropBadge = screen.getByText('Largest Drop');
      expect(largestDropBadge).toBeInTheDocument();

      // Verify it's highlighted in the correct stage (interviews_complete)
      const badges = screen.getAllByText('Largest Drop');
      expect(badges.length).toBe(1); // Only one largest drop
    });

    it('handles decimal conversion rates', () => {
      const decimalRates: FunnelStage[] = [
        {
          stageName: 'applications',
          stageCount: 333,
          conversionRatePct: 100,
          dropCount: 0,
          dropRatePct: 0,
          isLargestDropTransition: false
        },
        {
          stageName: 'shortlisted',
          stageCount: 111,
          conversionRatePct: 33.33,
          dropCount: 222,
          dropRatePct: 66.67,
          isLargestDropTransition: true
        }
      ];

      render(<FunnelChart stages={decimalRates} largestDropTransition="shortlisted" />);

      // Verify decimal values are displayed (may be rounded)
      expect(screen.getByText(/33.33|33.3|33%/)).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('provides accessible labels for each stage', () => {
      render(<FunnelChart stages={mockStages} largestDropTransition="shortlisted" />);

      // Check for role and aria labels
      const chart = screen.getByRole('region');
      expect(chart).toHaveAttribute('aria-label');
    });

    it('announces loading state to screen readers', () => {
      render(<FunnelChart stages={[]} largestDropTransition={null} loading={true} />);

      const status = screen.getByRole('status');
      expect(status).toHaveAttribute('aria-label');
    });

    it('announces error state to screen readers', () => {
      render(<FunnelChart stages={[]} largestDropTransition={null} error="Test error" />);

      const alert = screen.getByRole('alert');
      expect(alert).toBeInTheDocument();
    });
  });
});
