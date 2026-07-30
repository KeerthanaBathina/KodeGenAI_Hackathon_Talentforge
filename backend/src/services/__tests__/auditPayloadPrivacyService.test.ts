import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  candidateFindMany: vi.fn()
}));

vi.mock('../../db/prisma', () => ({
  default: {
    candidate: {
      findMany: mocks.candidateFindMany
    }
  }
}));

import { projectAuditPayloadsForPrivacy } from '../auditPayloadPrivacyService';

describe('auditPayloadPrivacyService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.candidateFindMany.mockResolvedValue([]);
  });

  it('returns payload unchanged when rows do not reference candidates', async () => {
    const payload = {
      action: 'login',
      reason: 'ok'
    };

    const projected = await projectAuditPayloadsForPrivacy([
      {
        entityType: 'session',
        entityId: '11111111-1111-1111-1111-111111111111',
        payloadJson: payload
      }
    ]);

    expect(projected[0]).toStrictEqual(payload);
    expect(mocks.candidateFindMany).not.toHaveBeenCalled();
  });

  it('redacts candidate pii when entity references anonymized candidate', async () => {
    const candidateId = '22222222-2222-2222-2222-222222222222';
    mocks.candidateFindMany.mockResolvedValueOnce([{ id: candidateId }]);

    const projected = await projectAuditPayloadsForPrivacy([
      {
        entityType: 'candidate',
        entityId: candidateId,
        payloadJson: {
          fullName: 'Jane Privacy',
          email: 'jane.privacy@example.com',
          phone: '+1-555-1200',
          address: '123 Hidden Lane',
          dateOfBirth: '1990-01-01',
          nested: {
            contactEmail: 'jane.secondary@example.com',
            city: 'London',
            decision: 'approved'
          }
        }
      }
    ]);

    expect(projected[0]).toStrictEqual({
      fullName: '[REDACTED]',
      email: '[REDACTED]',
      phone: null,
      address: null,
      dateOfBirth: null,
      nested: {
        contactEmail: '[REDACTED]',
        city: null,
        decision: 'approved'
      }
    });
  });

  it('redacts candidate pii when payload candidateId maps to anonymized candidate', async () => {
    const candidateId = '33333333-3333-3333-3333-333333333333';
    mocks.candidateFindMany.mockResolvedValueOnce([{ id: candidateId }]);

    const projected = await projectAuditPayloadsForPrivacy([
      {
        entityType: 'application',
        entityId: '44444444-4444-4444-4444-444444444444',
        payloadJson: {
          candidateId,
          candidate: {
            fullName: 'John Candidate',
            personalEmail: 'john@example.com',
            mobileNumber: '+1-555-7788'
          },
          status: 'shortlisted'
        }
      }
    ]);

    expect(projected[0]).toStrictEqual({
      candidateId,
      candidate: {
        fullName: '[REDACTED]',
        personalEmail: '[REDACTED]',
        mobileNumber: null
      },
      status: 'shortlisted'
    });
  });

  it('keeps payload values when candidate is not anonymized', async () => {
    const candidateId = '55555555-5555-5555-5555-555555555555';
    mocks.candidateFindMany.mockResolvedValueOnce([]);

    const projected = await projectAuditPayloadsForPrivacy([
      {
        entityType: 'candidate',
        entityId: candidateId,
        payloadJson: {
          fullName: 'Visible Name',
          email: 'visible@example.com'
        }
      }
    ]);

    expect(projected[0]).toStrictEqual({
      fullName: 'Visible Name',
      email: 'visible@example.com'
    });
  });

  it('is deterministic across repeated projection runs', async () => {
    const candidateId = '66666666-6666-6666-6666-666666666666';
    mocks.candidateFindMany.mockResolvedValue([{ id: candidateId }]);

    const rows = [
      {
        entityType: 'candidate',
        entityId: candidateId,
        payloadJson: {
          dateOfBirth: '1992-02-02',
          phone: '+1-202-555-1111',
          nested: {
            fullName: 'Deterministic User',
            email: 'deterministic@example.com'
          }
        }
      }
    ];

    const first = await projectAuditPayloadsForPrivacy(rows);
    const second = await projectAuditPayloadsForPrivacy(rows);

    expect(first).toStrictEqual(second);
  });
});