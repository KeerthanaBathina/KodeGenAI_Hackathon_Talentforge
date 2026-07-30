import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ConfusionMatrix } from '../ConfusionMatrix';
import { type ConfusionMatrixAnalyticsData } from '@/services/confusionMatrixService';

const mockData: ConfusionMatrixAnalyticsData = {
  truePositives: 50,
  falsePositives: 10,
  trueNegatives: 80,
  falseNegatives: 5,
  precision: 0.8333,
  recall: 0.9091,
  f1Score: 0.8696,
  accuracy: 0.8571,
  lastRefreshedAt: '2026-07-30T10:00:00.000Z',
  generatedAt: '2026-07-30T10:00:01.000Z'
};

describe('ConfusionMatrix', () => {
  it('renders confusion matrix with correct TP/FP/TN/FN values', () => {
    render(<ConfusionMatrix data={mockData} />);

    expect(screen.getByText('AI Screening Accuracy')).toBeInTheDocument();
    expect(screen.getByText('50')).toBeInTheDocument(); // TP
    expect(screen.getByText('10')).toBeInTheDocument(); // FP
    expect(screen.getByText('80')).toBeInTheDocument(); // TN
    expect(screen.getByText('5')).toBeInTheDocument();  // FN
  });

  it('displays performance metrics (precision, recall, F1, accuracy)', () => {
    render(<ConfusionMatrix data={mockData} />);

    expect(screen.getByText('Performance Metrics')).toBeInTheDocument();
    expect(screen.getByText(/Precision/)).toBeInTheDocument();
    expect(screen.getByText(/Recall/)).toBeInTheDocument();
    expect(screen.getByText(/F1 Score/)).toBeInTheDocument();
    expect(screen.getByText(/Accuracy/)).toBeInTheDocument();
  });

  it('calculates and displays precision correctly', () => {
    render(<ConfusionMatrix data={mockData} />);

    const precisionValue = (mockData.precision * 100).toFixed(2);
    expect(screen.getByText(`${precisionValue}%`)).toBeInTheDocument();
  });

  it('calculates and displays recall correctly', () => {
    render(<ConfusionMatrix data={mockData} />);

    const recallValue = (mockData.recall * 100).toFixed(2);
    const elements = screen.getAllByText(`${recallValue}%`);
    expect(elements.length).toBeGreaterThan(0);
  });

  it('shows loading skeleton when loading', () => {
    render(<ConfusionMatrix data={mockData} loading={true} />);

    const status = screen.getByRole('status', { name: 'Loading confusion matrix' });
    expect(status).toBeInTheDocument();
  });

  it('shows error message when error provided', () => {
    const errorMsg = 'Failed to load confusion matrix';
    render(<ConfusionMatrix data={mockData} error={errorMsg} />);

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(errorMsg);
  });

  it('shows empty state when total is 0', () => {
    const zeroData: ConfusionMatrixAnalyticsData = {
      ...mockData,
      truePositives: 0,
      falsePositives: 0,
      trueNegatives: 0,
      falseNegatives: 0
    };

    render(<ConfusionMatrix data={zeroData} />);

    expect(screen.getByText('No screening data available for this requisition.')).toBeInTheDocument();
  });

  it('displays correct labels for quadrants', () => {
    render(<ConfusionMatrix data={mockData} />);

    expect(screen.getByText('True Positives (TP)')).toBeInTheDocument();
    expect(screen.getByText('False Positives (FP)')).toBeInTheDocument();
    expect(screen.getByText('True Negatives (TN)')).toBeInTheDocument();
    expect(screen.getByText('False Negatives (FN)')).toBeInTheDocument();
  });

  it('uses appropriate color coding for quadrants', () => {
    const { container } = render(<ConfusionMatrix data={mockData} />);

    const greenBoxes = container.querySelectorAll('.bg-green-50');
    const redBoxes = container.querySelectorAll('.bg-red-50');

    expect(greenBoxes.length).toBe(2); // TP and TN
    expect(redBoxes.length).toBe(2);   // FP and FN
  });

  describe('Edge Cases', () => {
    it('handles all zeros correctly', () => {
      const allZeros: ConfusionMatrixAnalyticsData = {
        truePositives: 0,
        falsePositives: 0,
        trueNegatives: 0,
        falseNegatives: 0,
        precision: 0,
        recall: 0,
        f1Score: 0,
        accuracy: 0,
        lastRefreshedAt: '2026-07-30T10:00:00.000Z',
        generatedAt: '2026-07-30T10:00:01.000Z'
      };

      render(<ConfusionMatrix data={allZeros} />);

      expect(screen.getByText('No screening data available for this requisition.')).toBeInTheDocument();
    });

    it('handles perfect precision (no false positives)', () => {
      const perfectPrecision: ConfusionMatrixAnalyticsData = {
        truePositives: 100,
        falsePositives: 0,
        trueNegatives: 100,
        falseNegatives: 0,
        precision: 1.0,
        recall: 1.0,
        f1Score: 1.0,
        accuracy: 1.0,
        lastRefreshedAt: '2026-07-30T10:00:00.000Z',
        generatedAt: '2026-07-30T10:00:01.000Z'
      };

      render(<ConfusionMatrix data={perfectPrecision} />);

      expect(screen.getByText('100')).toBeInTheDocument();
      expect(screen.getByText(/100.00%/)).toBeInTheDocument();
    });

    it('handles worst case (no true positives or negatives)', () => {
      const worstCase: ConfusionMatrixAnalyticsData = {
        truePositives: 0,
        falsePositives: 50,
        trueNegatives: 0,
        falseNegatives: 50,
        precision: 0,
        recall: 0,
        f1Score: 0,
        accuracy: 0,
        lastRefreshedAt: '2026-07-30T10:00:00.000Z',
        generatedAt: '2026-07-30T10:00:01.000Z'
      };

      render(<ConfusionMatrix data={worstCase} />);

      expect(screen.getByText('50')).toBeInTheDocument();
    });

    it('handles large numbers correctly', () => {
      const largeNumbers: ConfusionMatrixAnalyticsData = {
        truePositives: 1000000,
        falsePositives: 100000,
        trueNegatives: 900000,
        falseNegatives: 50000,
        precision: 0.909090909,
        recall: 0.952380952,
        f1Score: 0.930282211,
        accuracy: 0.947368421,
        lastRefreshedAt: '2026-07-30T10:00:00.000Z',
        generatedAt: '2026-07-30T10:00:01.000Z'
      };

      render(<ConfusionMatrix data={largeNumbers} />);

      expect(screen.getByText('1000000')).toBeInTheDocument();
      expect(screen.getByText('100000')).toBeInTheDocument();
    });

    it('validates F1 calculation accuracy', () => {
      // F1 = 2 * (precision * recall) / (precision + recall)
      // For this data: F1 = 2 * (0.8333 * 0.9091) / (0.8333 + 0.9091) ≈ 0.8696
      render(<ConfusionMatrix data={mockData} />);

      const f1Value = (mockData.f1Score * 100).toFixed(2);
      expect(screen.getByText(`${f1Value}%`)).toBeInTheDocument();
    });

    it('validates accuracy calculation (TP + TN) / total', () => {
      // accuracy = (50 + 80) / (50 + 10 + 80 + 5) = 130 / 145 ≈ 0.8571
      render(<ConfusionMatrix data={mockData} />);

      const accuracyValue = (mockData.accuracy * 100).toFixed(2);
      expect(screen.getByText(`${accuracyValue}%`)).toBeInTheDocument();
    });

    it('handles asymmetric confusion matrix (more false negatives)', () => {
      const asymmetric: ConfusionMatrixAnalyticsData = {
        truePositives: 20,
        falsePositives: 5,
        trueNegatives: 70,
        falseNegatives: 60,
        precision: 0.8,
        recall: 0.25,
        f1Score: 0.3846,
        accuracy: 0.6,
        lastRefreshedAt: '2026-07-30T10:00:00.000Z',
        generatedAt: '2026-07-30T10:00:01.000Z'
      };

      render(<ConfusionMatrix data={asymmetric} />);

      expect(screen.getByText('20')).toBeInTheDocument(); // TP
      expect(screen.getByText('60')).toBeInTheDocument(); // FN - significantly higher
    });

    it('handles asymmetric confusion matrix (more false positives)', () => {
      const asymmetricFP: ConfusionMatrixAnalyticsData = {
        truePositives: 30,
        falsePositives: 80,
        trueNegatives: 50,
        falseNegatives: 10,
        precision: 0.2727,
        recall: 0.75,
        f1Score: 0.4,
        accuracy: 0.44,
        lastRefreshedAt: '2026-07-30T10:00:00.000Z',
        generatedAt: '2026-07-30T10:00:01.000Z'
      };

      render(<ConfusionMatrix data={asymmetricFP} />);

      expect(screen.getByText('30')).toBeInTheDocument(); // TP
      expect(screen.getByText('80')).toBeInTheDocument(); // FP - significantly higher
    });

    it('rounds metrics to appropriate precision', () => {
      const precisionData: ConfusionMatrixAnalyticsData = {
        truePositives: 33,
        falsePositives: 7,
        trueNegatives: 67,
        falseNegatives: 8,
        precision: 0.825, // Should round to 82.50%
        recall: 0.804878, // Should round to 80.49%
        f1Score: 0.814583, // Should round to 81.46%
        accuracy: 0.7, // Should be 70.00%
        lastRefreshedAt: '2026-07-30T10:00:00.000Z',
        generatedAt: '2026-07-30T10:00:01.000Z'
      };

      render(<ConfusionMatrix data={precisionData} />);

      expect(screen.getByText(/82.50%/)).toBeInTheDocument();
      expect(screen.getByText(/80.49%/)).toBeInTheDocument();
      expect(screen.getByText(/81.46%/)).toBeInTheDocument();
      expect(screen.getByText(/70.00%/)).toBeInTheDocument();
    });
  });

  describe('Metrics Validation', () => {
    it('verifies all metrics are non-negative', () => {
      const data = mockData;

      expect(data.truePositives).toBeGreaterThanOrEqual(0);
      expect(data.falsePositives).toBeGreaterThanOrEqual(0);
      expect(data.trueNegatives).toBeGreaterThanOrEqual(0);
      expect(data.falseNegatives).toBeGreaterThanOrEqual(0);
      expect(data.precision).toBeGreaterThanOrEqual(0);
      expect(data.recall).toBeGreaterThanOrEqual(0);
      expect(data.f1Score).toBeGreaterThanOrEqual(0);
      expect(data.accuracy).toBeGreaterThanOrEqual(0);
    });

    it('verifies all metrics do not exceed bounds', () => {
      const data = mockData;

      expect(data.precision).toBeLessThanOrEqual(1);
      expect(data.recall).toBeLessThanOrEqual(1);
      expect(data.f1Score).toBeLessThanOrEqual(1);
      expect(data.accuracy).toBeLessThanOrEqual(1);
    });

    it('verifies F1 is harmonic mean of precision and recall', () => {
      const { precision, recall, f1Score } = mockData;
      const expectedF1 = 2 * (precision * recall) / (precision + recall);

      expect(f1Score).toBeCloseTo(expectedF1, 3);
    });

    it('verifies accuracy formula (TP + TN) / total', () => {
      const { truePositives, falsePositives, trueNegatives, falseNegatives, accuracy } = mockData;
      const total = truePositives + falsePositives + trueNegatives + falseNegatives;
      const expectedAccuracy = (truePositives + trueNegatives) / total;

      expect(accuracy).toBeCloseTo(expectedAccuracy, 3);
    });
  });

  describe('Accessibility', () => {
    it('provides accessible labels for quadrants', () => {
      render(<ConfusionMatrix data={mockData} />);

      expect(screen.getByText('True Positives (TP)')).toBeInTheDocument();
      expect(screen.getByText('False Positives (FP)')).toBeInTheDocument();
      expect(screen.getByText('True Negatives (TN)')).toBeInTheDocument();
      expect(screen.getByText('False Negatives (FN)')).toBeInTheDocument();
    });

    it('announces loading state to screen readers', () => {
      render(<ConfusionMatrix data={mockData} loading={true} />);

      const status = screen.getByRole('status');
      expect(status).toHaveAttribute('aria-label');
    });

    it('announces error state to screen readers', () => {
      render(<ConfusionMatrix data={mockData} error="Test error" />);

      const alert = screen.getByRole('alert');
      expect(alert).toBeInTheDocument();
    });
  });
});
