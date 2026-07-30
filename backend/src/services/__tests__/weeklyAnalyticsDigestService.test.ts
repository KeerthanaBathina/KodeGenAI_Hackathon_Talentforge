import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getPipelineAnalytics: vi.fn(),
  getNoShowAnalytics: vi.fn(),
  getLatestWeeklyActivitySignal: vi.fn(),
  findUsers: vi.fn()
}));

vi.mock('../../services/pipelineAnalyticsService', async () => {
  const actual = await vi.importActual<typeof import('../../services/pipelineAnalyticsService')>(
    '../../services/pipelineAnalyticsService'
  );

  return {
    ...actual,
    getPipelineAnalytics: mocks.getPipelineAnalytics
  };
});

vi.mock('../../services/noShowAnalyticsService', async () => {
  const actual = await vi.importActual<typeof import('../../services/noShowAnalyticsService')>(
    '../../services/noShowAnalyticsService'
  );

  return {
    ...actual,
    getNoShowAnalytics: mocks.getNoShowAnalytics
  };
});

vi.mock('../../db/weeklyActivitySignals', async () => {
  const actual = await vi.importActual<typeof import('../../db/weeklyActivitySignals')>(
    '../../db/weeklyActivitySignals'
  );

  return {
    ...actual,
    getLatestWeeklyActivitySignal: mocks.getLatestWeeklyActivitySignal
  };
});

vi.mock('../../db/prisma', () => ({
  default: {
    user: {
      findMany: mocks.findUsers
    }
  }
}));

import {
  composeWeeklyAnalyticsDigestPayload,
  resolveDigestRecipients,
  shouldSendWeeklyDigest
} from '../../services/weeklyAnalyticsDigestService';

describe('weeklyAnalyticsDigestService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('composeWeeklyAnalyticsDigestPayload', () => {
    it('composes payload with all five required KPI fields', async () => {
      mocks.getPipelineAnalytics.mockResolvedValue({
        totalApplications: 100,
        shortlistRatePct: 45.5,
        avgTimeToHireDays: 28.3,
        offerAcceptanceRatePct: 82.4,
        lastRefreshedAt: '2026-01-15T10:00:00Z',
        generatedAt: '2026-01-16T10:00:00Z'
      });

      mocks.getNoShowAnalytics.mockResolvedValue({
        noShowRatePct: 12.5,
        noShowCount: 2,
        scheduledCount: 16,
        trend30d: [],
        lastRefreshedAt: '2026-01-15T10:00:00Z',
        generatedAt: '2026-01-16T10:00:00Z'
      });

      const payload = await composeWeeklyAnalyticsDigestPayload();

      expect(payload).toEqual({
        totalApplications: 100,
        shortlistRatePct: 45.5,
        avgTimeToHireDays: 28.3,
        offerAcceptanceRatePct: 82.4,
        noShowRatePct: 12.5,
        generatedAt: '2026-01-16T10:00:00Z'
      });
    });

    it('passes requisitionId filter to both upstream analytics services', async () => {
      const requisitionId = '550e8400-e29b-41d4-a716-446655440000';

      mocks.getPipelineAnalytics.mockResolvedValue({
        totalApplications: 50,
        shortlistRatePct: 40,
        avgTimeToHireDays: 25,
        offerAcceptanceRatePct: 80,
        lastRefreshedAt: null,
        generatedAt: new Date().toISOString()
      });

      mocks.getNoShowAnalytics.mockResolvedValue({
        noShowRatePct: 10,
        noShowCount: 1,
        scheduledCount: 10,
        trend30d: [],
        lastRefreshedAt: null,
        generatedAt: new Date().toISOString()
      });

      await composeWeeklyAnalyticsDigestPayload(requisitionId);

      expect(mocks.getPipelineAnalytics).toHaveBeenCalledWith(requisitionId);
      expect(mocks.getNoShowAnalytics).toHaveBeenCalledWith(requisitionId);
    });
  });

  describe('shouldSendWeeklyDigest', () => {
    it('returns true when prior week has activity', async () => {
      mocks.getLatestWeeklyActivitySignal.mockResolvedValue({
        id: '1',
        weekEndingDate: new Date('2026-07-26T00:00:00.000Z'),
        applicationCountPriorWeek: 5,
        interviewCountPriorWeek: 3,
        hasActivity: true,
        refreshedAt: new Date(),
        updatedAt: new Date()
      });

      await expect(shouldSendWeeklyDigest()).resolves.toBe(true);
    });

    it('returns false when prior week has no activity', async () => {
      mocks.getLatestWeeklyActivitySignal.mockResolvedValue({
        id: '1',
        weekEndingDate: new Date('2026-07-26T00:00:00.000Z'),
        applicationCountPriorWeek: 0,
        interviewCountPriorWeek: 0,
        hasActivity: false,
        refreshedAt: new Date(),
        updatedAt: new Date()
      });

      await expect(shouldSendWeeklyDigest()).resolves.toBe(false);
    });

    it('defaults to true when activity signal is unavailable', async () => {
      mocks.getLatestWeeklyActivitySignal.mockResolvedValue(null);

      await expect(shouldSendWeeklyDigest()).resolves.toBe(true);
    });

    it('defaults to true when activity lookup throws', async () => {
      mocks.getLatestWeeklyActivitySignal.mockRejectedValue(new Error('db error'));

      await expect(shouldSendWeeklyDigest()).resolves.toBe(true);
    });
  });

  describe('resolveDigestRecipients', () => {
    it('returns normalized unique recipient emails', async () => {
      mocks.findUsers.mockResolvedValue([
        { email: 'Manager@One.example' },
        { email: 'manager@one.example ' },
        { email: 'manager.two@example.com' }
      ]);

      const recipients = await resolveDigestRecipients();

      expect(recipients).toEqual(['manager@one.example', 'manager.two@example.com']);
    });

    it('returns empty array when recipient lookup fails', async () => {
      mocks.findUsers.mockRejectedValue(new Error('lookup failed'));

      await expect(resolveDigestRecipients()).resolves.toEqual([]);
    });
  });
});
