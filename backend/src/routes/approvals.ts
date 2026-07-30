/**
 * Approval API Routes
 * 
 * Endpoints:
 * - POST /api/approvals/respond - Process approval response via secure token
 * - GET /api/approvals/decision/:decisionId/status - View approval chain status
 * - GET /api/approvals/:approvalId - View individual approval details
 */

import express, { Request, Response } from 'express';
import { z } from 'zod';
import { verifyApprovalToken } from '../services/approvalTokenService';
import { processApprovalResponse, getApprovalStatus } from '../services/approvalOrchestrator';
import { authenticate } from '../middleware/authenticate';
import { authorize } from '../middleware/authorize';
import prisma from '../db/prisma';
import logger from '../utils/logger';

const router = express.Router();

/**
 * Approval response schema
 */
const ApprovalResponseSchema = z.object({
  token: z.string().min(1, 'Token is required'),
  comments: z.string().optional()
});

/**
 * POST /api/approvals/respond
 * Process approval or rejection via secure token
 * 
 * Public endpoint (token-based authentication)
 */
router.post(
  '/respond',
  async (req: Request, res: Response): Promise<void> => {
    try {
      // Validate request body
      const validatedData = ApprovalResponseSchema.parse(req.body);

      // Verify and decode token
      const decoded = verifyApprovalToken(validatedData.token);

      logger.info({
        approvalId: decoded.approvalId,
        action: decoded.action,
        approverId: decoded.approverId
      }, 'Processing approval response from token');

      // Process the approval response
      await processApprovalResponse({
        approvalId: decoded.approvalId,
        approverId: decoded.approverId,
        approved: decoded.action === 'approve',
        comments: validatedData.comments
      });

      res.status(200).json({
        success: true,
        message: decoded.action === 'approve' 
          ? 'Approval recorded successfully. The next approver has been notified.'
          : 'Rejection recorded successfully. The hiring manager has been notified.',
        data: {
          action: decoded.action,
          approvalId: decoded.approvalId
        }
      });
    } catch (error: any) {
      logger.error({ error: error.message }, 'Failed to process approval response');

      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request data',
            details: error.errors
          }
        });
        return;
      }

      if (error.message.includes('expired') || error.message.includes('Invalid')) {
        res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_TOKEN',
            message: error.message
          }
        });
        return;
      }

      if (error.message.includes('already processed')) {
        res.status(409).json({
          success: false,
          error: {
            code: 'ALREADY_PROCESSED',
            message: 'This approval has already been processed'
          }
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to process approval response'
        }
      });
    }
  }
);

/**
 * GET /api/approvals/decision/:decisionId/status
 * Get approval chain status for a decision
 * 
 * Requires authentication (hiring manager or admin)
 */
router.get(
  '/decision/:decisionId/status',
  authenticate,
  authorize(['hiring_manager', 'admin']),
  async (req: Request, res: Response): Promise<void> => {
    const { decisionId } = req.params;

    // Validate UUID
    if (!decisionId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(decisionId)) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid decision ID'
        }
      });
      return;
    }

    try {
      const status = await getApprovalStatus(decisionId);

      res.status(200).json({
        success: true,
        data: status
      });
    } catch (error: any) {
      logger.error({ error: error.message, decisionId }, 'Failed to get approval status');

      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to retrieve approval status'
        }
      });
    }
  }
);

/**
 * GET /api/approvals/:approvalId
 * Get individual approval details
 * 
 * Requires authentication
 */
router.get(
  '/:approvalId',
  authenticate,
  async (req: Request, res: Response): Promise<void> => {
    const { approvalId } = req.params;

    // Validate UUID
    if (!approvalId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(approvalId)) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid approval ID'
        }
      });
      return;
    }

    try {
      // Fetch approval details
      const approval = await prisma.approval.findUnique({
        where: { id: approvalId },
        include: {
          approver: {
            select: {
              id: true,
              fullName: true,
              email: true,
              role: true
            }
          },
          decision: {
            select: {
              id: true,
              outcome: true,
              applicationId: true
            }
          }
        }
      });

      if (!approval) {
        res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Approval not found'
          }
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: {
          approvalId: approval.id,
          tier: approval.tier,
          status: approval.status,
          approver: {
            id: approval.approver.id,
            name: approval.approver.fullName,
            email: approval.approver.email,
            role: approval.approver.role
          },
          comments: approval.comments,
          respondedAt: approval.respondedAt,
          createdAt: approval.createdAt,
          decision: {
            id: approval.decision.id,
            outcome: approval.decision.outcome,
            applicationId: approval.decision.applicationId
          }
        }
      });
    } catch (error: any) {
      logger.error({ error: error.message, approvalId }, 'Failed to get approval details');

      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to retrieve approval details'
        }
      });
    }
  }
);

export default router;
