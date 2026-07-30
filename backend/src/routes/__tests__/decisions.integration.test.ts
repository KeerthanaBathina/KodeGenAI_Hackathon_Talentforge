/**
 * Integration Tests for Decision API with Prerequisite Validation
 * 
 * Tests the complete flow of decision creation with prerequisite checks:
 * - Prerequisites incomplete (HTTP 422)
 * - Prerequisites complete (HTTP 201)
 * - Audit logging
 * - Error handling
 */

import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  checkPrerequisites: vi.fn(),
  ApplicationNotFoundError: class ApplicationNotFoundError extends Error {
    constructor(applicationId: string) {
      super(`Application not found: ${applicationId}`);
      this.name = 'ApplicationNotFoundError';
    }
  },
  prismaDecisionFindUnique: vi.fn(),
  prismaDecisionCreate: vi.fn(),
  prismaApplicationFindUnique: vi.fn(),
  auditEvent: vi.fn()
}));

// Mock prerequisite validation service
vi.mock('../../services/prerequisiteValidationService', () => ({
  checkPrerequisites: mocks.checkPrerequisites,
  ApplicationNotFoundError: mocks.ApplicationNotFoundError
}));

// Mock authentication middleware
vi.mock('../../middleware/authenticate', () => ({
  authenticate: (req: any, _res: any, next: any) => {
    req.user = {
      id: 'user-hiring-manager-1',
      email: 'hm@example.com',
      role: (req.headers['x-test-role'] as string) || 'hiring_manager'
    };
    next();
  }
}));

// Mock authorization middleware
vi.mock('../../middleware/authorize', () => ({
  authorize: (allowedRoles: string[]) => (req: any, res: any, next: any) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'You do not have permission to access this resource'
        }
      });
      return;
    }
    next();
  }
}));

// Mock Prisma
vi.mock('../../db/prisma', () => ({
  default: {
    decision: {
      findUnique: mocks.prismaDecisionFindUnique,
      create: mocks.prismaDecisionCreate
    },
    application: {
      findUnique: mocks.prismaApplicationFindUnique
    }
  }
}));

// Mock audit service
vi.mock('../../services/auditService', () => ({
  auditEvent: mocks.auditEvent
}));

// Mock logger
vi.mock('../../utils/logger', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

import decisionsRouter from '../decisions';

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/decisions', decisionsRouter);
  return app;
}

