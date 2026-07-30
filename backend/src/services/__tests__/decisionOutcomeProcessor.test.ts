import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  processDecisionOutcome,
  getOutcomeMessage,
  type ProcessDecisionOutcomeParams
} from '../decisionOutcomeProcessor';

// Mock dependencies using vi.hoisted
const { mockGeneratePdf, mockSendEmail, mockCreateTask, mockAuditEvent } = vi.hoisted(() => {
  return {
    mockGeneratePdf: vi.fn(),
    mockSendEmail: vi.fn(),
    mockCreateTask: vi.fn(),
    mockAuditEvent: vi.fn()
  };
});

vi.mock('../../db/prisma', () => ({
  default: {
    application: {
      update: vi.fn(),
      findUnique: vi.fn()
    },
    reasonCode: {
      findUniqueOrThrow: vi.fn()
    },
    user: {
      findUniqueOrThrow: vi.fn()
    },
    decision: {
      update: vi.fn()
    }
  }
}));

vi.mock('../../utils/logger', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    error: vi.fn()
  }
}));

vi.mock('../decisionPdfService', () => ({
  generateDecisionPdf: mockGeneratePdf
}));

vi.mock('../emailService', () => ({
  sendRejectionEmail: mockSendEmail
}));

vi.mock('../taskService', () => ({
  createReminderTask: mockCreateTask
}));

vi.mock('../auditService', () => ({
  auditEvent: mockAuditEvent
}));

import prisma from '../../db/prisma';
import logger from '../../utils/logger';

