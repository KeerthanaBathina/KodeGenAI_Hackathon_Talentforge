/**
 * Tests for Enhanced DecisionPanel Component
 * 
 * Tests the new features added in TASK-003:
 * - Four outcome options (offer/reject/hold/withdraw)
 * - Dynamic reason code dropdown
 * - Reason code validation
 * - Form submission with reason codes
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DecisionPanel } from '../DecisionPanel';
import * as prerequisitesApi from '@/lib/api/prerequisites';

// Mock the prerequisites API
vi.mock('@/lib/api/prerequisites', () => ({
  fetchPrerequisites: vi.fn(),
  PrerequisiteError: class PrerequisiteError extends Error {
    constructor(message: string, public statusCode?: number) {
      super(message);
      this.name = 'PrerequisiteError';
    }
  }
}));

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('DecisionPanel - Enhanced with Outcome Selector and Reason Codes', () => {
  const mockProps = {
    applicationId: '550e8400-e29b-41d4-a716-446655440000',
    candidateName: 'John Doe',
    onDecisionSubmitted: vi.fn()
  };

  const mockCompletePrerequisites = {
    isComplete: true,
    items: [
      {
        id: 'stage-1',
        type: 'interview_stage' as const,
        label: 'Technical Interview',
        status: 'completed' as const
      }
    ]
  };

  const mockRejectReasonCodes = [
    { id: '1', code: 'SKILLS_GAP', displayText: 'Skills Gap', category: 'reject_decision', displayOrder: 1 },
    { id: '2', code: 'EXPERIENCE', displayText: 'Insufficient Experience', category: 'reject_decision', displayOrder: 2 }
  ];

  const mockOfferReasonCodes = [
    { id: '3', code: 'COMPETITIVE', displayText: 'Competitive Package', category: 'offer_decision', displayOrder: 1 }
  ];

  const mockHoldReasonCodes = [
    { id: '4', code: 'PENDING_INFO', displayText: 'Pending Additional Information', category: 'hold_decision', displayOrder: 1 }
  ];

  const mockWithdrawReasonCodes = [
    { id: '5', code: 'CANDIDATE_WITHDREW', displayText: 'Candidate Withdrew', category: 'withdraw_decision', displayOrder: 1 }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockClear();
    
    // Default mocks
    vi.mocked(prerequisitesApi.fetchPrerequisites).mockResolvedValue(
      mockCompletePrerequisites
    );
  });

  describe('Four Outcome Options', () => {
    it('should display all four outcome buttons', async () => {
      render(<DecisionPanel {...mockProps} />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /offer/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /reject/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /hold/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /withdraw/i })).toBeInTheDocument();
      });
    });

    it('should show help text for each outcome', async () => {
      render(<DecisionPanel {...mockProps} />);

      await waitFor(() => {
        expect(screen.getByText('Submit for approval')).toBeInTheDocument();
        expect(screen.getByText('Candidate notified')).toBeInTheDocument();
        expect(screen.getByText('Pause for 14 days')).toBeInTheDocument();
        expect(screen.getByText('Remove from consideration')).toBeInTheDocument();
      });
    });

    it('should allow selecting each outcome', async () => {
      const user = userEvent.setup();
      render(<DecisionPanel {...mockProps} />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /offer/i })).toBeEnabled();
      });

      const offerButton = screen.getByRole('button', { name: /offer/i });
      const rejectButton = screen.getByRole('button', { name: /reject/i });
      const holdButton = screen.getByRole('button', { name: /hold/i });
      const withdrawButton = screen.getByRole('button', { name: /withdraw/i });

      await user.click(offerButton);
      expect(offerButton).toHaveAttribute('aria-pressed', 'true');

      await user.click(rejectButton);
      expect(rejectButton).toHaveAttribute('aria-pressed', 'true');
      expect(offerButton).toHaveAttribute('aria-pressed', 'false');

      await user.click(holdButton);
      expect(holdButton).toHaveAttribute('aria-pressed', 'true');

      await user.click(withdrawButton);
      expect(withdrawButton).toHaveAttribute('aria-pressed', 'true');
    });
  });

  describe('Reason Code Dropdown', () => {
    it('should be disabled until outcome is selected', async () => {
      render(<DecisionPanel {...mockProps} />);

      await waitFor(() => {
        const reasonCodeSelect = screen.getByLabelText(/Reason Code/i);
        expect(reasonCodeSelect).toBeDisabled();
        expect(reasonCodeSelect).toHaveTextContent('Select an outcome first');
      });
    });

    it('should fetch and display reason codes when outcome selected', async () => {
      const user = userEvent.setup();
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: mockRejectReasonCodes })
      });

      render(<DecisionPanel {...mockProps} />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /reject/i })).toBeEnabled();
      });

      const rejectButton = screen.getByRole('button', { name: /reject/i });
      await user.click(rejectButton);

      await waitFor(() => {
        const reasonCodeSelect = screen.getByLabelText(/Reason Code/i) as HTMLSelectElement;
        expect(reasonCodeSelect).toBeEnabled();
        expect(screen.getByText('Skills Gap')).toBeInTheDocument();
        expect(screen.getByText('Insufficient Experience')).toBeInTheDocument();
      });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/reason-codes?category=reject_decision',
        expect.any(Object)
      );
    });

    it('should reset reason code when outcome changes', async () => {
      const user = userEvent.setup();
      
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ success: true, data: mockRejectReasonCodes })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ success: true, data: mockOfferReasonCodes })
        });

      render(<DecisionPanel {...mockProps} />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /reject/i })).toBeEnabled();
      });

      // Select reject and choose a reason code
      await user.click(screen.getByRole('button', { name: /reject/i }));

      await waitFor(() => {
        expect(screen.getByText('Skills Gap')).toBeInTheDocument();
      });

      const reasonCodeSelect = screen.getByLabelText(/Reason Code/i) as HTMLSelectElement;
      await user.selectOptions(reasonCodeSelect, '1');
      expect(reasonCodeSelect.value).toBe('1');

      // Change to offer
      await user.click(screen.getByRole('button', { name: /offer/i }));

      await waitFor(() => {
        expect(reasonCodeSelect.value).toBe('');
      });
    });

    it('should show loading state while fetching reason codes', async () => {
      const user = userEvent.setup();
      
      let resolveReasonCodes: (value: any) => void;
      const reasonCodesPromise = new Promise((resolve) => {
        resolveReasonCodes = resolve;
      });

      mockFetch.mockReturnValueOnce({
        ok: true,
        json: () => reasonCodesPromise
      } as any);

      render(<DecisionPanel {...mockProps} />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /reject/i })).toBeEnabled();
      });

      await user.click(screen.getByRole('button', { name: /reject/i }));

      await waitFor(() => {
        const reasonCodeSelect = screen.getByLabelText(/Reason Code/i);
        expect(reasonCodeSelect).toHaveTextContent('Loading reasons...');
      });

      // Resolve the promise
      resolveReasonCodes!({ success: true, data: mockRejectReasonCodes });

      await waitFor(() => {
        expect(screen.getByText('Skills Gap')).toBeInTheDocument();
      });
    });
  });

  describe('Form Validation with Reason Codes', () => {
    it('should require reason code selection before submit', async () => {
      const user = userEvent.setup();
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: mockRejectReasonCodes })
      });

      render(<DecisionPanel {...mockProps} />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /reject/i })).toBeEnabled();
      });

      await user.click(screen.getByRole('button', { name: /reject/i }));

      await waitFor(() => {
        expect(screen.getByText('Skills Gap')).toBeInTheDocument();
      });

      const justificationField = screen.getByLabelText(/Justification/i);
      await user.type(justificationField, 'This is a valid justification with enough characters');

      const submitButton = screen.getByRole('button', { name: /Submit Final Decision/i });
      expect(submitButton).toBeDisabled();
    });

    it('should enable submit button when all fields valid including reason code', async () => {
      const user = userEvent.setup();
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: mockRejectReasonCodes })
      });

      render(<DecisionPanel {...mockProps} />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /reject/i })).toBeEnabled();
      });

      await user.click(screen.getByRole('button', { name: /reject/i }));

      await waitFor(() => {
        expect(screen.getByText('Skills Gap')).toBeInTheDocument();
      });

      const reasonCodeSelect = screen.getByLabelText(/Reason Code/i);
      await user.selectOptions(reasonCodeSelect, '1');

      const justificationField = screen.getByLabelText(/Justification/i);
      await user.type(justificationField, 'This is a valid justification with enough characters');

      const submitButton = screen.getByRole('button', { name: /Submit Final Decision/i });
      expect(submitButton).toBeEnabled();
    });
  });

  describe('Form Submission', () => {
    it('should submit all four outcomes with reason codes', async () => {
      const outcomes = [
        { name: 'offer', mockCodes: mockOfferReasonCodes, category: 'offer_decision' },
        { name: 'reject', mockCodes: mockRejectReasonCodes, category: 'reject_decision' },
        { name: 'hold', mockCodes: mockHoldReasonCodes, category: 'hold_decision' },
        { name: 'withdraw', mockCodes: mockWithdrawReasonCodes, category: 'withdraw_decision' }
      ];

      for (const outcome of outcomes) {
        const user = userEvent.setup();
        mockFetch.mockClear();
        
        mockFetch
          .mockResolvedValueOnce({
            ok: true,
            json: async () => ({ success: true, data: outcome.mockCodes })
          })
          .mockResolvedValueOnce({
            ok: true,
            json: async () => ({ success: true, data: {} })
          });

        const { unmount } = render(<DecisionPanel {...mockProps} />);

        await waitFor(() => {
          expect(screen.getByRole('button', { name: new RegExp(outcome.name, 'i') })).toBeEnabled();
        });

        await user.click(screen.getByRole('button', { name: new RegExp(outcome.name, 'i') }));

        await waitFor(() => {
          const options = screen.getAllByRole('option');
          expect(options.length).toBeGreaterThan(1);
        });

        const reasonCodeSelect = screen.getByLabelText(/Reason Code/i);
        await user.selectOptions(reasonCodeSelect, outcome.mockCodes[0].id);

        const justificationField = screen.getByLabelText(/Justification/i);
        await user.type(justificationField, 'Valid justification text here with enough characters');

        const submitButton = screen.getByRole('button', { name: /Submit Final Decision/i });
        await user.click(submitButton);

        await waitFor(() => {
          const submitCall = mockFetch.mock.calls.find((call) => 
            call[0] === '/api/decisions' && call[1]?.method === 'POST'
          );
          expect(submitCall).toBeDefined();
          
          const body = JSON.parse(submitCall![1]!.body as string);
          expect(body.outcome).toBe(outcome.name);
          expect(body.reasonCodeId).toBe(outcome.mockCodes[0].id);
          expect(body.justification).toBeTruthy();
        });

        unmount();
      }
    });

    it('should show error when reason code not selected', async () => {
      const user = userEvent.setup();
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: mockRejectReasonCodes })
      });

      render(<DecisionPanel {...mockProps} />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /reject/i })).toBeEnabled();
      });

      await user.click(screen.getByRole('button', { name: /reject/i }));

      await waitFor(() => {
        expect(screen.getByText('Skills Gap')).toBeInTheDocument();
      });

      const justificationField = screen.getByLabelText(/Justification/i);
      await user.type(justificationField, 'Valid justification with enough characters');

      // Manually trigger form submission without selecting reason code
      const form = screen.getByRole('button', { name: /Submit Final Decision/i }).closest('form');
      if (form) {
        const submitEvent = new Event('submit', { bubbles: true, cancelable: true });
        form.dispatchEvent(submitEvent);
      }

      await waitFor(() => {
        expect(screen.getByText(/Please select a reason code/i)).toBeInTheDocument();
      });
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA attributes on reason code dropdown', async () => {
      const user = userEvent.setup();
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: mockRejectReasonCodes })
      });

      render(<DecisionPanel {...mockProps} />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /reject/i })).toBeEnabled();
      });

      await user.click(screen.getByRole('button', { name: /reject/i }));

      await waitFor(() => {
        const reasonCodeSelect = screen.getByLabelText(/Reason Code/i);
        expect(reasonCodeSelect).toHaveAttribute('aria-required', 'true');
        expect(reasonCodeSelect).toHaveAttribute('id', 'reason-code');
      });
    });

    it('should mark reason code as invalid when error exists', async () => {
      const user = userEvent.setup();
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: mockRejectReasonCodes })
      });

      render(<DecisionPanel {...mockProps} />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /reject/i })).toBeEnabled();
      });

      await user.click(screen.getByRole('button', { name: /reject/i }));

      await waitFor(() => {
        expect(screen.getByText('Skills Gap')).toBeInTheDocument();
      });

      const justificationField = screen.getByLabelText(/Justification/i);
      await user.type(justificationField, 'Valid justification');

      // Try to submit without reason code
      const form = screen.getByRole('button', { name: /Submit Final Decision/i }).closest('form');
      if (form) {
        const submitEvent = new Event('submit', { bubbles: true, cancelable: true });
        form.dispatchEvent(submitEvent);
      }

      await waitFor(() => {
        const reasonCodeSelect = screen.getByLabelText(/Reason Code/i);
        expect(reasonCodeSelect).toHaveAttribute('aria-invalid', 'true');
      });
    });
  });
});
