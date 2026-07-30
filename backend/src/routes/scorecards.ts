import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/authenticate';
import { authorize } from '../middleware/authorize';
import {
    createDraftScorecard,
    getScorecardById,
    updateScorecardDimensions,
    validateScorecardComplete,
    getRubricTemplateForStageType,
    canViewScorecard,
    canUpdateScorecard,
    submitScorecard,
} from '../services/scorecardService';
import { InterviewRecommendation } from '@prisma/client';
import logger from '../utils/logger';
import { prisma } from '../db/prisma';
import { auditEvent } from '../services/auditService';

const router = Router();

/**
 * POST /api/scorecards
 * Create a new draft scorecard for an interview stage
 */
const CreateScorecardSchema = z.object({
    interviewStageId: z.string().uuid(),
});

router.post('/', authenticate, async (req, res) => {
    try {
        const body = CreateScorecardSchema.parse(req.body);
        const userId = req.user!.id;

        // Verify the interview stage exists
        const interviewStage = await prisma.interviewStage.findUnique({
            where: { id: body.interviewStageId },
            select: {
                id: true,
                panelMembers: true,
                type: true,
            },
        });

        if (!interviewStage) {
            res.status(404).json({ error: 'Interview stage not found' });
            return;
        }

        // Verify the user is an assigned panelist for this interview
        if (!interviewStage.panelMembers.includes(userId)) {
            res.status(403).json({
                error: 'Forbidden',
                message: 'You are not assigned as a panelist for this interview',
            });
            return;
        }

        // Create draft scorecard
        const scorecard = await createDraftScorecard({
            interviewStageId: body.interviewStageId,
            interviewerId: userId,
        });

        logger.info(
            {
                scorecardId: scorecard.id,
                interviewStageId: body.interviewStageId,
                interviewerId: userId,
            },
            '[scorecards] Draft scorecard created'
        );

        res.status(201).json(scorecard);
    } catch (error) {
        if (error instanceof z.ZodError) {
            res.status(400).json({
                error: 'Invalid request body',
                details: error.issues,
            });
            return;
        }

        if (error instanceof Error) {
            if (error.message.includes('not found')) {
                res.status(404).json({ error: error.message });
                return;
            }
            if (error.message.includes('No rubric template')) {
                res.status(400).json({ error: error.message });
                return;
            }
        }

        logger.error({ error }, 'Failed to create scorecard');
        res.status(500).json({ error: 'Failed to create scorecard' });
    }
});

/**
 * GET /api/scorecards/:scorecardId
 * Retrieve a scorecard with all dimensions
 */
router.get('/:scorecardId', authenticate, async (req, res) => {
    try {
        const { scorecardId } = req.params;
        if (!scorecardId) {
            res.status(400).json({ error: 'Scorecard ID is required' });
            return;
        }

        const userId = req.user!.id;

        // Check authorization
        const authorized = await canViewScorecard(userId, scorecardId);
        if (!authorized) {
            res.status(403).json({
                error: 'Forbidden',
                message: 'You do not have permission to view this scorecard',
            });
            return;
        }

        const scorecard = await getScorecardById(scorecardId);

        if (!scorecard) {
            res.status(404).json({ error: 'Scorecard not found' });
            return;
        }

        res.status(200).json(scorecard);
    } catch (error) {
        logger.error({ error, scorecardId: req.params.scorecardId }, 'Failed to retrieve scorecard');
        res.status(500).json({ error: 'Failed to retrieve scorecard' });
    }
});

/**
 * PATCH /api/scorecards/:scorecardId
 * Update scorecard dimensions (partial save)
 */
const UpdateScorecardSchema = z.object({
    dimensions: z
        .array(
            z.object({
                dimensionName: z.string().min(1).max(100),
                score: z.number().int().min(1).max(5),
                notes: z.string().optional(),
            })
        )
        .min(1),
    recommendation: z.enum(['advance', 'hold', 'reject']).optional(),
});

