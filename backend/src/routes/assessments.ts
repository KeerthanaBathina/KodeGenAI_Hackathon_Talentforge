import express from 'express';
import { z } from 'zod';
import {
    resolveProvider,
    checkDuplicateLaunch,
    ProviderResolutionError,
} from '../services/assessmentProviderService';
import {
    launchAssessmentWithProvider,
    ProviderLaunchError,
} from '../services/providerLaunchClient';
import {
    sendAssessmentLaunchEmail,
    sendAssessmentLaunchFailedEmail,
} from '../services/emailService';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/authorize';
import { withRetry, createProviderLaunchRetryOptions, RetryExhaustedError } from '../utils/retry';
import logger from '../utils/logger';
import prisma from '../db/prisma';

const router = express.Router();

// ==================== Schema Validation ====================

const LaunchAssessmentSchema = z.object({
    applicationId: z.string().uuid('Invalid application ID format'),
    providerId: z.string().uuid('Invalid provider ID format').optional(),
});

// ==================== Launch Assessment Endpoint ====================

/**
 * POST /api/assessments/launch
 * Launch external assessment and return test URL
 * 
 * Authorization: Recruiter or HR roles only
 * 
 * Request Body:
 * {
 *   "applicationId": "uuid",
 *   "providerId": "uuid" (optional, admin override)
 * }
 * 
 * Response:
 * {
 *   "success": true,
 *   "sessionId": "uuid",
 *   "testUrl": "https://provider.com/test/...",
 *   "launchedAt": "ISO timestamp",
 *   "correlationId": "uuid"
 * }
 * 
 * Error Codes:
 * - INVALID_REQUEST_BODY: Validation failed
 * - APPLICATION_NOT_FOUND: Application doesn't exist
 * - APPLICATION_INELIGIBLE: Application not in correct status
 * - PROVIDER_NOT_FOUND: Provider doesn't exist
 * - PROVIDER_INACTIVE: Provider is disabled
 * - PROVIDER_MISCONFIGURED: Missing required config
 * - DUPLICATE_ACTIVE_SESSION: Active session already exists
 * - PROVIDER_LAUNCH_FAILED: External API call failed
 */
