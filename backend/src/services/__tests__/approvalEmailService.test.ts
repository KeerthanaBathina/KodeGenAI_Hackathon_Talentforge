import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Decimal } from '@prisma/client/runtime/library';
import { sendApprovalRequestEmail } from '../approvalEmailService';

const mocks = vi.hoisted(() => ({
  generateApprovalTokens: vi.fn()
}));

vi.mock('../approvalTokenService', () => ({
  generateApprovalTokens: mocks.generateApprovalTokens
}));

vi.mock('../../config/env', () => ({
  env: {
    FRONTEND_URL: 'https://app.example.com',
    EMAIL_PROVIDER: 'mock'
  }
}));

vi.mock('../../utils/logger', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

describe('approvalEmailService', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.generateApprovalTokens.mockReturnValue({
      approveToken: 'mock-approve-token',
      rejectToken: 'mock-reject-token'
    });

    // Clear console.log spy
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  describe('sendApprovalRequestEmail', () => {
    it('should generate tokens and log email', async () => {
      await sendApprovalRequestEmail({
        approvalId: 'approval-123',
        approverId: 'user-vp',
        approverDisplayName: 'VP Engineering',
        decisionId: 'decision-456',
        applicationId: 'app-789',
        compensationAmount: new Decimal(150000),
        tier: 1
      });

      expect(mocks.generateApprovalTokens).toHaveBeenCalledWith(
        'approval-123',
        'user-vp'
      );
      
      // Verify console.log was called (mock email output)
      expect(console.log).toHaveBeenCalled();
    });

    it('should include compensation amount formatted correctly', async () => {
      const consoleSpy = vi.spyOn(console, 'log');

      await sendApprovalRequestEmail({
        approvalId: 'approval-123',
        approverId: 'user-vp',
        approverDisplayName: 'VP',
        decisionId: 'decision-456',
        applicationId: 'app-789',
        compensationAmount: new Decimal(175500.50),
        tier: 1
      });

      const logOutput = consoleSpy.mock.calls[0][0];
      expect(logOutput).toContain('$175500.50');
    });

    it('should include 72 hour expiry notice', async () => {
      const consoleSpy = vi.spyOn(console, 'log');

      await sendApprovalRequestEmail({
        approvalId: 'approval-123',
        approverId: 'user-vp',
        approverDisplayName: 'VP',
        decisionId: 'decision-456',
        applicationId: 'app-789',
        compensationAmount: new Decimal(150000),
        tier: 1
      });

      const logOutput = consoleSpy.mock.calls[0][0];
      expect(logOutput).toContain('72 hours');
    });

    it('should include approve and reject URLs', async () => {
      const consoleSpy = vi.spyOn(console, 'log');

      await sendApprovalRequestEmail({
        approvalId: 'approval-123',
        approverId: 'user-cfo',
        approverDisplayName: 'CFO',
        decisionId: 'decision-456',
        applicationId: 'app-789',
        compensationAmount: new Decimal(200000),
        tier: 2
      });

      const logOutput = consoleSpy.mock.calls[0][0];
      expect(logOutput).toContain('https://app.example.com/approvals/respond?token=mock-approve-token');
      expect(logOutput).toContain('https://app.example.com/approvals/respond?token=mock-reject-token');
    });
  });
});
