import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PipelineAnalyticsPage from '../page';

const serviceMocks = vi.hoisted(() => ({
  fetchPipelineAnalytics: vi.fn(),
  fetchOpenRequisitions: vi.fn(),
  fetchFunnelAnalytics: vi.fn(),
  fetchConfusionMatrixAnalytics: vi.fn(),
  fetchNoShowAnalytics: vi.fn()
}));

vi.mock('@/services/pipelineAnalyticsService', () => ({
  fetchPipelineAnalytics: serviceMocks.fetchPipelineAnalytics,
  fetchOpenRequisitions: serviceMocks.fetchOpenRequisitions
}));

vi.mock('@/services/analyticsFunnelService', () => ({
  fetchFunnelAnalytics: serviceMocks.fetchFunnelAnalytics
}));

vi.mock('@/services/confusionMatrixService', () => ({
  fetchConfusionMatrixAnalytics: serviceMocks.fetchConfusionMatrixAnalytics
}));

vi.mock('@/services/noShowAnalyticsService', () => ({
  fetchNoShowAnalytics: serviceMocks.fetchNoShowAnalytics
}));

describe('PipelineAnalyticsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    serviceMocks.fetchOpenRequisitions.mockResolvedValue([
      { id: 'req-1', title: 'Senior Backend Engineer - London' },
      { id: 'req-2', title: 'Product Manager - Remote' }
    ]);
    serviceMocks.fetchPipelineAnalytics.mockResolvedValue({
      totalApplications: 120,
      shortlistRatePct: 41.67,
      avgTimeToHireDays: 14.25,
      offerAcceptanceRatePct: 66.67,
      lastRefreshedAt: '2026-07-29T10:00:00.000Z',
      generatedAt: '2026-07-29T10:00:01.000Z'
    });
    serviceMocks.fetchFunnelAnalytics.mockResolvedValue({
      stages: [
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
        }
      ],
      largestDropTransition: 'shortlisted',
      lastRefreshedAt: '2026-07-29T10:00:00.000Z',
      generatedAt: '2026-07-29T10:00:01.000Z'
    });
    serviceMocks.fetchConfusionMatrixAnalytics.mockResolvedValue({
      truePositives: 50,
      falsePositives: 10,
      trueNegatives: 80,
      falseNegatives: 5,
      precision: 0.8333,
      recall: 0.9091,
      f1Score: 0.8696,
      accuracy: 0.8571,
      lastRefreshedAt: '2026-07-29T10:00:00.000Z',
      generatedAt: '2026-07-29T10:00:01.000Z'
    });
    serviceMocks.fetchNoShowAnalytics.mockResolvedValue({
      noShowRatePct: 20,
      noShowCount: 4,
      scheduledCount: 20,
      trend30d: [
        {
          date: '2026-07-28',
          scheduledCount: 12,
          noShowCount: 3,
          noShowRatePct: 25
        },
        {
          date: '2026-07-29',
          scheduledCount: 10,
          noShowCount: 1,
          noShowRatePct: 10
        }
      ],
      lastRefreshedAt: '2026-07-29T10:00:00.000Z',
      generatedAt: '2026-07-29T10:00:01.000Z'
    });
  });

  it('loads and renders KPI cards', async () => {
    render(<PipelineAnalyticsPage />);

    expect(screen.getByRole('heading', { name: 'Pipeline Dashboard' })).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByLabelText('Total Applications')).toHaveTextContent('120');
    });

    expect(serviceMocks.fetchPipelineAnalytics).toHaveBeenCalledWith(undefined);
    expect(serviceMocks.fetchNoShowAnalytics).toHaveBeenCalledWith(undefined);
    expect(screen.getByTestId('last-updated-label')).toHaveTextContent('Last updated:');
  });

  it('loads and renders no-show KPI summary and sparkline', async () => {
    render(<PipelineAnalyticsPage />);

    await waitFor(() => {
      expect(screen.getByTestId('no-show-kpi-summary')).toHaveTextContent('20.00% (4 of 20)');
    });

    expect(screen.getByRole('heading', { name: '30-Day No-Show Trend' })).toBeInTheDocument();
    expect(screen.getAllByTestId('no-show-sparkline-point')).toHaveLength(2);
  });

  it('loads and renders funnel chart', async () => {
    render(<PipelineAnalyticsPage />);

    await waitFor(() => {
      expect(screen.getByText('Funnel Visualization')).toBeInTheDocument();
      expect(screen.getByText(/applications/i)).toBeInTheDocument();
      expect(screen.getByText('100')).toBeInTheDocument();
    });

    expect(serviceMocks.fetchFunnelAnalytics).toHaveBeenCalledWith(undefined);
  });

  it('loads and renders confusion matrix', async () => {
    render(<PipelineAnalyticsPage />);

    await waitFor(() => {
      expect(screen.getByText('AI Screening Accuracy')).toBeInTheDocument();
      expect(screen.getByText('True Positives (TP)')).toBeInTheDocument();
      expect(screen.getByText('Performance Metrics')).toBeInTheDocument();
    });

    expect(serviceMocks.fetchConfusionMatrixAnalytics).toHaveBeenCalledWith(undefined);
  });

  it('applies requisition filter and refetches all analytics data', async () => {
    render(<PipelineAnalyticsPage />);

    await waitFor(() => {
      expect(screen.getByLabelText('Requisition selection')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText('Requisition selection'), {
      target: { value: 'req-1' }
    });

    await waitFor(() => {
      expect(serviceMocks.fetchPipelineAnalytics).toHaveBeenCalledWith('req-1');
      expect(serviceMocks.fetchFunnelAnalytics).toHaveBeenCalledWith('req-1');
      expect(serviceMocks.fetchConfusionMatrixAnalytics).toHaveBeenCalledWith('req-1');
      expect(serviceMocks.fetchNoShowAnalytics).toHaveBeenCalledWith('req-1');
    });
  });

  it('shows user-friendly error state when KPI request fails', async () => {
    serviceMocks.fetchPipelineAnalytics.mockRejectedValueOnce(new Error('Unauthorized'));
    serviceMocks.fetchFunnelAnalytics.mockRejectedValueOnce(new Error('Unauthorized'));
    serviceMocks.fetchConfusionMatrixAnalytics.mockRejectedValueOnce(new Error('Unauthorized'));
    serviceMocks.fetchNoShowAnalytics.mockRejectedValueOnce(new Error('Unauthorized'));

    render(<PipelineAnalyticsPage />);

    await waitFor(() => {
      expect(screen.getByTestId('pipeline-kpi-error')).toBeInTheDocument();
    });
    expect(screen.getByText('Unauthorized')).toBeInTheDocument();
  });

  it('displays analytics modules in responsive grid layout', async () => {
    const { container } = render(<PipelineAnalyticsPage />);

    await waitFor(() => {
      const gridContainer = container.querySelector('.mt-8.grid');
      expect(gridContainer).toHaveClass('grid-cols-1', 'lg:grid-cols-2');
    });
  });
});
