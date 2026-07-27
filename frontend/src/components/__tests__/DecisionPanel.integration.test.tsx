/**
 * Frontend Integration Tests for Decision Panel
 * 
 * Tests complete user workflows from outcome selection to submission:
 * - All four outcomes (offer, reject, hold, withdraw)
 * - Reason code loading and selection
 * - Form validation
 * - Error handling
 * - Accessibility
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

describe('DecisionPanel - Integration Workflows', () => {
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

  const mockOfferReasonCodes = [
    { id: '1', code: 'COMPETITIVE', displayText: 'Competitive Package', category: 'offer_decision', displayOrder: 1 },
    { id: '2', code: 'TOP_CANDIDATE', displayText: 'Top Candidate', category: 'offer_decision', displayOrder: 2 }
  ];

  const mockRejectReasonCodes = [
    { id: '3', code: 'SKILLS_GAP', displayText: 'Skills Gap', category: 'reject_decision', displayOrder: 1 },
    { id: '4', code: 'EXPERIENCE', displayText: 'Insufficient Experience', category: 'reject_decision', displayOrder: 2 }
  ];

  const mockHoldReasonCodes = [
    { id: '5', code: 'BUDGET_REVIEW', displayText: 'Budget Under Review', category: 'hold_decision', displayOrder: 1 },
    { id: '6', code: 'PENDING_INFO', displayText: 'Pending Additional Information', category: 'hold_decision', displayOrder: 2 }
  ];

  const mockWithdrawReasonCodes = [
    { id: '7', code: 'CANDIDATE_DECLINED', displayText: 'Candidate Declined', category: 'withdraw_decision', displayOrder: 1 },
    { id: '8', code: 'POSITION_FILLED', displayText: 'Position Already Filled', category: 'withdraw_decision', displayOrder: 2 }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockClear();
    
    // Default: prerequisites complete
    vi.mocked(prerequisitesApi.fetchPrerequisites).mockResolvedValue(
      mockCompletePrerequisites
    );
  });

  describe('Complete Offer Decision Workflow', () => {
    it('should complete full offer workflow from start to submission', async () => {
      const user = userEvent.setup();
      
      // Mock API responses
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ success: true, data: mockOfferReasonCodes })
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 201,
          json: async () => ({
            success: true,
            data: {
              id: 'decision-123',
              outcome: 'offer',
              status: 'pending_approval'
            },
            message: 'Decision submitted — awaiting approval'
          })
        });

      render(<DecisionPanel {...mockProps} />);

      // Wait for prerequisites to load
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /offer/i })).toBeEnabled();
      });

      // Step 1: Select offer outcome
      const offerButton = screen.getByRole('button', { name: /offer/i });
      await user.click(offerButton);

      // Step 2: Wait for reason codes to load
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          '/api/reason-codes?category=offer_decision',
          expect.any(Object)
        );
      });

      await waitFor(() => {
        const reasonCodeSelect = screen.getByLabelText(/Reason Code/i);
        expect(reasonCodeSelect).not.toBeDisabled();
        expect(screen.getByText('Competitive Package')).toBeInTheDocument();
      });

      // Step 3: Select reason code
      const reasonCodeSelect = screen.getByLabelText(/Reason Code/i);
      await user.selectOptions(reasonCodeSelect, '1');
      expect(reasonCodeSelect).toHaveValue('1');

      // Step 4: Enter justification
      const justificationField = screen.getByLabelText(/Justification/i);
      await user.type(
        justificationField,
        'Exceptional technical skills, strong cultural fit, and proven leadership experience'
      );

      // Step 5: Submit decision
      const submitButton = screen.getByRole('button', { name: /Submit Final Decision/i });
      expect(submitButton).toBeEnabled();
      await user.click(submitButton);

      // Verify API call
      await waitFor(() => {
        const decisionCall = mockFetch.mock.calls.find(call => 
          call[0] === '/api/decisions' && call[1]?.method === 'POST'
        );
        expect(decisionCall).toBeDefined();
        
        const body = JSON.parse(decisionCall![1]!.body as string);
        expect(body).toMatchObject({
          applicationId: mockProps.applicationId,
          outcome: 'offer',
          reasonCodeId: '1',
          justification: expect.stringContaining('Exceptional technical skills')
        });
      });

      // Step 6: Verify success message
      await waitFor(() => {
        expect(screen.getByText(/Decision Submitted Successfully/i)).toBeInTheDocument();
        expect(screen.getByText(/offer decision.*has been recorded/i)).toBeInTheDocument();
      });
    });
  });

  describe('Complete Reject Decision Workflow', () => {
    it('should complete full reject workflow with notification message', async () => {
      const user = userEvent.setup();
      
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ success: true, data: mockRejectReasonCodes })
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 201,
          json: async () => ({
            success: true,
            data: {
              id: 'decision-456',
              outcome: 'reject'
            },
            message: 'Rejection decision recorded. Candidate will be notified.'
          })
        });

      render(<DecisionPanel {...mockProps} />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /reject/i })).toBeEnabled();
      });

      // Select reject
      await user.click(screen.getByRole('button', { name: /reject/i }));

      // Wait for reason codes
      await waitFor(() => {
        expect(screen.getByText('Skills Gap')).toBeInTheDocument();
      });

      // Select reason code
      await user.selectOptions(screen.getByLabelText(/Reason Code/i), '3');

      // Enter justification
      await user.type(
        screen.getByLabelText(/Justification/i),
        'Candidate lacks required distributed systems experience and cloud architecture knowledge'
      );

      // Submit
      await user.click(screen.getByRole('button', { name: /Submit Final Decision/i }));

      // Verify submission
      await waitFor(() => {
        const decisionCall = mockFetch.mock.calls.find(call => 
          call[0] === '/api/decisions' && call[1]?.method === 'POST'
        );
        const body = JSON.parse(decisionCall![1]!.body as string);
        expect(body.outcome).toBe('reject');
        expect(body.reasonCodeId).toBe('3');
      });

      // Verify success
      await waitFor(() => {
        expect(screen.getByText(/rejection decision.*has been recorded/i)).toBeInTheDocument();
      });
    });
  });

  describe('Complete Hold Decision Workflow', () => {
    it('should complete full hold workflow with 14-day reminder message', async () => {
      const user = userEvent.setup();
      
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ success: true, data: mockHoldReasonCodes })
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 201,
          json: async () => ({
            success: true,
            data: {
              id: 'decision-789',
              outcome: 'hold'
            },
            message: 'Application placed on hold. Reminder set for 14 days.'
          })
        });

      render(<DecisionPanel {...mockProps} />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /hold/i })).toBeEnabled();
      });

      await user.click(screen.getByRole('button', { name: /hold/i }));

      await waitFor(() => {
        expect(screen.getByText('Budget Under Review')).toBeInTheDocument();
      });

      await user.selectOptions(screen.getByLabelText(/Reason Code/i), '5');

      await user.type(
        screen.getByLabelText(/Justification/i),
        'Awaiting Q3 budget approval before proceeding'
      );

      await user.click(screen.getByRole('button', { name: /Submit Final Decision/i }));

      await waitFor(() => {
        const decisionCall = mockFetch.mock.calls.find(call => 
          call[0] === '/api/decisions' && call[1]?.method === 'POST'
        );
        const body = JSON.parse(decisionCall![1]!.body as string);
        expect(body.outcome).toBe('hold');
      });

      await waitFor(() => {
        expect(screen.getByText(/hold decision.*has been recorded/i)).toBeInTheDocument();
      });
    });
  });

  describe('Complete Withdraw Decision Workflow', () => {
    it('should complete full withdraw workflow', async () => {
      const user = userEvent.setup();
      
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ success: true, data: mockWithdrawReasonCodes })
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 201,
          json: async () => ({
            success: true,
            data: {
              id: 'decision-abc',
              outcome: 'withdraw'
            },
            message: 'Application withdrawn from consideration.'
          })
        });

      render(<DecisionPanel {...mockProps} />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /withdraw/i })).toBeEnabled();
      });

      await user.click(screen.getByRole('button', { name: /withdraw/i }));

      await waitFor(() => {
        expect(screen.getByText('Candidate Declined')).toBeInTheDocument();
      });

      await user.selectOptions(screen.getByLabelText(/Reason Code/i), '7');

      await user.type(
        screen.getByLabelText(/Justification/i),
        'Candidate accepted another offer'
      );

      await user.click(screen.getByRole('button', { name: /Submit Final Decision/i }));

      await waitFor(() => {
        const decisionCall = mockFetch.mock.calls.find(call => 
          call[0] === '/api/decisions' && call[1]?.method === 'POST'
        );
        const body = JSON.parse(decisionCall![1]!.body as string);
        expect(body.outcome).toBe('withdraw');
      });

      await waitFor(() => {
        expect(screen.getByText(/withdrawal decision.*has been recorded/i)).toBeInTheDocument();
      });
    });
  });

  describe('Error Handling Integration', () => {
    it('should handle API failure during reason code loading', async () => {
      const user = userEvent.setup();
      
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      render(<DecisionPanel {...mockProps} />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /reject/i })).toBeEnabled();
      });

      await user.click(screen.getByRole('button', { name: /reject/i }));

      // Reason codes should fail to load
      await waitFor(() => {
        const reasonCodeSelect = screen.getByLabelText(/Reason Code/i);
        // Should still show "Loading..." or error state
        expect(reasonCodeSelect).toBeInTheDocument();
      });
    });

    it('should handle decision submission failure', async () => {
      const user = userEvent.setup();
      
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ success: true, data: mockRejectReasonCodes })
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          json: async () => ({
            success: false,
            error: {
              code: 'INTERNAL_ERROR',
              message: 'Database connection failed'
            }
          })
        });

      render(<DecisionPanel {...mockProps} />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /reject/i })).toBeEnabled();
      });

      await user.click(screen.getByRole('button', { name: /reject/i }));

      await waitFor(() => {
        expect(screen.getByText('Skills Gap')).toBeInTheDocument();
      });

      await user.selectOptions(screen.getByLabelText(/Reason Code/i), '3');
      await user.type(
        screen.getByLabelText(/Justification/i),
        'Test error handling with sufficient characters'
      );

      await user.click(screen.getByRole('button', { name: /Submit Final Decision/i }));

      // Should show error message
      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent(/Error/i);
      });
    });

    it('should handle invalid reason code rejection (HTTP 400)', async () => {
      const user = userEvent.setup();
      
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ success: true, data: mockOfferReasonCodes })
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 400,
          json: async () => ({
            success: false,
            error: {
              code: 'INVALID_REASON_CODE',
              message: 'Reason code category mismatch'
            }
          })
        });

      render(<DecisionPanel {...mockProps} />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /offer/i })).toBeEnabled();
      });

      await user.click(screen.getByRole('button', { name: /offer/i }));

      await waitFor(() => {
        expect(screen.getByText('Competitive Package')).toBeInTheDocument();
      });

      await user.selectOptions(screen.getByLabelText(/Reason Code/i), '1');
      await user.type(
        screen.getByLabelText(/Justification/i),
        'Test invalid reason code scenario'
      );

      await user.click(screen.getByRole('button', { name: /Submit Final Decision/i }));

      await waitFor(() => {
        expect(screen.getByText(/category mismatch/i)).toBeInTheDocument();
      });
    });
  });

  describe('Accessibility Integration', () => {
    it('should maintain proper tab order through entire workflow', async () => {
      const user = userEvent.setup();
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: mockOfferReasonCodes })
      });

      render(<DecisionPanel {...mockProps} />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /offer/i })).toBeEnabled();
      });

      // Tab through outcome buttons
      await user.tab();
      expect(screen.getByRole('button', { name: /offer/i })).toHaveFocus();

      await user.tab();
      expect(screen.getByRole('button', { name: /reject/i })).toHaveFocus();

      await user.tab();
      expect(screen.getByRole('button', { name: /hold/i })).toHaveFocus();

      await user.tab();
      expect(screen.getByRole('button', { name: /withdraw/i })).toHaveFocus();

      // Tab to reason code
      await user.tab();
      expect(screen.getByLabelText(/Reason Code/i)).toHaveFocus();

      // Tab to justification
      await user.tab();
      expect(screen.getByLabelText(/Justification/i)).toHaveFocus();

      // Tab to submit button
      await user.tab();
      expect(screen.getByRole('button', { name: /Submit Final Decision/i })).toHaveFocus();
    });

    it('should announce dynamic content changes to screen readers', async () => {
      const user = userEvent.setup();
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: mockRejectReasonCodes })
      });

      render(<DecisionPanel {...mockProps} />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /reject/i })).toBeEnabled();
      });

      // Before selection
      expect(screen.getByText(/Choose an outcome to see available reason codes/i)).toBeInTheDocument();

      // Select reject
      await user.click(screen.getByRole('button', { name: /reject/i }));

      // After selection - help text should update
      await waitFor(() => {
        expect(screen.getByText(/Select the primary reason for this reject decision/i)).toBeInTheDocument();
      });

      // Reason code dropdown should have proper ARIA attributes
      const reasonCodeSelect = screen.getByLabelText(/Reason Code/i);
      expect(reasonCodeSelect).toHaveAttribute('aria-required', 'true');
    });
  });

  describe('Form State Management', () => {
    it('should reset reason code when switching outcomes', async () => {
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

      // Select reject and reason code
      await user.click(screen.getByRole('button', { name: /reject/i }));

      await waitFor(() => {
        expect(screen.getByText('Skills Gap')).toBeInTheDocument();
      });

      const reasonCodeSelect = screen.getByLabelText(/Reason Code/i) as HTMLSelectElement;
      await user.selectOptions(reasonCodeSelect, '3');
      expect(reasonCodeSelect.value).toBe('3');

      // Switch to offer
      await user.click(screen.getByRole('button', { name: /offer/i }));

      // Reason code should reset
      await waitFor(() => {
        expect(reasonCodeSelect.value).toBe('');
      });

      // New reason codes should load
      await waitFor(() => {
        expect(screen.getByText('Competitive Package')).toBeInTheDocument();
      });
    });

    it('should preserve justification when changing outcomes', async () => {
      const user = userEvent.setup();
      
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ success: true, data: mockOfferReasonCodes })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ success: true, data: mockRejectReasonCodes })
        });

      render(<DecisionPanel {...mockProps} />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /offer/i })).toBeEnabled();
      });

      // Enter justification
      const justificationField = screen.getByLabelText(/Justification/i) as HTMLTextAreaElement;
      await user.type(justificationField, 'This is my justification text');
      expect(justificationField.value).toContain('This is my justification text');

      // Switch outcome
      await user.click(screen.getByRole('button', { name: /offer/i }));
      await user.click(screen.getByRole('button', { name: /reject/i }));

      // Justification should still be there
      expect(justificationField.value).toContain('This is my justification text');
    });
  });
});