router.post(
    '/launch',
    authenticate,
    requireRole(['recruiter', 'hr_reviewer', 'hr_manager']),
    async (req, res) => {
        const correlationId = crypto.randomUUID();

        try {
            // Validate request body
            const validationResult = LaunchAssessmentSchema.safeParse(req.body);

            if (!validationResult.success) {
                return res.status(400).json({
                    success: false,
                    error: {
                        code: 'INVALID_REQUEST_BODY',
                        message: 'Invalid request payload',
                        details: validationResult.error.errors,
                        correlationId,
                    },
                });
            }

            const { applicationId, providerId } = validationResult.data;

            logger.info('Assessment launch requested', {
                applicationId,
                providerId,
                actorId: req.user!.id,
                actorRole: req.user!.role,
                correlationId,
            });

            // Check for duplicate active session
            const hasDuplicate = await checkDuplicateLaunch(applicationId);
            if (hasDuplicate) {
                logger.warn('Duplicate launch attempt blocked', {
                    applicationId,
                    correlationId,
                });

                return res.status(409).json({
                    success: false,
                    error: {
                        code: 'DUPLICATE_ACTIVE_SESSION',
                        message: 'An active assessment session already exists for this application',
                        correlationId,
                    },
                });
            }

            // Resolve provider configuration
            const resolvedData = await resolveProvider({
                applicationId,
                providerId,
            });

            // Fetch application with candidate for provider launch
            const applicationWithCandidate = await prisma.application.findUnique({
                where: { id: applicationId },
                include: {
                    candidate: true,
                    requisition: true,
                },
            });

            if (!applicationWithCandidate) {
                throw new Error('Application not found after resolution');
            }

            // Launch assessment with external provider (with retry logic)
            let providerResponse;
            try {
                providerResponse = await withRetry(
                    () =>
                        launchAssessmentWithProvider({
                            provider: resolvedData.provider,
                            application: applicationWithCandidate,
                            correlationId,
                        }),
                    {
                        ...createProviderLaunchRetryOptions(correlationId),
                        operation: 'Assessment provider launch',
                    }
                );
            } catch (error) {
                // Handle retry exhaustion - create failed session and notify recruiter
                if (error instanceof RetryExhaustedError) {
                    logger.error('Assessment launch failed after retries', {
                        applicationId,
                        attempts: error.attempts,
                        lastError: error.lastError.message,
                        correlationId,
                    });

                    // Persist failed launch record
                    const failedSession = await prisma.assessmentSession.create({
                        data: {
                            applicationId: applicationWithCandidate.id,
                            providerId: resolvedData.provider.id,
                            sessionToken: null,
                            testUrl: null,
                            status: 'launch_failed',
                            metadata: {
                                providerName: resolvedData.provider.name,
                                correlationId,
                                launchedBy: req.user!.id,
                                launchedByRole: req.user!.role,
                                failureReason:
                                    error.lastError instanceof ProviderLaunchError
                                        ? error.lastError.code
                                        : 'UNKNOWN_ERROR',
                                attempts: error.attempts,
                                failedAt: new Date().toISOString(),
                            },
                        },
                    });

                    // Record failure audit event
                    await prisma.auditEvent.create({
                        data: {
                            actorId: req.user!.id,
                            eventType: 'assessment_launch_failed',
                            entityType: 'assessment_session',
                            entityId: failedSession.id,
                            payloadJson: {
                                applicationId,
                                providerId: resolvedData.provider.id,
                                providerName: resolvedData.provider.name,
                                attempts: error.attempts,
                                failureReason:
                                    error.lastError instanceof ProviderLaunchError
                                        ? error.lastError.code
                                        : 'UNKNOWN_ERROR',
                                correlationId,
                            },
                            ipAddress: req.ip || null,
                            userAgent: req.get('user-agent') || null,
                        },
                    });

                    // Notify recruiter (async, non-blocking)
                    const recruiterUser = await prisma.candidate.findUnique({
                        where: { id: req.user!.id },
                        select: { email: true, firstName: true, lastName: true },
                    });

                    if (recruiterUser) {
                        sendAssessmentLaunchFailedEmail({
                            recruiterEmail: recruiterUser.email,
                            recruiterName: `${recruiterUser.firstName || ''} ${recruiterUser.lastName || ''}`.trim(),
                            candidateName: `${applicationWithCandidate.candidate.firstName} ${applicationWithCandidate.candidate.lastName}`,
                            requisitionTitle: applicationWithCandidate.requisition.title,
                            applicationId: applicationWithCandidate.id,
                            providerName: resolvedData.provider.name,
                            attempts: error.attempts,
                            failedAt: new Date(),
                            sessionId: failedSession.id,
                        }).catch((emailError) => {
                            logger.error('Recruiter notification dispatch failed', {
                                sessionId: failedSession.id,
                                recruiterEmail: recruiterUser.email,
                                error: emailError instanceof Error ? emailError.message : String(emailError),
                                correlationId,
                            });
                        });
                    }

                    return res.status(503).json({
                        success: false,
                        error: {
                            code: 'PROVIDER_LAUNCH_FAILED_AFTER_RETRIES',
                            message: `Assessment launch failed after ${error.attempts} attempts. Our team has been notified.`,
                            sessionId: failedSession.id,
                            correlationId,
                        },
                    });
                }

                // Re-throw non-retryable errors (handled by existing error handling)
                throw error;
            }

            // Persist assessment session transactionally
            const session = await prisma.assessmentSession.create({
                data: {
                    applicationId: applicationWithCandidate.id,
                    providerId: resolvedData.provider.id,
                    sessionToken: providerResponse.sessionToken,
                    testUrl: providerResponse.testUrl,
                    status: 'in_progress',
                    metadata: {
                        providerName: resolvedData.provider.name,
                        correlationId,
                        launchedBy: req.user!.id,
                        launchedByRole: req.user!.role,
                        expiresAt: providerResponse.expiresAt,
                        providerMetadata: providerResponse.metadata,
                    },
                },
            });
Dispatch candidate notification email (async, non-blocking)
            // Email dispatch happens after session persistence to ensure link is ready
            // Failure does not block launch response - session is already created
            sendAssessmentLaunchEmail({
                candidateEmail: applicationWithCandidate.candidate.email,
                candidateName: `${applicationWithCandidate.candidate.firstName} ${applicationWithCandidate.candidate.lastName}`,
                requisitionTitle: applicationWithCandidate.requisition.title,
                applicationId: applicationWithCandidate.id,
                providerName: resolvedData.provider.name,
                testUrl: session.testUrl,
                expiresAt: providerResponse.expiresAt ? new Date(providerResponse.expiresAt) : undefined,
                sessionId: session.id,
            }).catch((emailError) => {
                // Log but don't throw - email failure shouldn't affect launch response
                logger.error('Assessment launch email dispatch failed', {
                    sessionId: session.id,
                    candidateEmail: applicationWithCandidate.candidate.email,
                    error: emailError instanceof Error ? emailError.message : String(emailError),
                    correlationId,
                });
            });

            // Write audit event
            await prisma.auditEvent.create({
                data: {
                    actorId: req.user!.id,
                    eventType: 'assessment_launch_initiated',
                    entityType: 'assessment_session',
                    entityId: session.id,
                    payloadJson: {
                        applicationId,
                        providerId: resolvedData.provider.id,
                        providerName: resolvedData.provider.name,
                        correlationId,
                    },
                    ipAddress: req.ip || null,
                    userAgent: req.get('user-agent') || null,
                },
            });

            logger.info('Assessment launched successfully', {
                sessionId: session.id,
                applicationId,
                providerId: resolvedData.provider.id,
                correlationId,
            });

            return res.status(200).json({
                success: true,
                sessionId: session.id,
                testUrl: session.testUrl,
                launchedAt: session.launchedAt.toISOString(),
                correlationId,
            });
        } catch (error) {
            if (error instanceof ProviderResolutionError) {
                const statusCode =
                    error.code === 'APPLICATION_NOT_FOUND' ||
                    error.code === 'PROVIDER_NOT_FOUND'
                        ? 404
                        : error.code === 'APPLICATION_INELIGIBLE' ||
                          error.code === 'PROVIDER_INACTIVE' ||
                          error.code === 'PROVIDER_MISCONFIGURED'
                        ? 400
                        : 500;

                return res.status(statusCode).json({
                    success: false,
                    error: {
                        code: error.code,
                        message: error.message,
                        correlationId,
                    },
                });
            }

            if (error instanceof ProviderLaunchError) {
                const statusCode = error.statusCode || 500;

                return res.status(statusCode).json({
                    success: false,
                    error: {
                        code: error.code,
                        message: error.message,
                        correlationId,
                    },
                });
            }

            logger.error('Assessment launch failed', {
                error: error instanceof Error ? error.message : String(error),
                correlationId,
            });

            return res.status(500).json({
                success: false,
                error: {
                    code: 'ASSESSMENT_LAUNCH_FAILED',
                    message: 'Failed to launch assessment',
                    correlationId,
                },
            });
        }
    }
);

export default router;
