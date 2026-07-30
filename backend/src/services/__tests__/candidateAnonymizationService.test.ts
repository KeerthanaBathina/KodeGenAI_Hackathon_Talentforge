import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requestFindUnique: vi.fn(),
  requestFindMany: vi.fn(),
  requestUpdate: vi.fn(),
  requestUpdateMany: vi.fn(),
  candidateFindUnique: vi.fn(),
  candidateUpdate: vi.fn(),
  candidateCredentialDeleteMany: vi.fn(),
  passwordResetTokenUpdateMany: vi.fn(),
  profileUpdate: vi.fn(),
  txRequestUpdate: vi.fn(),
  transaction: vi.fn(),
  applicationDeleteMany: vi.fn(),
  screeningDeleteMany: vi.fn(),
  interviewDeleteMany: vi.fn(),
  decisionDeleteMany: vi.fn(),
  auditLogEvent: vi.fn(),
  loggerInfo: vi.fn(),
  loggerWarn: vi.fn(),
  loggerError: vi.fn()
}));

vi.mock('../../db/prisma', () => ({
  default: {
    gdprErasureRequest: {
      findUnique: mocks.requestFindUnique,
      findMany: mocks.requestFindMany,
      update: mocks.requestUpdate,
      updateMany: mocks.requestUpdateMany
    },
    $transaction: mocks.transaction
  }
}));

vi.mock('../auditService', () => ({
  auditService: {
    logEvent: mocks.auditLogEvent
  }
}));

vi.mock('../../utils/logger', () => ({
  default: {
    info: mocks.loggerInfo,
    warn: mocks.loggerWarn,
    error: mocks.loggerError
  }
}));

import {
  processGdprErasureRequestById,
  processPendingGdprErasureRequests
} from '../candidateAnonymizationService';

function buildRequest(overrides: Partial<any> = {}) {
  return {
    id: 'request-1',
    candidateId: 'candidate-1',
    requestedAt: new Date('2026-07-01T00:00:00.000Z'),
    dueAt: new Date('2026-07-31T00:00:00.000Z'),
    status: 'pending',
    processedAt: null,
    failureReason: null,
    requestReason: 'User asked to erase data',
    ...overrides
  };
}

function buildCandidate(overrides: Partial<any> = {}) {
  return {
    id: 'candidate-1',
    anonymisedAt: null,
    profile: {
      education: [
        {
          institution: 'State University',
          address: '123 Main St',
          dateOfBirth: '1995-01-01',
          contactEmail: 'candidate@example.com'
        }
      ],
      workHistory: [
        {
          employer: 'Acme Corp',
          city: 'London',
          phoneNumber: '+44-111-2222'
        }
      ],
      rawParseJson: {
        fullName: 'Jane Candidate',
        dob: '1995-01-01',
        address: '123 Main St'
      }
    },
    ...overrides
  };
}

