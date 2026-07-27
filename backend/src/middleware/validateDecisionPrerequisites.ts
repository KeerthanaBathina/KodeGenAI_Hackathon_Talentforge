import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { 
  checkPrerequisites, 
  ApplicationNotFoundError 
} from '../services/prerequisiteValidationService';
import { auditEvent } from '../services/auditService';
import logger from '../utils/logger';

/**
 * Validation middleware for decision creation
 * 
 * Checks that all prerequisites (interview stages and assessment) are complete
 * before allowing a hiring decision to be made.
 * 
 * Returns HTTP 422 if prerequisites are incomplete with detailed breakdown.
 * Logs all validation failures for audit trail.
 */
export async function validateDecisionPrerequisites(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Extract and validate applicationId from request body
    const { applicationId } = req.body;

    if (!applicationId) {
      res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_APPLICATION_ID',
          message: 'Application ID is required'
        }
      });
      return;
    }

    // Validate UUID format
    const uuidSchema = z.string().uuid();
    const validationResult = uuidSchema.safeParse(applicationId);

    if (!validationResult.success) {
      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_APPLICATION_ID',
          message: 'Application ID must be a valid UUID'
        }
      });
      return;
    }

    logger.debug('Validating decision prerequisites', {
      applicationId,
      userId: req.user?.id
    });

    // Check prerequisites
    const result = await checkPrerequisites(applicationId);

    // If prerequisites are complete, proceed to next middleware
    if (result.isComplete) {
      logger.info('Decision prerequisites validated successfully', {
        applicationId,
        userId: req.user?.id
      });
      next();
      return;
    }

    // Prerequisites incomplete - log audit event
    await auditEvent({
      actorId: req.user?.id || null,
      eventType: 'DECISION_PREREQUISITE_FAILED',
      entityType: 'application',
      entityId: applicationId,
      payload: {
        incompleteStages: result.incompleteStages.map(stage => stage.type),
        missingAssessment: result.missingAssessment,
        attemptedAt: new Date().toISOString(),
        userRole: req.user?.role
      },
      ipAddress: req.ip || null,
      userAgent: req.get('user-agent') || null
    });

    logger.warn('Decision blocked: prerequisites incomplete', {
      applicationId,
      userId: req.user?.id,
      incompleteStages: result.incompleteStages.length,
      missingAssessment: result.missingAssessment
    });

    // Return 422 with detailed error
    res.status(422).json({
      success: false,
      error: {
        code: 'PREREQUISITES_INCOMPLETE',
        message: `Cannot create decision: ${result.message}`,
        details: {
          incompleteStages: result.incompleteStages.map(stage => ({
            id: stage.id,
            type: stage.type,
            state: stage.state,
            scheduledDate: stage.scheduledDate,
            hasScorecards: stage.hasScorecards
          })),
          missingAssessment: result.missingAssessment
        }
      }
    });

  } catch (error) {
    // Handle application not found
    if (error instanceof ApplicationNotFoundError) {
      logger.warn('Decision validation failed: application not found', {
        applicationId: req.body?.applicationId,
        userId: req.user?.id
      });

      res.status(404).json({
        success: false,
        error: {
          code: 'APPLICATION_NOT_FOUND',
          message: 'Application not found'
        }
      });
      return;
    }

    // Handle unexpected errors
    logger.error({ err: error, applicationId: req.body?.applicationId }, 
      'Decision prerequisite validation error');

    res.status(500).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Failed to validate decision prerequisites'
      }
    });
  }
}
