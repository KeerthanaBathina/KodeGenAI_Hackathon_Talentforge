/**
 * Integration tests for policy UI components
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ScreeningThresholdEditor } from '@/components/admin/ScreeningThresholdEditor';
import { policyService } from '@/services/policyService';

// Mock the API service
vi.mock('@/services/policyService');

describe('ScreeningThresholdEditor Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(policyService.getActiveScreeningThreshold).mockResolvedValue({
      id: '1',
      shortlistThreshold: 80,
      borderlineMin: 40,
      borderlineMax: 60,
      rejectThreshold: 20,
      version: 1,
      effectiveFrom: '2026-07-01T00:00:00Z',
      createdAt: '2026-07-01T00:00:00Z',
    });
  });

  it('should render current threshold on mount', async () => {
    render(<ScreeningThresholdEditor />);

    await waitFor(() => {
      expect(screen.getByText(/Current Screening Thresholds/)).toBeInTheDocument();
      expect(screen.getByText('80')).toBeInTheDocument(); // shortlist value
    });
  });

  it('should display form for creating new version', async () => {
    render(<ScreeningThresholdEditor />);

    await waitFor(() => {
      expect(screen.getByText(/Create New Version/)).toBeInTheDocument();
      expect(screen.getByLabelText(/Shortlist Threshold/)).toBeInTheDocument();
    });
  });

  it('should show validation errors for invalid inputs', async () => {
    const user = userEvent.setup();
    render(<ScreeningThresholdEditor />);

    await waitFor(() => {
      expect(screen.getByLabelText(/Shortlist Threshold/)).toBeInTheDocument();
    });

    const shortlistInput = screen.getByLabelText(/Shortlist Threshold/);
    await user.clear(shortlistInput);
    await user.type(shortlistInput, '101'); // Invalid: > 100

    await waitFor(() => {
      expect(screen.getByText(/must be between 0 and 100/i)).toBeInTheDocument();
    });
  });

  it('should show range errors visually', async () => {
    const user = userEvent.setup();
    render(<ScreeningThresholdEditor />);

    await waitFor(() => {
      expect(screen.getByLabelText(/Shortlist Threshold/)).toBeInTheDocument();
    });

    const rejectInput = screen.getByLabelText(/Reject Threshold/);
    const borderlineMinInput = screen.getByLabelText(/Borderline Min/);

    await user.clear(rejectInput);
    await user.type(rejectInput, '50'); // Greater than borderlineMin

    await waitFor(() => {
      expect(screen.getByText(/Validation Issues/)).toBeInTheDocument();
    });
  });

  it('should disable submit button when form is invalid', async () => {
    render(<ScreeningThresholdEditor />);

    await waitFor(() => {
      const submitButton = screen.getByRole('button', { name: /Create New Version/ });
      expect(submitButton).toBeDisabled();
    });
  });

  it('should enable submit button when form is valid', async () => {
    const user = userEvent.setup();
    render(<ScreeningThresholdEditor />);

    await waitFor(() => {
      expect(screen.getByLabelText(/Shortlist Threshold/)).toBeInTheDocument();
    });

    // The default form values are valid, so button should be enabled
    const submitButton = screen.getByRole('button', { name: /Create New Version/ });

    await waitFor(() => {
      expect(submitButton).not.toBeDisabled();
    });
  });

  it('should submit form with valid data', async () => {
    const user = userEvent.setup();
    vi.mocked(policyService.createScreeningThreshold).mockResolvedValue({
      id: '2',
      shortlistThreshold: 85,
      borderlineMin: 45,
      borderlineMax: 65,
      rejectThreshold: 25,
      version: 2,
      effectiveFrom: '2026-08-01T00:00:00Z',
      createdAt: '2026-08-01T00:00:00Z',
    });

    render(<ScreeningThresholdEditor />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Create New Version/ })).toBeInTheDocument();
    });

    const submitButton = screen.getByRole('button', { name: /Create New Version/ });

    // Form has valid default values, so submit should work
    await user.click(submitButton);

    await waitFor(() => {
      expect(policyService.createScreeningThreshold).toHaveBeenCalled();
    });
  });

  it('should show success message after submission', async () => {
    const user = userEvent.setup();
    vi.mocked(policyService.createScreeningThreshold).mockResolvedValue({
      id: '2',
      shortlistThreshold: 85,
      borderlineMin: 45,
      borderlineMax: 65,
      rejectThreshold: 25,
      version: 2,
      effectiveFrom: '2026-08-01T00:00:00Z',
      createdAt: '2026-08-01T00:00:00Z',
    });

    render(<ScreeningThresholdEditor />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Create New Version/ })).toBeInTheDocument();
    });

    const submitButton = screen.getByRole('button', { name: /Create New Version/ });
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText(/New screening threshold version created/)).toBeInTheDocument();
    });
  });

  it('should show error message on failed submission', async () => {
    const user = userEvent.setup();
    vi.mocked(policyService.createScreeningThreshold).mockRejectedValue(
      new Error('API error'),
    );

    render(<ScreeningThresholdEditor />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Create New Version/ })).toBeInTheDocument();
    });

    const submitButton = screen.getByRole('button', { name: /Create New Version/ });
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText(/Failed to create/)).toBeInTheDocument();
    });
  });

  it('should reset form when reset button is clicked', async () => {
    const user = userEvent.setup();
    render(<ScreeningThresholdEditor />);

    await waitFor(() => {
      expect(screen.getByLabelText(/Shortlist Threshold/)).toBeInTheDocument();
    });

    const shortlistInput = screen.getByLabelText(/Shortlist Threshold/) as HTMLInputElement;
    const resetButton = screen.getByRole('button', { name: /Reset/ });

    // Change a value
    await user.clear(shortlistInput);
    await user.type(shortlistInput, '90');
    expect(shortlistInput.value).toBe('90');

    // Reset
    await user.click(resetButton);

    // Should be back to default
    expect(shortlistInput.value).toBe('80');
  });

  it('should reject past dates for effectiveFrom', async () => {
    const user = userEvent.setup();
    render(<ScreeningThresholdEditor />);

    await waitFor(() => {
      expect(screen.getByLabelText(/Effective From/)).toBeInTheDocument();
    });

    const dateInput = screen.getByLabelText(/Effective From/) as HTMLInputElement;
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayString = yesterday.toISOString().split('T')[0];

    await user.clear(dateInput);
    await user.type(dateInput, yesterdayString);

    await waitFor(() => {
      expect(screen.getByText(/cannot be in the past/i)).toBeInTheDocument();
    });
  });
});

describe('ThresholdRangeVisualizer', () => {
  it('should render range visualization', async () => {
    const { ThresholdRangeVisualizer } = await import('@/components/admin/ThresholdRangeVisualizer');
    const { render } = await import('@testing-library/react');

    render(
      <ThresholdRangeVisualizer
        reject={20}
        borderlineMin={40}
        borderlineMax={60}
        shortlist={80}
        errors={[]}
      />,
    );

    expect(screen.getByText(/Score Range/)).toBeInTheDocument();
  });

  it('should display validation errors', async () => {
    const { ThresholdRangeVisualizer } = await import('@/components/admin/ThresholdRangeVisualizer');
    const { render } = await import('@testing-library/react');

    render(
      <ThresholdRangeVisualizer
        reject={20}
        borderlineMin={60}
        borderlineMax={60}
        shortlist={80}
        errors={[{ field: 'borderlineMax', message: 'Invalid range' }]}
      />,
    );

    expect(screen.getByText(/Validation Issues/)).toBeInTheDocument();
    expect(screen.getByText(/Invalid range/)).toBeInTheDocument();
  });
});
