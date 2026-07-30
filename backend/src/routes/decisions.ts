/**
 * Decision API Routes
 * 
 * Endpoints:
 * - POST /api/decisions - Create a hiring decision
 */

import express from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/authenticate';
import { authorize } from '../middleware/authorize';
import { validateDecisionPrerequisites } from '../middleware/validateDecisionPrerequisites';
import prisma from '../db/prisma';
import logger from '../utils/logger';
import { auditEvent } from '../services/auditService';
import { validateReasonCode } from '../services/reasonCodeService';
import { processDecisionOutcome, getOutcomeMessage } from '../services/decisionOutcomeProcessor';
import { buildAuditContextFromRequest } from '../services/auditContextService';
import { AUDIT_EVENT_TYPES } from '../constants/auditEventTypes';

const router = express.Router();

// Apply authentication to all routes
router.use(authenticate);

/**
 * Decision creation schema
 */
const CreateDecisionSchema = z.object({
  applicationId: z.string().uuid('Application ID must be a valid UUID'),
  outcome: z.enum(['offer', 'reject', 'hold', 'withdraw'], {
    errorMap: () => ({ message: 'Outcome must be offer, reject, hold, or withdraw' })
  }),
  reasonCodeId: z.string().uuid('Reason code must be a valid UUID'),
  justification: z.string()
    .min(20, 'Justification must be at least 20 characters')
    .max(2000, 'Justification must be 2000 characters or fewer'),
  compensationBand: z.string().max(50).optional(),
  offerDetails: z.record(z.unknown()).optional()
});

function toDecisionOutcomeEventType(outcome: 'offer' | 'reject' | 'hold' | 'withdraw'): string {
  switch (outcome) {
    case 'offer':
      return AUDIT_EVENT_TYPES.DECISION_SHORTLIST;
    case 'reject':
      return AUDIT_EVENT_TYPES.DECISION_REJECT;
    case 'hold':
      return AUDIT_EVENT_TYPES.DECISION_HOLD;
    case 'withdraw':
      return AUDIT_EVENT_TYPES.DECISION_WITHDRAW;
  }
}

/**
 * POST /api/decisions
 * 
 * Create a hiring decision for an application
 * 
 * Requires:
 * - Authentication
 * - hiring_manager or admin role
 * - All prerequisites complete (validated by middleware)
 */
router.post(
  '/',
  authorize(['hiring_manager', 'admin']),
  validateDecisionPrerequisites,
  async (req, res) => {
    try {
      const auditContext = buildAuditContextFromRequest(req);

      // Validate request body
      const validatedData = CreateDecisionSchema.parse(req.body);

      logger.info('Creating decision', {
        applicationId: validatedData.applicationId,
        outcome: validatedData.outcome,
        userId: req.user?.id
      });

      // Check if decision already exists for this application
      const existingDecision = await prisma.decision.findUnique({
        where: { applicationId: validatedData.applicationId }
      });

      if (existingDecision) {
        res.status(409).json({
          success: false,
          error: {
            code: 'DECISION_EXISTS',
            message: 'A decision has already been made for this application'
          }
        });
        return;
      }

      // Verify application exists
      const application = await prisma.application.findUnique({
        where: { id: validatedData.applicationId },
        select: { id: true, requisitionId: true, candidateId: true }
      });

      if (!application) {
        res.status(404).json({
          success: false,
          error: {
            code: 'APPLICATION_NOT_FOUND',
            message: 'Application not found'
          }
        });
        return;
      }

      // Validate reason code matches outcome category
      const expectedCategory = `${validatedData.outcome}_decision` as const;
      const reasonCodeValidation = await validateReasonCode(
        validatedData.reasonCodeId,
        expectedCategory
      );

      if (!reasonCodeValidation.valid) {
        res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_REASON_CODE',
            message: reasonCodeValidation.error || 'Reason code is invalid for this outcome'
          }
        });
        return;
      }

      // Create decision
      const decision = await prisma.decision.create({
        data: {
          applicationId: validatedData.applicationId,
          outcome: validatedData.outcome,
          reasonCodeId: validatedData.reasonCodeId,
          compensationBand: validatedData.compensationBand || null,
          offerDetails: validatedData.offerDetails || null,
          decidedById: req.user!.id,
          decidedAt: new Date()
        },
        select: {
          id: true,
          applicationId: true,
          outcome: true,
          reasonCodeId: true,
          compensationBand: true,
          decidedAt: true,
          decidedById: true
        }
      });

      // Log audit event
      await auditEvent({
        actorId: auditContext.actorId,
        actorRole: auditContext.actorRole,
        eventType: AUDIT_EVENT_TYPES.DECISION_APPLICATION_DECISION,
        entityType: 'application',
        entityId: validatedData.applicationId,
        payload: {
          decisionId: decision.id,
          applicationId: validatedData.applicationId,
          outcome: validatedData.outcome,
          outcomeEventType: toDecisionOutcomeEventType(validatedData.outcome),
          reasonCodeId: validatedData.reasonCodeId,
          reason_code_id: validatedData.reasonCodeId,
          requisitionId: application.requisitionId,
          candidateId: application.candidateId,
          hasCompensation: !!validatedData.compensationBand,
          hasOfferDetails: !!validatedData.offerDetails,
          justificationLength: validatedData.justification.length
        },
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent
      });

      // Process decision outcome asynchronously
      processDecisionOutcome({
        decisionId: decision.id,
        applicationId: validatedData.applicationId,
        outcome: validatedData.outcome,
        reasonCodeId: validatedData.reasonCodeId,
        justification: validatedData.justification,
        decidedBy: req.user!.id,
        actorRole: auditContext.actorRole,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent
      }).catch((error) => {
        logger.error('Failed to process decision outcome', {
          decisionId: decision.id,
          outcome: validatedData.outcome,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        // Don't fail the request if outcome processing fails
      });

      logger.info('Decision created successfully', {
        decisionId: decision.id,
        applicationId: validatedData.applicationId,
        outcome: validatedData.outcome
      });

      res.status(201).json({
        success: true,
        data: decision,
        message: getOutcomeMessage(validatedData.outcome)
      });

    } catch (error) {
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

      logger.error({ err: error }, 'Failed to create decision');

      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to create decision'
        }
      });
    }
  }
);

export default router;
