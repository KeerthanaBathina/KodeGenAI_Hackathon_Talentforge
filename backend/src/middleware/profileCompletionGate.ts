import { Request, Response, NextFunction } from 'express';
import * as profileService from '../services/profileService';
import logger from '../utils/logger';

const COMPLETION_THRESHOLD = 80; // 80% required to apply

/**
 * Middleware to enforce profile completion threshold for job applications.
 * Returns 403 if profile completion < 80%.
 */
export async function profileCompletionGate(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> {
    try {
        // Require authenticated user
        if (!req.user || !req.user.id) {
            res.status(401).json({
                error: {
                    code: 'UNAUTHORIZED',
                    message: 'Authentication required',
                },
            });
            return;
        }

        const candidateId = req.user.id;

        // Get profile completion status
        const completionStatus = await profileService.getCompletionStatus(candidateId);

        // Check if profile exists
        if (completionStatus.percentage === 0 && completionStatus.missingFields.includes('Profile not created')) {
            res.status(404).json({
                error: {
                    code: 'PROFILE_NOT_FOUND',
                    message: 'Profile not found. Please create your profile first.',
                    redirectTo: '/profile',
                },
            });
            return;
        }

        // Enforce completion threshold
        if (completionStatus.percentage < COMPLETION_THRESHOLD) {
            logger.info(
                { candidateId, completion: completionStatus.percentage, threshold: COMPLETION_THRESHOLD },
                'Profile completion gate blocked application'
            );

            res.status(403).json({
                error: {
                    code: 'PROFILE_INCOMPLETE',
                    message: `Profile must be at least ${COMPLETION_THRESHOLD}% complete to apply for jobs. Current completion: ${completionStatus.percentage}%`,
                    details: {
                        currentCompletion: completionStatus.percentage,
                        requiredCompletion: COMPLETION_THRESHOLD,
                        missingFields: completionStatus.missingFields,
                        completedSections: completionStatus.completedSections,
                    },
                    redirectTo: '/profile',
                },
            });
            return;
        }

        // Profile meets threshold - allow request to proceed
        logger.debug(
            { candidateId, completion: completionStatus.percentage },
            'Profile completion gate passed'
        );

        next();
    } catch (error) {
        logger.error({ error }, 'Error in profile completion gate');
        res.status(500).json({
            error: {
                code: 'INTERNAL_ERROR',
                message: 'Unable to verify profile completion',
            },
        });
    }
}
