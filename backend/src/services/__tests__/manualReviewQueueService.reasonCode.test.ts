import { beforeEach, describe, expect, it, vi } from 'vitest';

const txMocks = vi.hoisted(() => ({
  reasonCodeFindFirst: vi.fn(),
  applicationFindUnique: vi.fn(),
  applicationUpdate: vi.fn(),
  reviewCreate: vi.fn(),
  interviewStageFindFirst: vi.fn(),
  interviewStageCreate: vi.fn(),
  screeningFindFirst: vi.fn(),
  scoringThresholdFindFirst: vi.fn(),
  templateFindFirst: vi.fn(),
  communicationCreate: vi.fn(),
  auditEventCreate: vi.fn(),
}));

const loggerMocks = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));

const prismaMocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  communicationFindUnique: vi.fn(),
  communicationUpdate: vi.fn(),
}));

vi.mock('../../db/prisma', () => ({
  prisma: {
    $transaction: prismaMocks.transaction,
    communication: {
      findUnique: prismaMocks.communicationFindUnique,
      update: prismaMocks.communicationUpdate,
    },
  },
}));

vi.mock('../../config/env', () => ({
  env: {
    REVIEW_QUEUE_SLA_HOURS: 48,
    EMAIL_PROVIDER: 'mock',
  },
}));

vi.mock('../templateRenderer', () => ({
  renderTemplate: vi.fn((template: { subject: string; bodyHtml: string; bodyText: string }) => template),
}));

vi.mock('../../utils/logger', () => ({
  default: {
    info: loggerMocks.info,
    warn: loggerMocks.warn,
    error: loggerMocks.error,
    debug: loggerMocks.debug,
  },
}));

import {
  InvalidReasonCodeError,
  markAsReviewed,
} from '../manualReviewQueueService';

function buildTransactionClient() {
  return {
    reasonCode: { findFirst: txMocks.reasonCodeFindFirst },
    application: {
      findUnique: txMocks.applicationFindUnique,
      update: txMocks.applicationUpdate,
    },
    review: { create: txMocks.reviewCreate },
    interviewStage: {
      findFirst: txMocks.interviewStageFindFirst,
      create: txMocks.interviewStageCreate,
    },
    screening: { findFirst: txMocks.screeningFindFirst },
    scoringThreshold: { findFirst: txMocks.scoringThresholdFindFirst },
    template: { findFirst: txMocks.templateFindFirst },
    communication: { create: txMocks.communicationCreate },
    auditEvent: { create: txMocks.auditEventCreate },
  };
}