router.patch('/:scorecardId', authenticate, async (req, res) => {
    try {
        const { scorecardId } = req.params;
        if (!scorecardId) {
            res.status(400).json({ error: 'Scorecard ID is required' });
            return;
        }

        const userId = req.user!.id;
        const body = UpdateScorecardSchema.parse(req.body);

        // Check authorization
        const authorized = await canUpdateScorecard(userId, scorecardId);
        if (!authorized) {
            res.status(403).json({
                error: 'Forbidden',
                message: 'You do not have permission to update this scorecard, or it has already been submitted',
            });
            return;
        }

        // Map string to enum
        const recommendation = body.recommendation
            ? (body.recommendation.toUpperCase() as keyof typeof InterviewRecommendation)
            : undefined;

        const updatedScorecard = await updateScorecardDimensions(scorecardId, {
            dimensions: body.dimensions,
            recommendation: recommendation ? InterviewRecommendation[recommendation] : undefined,
        });

        // Get validation status for response
        const validation = await validateScorecardComplete(scorecardId);

        logger.info(
            {
                scorecardId,
                dimensionCount: body.dimensions.length,
                completionPercentage: validation.completionPercentage,
            },
            '[scorecards] Scorecard updated (partial save)'
        );

        res.status(200).json({
            scorecard: updatedScorecard,
            validation,
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            res.status(400).json({
                error: 'Invalid request body',
                details: error.issues,
            });
            return;
        }

        if (error instanceof Error) {
            if (error.message.includes('not found')) {
                res.status(404).json({ error: error.message });
                return;
            }
            if (error.message.includes('Cannot update submitted')) {
                res.status(422).json({ error: error.message });
                return;
            }
            if (error.message.includes('Invalid score')) {
                res.status(400).json({ error: error.message });
                return;
            }
        }

        logger.error({ error, scorecardId: req.params.scorecardId }, 'Failed to update scorecard');
        res.status(500).json({ error: 'Failed to update scorecard' });
    }
});

/**
 * GET /api/scorecards/:scorecardId/validation
 * Check if scorecard is complete and ready for submission
 */
router.get('/:scorecardId/validation', authenticate, async (req, res) => {
    try {
        const { scorecardId } = req.params;
        if (!scorecardId) {
            res.status(400).json({ error: 'Scorecard ID is required' });
            return;
        }

        const userId = req.user!.id;

        // Check authorization
        const authorized = await canViewScorecard(userId, scorecardId);
        if (!authorized) {
            res.status(403).json({
                error: 'Forbidden',
                message: 'You do not have permission to view this scorecard',
            });
            return;
        }

        const validation = await validateScorecardComplete(scorecardId);

        res.status(200).json(validation);
    } catch (error) {
        if (error instanceof Error && error.message.includes('not found')) {
            res.status(404).json({ error: error.message });
            return;
        }

        logger.error(
            { error, scorecardId: req.params.scorecardId },
            'Failed to validate scorecard'
        );
        res.status(500).json({ error: 'Failed to validate scorecard' });
    }
});

/**
 * GET /api/scorecards/rubric/:stageType
 * Get rubric template for a specific interview stage type
 */
router.get('/rubric/:stageType', authenticate, async (req, res) => {
    try {
        const { stageType } = req.params;
        if (!stageType) {
            res.status(400).json({ error: 'Stage type is required' });
            return;
        }

        const rubricTemplate = await getRubricTemplateForStageType(stageType);

        if (rubricTemplate.dimensions.length === 0) {
            res.status(404).json({
                error: 'No rubric template found',
                message: `No rubric template found for stage type: ${stageType}`,
            });
            return;
        }

        res.status(200).json(rubricTemplate);
    } catch (error) {
        logger.error({ error, stageType: req.params.stageType }, 'Failed to retrieve rubric template');
        res.status(500).json({ error: 'Failed to retrieve rubric template' });
    }
});

/**
 * POST /api/scorecards/:scorecardId/submit
 * Submit a completed scorecard (validates, calculates aggregate, locks)
 */
router.post('/:scorecardId/submit', authenticate, async (req, res) => {
    try {
        const { scorecardId } = req.params;
        if (!scorecardId) {
            res.status(400).json({ error: 'Scorecard ID is required' });
            return;
        }

        const userId = req.user!.id;

        // Submit the scorecard
        const submittedScorecard = await submitScorecard(scorecardId, userId);

        // Create audit event
        await auditEvent({
            actorId: userId,
            eventType: 'scorecard_submitted',
            entityType: 'interview_scorecard',
            entityId: scorecardId,
            payload: {
                interviewStageId: submittedScorecard.interviewStageId,
                recommendation: submittedScorecard.recommendation,
                aggregateScore: submittedScorecard.aggregateScore,
                dimensionCount: submittedScorecard.dimensions.length,
                submittedAt: submittedScorecard.submittedAt,
            },
        });

        logger.info(
            {
                scorecardId,
                aggregateScore: submittedScorecard.aggregateScore,
                recommendation: submittedScorecard.recommendation,
            },
            '[scorecards] Scorecard submitted and locked'
        );

        res.status(200).json(submittedScorecard);
    } catch (error) {
        if (error instanceof Error) {
            if (error.message.includes('not found')) {
                res.status(404).json({ error: error.message });
                return;
            }
            if (error.message.includes('Unauthorized')) {
                res.status(403).json({ error: error.message });
                return;
            }
            if (error.message.includes('already been submitted')) {
                res.status(409).json({ error: error.message });
                return;
            }
            if ((error as any).code === 'INCOMPLETE_SCORECARD') {
                res.status(422).json({
                    error: error.message,
                    validation: (error as any).validation,
                });
                return;
            }
        }

        logger.error({ error, scorecardId: req.params.scorecardId }, 'Failed to submit scorecard');
        res.status(500).json({ error: 'Failed to submit scorecard' });
    }
});

export default router;
