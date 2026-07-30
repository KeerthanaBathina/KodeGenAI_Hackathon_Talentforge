import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../prisma', () => ({
  default: {
    approvalPolicy: {
      findFirst: vi.fn()
    }
  }
}));

import prisma from '../prisma';
import { getActiveApprovalPolicy } from '../approvalPolicies';

const mockFindFirst = vi.mocked(
  (prisma as unknown as { approvalPolicy: { findFirst: ReturnType<typeof vi.fn> } }).approvalPolicy.findFirst
);

const makeRow = (approvers: string[]) => ({
  requiredApprovers: approvers,
  effectiveFrom: new Date('2026-01-01T00:00:00Z')
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getActiveApprovalPolicy', () => {
  it('returns null when no policy covers the salary', async () => {
    mockFindFirst.mockResolvedValue(null);
    expect(await getActiveApprovalPolicy(50_000)).toBeNull();
  });

  it('returns 3-tier approver chain for L5 salary 160000', async () => {
    const approvers = ['hiring_manager', 'hr_manager', 'finance_director'];
    mockFindFirst.mockResolvedValue(makeRow(approvers));

    const result = await getActiveApprovalPolicy(160_000);
    expect(result?.requiredApprovers).toEqual(approvers);
    expect(result?.requiredApprovers).toHaveLength(3);
  });

  it('returns single approver chain for L1 salary 40000', async () => {
    mockFindFirst.mockResolvedValue(makeRow(['hiring_manager']));
    const result = await getActiveApprovalPolicy(40_000);
    expect(result?.requiredApprovers).toEqual(['hiring_manager']);
  });

  it('queries with salary range and lte asOf', async () => {
    mockFindFirst.mockResolvedValue(makeRow(['hiring_manager']));
    const asOf = new Date('2026-08-01T00:00:00Z');

    await getActiveApprovalPolicy(160_000, asOf);

    expect(mockFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          compensationBandMin: { lte: 160_000 },
          compensationBandMax: { gte: 160_000 },
          effectiveFrom: { lte: asOf },
          active: true
        })
      })
    );
  });
});
