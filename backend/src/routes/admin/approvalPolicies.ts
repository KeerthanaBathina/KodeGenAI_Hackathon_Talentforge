/**
 * Admin Approval Policies Management Routes
 *
 * REST API endpoints for managing approval policies with compensation band versioning.
 * All routes require admin authentication.
 *
 * @module routes/admin/approvalPolicies
 */

import express, { Request, Response, NextFunction } from 'express';
import { Decimal } from '@prisma/client/runtime/library';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { prisma } from '../../db/prisma';
import {
  createApprovalPolicyVersion,
  getApprovalPolicy,
  getApprovalPolicyHistory,
  listActivePolicies,
  validateApprovalPolicy,
} from '../../services/approvalPolicyService';
import type { ApprovalTier } from '../../services/approvalPolicyService';
import {
  PolicyValidationError,
  PolicyNotFoundError,
  InvalidCompensationBandError,
  InvalidApproverError,
} from '../../services/errors/PolicyErrors';
import logger from '../../utils/logger';

const router = express.Router();

// All routes require authentication and admin role
router.use(authenticate);
router.use(authorize(['admin']));

// ============================================================================
// GET /api/admin/approval-policies
// ============================================================================

router.get('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const active = req.query.active === 'true';
    const compensationAmount = req.query.compensationAmount
      ? new Decimal(req.query.compensationAmount as string)
      : undefined;

    if (compensationAmount) {
      // Find policy for specific compensation
      try {
        const policy = await getApprovalPolicy(compensationAmount);

        res.set('Cache-Control', 'no-cache, no-store, must-revalidate');

        res.json({
          policies: [
            {
              id: policy.policyId,
              compensationBandMin: policy.compensationBandMin.toString(),
              compensationBandMax: policy.compensationBandMax.toString(),
              requiredApprovers: policy.requiredApprovers,
              effectiveFrom: policy.effectiveFrom?.toISOString(),
            },
          ],
          total: 1,
        });
      } catch (error) {
        if (error instanceof PolicyNotFoundError) {
          res.status(404).json({
            error: {
              code: 'NOT_FOUND',
              message: `No approval policy found for compensation amount ${compensationAmount}`,
            },
          });
        } else {
          throw error;
        }
      }
      return;
    }

    // List all active policies
    const policies = await listActivePolicies();

    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');

    res.json({
      policies: policies.map((p) => ({
        id: p.policyId,
        compensationBandMin: p.compensationBandMin.toString(),
        compensationBandMax: p.compensationBandMax.toString(),
        requiredApprovers: p.requiredApprovers,
        effectiveFrom: p.effectiveFrom?.toISOString(),
      })),
      total: policies.length,
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// GET /api/admin/approval-policies/history
// ============================================================================

router.get('/history', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const compensationBandMin = req.query.compensationBandMin
      ? new Decimal(req.query.compensationBandMin as string)
      : undefined;
    const compensationBandMax = req.query.compensationBandMax
      ? new Decimal(req.query.compensationBandMax as string)
      : undefined;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);

    const policies = await getApprovalPolicyHistory({
      compensationBandMin,
      compensationBandMax,
      limit,
    });

    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');

    res.json({
      policies: policies.map((p) => ({
        id: p.policyId,
        compensationBandMin: p.compensationBandMin.toString(),
        compensationBandMax: p.compensationBandMax.toString(),
        requiredApprovers: p.requiredApprovers,
        effectiveFrom: p.effectiveFrom?.toISOString(),
      })),
      total: policies.length,
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// POST /api/admin/approval-policies
// ============================================================================

router.post('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const {
      compensationBandMin,
      compensationBandMax,
      requiredApprovers,
      effectiveFrom,
    } = req.body;

    const errors: string[] = [];

    // Validate required fields
    if (
      compensationBandMin === undefined ||
      compensationBandMax === undefined ||
      !requiredApprovers ||
      !effectiveFrom
    ) {
      errors.push(
        'Missing required fields: compensationBandMin, compensationBandMax, requiredApprovers, effectiveFrom',
      );
    }

    // Validate effectiveFrom is not in the past
    if (effectiveFrom) {
      const requestedDate = new Date(effectiveFrom);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (requestedDate < today) {
        errors.push('effectiveFrom cannot be in the past (must be today or later)');
      }
    }

    // Validate approvers
    if (Array.isArray(requiredApprovers)) {
      const tiers = new Set<number>();

      for (const approver of requiredApprovers) {
        if (!approver.tier || !approver.approverId) {
          errors.push('Each approver must have tier and approverId');
          break;
        }

        if (tiers.has(approver.tier)) {
          errors.push(`Duplicate tier: ${approver.tier}`);
        }
        tiers.add(approver.tier);
      }

      // Check for sequential tiers
      if (tiers.size > 0) {
        const sortedTiers = Array.from(tiers).sort((a, b) => a - b);
        for (let i = 0; i < sortedTiers.length; i++) {
          if (sortedTiers[i] !== i + 1) {
            errors.push('Tiers must start at 1 and be sequential');
            break;
          }
        }
      }
    }

    if (errors.length > 0) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid policy values',
          details: errors,
        },
      });
      return;
    }

    const policy = await createApprovalPolicyVersion(
      {
        compensationBandMin: new Decimal(compensationBandMin),
        compensationBandMax: new Decimal(compensationBandMax),
        requiredApprovers: requiredApprovers as ApprovalTier[],
        effectiveFrom: new Date(effectiveFrom),
      },
      req.user!.id,
    );

    logger.info(
      {
        policyId: policy.policyId,
        compensationBand: `${compensationBandMin}-${compensationBandMax}`,
        approversCount: requiredApprovers.length,
        actorId: req.user!.id,
      },
      'Approval policy version created via API',
    );

    res.status(201).json({
      id: policy.policyId,
      compensationBandMin: policy.compensationBandMin.toString(),
      compensationBandMax: policy.compensationBandMax.toString(),
      requiredApprovers: policy.requiredApprovers,
      effectiveFrom: policy.effectiveFrom?.toISOString(),
    });
  } catch (error) {
    if (error instanceof InvalidCompensationBandError) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: error.message,
          details: error.errors,
        },
      });
      return;
    }

    if (error instanceof InvalidApproverError) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: error.message,
          details: error.errors,
        },
      });
      return;
    }

    if (error instanceof PolicyValidationError) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: error.message,
          details: error.errors,
        },
      });
      return;
    }

    if (error instanceof PolicyNotFoundError) {
      res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: error.message,
        },
      });
      return;
    }

    next(error);
  }
});

// ============================================================================
// PATCH /api/admin/approval-policies/:id/deactivate
// ============================================================================

router.patch(
  '/:id/deactivate',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;

      const policy = await prisma.approvalPolicy.findUnique({
        where: { id },
      });

      if (!policy) {
        res.status(404).json({
          error: {
            code: 'NOT_FOUND',
            message: 'Policy not found',
            resourceType: 'ApprovalPolicy',
            resourceId: id,
          },
        });
        return;
      }

      const updated = await prisma.approvalPolicy.update({
        where: { id },
        data: { active: false },
      });

      logger.info(
        {
          policyId: id,
          actorId: req.user!.id,
        },
        'Approval policy deactivated via API',
      );

      res.set('Cache-Control', 'no-cache, no-store, must-revalidate');

      res.json({
        id: updated.id,
        compensationBandMin: updated.compensationBandMin.toString(),
        compensationBandMax: updated.compensationBandMax.toString(),
        requiredApprovers: updated.requiredApprovers,
        active: updated.active,
        effectiveFrom: updated.effectiveFrom.toISOString(),
      });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