describe('markAsReviewed side effects and audit behavior', () => {
  beforeEach(() => {
    vi.useFakeTimers();

    txMocks.reasonCodeFindFirst.mockReset();
    txMocks.applicationFindUnique.mockReset();
    txMocks.applicationUpdate.mockReset();
    txMocks.reviewCreate.mockReset();
    txMocks.interviewStageFindFirst.mockReset();
    txMocks.interviewStageCreate.mockReset();
    txMocks.screeningFindFirst.mockReset();
    txMocks.scoringThresholdFindFirst.mockReset();
    txMocks.templateFindFirst.mockReset();
    txMocks.communicationCreate.mockReset();
    txMocks.auditEventCreate.mockReset();

    prismaMocks.transaction.mockReset();
    prismaMocks.communicationFindUnique.mockReset();
    prismaMocks.communicationUpdate.mockReset();
    loggerMocks.info.mockReset();
    loggerMocks.warn.mockReset();
    loggerMocks.error.mockReset();
    loggerMocks.debug.mockReset();

    prismaMocks.transaction.mockImplementation(async (callback: (tx: any) => Promise<unknown>) => {
      return callback(buildTransactionClient());
    });
  });

  it('throws InvalidReasonCodeError when reason code is not active or not allowed', async () => {
    txMocks.reasonCodeFindFirst.mockResolvedValue(null);

    await expect(
      markAsReviewed('app-1', 'reviewer-1', 'rejected', 'unknown_code')
    ).rejects.toBeInstanceOf(InvalidReasonCodeError);

    expect(txMocks.applicationFindUnique).not.toHaveBeenCalled();
    expect(txMocks.applicationUpdate).not.toHaveBeenCalled();
    expect(txMocks.auditEventCreate).not.toHaveBeenCalled();
  });

  it('persists status, review, queued email, interview handoff, and audit event for shortlist', async () => {
    txMocks.reasonCodeFindFirst.mockResolvedValue({ id: 'reason-1', code: 'strong_skills_match' });
    txMocks.applicationFindUnique.mockResolvedValue({
      id: 'app-1',
      status: 'pending_review',
      requisitionId: 'req-1',
      manualReviewReason: 'low_confidence',
      requisition: {
        jobFamilyId: '00000003-0000-0000-0000-000000000001',
      },
    });
    txMocks.scoringThresholdFindFirst.mockResolvedValue({
      experienceThresholdYears: 2,
    });
    txMocks.screeningFindFirst.mockResolvedValue({
      factors: {
        parsedData: {
          experience_years: 3,
        },
      },
    });
    txMocks.templateFindFirst.mockResolvedValue({
      id: 'tpl-shortlist',
      type: 'general',
      name: 'Shortlist Notification',
    });
    txMocks.interviewStageFindFirst.mockResolvedValue(null);
    txMocks.communicationCreate.mockResolvedValue({ id: 'comm-1', status: 'queued' });
    txMocks.reviewCreate.mockResolvedValue({ id: 'review-1' });
    txMocks.auditEventCreate.mockResolvedValue({ id: 'audit-1' });

    prismaMocks.communicationFindUnique.mockResolvedValue({
      id: 'comm-1',
      applicationId: 'app-1',
      template: {
        subject: 'You are shortlisted for {{role_title}}',
        bodyHtml: '<p>Hi {{candidate_name}}</p>',
        bodyText: 'Hi {{candidate_name}}',
      },
      application: {
        id: 'app-1',
        candidate: {
          email: 'candidate@example.com',
          profile: { fullName: 'Candidate One' },
        },
        requisition: {
          title: 'Backend Engineer',
        },
      },
    });
    prismaMocks.communicationUpdate.mockResolvedValue({ id: 'comm-1' });

    await markAsReviewed(
      'app-1',
      'reviewer-1',
      'shortlisted',
      'strong_skills_match',
      'Strong systems design and coding performance.'
    );

    expect(txMocks.applicationUpdate).toHaveBeenCalledWith({
      where: { id: 'app-1' },
      data: expect.objectContaining({
        status: 'shortlisted',
        path: 'experienced',
        pathOverridden: false,
        pathOverrideApproverId: null,
        pathOverrideJustification: null,
      }),
    });

    expect(txMocks.reviewCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          applicationId: 'app-1',
          reviewerId: 'reviewer-1',
          decision: 'shortlisted',
          reasonCodeId: 'reason-1',
          notes: 'Strong systems design and coding performance.',
        }),
      })
    );

    expect(txMocks.interviewStageCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          applicationId: 'app-1',
          type: 'hr',
        }),
      })
    );

    expect(txMocks.communicationCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          applicationId: 'app-1',
          templateId: 'tpl-shortlist',
          channel: 'email',
          status: 'queued',
        }),
      })
    );

    expect(txMocks.auditEventCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actorId: 'reviewer-1',
          eventType: 'application_decision',
          entityType: 'application',
          entityId: 'app-1',
        }),
      })
    );

    await vi.advanceTimersByTimeAsync(1_000);

    expect(prismaMocks.communicationFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'comm-1' } })
    );
    expect(prismaMocks.communicationUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'comm-1' },
        data: expect.objectContaining({ status: 'sent' }),
      })
    );
  });

  it('uses configured threshold from scoringThreshold for classification', async () => {
    txMocks.reasonCodeFindFirst.mockResolvedValue({ id: 'reason-1', code: 'strong_skills_match' });
    txMocks.applicationFindUnique.mockResolvedValue({
      id: 'app-1',
      status: 'pending_review',
      requisitionId: 'req-1',
      manualReviewReason: 'low_confidence',
      requisition: {
        jobFamilyId: '00000003-0000-0000-0000-000000000001',
      },
    });
    txMocks.scoringThresholdFindFirst.mockResolvedValue({
      experienceThresholdYears: 3,
    });
    txMocks.screeningFindFirst.mockResolvedValue({
      factors: {
        parsedData: {
          experience_years: 2,
        },
      },
    });
    txMocks.templateFindFirst.mockResolvedValue({
      id: 'tpl-shortlist',
      type: 'general',
      name: 'Shortlist Notification',
    });
    txMocks.interviewStageFindFirst.mockResolvedValue(null);
    txMocks.communicationCreate.mockResolvedValue({ id: 'comm-1', status: 'queued' });
    txMocks.reviewCreate.mockResolvedValue({ id: 'review-1' });
    txMocks.auditEventCreate.mockResolvedValue({ id: 'audit-1' });
    prismaMocks.communicationFindUnique.mockResolvedValue(null);

    await markAsReviewed('app-1', 'reviewer-1', 'shortlisted', 'strong_skills_match');

    expect(txMocks.applicationUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'shortlisted',
          path: 'fresher',
        }),
      })
    );
  });

  it('falls back to default threshold when no threshold row exists', async () => {
    txMocks.reasonCodeFindFirst.mockResolvedValue({ id: 'reason-1', code: 'strong_skills_match' });
    txMocks.applicationFindUnique.mockResolvedValue({
      id: 'app-1',
      status: 'pending_review',
      requisitionId: 'req-1',
      manualReviewReason: 'low_confidence',
      requisition: {
        jobFamilyId: '00000003-0000-0000-0000-000000000001',
      },
    });
    txMocks.scoringThresholdFindFirst.mockResolvedValue(null);
    txMocks.screeningFindFirst.mockResolvedValue({
      factors: {
        parsedData: {
          experience_years: 2,
        },
      },
    });
    txMocks.templateFindFirst.mockResolvedValue({
      id: 'tpl-shortlist',
      type: 'general',
      name: 'Shortlist Notification',
    });
    txMocks.interviewStageFindFirst.mockResolvedValue(null);
    txMocks.communicationCreate.mockResolvedValue({ id: 'comm-1', status: 'queued' });
    txMocks.reviewCreate.mockResolvedValue({ id: 'review-1' });
    txMocks.auditEventCreate.mockResolvedValue({ id: 'audit-1' });
    prismaMocks.communicationFindUnique.mockResolvedValue(null);

    await markAsReviewed('app-1', 'reviewer-1', 'shortlisted', 'strong_skills_match');

    expect(txMocks.applicationUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'shortlisted',
          path: 'experienced',
        }),
      })
    );
  });

  it('falls back to default threshold and logs warning for malformed threshold values', async () => {
    txMocks.reasonCodeFindFirst.mockResolvedValue({ id: 'reason-1', code: 'strong_skills_match' });
    txMocks.applicationFindUnique.mockResolvedValue({
      id: 'app-1',
      status: 'pending_review',
      requisitionId: 'req-1',
      manualReviewReason: 'low_confidence',
      requisition: {
        jobFamilyId: '00000003-0000-0000-0000-000000000001',
      },
    });
    txMocks.scoringThresholdFindFirst.mockResolvedValue({
      experienceThresholdYears: -1,
    });
    txMocks.screeningFindFirst.mockResolvedValue({
      factors: {
        parsedData: {
          experience_years: 2,
        },
      },
    });
    txMocks.templateFindFirst.mockResolvedValue({
      id: 'tpl-shortlist',
      type: 'general',
      name: 'Shortlist Notification',
    });
    txMocks.interviewStageFindFirst.mockResolvedValue(null);
    txMocks.communicationCreate.mockResolvedValue({ id: 'comm-1', status: 'queued' });
    txMocks.reviewCreate.mockResolvedValue({ id: 'review-1' });
    txMocks.auditEventCreate.mockResolvedValue({ id: 'audit-1' });
    prismaMocks.communicationFindUnique.mockResolvedValue(null);

    await markAsReviewed('app-1', 'reviewer-1', 'shortlisted', 'strong_skills_match');

    expect(txMocks.applicationUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'shortlisted',
          path: 'experienced',
        }),
      })
    );
    expect(loggerMocks.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        jobFamilyId: '00000003-0000-0000-0000-000000000001',
        configuredThreshold: -1,
      }),
      'manual-review: invalid classification threshold; fallback value applied'
    );
  });
});