describe('decisionOutcomeProcessor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const baseParams: ProcessDecisionOutcomeParams = {
    decisionId: '123e4567-e89b-12d3-a456-426614174000',
    applicationId: '123e4567-e89b-12d3-a456-426614174001',
    outcome: 'offer',
    reasonCodeId: '123e4567-e89b-12d3-a456-426614174002',
    justification: 'Strong candidate with excellent qualifications',
    decidedBy: '123e4567-e89b-12d3-a456-426614174003'
  };

  describe('processDecisionOutcome', () => {
    it('should process offer decision and update status to pending_approval', async () => {
      vi.mocked(prisma.application.update).mockResolvedValue({
        id: baseParams.applicationId,
        status: 'pending_approval'
      } as any);
      mockAuditEvent.mockResolvedValue(undefined);

      await processDecisionOutcome(baseParams);

      expect(prisma.application.update).toHaveBeenCalledWith({
        where: { id: baseParams.applicationId },
        data: {
          status: 'pending_approval',
          updatedAt: expect.any(Date)
        }
      });

      expect(mockAuditEvent).toHaveBeenCalledWith({
        actorId: baseParams.decidedBy,
        eventType: 'decision.shortlist',
        entityType: 'application',
        entityId: baseParams.applicationId,
        payload: expect.objectContaining({
          decisionId: baseParams.decisionId,
          outcome: 'offer',
          reasonCodeId: baseParams.reasonCodeId,
          reason_code_id: baseParams.reasonCodeId,
          justificationLength: baseParams.justification.length,
        })
      });

      expect(logger.info).toHaveBeenCalledWith(
        'Offer decision 123e4567-e89b-12d3-a456-426614174000 awaiting approval chain'
      );
    });

    it('should process reject decision, update status, and trigger PDF + email', async () => {
      const rejectParams = { ...baseParams, outcome: 'reject' as const };

      vi.mocked(prisma.application.update).mockResolvedValue({
        id: rejectParams.applicationId,
        status: 'rejected',
        candidate: {
          email: 'candidate@example.com',
          profile: { fullName: 'John Doe' }
        },
        requisition: {
          title: 'Senior Software Engineer'
        }
      } as any);

      vi.mocked(prisma.reasonCode.findUniqueOrThrow).mockResolvedValue({
        id: rejectParams.reasonCodeId,
        code: 'QUALIFICATIONS',
        displayText: 'Qualifications did not meet requirements'
      } as any);

      vi.mocked(prisma.user.findUniqueOrThrow).mockResolvedValue({
        id: rejectParams.decidedBy,
        fullName: 'Jane Manager'
      } as any);

      mockGeneratePdf.mockResolvedValue('https://storage.example.com/decision.pdf');
      mockSendEmail.mockResolvedValue(undefined);
      mockAuditEvent.mockResolvedValue(undefined);

      await processDecisionOutcome(rejectParams);

      expect(prisma.application.update).toHaveBeenCalledWith({
        where: { id: rejectParams.applicationId },
        data: {
          status: 'rejected',
          updatedAt: expect.any(Date)
        },
        include: expect.objectContaining({
          candidate: expect.any(Object),
          requisition: expect.any(Object)
        })
      });

      // PDF generation is async, need to advance timers and wait
      await vi.advanceTimersByTimeAsync(0);

      expect(mockGeneratePdf).toHaveBeenCalledWith({
        decisionId: rejectParams.decisionId,
        candidateName: 'John Doe',
        requisitionTitle: 'Senior Software Engineer',
        outcome: 'reject',
        reasonCode: 'QUALIFICATIONS',
        reasonLabel: 'Qualifications did not meet requirements',
        justification: rejectParams.justification,
        decidedBy: rejectParams.decidedBy,
        decidedByName: 'Jane Manager',
        decidedAt: expect.any(Date)
      });

      // Email is sent after 2-second delay
      await vi.advanceTimersByTimeAsync(2000);

      expect(mockSendEmail).toHaveBeenCalledWith({
        candidateEmail: 'candidate@example.com',
        candidateName: 'John Doe',
        requisitionTitle: 'Senior Software Engineer',
        companyName: 'TalentForge'
      });
    });

    it('should process hold decision and create 14-day reminder task', async () => {
      const holdParams = { ...baseParams, outcome: 'hold' as const };
      const currentDate = new Date('2026-08-01T10:00:00Z');
      const expectedReminderDate = new Date('2026-08-15T10:00:00Z');

      vi.setSystemTime(currentDate);

      vi.mocked(prisma.application.update).mockResolvedValue({
        id: holdParams.applicationId,
        status: 'on_hold'
      } as any);
      mockCreateTask.mockResolvedValue(undefined);
      mockAuditEvent.mockResolvedValue(undefined);

      await processDecisionOutcome(holdParams);

      expect(prisma.application.update).toHaveBeenCalledWith({
        where: { id: holdParams.applicationId },
        data: {
          status: 'on_hold',
          updatedAt: expect.any(Date)
        }
      });

      expect(mockCreateTask).toHaveBeenCalledWith({
        assignedTo: holdParams.decidedBy,
        title: expect.stringContaining('Review held application'),
        description: expect.stringContaining('placed on hold'),
        dueDate: expectedReminderDate,
        entityType: 'application',
        entityId: holdParams.applicationId,
        metadata: {
          decisionId: holdParams.decisionId,
          holdReason: holdParams.reasonCodeId
        }
      });

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('14-day reminder'),
        expect.objectContaining({
          dueDate: expectedReminderDate
        })
      );
    });

    it('should process withdraw decision with no notifications', async () => {
      const withdrawParams = { ...baseParams, outcome: 'withdraw' as const };

      vi.mocked(prisma.application.update).mockResolvedValue({
        id: withdrawParams.applicationId,
        status: 'withdrawn'
      } as any);
      mockAuditEvent.mockResolvedValue(undefined);

      await processDecisionOutcome(withdrawParams);

      expect(prisma.application.update).toHaveBeenCalledWith({
        where: { id: withdrawParams.applicationId },
        data: {
          status: 'withdrawn',
          updatedAt: expect.any(Date)
        }
      });

      // No email or PDF generation for withdrawal
      expect(mockGeneratePdf).not.toHaveBeenCalled();
      expect(mockSendEmail).not.toHaveBeenCalled();
      expect(mockCreateTask).not.toHaveBeenCalled();

      expect(logger.info).toHaveBeenCalledWith(
        'Withdrawal decision processed',
        expect.any(Object)
      );
    });

    it('should log error and throw when outcome processing fails', async () => {
      const dbError = new Error('Database connection failed');
      vi.mocked(prisma.application.update).mockRejectedValue(dbError);

      await expect(processDecisionOutcome(baseParams)).rejects.toThrow(
        'Database connection failed'
      );

      expect(logger.error).toHaveBeenCalledWith(
        'Error processing decision outcome',
        expect.objectContaining({
          decisionId: baseParams.decisionId,
          outcome: baseParams.outcome,
          error: 'Database connection failed'
        })
      );
    });

    it('should handle unknown outcome gracefully', async () => {
      const invalidParams = { ...baseParams, outcome: 'invalid' as any };

      await expect(processDecisionOutcome(invalidParams)).rejects.toThrow(
        'Unknown decision outcome: invalid'
      );

      expect(logger.error).toHaveBeenCalledWith(
        'Error processing decision outcome',
        expect.objectContaining({
          error: 'Unknown decision outcome: invalid'
        })
      );
    });

    it('should not fail if PDF generation fails for reject decision', async () => {
      const rejectParams = { ...baseParams, outcome: 'reject' as const };

      vi.mocked(prisma.application.update).mockResolvedValue({
        id: rejectParams.applicationId,
        status: 'rejected',
        candidate: {
          email: 'candidate@example.com',
          profile: { fullName: 'John Doe' }
        },
        requisition: { title: 'Senior Software Engineer' }
      } as any);

      vi.mocked(prisma.reasonCode.findUniqueOrThrow).mockResolvedValue({
        id: rejectParams.reasonCodeId,
        code: 'QUALIFICATIONS',
        displayText: 'Qualifications did not meet requirements'
      } as any);

      vi.mocked(prisma.user.findUniqueOrThrow).mockResolvedValue({
        id: rejectParams.decidedBy,
        fullName: 'Jane Manager'
      } as any);

      mockGeneratePdf.mockRejectedValue(new Error('Storage unavailable'));
      mockSendEmail.mockResolvedValue(undefined);
      mockAuditEvent.mockResolvedValue(undefined);

      await processDecisionOutcome(rejectParams);

      // Advance timers to trigger async PDF generation
      await vi.advanceTimersByTimeAsync(0);

      expect(logger.error).toHaveBeenCalledWith(
        'Failed to generate PDF for decision',
        expect.objectContaining({
          decisionId: rejectParams.decisionId,
          error: 'Storage unavailable'
        })
      );

      // Email should still be sent
      await vi.advanceTimersByTimeAsync(2000);
      expect(mockSendEmail).toHaveBeenCalled();
    });

    it('should not fail if email sending fails for reject decision', async () => {
      const rejectParams = { ...baseParams, outcome: 'reject' as const };

      vi.mocked(prisma.application.update).mockResolvedValue({
        id: rejectParams.applicationId,
        status: 'rejected',
        candidate: {
          email: 'candidate@example.com',
          profile: { fullName: 'John Doe' }
        },
        requisition: { title: 'Senior Software Engineer' }
      } as any);

      vi.mocked(prisma.reasonCode.findUniqueOrThrow).mockResolvedValue({
        id: rejectParams.reasonCodeId,
        code: 'QUALIFICATIONS',
        displayText: 'Qualifications did not meet requirements'
      } as any);

      vi.mocked(prisma.user.findUniqueOrThrow).mockResolvedValue({
        id: rejectParams.decidedBy,
        fullName: 'Jane Manager'
      } as any);

      mockGeneratePdf.mockResolvedValue('https://storage.example.com/decision.pdf');
      mockSendEmail.mockRejectedValue(new Error('SMTP timeout'));
      mockAuditEvent.mockResolvedValue(undefined);

      await processDecisionOutcome(rejectParams);

      // Advance timers to trigger email sending
      await vi.advanceTimersByTimeAsync(2000);

      expect(logger.error).toHaveBeenCalledWith(
        'Failed to send rejection email',
        expect.objectContaining({
          decisionId: rejectParams.decisionId,
          error: 'SMTP timeout'
        })
      );

      // PDF should still be generated
      expect(mockGeneratePdf).toHaveBeenCalled();
    });
  });

  describe('getOutcomeMessage', () => {
    it('should return message for offer outcome', () => {
      expect(getOutcomeMessage('offer')).toBe('Decision submitted — awaiting approval');
    });

    it('should return message for reject outcome', () => {
      expect(getOutcomeMessage('reject')).toBe(
        'Rejection decision recorded. Candidate will be notified.'
      );
    });

    it('should return message for hold outcome', () => {
      expect(getOutcomeMessage('hold')).toBe(
        'Application placed on hold. Reminder set for 14 days.'
      );
    });

    it('should return message for withdraw outcome', () => {
      expect(getOutcomeMessage('withdraw')).toBe(
        'Application withdrawn from consideration.'
      );
    });

    it('should return default message for unknown outcome', () => {
      expect(getOutcomeMessage('unknown' as any)).toBe('Decision recorded successfully.');
    });
  });
});
