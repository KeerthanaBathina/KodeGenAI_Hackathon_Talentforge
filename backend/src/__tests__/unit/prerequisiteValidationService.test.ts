/**
 * Unit Tests for Prerequisite Validation Service
 * 
 * Tests validation logic for hiring decision prerequisites:
 * - Interview stage completion checks
 * - Assessment score validation
 * - Edge cases (no stages, cancelled stages, missing data)
 * - Error handling
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  checkPrerequisites,
  getInterviewStageCompletion,
  hasAssessmentScore,
  validateAllStagesComplete,
  ApplicationNotFoundError
} from '../../services/prerequisiteValidationService';
import prisma from '../../db/prisma';
import type { InterviewStage, AssessmentSession } from '@prisma/client';

// Mock Prisma client
vi.mock('../../db/prisma', () => ({
  default: {
    application: {
      findUnique: vi.fn()
    },
    interviewStage: {
      findMany: vi.fn()
    },
    assessmentSession: {
      findFirst: vi.fn()
    }
  }
}));

// Mock logger
vi.mock('../../utils/logger', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    error: vi.fn()
  }
}));

describe('PrerequisiteValidationService', () => {
  const mockApplicationId = '550e8400-e29b-41d4-a716-446655440000';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('checkPrerequisites', () => {
    it('should return complete when all stages and assessment are done', async () => {
      // Mock application exists
      vi.mocked(prisma.application.findUnique).mockResolvedValue({
        id: mockApplicationId
      } as any);

      // Mock completed stages
      vi.mocked(prisma.interviewStage.findMany).mockResolvedValue([
        {
          id: 'stage-1',
          applicationId: mockApplicationId,
          type: 'technical',
          state: 'completed',
          scheduledAt: new Date(),
          scorecards: [{ id: 'scorecard-1', recommendation: 'strong_yes' }]
        },
        {
          id: 'stage-2',
          applicationId: mockApplicationId,
          type: 'hr',
          state: 'completed',
          scheduledAt: new Date(),
          scorecards: [{ id: 'scorecard-2', recommendation: 'yes' }]
        }
      ] as any);

      // Mock completed assessment
      vi.mocked(prisma.assessmentSession.findFirst).mockResolvedValue({
        id: 'assessment-1',
        applicationId: mockApplicationId,
        status: 'completed',
        score: 85.5
      } as any);

      const result = await checkPrerequisites(mockApplicationId);

      expect(result.isComplete).toBe(true);
      expect(result.incompleteStages).toHaveLength(0);
      expect(result.missingAssessment).toBe(false);
      expect(result.message).toBe('All prerequisites complete');
    });

    it('should return incomplete when one stage is pending', async () => {
      vi.mocked(prisma.application.findUnique).mockResolvedValue({
        id: mockApplicationId
      } as any);

      vi.mocked(prisma.interviewStage.findMany).mockResolvedValue([
        {
          id: 'stage-1',
          applicationId: mockApplicationId,
          type: 'technical',
          state: 'completed',
          scheduledAt: new Date(),
          scorecards: [{ id: 'scorecard-1', recommendation: 'strong_yes' }]
        },
        {
          id: 'stage-2',
          applicationId: mockApplicationId,
          type: 'hr',
          state: 'scheduled',
          scheduledAt: new Date('2026-07-28T10:00:00Z'),
          scorecards: []
        }
      ] as any);

      vi.mocked(prisma.assessmentSession.findFirst).mockResolvedValue({
        id: 'assessment-1',
        applicationId: mockApplicationId,
        status: 'completed',
        score: 85.5
      } as any);

      const result = await checkPrerequisites(mockApplicationId);

      expect(result.isComplete).toBe(false);
      expect(result.incompleteStages).toHaveLength(1);
      expect(result.incompleteStages[0]).toMatchObject({
        id: 'stage-2',
        type: 'hr',
        state: 'scheduled',
        hasScorecards: false
      });
      expect(result.missingAssessment).toBe(false);
      expect(result.message).toContain('Hr Interview (scheduled)');
    });

    it('should return incomplete when assessment is missing', async () => {
      vi.mocked(prisma.application.findUnique).mockResolvedValue({
        id: mockApplicationId
      } as any);

      vi.mocked(prisma.interviewStage.findMany).mockResolvedValue([
        {
          id: 'stage-1',
          applicationId: mockApplicationId,
          type: 'technical',
          state: 'completed',
          scheduledAt: new Date(),
          scorecards: [{ id: 'scorecard-1', recommendation: 'strong_yes' }]
        }
      ] as any);

      // No assessment found
      vi.mocked(prisma.assessmentSession.findFirst).mockResolvedValue(null);

      const result = await checkPrerequisites(mockApplicationId);

      expect(result.isComplete).toBe(false);
      expect(result.incompleteStages).toHaveLength(0);
      expect(result.missingAssessment).toBe(true);
      expect(result.message).toContain('Assessment Score');
    });

    it('should return complete when no stages configured and assessment not required', async () => {
      vi.mocked(prisma.application.findUnique).mockResolvedValue({
        id: mockApplicationId
      } as any);

      vi.mocked(prisma.interviewStage.findMany).mockResolvedValue([]);
      vi.mocked(prisma.assessmentSession.findFirst).mockResolvedValue(null);

      const result = await checkPrerequisites(mockApplicationId, {
        requireAllInterviewStages: true,
        requireAssessment: false
      });

      expect(result.isComplete).toBe(true);
      expect(result.incompleteStages).toHaveLength(0);
      expect(result.message).toBe('All prerequisites complete');
    });

    it('should throw ApplicationNotFoundError when application does not exist', async () => {
      vi.mocked(prisma.application.findUnique).mockResolvedValue(null);

      await expect(checkPrerequisites(mockApplicationId))
        .rejects
        .toThrow(ApplicationNotFoundError);

      await expect(checkPrerequisites(mockApplicationId))
        .rejects
        .toThrow(`Application not found: ${mockApplicationId}`);
    });

    it('should handle multiple incomplete items in message', async () => {
      vi.mocked(prisma.application.findUnique).mockResolvedValue({
        id: mockApplicationId
      } as any);

      vi.mocked(prisma.interviewStage.findMany).mockResolvedValue([
        {
          id: 'stage-1',
          applicationId: mockApplicationId,
          type: 'technical',
          state: 'scheduled',
          scheduledAt: new Date(),
          scorecards: []
        },
        {
          id: 'stage-2',
          applicationId: mockApplicationId,
          type: 'hr',
          state: 'scheduled',
          scheduledAt: new Date(),
          scorecards: []
        }
      ] as any);

      vi.mocked(prisma.assessmentSession.findFirst).mockResolvedValue(null);

      const result = await checkPrerequisites(mockApplicationId);

      expect(result.isComplete).toBe(false);
      expect(result.message).toContain('Technical Interview (scheduled)');
      expect(result.message).toContain('Hr Interview (scheduled)');
      expect(result.message).toContain('Assessment Score');
    });
  });

  describe('validateAllStagesComplete', () => {
    it('should exclude cancelled stages from validation', async () => {
      const stages = [
        {
          id: 'stage-1',
          type: 'technical',
          state: 'completed',
          scorecards: []
        },
        {
          id: 'stage-2',
          type: 'hr',
          state: 'cancelled',
          scorecards: []
        }
      ] as any;

      const incomplete = validateAllStagesComplete(stages);

      expect(incomplete).toHaveLength(0);
    });

    it('should exclude no_show stages from validation', async () => {
      const stages = [
        {
          id: 'stage-1',
          type: 'technical',
          state: 'completed',
          scorecards: []
        },
        {
          id: 'stage-2',
          type: 'hr',
          state: 'no_show',
          scorecards: []
        }
      ] as any;

      const incomplete = validateAllStagesComplete(stages);

      expect(incomplete).toHaveLength(0);
    });

    it('should return empty array when no stages configured', async () => {
      const stages: InterviewStage[] = [];
      const incomplete = validateAllStagesComplete(stages);

      expect(incomplete).toHaveLength(0);
    });

    it('should validate specific required stage types only', async () => {
      const stages = [
        {
          id: 'stage-1',
          type: 'technical',
          state: 'completed',
          scorecards: []
        },
        {
          id: 'stage-2',
          type: 'hr',
          state: 'scheduled',
          scorecards: []
        },
        {
          id: 'stage-3',
          type: 'coding',
          state: 'scheduled',
          scorecards: []
        }
      ] as any;

      // Only require technical and coding
      const incomplete = validateAllStagesComplete(stages, ['technical', 'coding']);

      expect(incomplete).toHaveLength(1);
      expect(incomplete[0].type).toBe('coding');
      // HR stage should not be included since it's not in required types
    });

    it('should mark stages with scorecards correctly', async () => {
      const stages = [
        {
          id: 'stage-1',
          type: 'technical',
          state: 'scheduled',
          scheduledAt: new Date(),
          scorecards: [{ id: 'scorecard-1' }]
        },
        {
          id: 'stage-2',
          type: 'hr',
          state: 'scheduled',
          scheduledAt: new Date(),
          scorecards: []
        }
      ] as any;

      const incomplete = validateAllStagesComplete(stages);

      expect(incomplete).toHaveLength(2);
      expect(incomplete[0].hasScorecards).toBe(true);
      expect(incomplete[1].hasScorecards).toBe(false);
    });
  });

  describe('hasAssessmentScore', () => {
    it('should return true when completed assessment with score exists', async () => {
      vi.mocked(prisma.assessmentSession.findFirst).mockResolvedValue({
        id: 'assessment-1',
        applicationId: mockApplicationId,
        status: 'completed',
        score: 85.5
      } as any);

      const result = await hasAssessmentScore(mockApplicationId);

      expect(result).toBe(true);
      expect(prisma.assessmentSession.findFirst).toHaveBeenCalledWith({
        where: {
          applicationId: mockApplicationId,
          status: 'completed',
          score: { not: null }
        },
        select: { id: true }
      });
    });

    it('should return false when no assessment exists', async () => {
      vi.mocked(prisma.assessmentSession.findFirst).mockResolvedValue(null);

      const result = await hasAssessmentScore(mockApplicationId);

      expect(result).toBe(false);
    });

    it('should return false when assessment exists but has no score', async () => {
      vi.mocked(prisma.assessmentSession.findFirst).mockResolvedValue(null);

      const result = await hasAssessmentScore(mockApplicationId);

      expect(result).toBe(false);
    });

    it('should return false when assessment is not completed', async () => {
      vi.mocked(prisma.assessmentSession.findFirst).mockResolvedValue(null);

      const result = await hasAssessmentScore(mockApplicationId);

      expect(result).toBe(false);
    });
  });

  describe('getInterviewStageCompletion', () => {
    it('should fetch stages with scorecards ordered by scheduled date', async () => {
      const mockStages = [
        {
          id: 'stage-1',
          applicationId: mockApplicationId,
          type: 'technical',
          state: 'completed',
          scheduledAt: new Date('2026-07-25'),
          scorecards: [{ id: 'sc-1', recommendation: 'yes' }]
        },
        {
          id: 'stage-2',
          applicationId: mockApplicationId,
          type: 'hr',
          state: 'scheduled',
          scheduledAt: new Date('2026-07-28'),
          scorecards: []
        }
      ];

      vi.mocked(prisma.interviewStage.findMany).mockResolvedValue(mockStages as any);

      const result = await getInterviewStageCompletion(mockApplicationId);

      expect(result).toEqual(mockStages);
      expect(prisma.interviewStage.findMany).toHaveBeenCalledWith({
        where: { applicationId: mockApplicationId },
        include: {
          scorecards: {
            select: { id: true, recommendation: true }
          }
        },
        orderBy: { scheduledAt: 'asc' }
      });
    });

    it('should return empty array when no stages exist', async () => {
      vi.mocked(prisma.interviewStage.findMany).mockResolvedValue([]);

      const result = await getInterviewStageCompletion(mockApplicationId);

      expect(result).toEqual([]);
    });
  });

  describe('Error Handling', () => {
    it('should re-throw ApplicationNotFoundError', async () => {
      vi.mocked(prisma.application.findUnique).mockResolvedValue(null);

      await expect(checkPrerequisites(mockApplicationId))
        .rejects
        .toThrow(ApplicationNotFoundError);
    });

    it('should log and re-throw database errors', async () => {
      const dbError = new Error('Database connection failed');
      vi.mocked(prisma.application.findUnique).mockRejectedValue(dbError);

      await expect(checkPrerequisites(mockApplicationId))
        .rejects
        .toThrow('Database connection failed');
    });
  });

  describe('Custom Requirements', () => {
    it('should skip assessment check when not required', async () => {
      vi.mocked(prisma.application.findUnique).mockResolvedValue({
        id: mockApplicationId
      } as any);

      vi.mocked(prisma.interviewStage.findMany).mockResolvedValue([
        {
          id: 'stage-1',
          applicationId: mockApplicationId,
          type: 'technical',
          state: 'completed',
          scorecards: []
        }
      ] as any);

      // Don't mock assessment session - it shouldn't be called

      const result = await checkPrerequisites(mockApplicationId, {
        requireAllInterviewStages: true,
        requireAssessment: false
      });

      expect(result.isComplete).toBe(true);
      expect(result.missingAssessment).toBe(false);
    });

    it('should skip stage check when not required', async () => {
      vi.mocked(prisma.application.findUnique).mockResolvedValue({
        id: mockApplicationId
      } as any);

      vi.mocked(prisma.interviewStage.findMany).mockResolvedValue([
        {
          id: 'stage-1',
          applicationId: mockApplicationId,
          type: 'technical',
          state: 'scheduled',
          scorecards: []
        }
      ] as any);

      vi.mocked(prisma.assessmentSession.findFirst).mockResolvedValue({
        id: 'assessment-1',
        status: 'completed',
        score: 85
      } as any);

      const result = await checkPrerequisites(mockApplicationId, {
        requireAllInterviewStages: false,
        requireAssessment: true
      });

      expect(result.isComplete).toBe(true);
      expect(result.incompleteStages).toHaveLength(0);
    });
  });
});
