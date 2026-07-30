import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  verifyApprovalToken: vi.fn(),
  processApprovalResponse: vi.fn(),
  getApprovalStatus: vi.fn(),
  prismaApprovalFindUnique: vi.fn(),
  authenticate: vi.fn((req, res, next) => {
    req.user = { id: 'user-123', role: 'hiring_manager' };
    next();
  }),
  authorize: vi.fn(() => (req: any, res: any, next: any) => next())
}));

vi.mock('../../services/approvalTokenService', () => ({
  verifyApprovalToken: mocks.verifyApprovalToken
}));

vi.mock('../../services/approvalOrchestrator', () => ({
  processApprovalResponse: mocks.processApprovalResponse,
  getApprovalStatus: mocks.getApprovalStatus
}));

vi.mock('../../db/prisma', () => ({
  default: {
    approval: {
      findUnique: mocks.prismaApprovalFindUnique
    }
  }
}));

vi.mock('../../middleware/authenticate', () => ({
  authenticate: mocks.authenticate
}));

vi.mock('../../middleware/authorize', () => ({
  authorize: mocks.authorize
}));

vi.mock('../../utils/logger', () => ({
  default: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn()
  }
}));

import approvalsRouter from '../approvals';

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/approvals', approvalsRouter);
  return app;
}

describe('approval routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /api/approvals/respond', () => {
    it('should process approval with valid token', async () => {
      const app = createTestApp();

      mocks.verifyApprovalToken.mockReturnValue({
        approvalId: 'approval-123',
        approverId: 'user-vp',
        action: 'approve',
        iat: Date.now(),
        exp: Date.now() + 72 * 60 * 60 * 1000
      });

      mocks.processApprovalResponse.mockResolvedValue(undefined);

      const response = await request(app)
        .post('/api/approvals/respond')
        .send({ token: 'valid-token' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('Approval recorded successfully');
      expect(response.body.data.action).toBe('approve');
    });

    it('should process rejection with valid token', async () => {
      const app = createTestApp();

      mocks.verifyApprovalToken.mockReturnValue({
        approvalId: 'approval-123',
        approverId: 'user-vp',
        action: 'reject',
        iat: Date.now(),
        exp: Date.now() + 72 * 60 * 60 * 1000
      });

      mocks.processApprovalResponse.mockResolvedValue(undefined);

      const response = await request(app)
        .post('/api/approvals/respond')
        .send({ token: 'valid-token', comments: 'Too high compensation' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('Rejection recorded successfully');
      expect(response.body.data.action).toBe('reject');
    });

    it('should return 400 for expired token', async () => {
      const app = createTestApp();

      mocks.verifyApprovalToken.mockImplementation(() => {
        throw new Error('Approval link has expired. Please request a new approval email.');
      });

      const response = await request(app)
        .post('/api/approvals/respond')
        .send({ token: 'expired-token' });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('INVALID_TOKEN');
    });

    it('should return 409 for already processed approval', async () => {
      const app = createTestApp();

      mocks.verifyApprovalToken.mockReturnValue({
        approvalId: 'approval-123',
        approverId: 'user-vp',
        action: 'approve',
        iat: Date.now(),
        exp: Date.now() + 72 * 60 * 60 * 1000
      });

      mocks.processApprovalResponse.mockRejectedValue(
        new Error('Approval already processed')
      );

      const response = await request(app)
        .post('/api/approvals/respond')
        .send({ token: 'valid-token' });

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('ALREADY_PROCESSED');
    });

    it('should return 400 for missing token', async () => {
      const app = createTestApp();

      const response = await request(app)
        .post('/api/approvals/respond')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /api/approvals/decision/:decisionId/status', () => {
    it('should return approval status for valid decision', async () => {
      const app = createTestApp();

      mocks.getApprovalStatus.mockResolvedValue({
        decisionId: 'decision-123',
        totalTiers: 2,
        approvals: [
          {
            approvalId: 'approval-1',
            tier: 'tier_1',
            status: 'approved',
            approver: {
              id: 'user-vp',
              name: 'VP Engineering',
              email: 'vp@company.com',
              role: 'vp_engineering'
            },
            comments: null,
            respondedAt: new Date(),
            createdAt: new Date()
          }
        ]
      });

      const response = await request(app)
        .get('/api/approvals/decision/550e8400-e29b-41d4-a716-446655440000/status');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.totalTiers).toBe(2);
    });

    it('should return 400 for invalid decision ID', async () => {
      const app = createTestApp();

      const response = await request(app)
        .get('/api/approvals/decision/invalid-uuid/status');

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /api/approvals/:approvalId', () => {
    it('should return approval details for valid approval', async () => {
      const app = createTestApp();

      mocks.prismaApprovalFindUnique.mockResolvedValue({
        id: 'approval-123',
        tier: 'tier_1',
        status: 'approved',
        comments: 'Looks good',
        respondedAt: new Date(),
        createdAt: new Date(),
        approver: {
          id: 'user-vp',
          fullName: 'VP Engineering',
          email: 'vp@company.com',
          role: 'vp_engineering'
        },
        decision: {
          id: 'decision-123',
          outcome: 'offer',
          applicationId: 'app-456'
        }
      });

      const response = await request(app)
        .get('/api/approvals/550e8400-e29b-41d4-a716-446655440000');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.approvalId).toBe('approval-123');
    });

    it('should return 404 for nonexistent approval', async () => {
      const app = createTestApp();

      mocks.prismaApprovalFindUnique.mockResolvedValue(null);

      const response = await request(app)
        .get('/api/approvals/550e8400-e29b-41d4-a716-446655440000');

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('NOT_FOUND');
    });

    it('should return 400 for invalid approval ID', async () => {
      const app = createTestApp();

      const response = await request(app)
        .get('/api/approvals/invalid-uuid');

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });
});
