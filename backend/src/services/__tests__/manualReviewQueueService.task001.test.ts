import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
}));

vi.mock('../../db/prisma', () => ({
  prisma: {
    application: {
      findMany: mocks.findMany,
    },
  },
}));

vi.mock('../../config/env', () => ({
  env: {
    REVIEW_QUEUE_SLA_HOURS: 48,
  },
}));

import { getManualReviewQueue } from '../manualReviewQueueService';

describe('manualReviewQueueService TASK-001 behavior', () => {
  beforeEach(() => {
    mocks.findMany.mockReset();
  });

  it('filters by department and high score > 75', async () => {
    const now = Date.now();

    mocks.findMany.mockResolvedValue([
      {
        id: 'a1',
        status: 'pending_review',
        manualReviewReason: null,
        submittedAt: new Date(now - 2 * 60 * 60 * 1000),
        candidate: {
          id: 'c1',
          email: 'eng@example.com',
          profile: { fullName: 'Eng Candidate' },
        },
        requisition: {
          id: 'r1',
          title: 'Backend Engineer',
          department: 'Engineering',
        },
        screenings: [{ score: 92, confidence: 0.9 }],
      },
      {
        id: 'a2',
        status: 'pending_review',
        manualReviewReason: null,
        submittedAt: new Date(now - 30 * 60 * 60 * 1000),
        candidate: {
          id: 'c2',
          email: 'design@example.com',
          profile: { fullName: 'Design Candidate' },
        },
        requisition: {
          id: 'r2',
          title: 'Product Designer',
          department: 'Design',
        },
        screenings: [{ score: 70, confidence: 0.8 }],
      },
    ]);

    const result = await getManualReviewQueue(
      { department: 'Engineering', scoreBand: 'high' },
      { page: 1, limit: 20 }
    );

    expect(result.total).toBe(1);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.candidateName).toBe('Eng Candidate');
    expect(result.items[0]?.requisitionDepartment).toBe('Engineering');
    expect(result.items[0]?.screeningScore).toBeGreaterThan(75);
    expect(result.items[0]?.slaRemainingSeconds).toBeGreaterThanOrEqual(0);
    expect(result.items[0]).toMatchObject({
      slaDeadlineAt: expect.any(String),
      slaElapsedPercent: expect.any(Number),
      slaSeverity: expect.any(String),
      isUrgent: expect.any(Boolean),
      canShortlist: true,
      canReject: true,
      decisionLocked: false,
    });
  });

  it('sorts by SLA ascending by default', async () => {
    const now = Date.now();

    mocks.findMany.mockResolvedValue([
      {
        id: 'a-later',
        status: 'pending_review',
        manualReviewReason: null,
        submittedAt: new Date(now - 1 * 60 * 60 * 1000),
        candidate: {
          id: 'c1',
          email: 'later@example.com',
          profile: { fullName: 'Later Candidate' },
        },
        requisition: {
          id: 'r1',
          title: 'Role 1',
          department: 'Engineering',
        },
        screenings: [{ score: 90, confidence: 0.9 }],
      },
      {
        id: 'a-sooner',
        status: 'pending_review',
        manualReviewReason: null,
        submittedAt: new Date(now - 20 * 60 * 60 * 1000),
        candidate: {
          id: 'c2',
          email: 'sooner@example.com',
          profile: { fullName: 'Sooner Candidate' },
        },
        requisition: {
          id: 'r2',
          title: 'Role 2',
          department: 'Engineering',
        },
        screenings: [{ score: 80, confidence: 0.8 }],
      },
    ]);

    const result = await getManualReviewQueue({}, { page: 1, limit: 20 });

    expect(result.items).toHaveLength(2);
    expect(result.items[0]?.id).toBe('a-sooner');
    expect(result.items[1]?.id).toBe('a-later');
  });
});