describe('Decision API - Prerequisite Validation Integration', () => {
  const mockApplicationId = '550e8400-e29b-41d4-a716-446655440000';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /api/decisions - Prerequisites Incomplete', () => {
    it('should return HTTP 422 when interview stages are incomplete', async () => {
      // Mock incomplete prerequisites
      mocks.checkPrerequisites.mockResolvedValue({
        isComplete: false,
        incompleteStages: [
          {
            id: 'stage-1',
            type: 'technical',
            state: 'scheduled',
            scheduledDate: new Date('2026-07-28T10:00:00Z'),
            hasScorecards: false
          }
        ],
        missingAssessment: false,
        message: 'Missing: Technical Interview (scheduled)'
      });

      const app = createTestApp();
      const response = await request(app)
        .post('/api/decisions')
        .send({
          applicationId: mockApplicationId,
          outcome: 'offer',
          justification: 'Strong candidate with excellent technical skills and cultural fit'
        });

      expect(response.status).toBe(422);
      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'PREREQUISITES_INCOMPLETE',
          message: expect.stringContaining('Technical Interview (scheduled)'),
          details: {
            incompleteStages: [
              {
                id: 'stage-1',
                type: 'technical',
                state: 'scheduled',
                hasScorecards: false
              }
            ],
            missingAssessment: false
          }
        }
      });

      // Verify audit event was logged
      expect(mocks.auditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'DECISION_PREREQUISITE_FAILED',
          entityType: 'application',
          entityId: mockApplicationId,
          payload: expect.objectContaining({
            incompleteStages: ['technical'],
            missingAssessment: false
          })
        })
      );
    });

    it('should return HTTP 422 when assessment is missing', async () => {
      mocks.checkPrerequisites.mockResolvedValue({
        isComplete: false,
        incompleteStages: [],
        missingAssessment: true,
        message: 'Missing: Assessment Score'
      });

      const app = createTestApp();
      const response = await request(app)
        .post('/api/decisions')
        .send({
          applicationId: mockApplicationId,
          outcome: 'offer',
          justification: 'Strong candidate with excellent technical skills'
        });

      expect(response.status).toBe(422);
      expect(response.body.error.code).toBe('PREREQUISITES_INCOMPLETE');
      expect(response.body.error.details.missingAssessment).toBe(true);
      expect(response.body.error.message).toContain('Assessment Score');
    });

    it('should return HTTP 422 with multiple incomplete items', async () => {
      mocks.checkPrerequisites.mockResolvedValue({
        isComplete: false,
        incompleteStages: [
          {
            id: 'stage-1',
            type: 'technical',
            state: 'scheduled',
            scheduledDate: new Date('2026-07-28T10:00:00Z'),
            hasScorecards: false
          },
          {
            id: 'stage-2',
            type: 'hr',
            state: 'scheduled',
            scheduledDate: new Date('2026-07-29T14:00:00Z'),
            hasScorecards: false
          }
        ],
        missingAssessment: true,
        message: 'Missing: Technical Interview (scheduled), Hr Interview (scheduled), Assessment Score'
      });

      const app = createTestApp();
      const response = await request(app)
        .post('/api/decisions')
        .send({
          applicationId: mockApplicationId,
          outcome: 'offer',
          justification: 'Strong candidate with excellent skills'
        });

      expect(response.status).toBe(422);
      expect(response.body.error.details.incompleteStages).toHaveLength(2);
      expect(response.body.error.details.missingAssessment).toBe(true);
    });
  });

  describe('POST /api/decisions - Prerequisites Complete', () => {
    it('should create decision when all prerequisites are complete', async () => {
      // Mock complete prerequisites
      mocks.checkPrerequisites.mockResolvedValue({
        isComplete: true,
        incompleteStages: [],
        missingAssessment: false,
        message: 'All prerequisites complete'
      });

      // Mock no existing decision
      mocks.prismaDecisionFindUnique.mockResolvedValue(null);

      // Mock application exists
      mocks.prismaApplicationFindUnique.mockResolvedValue({
        id: mockApplicationId,
        requisitionId: 'req-1',
        candidateId: 'cand-1'
      });

      // Mock decision creation
      const mockDecision = {
        id: 'decision-1',
        applicationId: mockApplicationId,
        outcome: 'offer',
        reasonCodeId: null,
        compensationBand: '100k-120k',
        decidedAt: new Date('2026-07-27T15:00:00Z'),
        decidedById: 'user-hiring-manager-1'
      };
      mocks.prismaDecisionCreate.mockResolvedValue(mockDecision);

      const app = createTestApp();
      const response = await request(app)
        .post('/api/decisions')
        .send({
          applicationId: mockApplicationId,
          outcome: 'offer',
          justification: 'Strong candidate with excellent technical skills and cultural fit',
          compensationBand: '100k-120k'
        });

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        success: true,
        data: {
          id: 'decision-1',
          applicationId: mockApplicationId,
          outcome: 'offer',
          compensationBand: '100k-120k'
        }
      });

      // Verify decision was created
      expect(mocks.prismaDecisionCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          applicationId: mockApplicationId,
          outcome: 'offer',
          compensationBand: '100k-120k',
          decidedById: 'user-hiring-manager-1'
        }),
        select: expect.any(Object)
      });

      // Verify audit event was logged
      expect(mocks.auditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'decision.application_decision',
          entityType: 'application',
          entityId: mockApplicationId,
          payload: expect.objectContaining({
            decisionId: 'decision-1',
            applicationId: mockApplicationId,
            outcome: 'offer',
            reason_code_id: null,
            outcomeEventType: 'decision.shortlist'
          })
        })
      );
    });

    it('should create reject decision when prerequisites complete', async () => {
      mocks.checkPrerequisites.mockResolvedValue({
        isComplete: true,
        incompleteStages: [],
        missingAssessment: false,
        message: 'All prerequisites complete'
      });

      mocks.prismaDecisionFindUnique.mockResolvedValue(null);
      mocks.prismaApplicationFindUnique.mockResolvedValue({
        id: mockApplicationId,
        requisitionId: 'req-1',
        candidateId: 'cand-1'
      });

      const mockDecision = {
        id: 'decision-2',
        applicationId: mockApplicationId,
        outcome: 'reject',
        reasonCodeId: '650e8400-e29b-41d4-a716-446655440001',
        compensationBand: null,
        decidedAt: new Date('2026-07-27T15:00:00Z'),
        decidedById: 'user-hiring-manager-1'
      };
      mocks.prismaDecisionCreate.mockResolvedValue(mockDecision);

      const app = createTestApp();
      const response = await request(app)
        .post('/api/decisions')
        .send({
          applicationId: mockApplicationId,
          outcome: 'reject',
          reasonCodeId: '650e8400-e29b-41d4-a716-446655440001',
          justification: 'Does not meet technical requirements for the role'
        });

      expect(response.status).toBe(201);
      expect(response.body.data.outcome).toBe('reject');
    });
  });

  describe('Error Handling', () => {
    it('should return HTTP 404 when application does not exist', async () => {
      mocks.checkPrerequisites.mockRejectedValue(
        new mocks.ApplicationNotFoundError(mockApplicationId)
      );

      const app = createTestApp();
      const response = await request(app)
        .post('/api/decisions')
        .send({
          applicationId: mockApplicationId,
          outcome: 'offer',
          justification: 'Strong candidate'
        });

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('APPLICATION_NOT_FOUND');
    });

    it('should return HTTP 400 for invalid application ID format', async () => {
      const app = createTestApp();
      const response = await request(app)
        .post('/api/decisions')
        .send({
          applicationId: 'not-a-uuid',
          outcome: 'offer',
          justification: 'Strong candidate'
        });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('INVALID_APPLICATION_ID');
    });

    it('should return HTTP 400 when application ID is missing', async () => {
      const app = createTestApp();
      const response = await request(app)
        .post('/api/decisions')
        .send({
          outcome: 'offer',
          justification: 'Strong candidate'
        });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('MISSING_APPLICATION_ID');
    });

    it('should return HTTP 409 when decision already exists', async () => {
      mocks.checkPrerequisites.mockResolvedValue({
        isComplete: true,
        incompleteStages: [],
        missingAssessment: false,
        message: 'All prerequisites complete'
      });

      // Mock existing decision
      mocks.prismaDecisionFindUnique.mockResolvedValue({
        id: 'existing-decision',
        applicationId: mockApplicationId,
        outcome: 'offer'
      });

      const app = createTestApp();
      const response = await request(app)
        .post('/api/decisions')
        .send({
          applicationId: mockApplicationId,
          outcome: 'offer',
          justification: 'Strong candidate with excellent technical skills and cultural fit'
        });

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('DECISION_EXISTS');
    });

    it('should return HTTP 400 for invalid justification length', async () => {
      const app = createTestApp();
      const response = await request(app)
        .post('/api/decisions')
        .send({
          applicationId: mockApplicationId,
          outcome: 'offer',
          justification: 'Too short'
        });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('Authorization', () => {
    it('should return HTTP 403 for non-hiring-manager roles', async () => {
      const app = createTestApp();
      const response = await request(app)
        .post('/api/decisions')
        .set('x-test-role', 'candidate')
        .send({
          applicationId: mockApplicationId,
          outcome: 'offer',
          justification: 'Strong candidate with excellent skills'
        });

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('FORBIDDEN');
    });

    it('should allow admin role to create decisions', async () => {
      mocks.checkPrerequisites.mockResolvedValue({
        isComplete: true,
        incompleteStages: [],
        missingAssessment: false,
        message: 'All prerequisites complete'
      });

      mocks.prismaDecisionFindUnique.mockResolvedValue(null);
      mocks.prismaApplicationFindUnique.mockResolvedValue({
        id: mockApplicationId,
        requisitionId: 'req-1',
        candidateId: 'cand-1'
      });

      const mockDecision = {
        id: 'decision-3',
        applicationId: mockApplicationId,
        outcome: 'offer',
        reasonCodeId: null,
        compensationBand: null,
        decidedAt: new Date(),
        decidedById: 'user-admin-1'
      };
      mocks.prismaDecisionCreate.mockResolvedValue(mockDecision);

      const app = createTestApp();
      const response = await request(app)
        .post('/api/decisions')
        .set('x-test-role', 'admin')
        .send({
          applicationId: mockApplicationId,
          outcome: 'offer',
          justification: 'Strong candidate with excellent technical skills'
        });

      expect(response.status).toBe(201);
    });
  });
});
