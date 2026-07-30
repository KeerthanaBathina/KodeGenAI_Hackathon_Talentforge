import express from 'express';
import { authenticate } from '../middleware/authenticate';
import { getStageSequence, getApplicationStageStatus } from '../services/stagePrerequisiteService';
import { ApplicationPath } from '@prisma/client';
import logger from '../utils/logger';

const router = express.Router();

/**
 * GET /api/interview-paths/:path/sequence
 * Get the stage sequence for a given path
 */
router.get(
    '/:path/sequence',
    authenticate,
    async (req, res) => {
        try {
            const path = req.params.path as ApplicationPath;

            if (!['fresher', 'experienced'].includes(path)) {
                res.status(400).json({
                    error: 'Invalid path',
                    message: 'Path must be "fresher" or "experienced"',
                });
                return;
            }

            const sequence = getStageSequence(path);

            res.status(200).json({
                path,
                sequence: sequence.map((s) => ({
                    stage: s.stage,
                    prerequisites: s.prerequisiteStages,
                })),
            });
        } catch (error) {
            logger.error({ error, path: req.params.path }, 'Failed to fetch stage sequence');
            res.status(500).json({
                error: 'Failed to fetch stage sequence',
            });
        }
    }
);

/**
 * GET /api/interview-paths/applications/:applicationId/stage-status
 * Get stage status for a specific application
 */
router.get(
    '/applications/:applicationId/stage-status',
    authenticate,
    async (req, res) => {
        try {
            const { applicationId } = req.params;

            const stageStatus = await getApplicationStageStatus(applicationId);

            res.status(200).json(stageStatus);
        } catch (error) {
            if (error instanceof Error && error.message.includes('not found')) {
                res.status(404).json({
                    error: 'Application not found',
                });
                return;
            }

            logger.error({ error, applicationId: req.params.applicationId }, 'Failed to fetch stage status');
            res.status(500).json({
                error: 'Failed to fetch stage status',
            });
        }
    }
);

export default router;