describe('candidateAnonymizationService', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.requestFindUnique.mockResolvedValue(buildRequest());
    mocks.requestFindMany.mockResolvedValue([]);
    mocks.requestUpdateMany.mockResolvedValue({ count: 1 });
    mocks.requestUpdate.mockResolvedValue(buildRequest({ status: 'failed' }));

    mocks.candidateFindUnique.mockResolvedValue(buildCandidate());
    mocks.candidateUpdate.mockResolvedValue({ id: 'candidate-1' });
    mocks.candidateCredentialDeleteMany.mockResolvedValue({ count: 1 });
    mocks.passwordResetTokenUpdateMany.mockResolvedValue({ count: 2 });
    mocks.profileUpdate.mockResolvedValue({ id: 'profile-1' });
    mocks.txRequestUpdate.mockResolvedValue(buildRequest({ status: 'completed' }));

    mocks.auditLogEvent.mockResolvedValue(undefined);

    mocks.transaction.mockImplementation(async (callback: any) => {
      const tx = {
        candidate: {
          findUnique: mocks.candidateFindUnique,
          update: mocks.candidateUpdate
        },
        candidateCredential: {
          deleteMany: mocks.candidateCredentialDeleteMany
        },
        passwordResetToken: {
          updateMany: mocks.passwordResetTokenUpdateMany
        },
        profile: {
          update: mocks.profileUpdate
        },
        gdprErasureRequest: {
          findUnique: vi.fn(),
          findMany: vi.fn(),
          update: mocks.txRequestUpdate,
          updateMany: vi.fn()
        },
        application: {
          deleteMany: mocks.applicationDeleteMany
        },
        screening: {
          deleteMany: mocks.screeningDeleteMany
        },
        interviewStage: {
          deleteMany: mocks.interviewDeleteMany
        },
        decision: {
          deleteMany: mocks.decisionDeleteMany
        }
      };

      return callback(tx);
    });
  });

  it('anonymizes PII and completes request without deleting hiring records', async () => {
    const result = await processGdprErasureRequestById('request-1');

    expect(result).toMatchObject({
      requestId: 'request-1',
      candidateId: 'candidate-1',
      outcome: 'completed'
    });

    expect(mocks.requestUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'request-1'
        }),
        data: expect.objectContaining({
          status: 'processing'
        })
      })
    );

    expect(mocks.candidateUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'candidate-1' },
        data: expect.objectContaining({
          status: 'anonymized',
          email: 'anon-candidate-1@redacted',
          phone: null,
          anonymisationVersion: 'gdpr-v1',
          failedLoginAttempts: 0,
          lockedUntil: null
        })
      })
    );

    expect(mocks.profileUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          fullName: 'ANONYMISED',
          education: [
            expect.objectContaining({
              address: null,
              dateOfBirth: null,
              contactEmail: 'anon-candidate-1@redacted'
            })
          ],
          workHistory: [
            expect.objectContaining({
              city: null,
              phoneNumber: null
            })
          ],
          rawParseJson: expect.objectContaining({
            fullName: 'ANONYMISED',
            dob: null,
            address: null
          })
        })
      })
    );

    expect(mocks.candidateCredentialDeleteMany).toHaveBeenCalledWith({
      where: { candidateId: 'candidate-1' }
    });

    expect(mocks.passwordResetTokenUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          candidateId: 'candidate-1',
          usedAt: null
        }
      })
    );

    expect(mocks.txRequestUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'request-1' },
        data: expect.objectContaining({
          status: 'completed'
        })
      })
    );

    expect(mocks.applicationDeleteMany).not.toHaveBeenCalled();
    expect(mocks.screeningDeleteMany).not.toHaveBeenCalled();
    expect(mocks.interviewDeleteMany).not.toHaveBeenCalled();
    expect(mocks.decisionDeleteMany).not.toHaveBeenCalled();

    expect(mocks.auditLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'gdpr_erasure_processing_started',
        resourceType: 'gdpr_erasure_request',
        resourceId: 'request-1'
      })
    );
    expect(mocks.auditLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'gdpr_erasure_processing_completed'
      })
    );
    expect(mocks.auditLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'candidate_anonymized',
        resourceType: 'candidate',
        resourceId: 'candidate-1'
      })
    );
  });

  it('is idempotent for already completed requests', async () => {
    mocks.requestFindUnique.mockResolvedValue(
      buildRequest({ status: 'completed', processedAt: new Date('2026-07-15T00:00:00.000Z') })
    );

    const result = await processGdprErasureRequestById('request-1');

    expect(result.outcome).toBe('skipped_already_completed');
    expect(mocks.requestUpdateMany).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it('marks request failed when anonymization processing errors', async () => {
    mocks.candidateFindUnique.mockResolvedValue(null);

    const result = await processGdprErasureRequestById('request-1');

    expect(result.outcome).toBe('failed');
    expect(result.failureReason).toContain('Candidate linked to erasure request was not found');

    expect(mocks.requestUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'request-1' },
        data: expect.objectContaining({
          status: 'failed',
          failureReason: expect.stringContaining('Candidate linked to erasure request was not found')
        })
      })
    );

    expect(mocks.auditLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'gdpr_erasure_processing_failed'
      })
    );
  });

  it('processes pending and failed requests to support retries', async () => {
    mocks.requestFindMany.mockResolvedValue([
      buildRequest({ id: 'request-1', status: 'pending' }),
      buildRequest({ id: 'request-2', candidateId: 'candidate-2', status: 'failed' })
    ]);

    mocks.requestFindUnique
      .mockResolvedValueOnce(buildRequest({ id: 'request-1', status: 'pending' }))
      .mockResolvedValueOnce(buildRequest({ id: 'request-2', candidateId: 'candidate-2', status: 'failed' }));

    mocks.candidateFindUnique
      .mockResolvedValueOnce(buildCandidate({ id: 'candidate-1' }))
      .mockResolvedValueOnce(buildCandidate({ id: 'candidate-2' }));

    const summary = await processPendingGdprErasureRequests({ limit: 10 });

    expect(mocks.requestFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: {
            in: ['pending', 'failed']
          }
        },
        take: 10
      })
    );

    expect(summary.selectedCount).toBe(2);
    expect(summary.completedCount).toBe(2);
    expect(summary.failedCount).toBe(0);
    expect(summary.skippedCount).toBe(0);

    expect(summary.results.map((item) => item.requestId)).toEqual(['request-1', 'request-2']);
    expect(mocks.requestUpdateMany).toHaveBeenCalledTimes(2);
  });
});
