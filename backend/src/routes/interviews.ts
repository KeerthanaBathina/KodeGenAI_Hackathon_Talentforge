import express from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/authenticate';
import { authorize } from '../middleware/authorize';
import {
    InterviewConflictError,
    PrerequisiteNotMetError,
    getPanelistAvailability,
    scheduleInterview,
} from '../services/interviewSchedulingService';
import {
    generatePanelistConfirmationToken,
    validatePanelistConfirmationToken,
    markTokenAsUsed,
} from '../services/panelistConfirmationService';
import { sendPanelistConfirmationEmail } from '../services/emailService';
import { dispatchInterviewInviteEmail, type InterviewInvitePayload } from '../services/interviewInviteService';
import { transitionInterviewState, getInterviewStateInfo } from '../services/interviewStateService';
import { recordNoShow, getCandidateNoShowHistory } from '../services/noShowService';
import { rescheduleInterview, getInterviewRescheduleHistory } from '../services/rescheduleService';
import { canScheduleStage } from '../services/stagePrerequisiteService';
import { InterviewStageState } from '@prisma/client';
import { prisma } from '../db/prisma';
import { env } from '../config/env';
import logger from '../utils/logger';
import { auditEvent } from '../services/auditService';
import { getSocketServer } from '../socket';

const router = express.Router();

const ScheduleInterviewSchema = z.object({
    applicationId: z.string().uuid(),
    type: z.enum(['aptitude', 'coding', 'technical', 'system_design', 'cultural', 'hr']),
    startAt: z.string().datetime(),
    endAt: z.string().datetime(),
    timezone: z.string().min(1).max(50),
    panelMemberIds: z.array(z.string().uuid()).min(1),
});

const AvailabilityQuerySchema = z.object({
    applicationId: z.string().uuid(),
    panelMemberIds: z.string().optional(),
});

router.get(
    '/availability',
    authenticate,
    authorize(['recruiter', 'hr_reviewer', 'hr_manager', 'tech_interviewer']),
    async (req, res) => {
        try {
            const query = AvailabilityQuerySchema.parse(req.query);
            const panelMemberIds = query.panelMemberIds
                ? query.panelMemberIds.split(',').filter(Boolean)
                : [];

            const availability = await getPanelistAvailability(panelMemberIds);
            res.status(200).json(availability);
        } catch (error) {
            if (error instanceof z.ZodError) {
                res.status(400).json({
                    error: 'Invalid query parameters',
                    details: error.issues,
                });
                return;
            }

            res.status(500).json({
                error: 'Failed to fetch interview availability',
            });
        }
    }
);

router.post(
    '/',
    authenticate,
    authorize(['recruiter', 'hr_reviewer', 'hr_manager', 'tech_interviewer']),
    async (req, res) => {
        try {
            const body = ScheduleInterviewSchema.parse(req.body);
            const result = await scheduleInterview(body);

            res.status(201).json({
                success: true,
                interview: result,
            });
        } catch (error) {
            if (error instanceof z.ZodError) {
                res.status(400).json({
                    error: 'Invalid request body',
                    details: error.issues,
                });
                return;
            }

            if (error instanceof PrerequisiteNotMetError) {
                // Log security audit event for prerequisite violation attempt
                await auditEvent({
                    actorId: req.user!.id,
                    eventType: 'prerequisite_violation_attempt',
                    entityType: 'interview_stage',
                    entityId: body.applicationId,
                    payload: {
                        requestedStage: error.requestedStage,
                        missingStages: error.missingStages,
                        ipAddress: req.ip,
                    },
                });

                res.status(422).json({
                    error: 'Prerequisite stage not complete',
                    message: error.message,
                    requiredStage: error.requiredStage,
                    requestedStage: error.requestedStage,
                    missingStages: error.missingStages,
                });
                return;
            }

            if (error instanceof InterviewConflictError) {
                res.status(422).json({
                    error: 'Conflict detected',
                    conflicts: error.conflicts,
                });
                return;
            }

            if (error instanceof Error && error.message === 'Interview end time must be after start time') {
                res.status(400).json({
                    error: 'Invalid request body',
                    details: [
                        {
                            code: 'custom',
                            path: ['endAt'],
                            message: error.message,
                        },
                    ],
                });
                return;
            }

            res.status(500).json({
                error: 'Failed to schedule interview',
            });
        }
    }
);

/**
 * PATCH /api/interviews/:interviewId/panelists
 * Assign or update panelists for an interview
 */
const UpdatePanelistsSchema = z.object({
    panelMemberIds: z.array(z.string().uuid()).min(1),
});

router.patch(
    '/:interviewId/panelists',
    authenticate,
    authorize(['recruiter', 'hr_manager']),
    async (req, res) => {
        try {
            const { interviewId } = req.params;
            const body = UpdatePanelistsSchema.parse(req.body);

            // Get the interview stage
            const interview = await prisma.interviewStage.findUnique({
                where: { id: interviewId },
                include: {
                    application: {
                        include: {
                            candidate: {
                                include: {
                                    profile: true,
                                },
                            },
                            requisition: true,
                        },
                    },
                },
            });

            if (!interview) {
                res.status(404).json({ error: 'Interview not found' });
                return;
            }

            if (!interview.scheduledAt || !interview.endAt) {
                res.status(400).json({ error: 'Interview must be scheduled first' });
                return;
            }

            // Check availability for all new panelists
            const availability = await getPanelistAvailability(body.panelMemberIds);
            const unavailablePanelists = availability.filter((panelist) => {
                const slotStart = interview.scheduledAt!.getTime();
                const slotEnd = interview.endAt!.getTime();

                return panelist.slots.every((slot) => {
                    const availStart = new Date(slot.startAt).getTime();
                    const availEnd = new Date(slot.endAt).getTime();
                    return !(availStart <= slotStart && availEnd >= slotEnd) || !slot.available;
                });
            });

            if (unavailablePanelists.length > 0) {
                res.status(422).json({
                    error: 'One or more panelists are unavailable',
                    unavailablePanelists: unavailablePanelists.map((p) => ({
                        id: p.panelMemberId,
                        name: p.panelMemberName,
                    })),
                });
                return;
            }

            // Update interview with new panelists
            await prisma.interviewStage.update({
                where: { id: interviewId },
                data: {
                    panelMembers: body.panelMemberIds,
                },
            });

            // Get panelist details
            const panelists = await prisma.user.findMany({
                where: { id: { in: body.panelMemberIds } },
                select: {
                    id: true,
                    email: true,
                    fullName: true,
                    timezone: true,
                },
            });

            // Create or update panelist confirmations
            for (const panelist of panelists) {
                await prisma.panelistConfirmation.upsert({
                    where: {
                        interviewStageId_panelistId: {
                            interviewStageId: interviewId,
                            panelistId: panelist.id,
                        },
                    },
                    create: {
                        interviewStageId: interviewId,
                        panelistId: panelist.id,
                        status: 'pending',
                    },
                    update: {
                        status: 'pending',
                        respondedAt: null,
                    },
                });

                // Generate confirmation tokens
                const confirmToken = await generatePanelistConfirmationToken(
                    interviewId,
                    panelist.id,
                    'confirm'
                );
                const declineToken = await generatePanelistConfirmationToken(
                    interviewId,
                    panelist.id,
                    'decline'
                );

                // Send confirmation email
                const confirmUrl = `${env.FRONTEND_URL}/interviews/confirm?token=${confirmToken}`;
                const declineUrl = `${env.FRONTEND_URL}/interviews/confirm?token=${declineToken}`;

                await sendPanelistConfirmationEmail({
                    panelistEmail: panelist.email,
                    panelistName: panelist.fullName,
                    candidateName: interview.application.candidate.profile?.fullName || 'Candidate',
                    requisitionTitle: interview.application.requisition.title,
                    interviewType: interview.type,
                    scheduledAt: interview.scheduledAt,
                    timezone: panelist.timezone,
                    confirmUrl,
                    declineUrl,
                });
            }

            await auditEvent({
                actorId: req.user!.id,
                eventType: 'panelists_assigned',
                entityType: 'interview_stage',
                entityId: interviewId,
                payload: {
                    panelMemberIds: body.panelMemberIds,
                },
            });

            res.status(200).json({
                success: true,
                message: 'Panelists assigned and confirmation requests sent',
            });
        } catch (error) {
            if (error instanceof z.ZodError) {
                res.status(400).json({
                    error: 'Invalid request body',
                    details: error.issues,
                });
                return;
            }

            logger.error({ error }, 'Failed to update interview panelists');
            res.status(500).json({
                error: 'Failed to update interview panelists',
            });
        }
    }
);

/**
 * POST /api/interviews/confirm-panelist
 * Handle panelist confirmation or decline
 */
const ConfirmPanelistSchema = z.object({
    token: z.string().min(1),
});

router.post('/confirm-panelist', async (req, res) => {
    try {
        const body = ConfirmPanelistSchema.parse(req.body);

        // Validate token
        const payload = await validatePanelistConfirmationToken(body.token);

        // Update panelist status
        const confirmation = await prisma.panelistConfirmation.updateMany({
            where: {
                interviewStageId: payload.interviewStageId,
                panelistId: payload.panelistId,
            },
            data: {
                status: payload.action === 'confirm' ? 'confirmed' : 'declined',
                respondedAt: new Date(),
            },
        });

        if (confirmation.count === 0) {
            res.status(404).json({ error: 'Confirmation record not found' });
            return;
        }

        // Mark token as used
        await markTokenAsUsed(payload.interviewStageId, payload.panelistId);

        // Create audit entry
        await auditEvent({
            actorId: payload.panelistId,
            eventType: `panelist_${payload.action}ed`,
            entityType: 'interview_stage',
            entityId: payload.interviewStageId,
            payload: {
                action: payload.action,
            },
        });

        // Emit WebSocket event for real-time UI updates
        try {
            const io = getSocketServer();
            const confirmationStatus = payload.action === 'confirm' ? 'confirmed' : 'declined';
            
            io.emit('panelist:confirmed', {
                interviewStageId: payload.interviewStageId,
                panelistId: payload.panelistId,
                status: confirmationStatus,
                timestamp: new Date().toISOString(),
            });

            logger.info(
                {
                    interviewStageId: payload.interviewStageId,
                    panelistId: payload.panelistId,
                    status: confirmationStatus,
                },
                '[interviews] Panelist confirmation event emitted'
            );
        } catch (socketError) {
            // Log but don't fail the request if WebSocket emission fails
            logger.warn(
                { error: socketError, interviewStageId: payload.interviewStageId },
                '[interviews] Failed to emit panelist confirmation WebSocket event'
            );
        }

        res.status(200).json({
            success: true,
            message: `Successfully ${payload.action}ed interview participation`,
            status: payload.action === 'confirm' ? 'confirmed' : 'declined',
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
            // Token validation errors
            if (
                error.message.includes('expired') ||
                error.message.includes('invalid') ||
                error.message.includes('used')
            ) {
                res.status(401).json({ error: error.message });
                return;
            }
        }

        logger.error({ error }, 'Failed to confirm panelist');
        res.status(500).json({
            error: 'Failed to process confirmation',
        });
    }
});

/**
 * POST /api/interviews/:interviewId/notify-candidate
 * Send interview notification to candidate with panelist confirmation guard
 */
const NotifyCandidateSchema = z.object({
    forceNotify: z.boolean().optional().default(false),
    justification: z.string().optional(),
});

router.post(
    '/:interviewId/notify-candidate',
    authenticate,
    authorize(['recruiter', 'hr_manager']),
    async (req, res) => {
        try {
            const { interviewId } = req.params;
            const body = NotifyCandidateSchema.parse(req.body);

            // Get interview with panelist confirmations
            const interview = await prisma.interviewStage.findUnique({
                where: { id: interviewId },
                include: {
                    application: {
                        include: {
                            candidate: {
                                include: {
                                    profile: true,
                                },
                            },
                            requisition: true,
                        },
                    },
                    panelistConfirmations: {
                        include: {
                            panelist: {
                                select: {
                                    id: true,
                                    fullName: true,
                                    email: true,
                                    timezone: true,
                                },
                            },
                        },
                    },
                },
            });

            if (!interview) {
                res.status(404).json({ error: 'Interview not found' });
                return;
            }

            if (!interview.scheduledAt || !interview.endAt) {
                res.status(400).json({ error: 'Interview must be scheduled first' });
                return;
            }

            // Check panelist confirmation status
            const unconfirmedPanelists = interview.panelistConfirmations.filter(
                (confirmation) => confirmation.status === 'pending' || confirmation.status === 'declined'
            );

            if (unconfirmedPanelists.length > 0 && !body.forceNotify) {
                res.status(409).json({
                    error: 'Cannot notify candidate with unconfirmed panelists',
                    unconfirmedPanelists: unconfirmedPanelists.map((confirmation) => ({
                        id: confirmation.panelistId,
                        name: confirmation.panelist.fullName,
                        status: confirmation.status,
                    })),
                    message: 'All panelists must confirm before notifying the candidate. Use forceNotify=true to override.',
                });
                return;
            }

            // Send candidate notification email
            const candidate = interview.application.candidate;
            const invitePayload: InterviewInvitePayload = {
                interviewId: interview.id,
                applicationId: interview.applicationId,
                interviewType: interview.type,
                startAt: interview.scheduledAt,
                endAt: interview.endAt,
                timezone: interview.timezone,
                candidateName: candidate.profile?.fullName || 'Candidate',
                requisitionTitle: interview.application.requisition.title,
                recipients: [],
            };

            await dispatchInterviewInviteEmail(invitePayload, {
                email: candidate.email,
                name: candidate.profile?.fullName || 'Candidate',
                timezone: candidate.timezone,
                role: 'candidate',
            });

            // Create audit entry
            await auditEvent({
                actorId: req.user!.id,
                eventType: body.forceNotify ? 'candidate_notified_with_override' : 'candidate_notified',
                entityType: 'interview_stage',
                entityId: interviewId,
                payload: {
                    unconfirmedCount: unconfirmedPanelists.length,
                    forceNotify: body.forceNotify,
                    justification: body.justification,
                    unconfirmedPanelistIds: unconfirmedPanelists.map((p) => p.panelistId),
                },
            });

            if (body.forceNotify && unconfirmedPanelists.length > 0) {
                logger.warn(
                    {
                        interviewId,
                        recruiterId: req.user!.id,
                        unconfirmedCount: unconfirmedPanelists.length,
                    },
                    '[interviews] Candidate notified despite unconfirmed panelists'
                );
            }

            res.status(200).json({
                success: true,
                message: 'Candidate notification sent successfully',
                warningOverridden: body.forceNotify && unconfirmedPanelists.length > 0,
            });
        } catch (error) {
            if (error instanceof z.ZodError) {
                res.status(400).json({
                    error: 'Invalid request body',
                    details: error.issues,
                });
                return;
            }

            logger.error({ error }, 'Failed to send candidate notification');
            res.status(500).json({
                error: 'Failed to send candidate notification',
            });
        }
    }
);

/**
 * PATCH /api/interviews/:interviewId/state
 * Transition interview to new state
 */
const TransitionStateSchema = z.object({
    state: z.enum(['completed', 'cancelled', 'no_show', 'rescheduled']),
    reason: z.string().optional(),
});

router.patch(
    '/:interviewId/state',
    authenticate,
    authorize(['recruiter', 'hr_manager', 'admin']),
    async (req, res) => {
        try {
            const { interviewId } = req.params;
            const body = TransitionStateSchema.parse(req.body);
            const userId = req.user!.id;

            const updatedInterview = await transitionInterviewState({
                interviewStageId: interviewId,
                newState: body.state as InterviewStageState,
                reason: body.reason,
                actorId: userId,
            });

            res.status(200).json(updatedInterview);
        } catch (error) {
            if (error instanceof z.ZodError) {
                res.status(400).json({
                    error: 'Invalid request body',
                    details: error.issues,
                });
                return;
            }

            if (error instanceof Error) {
                if ((error as any).code === 'INVALID_STATE_TRANSITION') {
                    res.status(422).json({
                        error: error.message,
                        currentState: (error as any).currentState,
                        requestedState: (error as any).requestedState,
                    });
                    return;
                }

                if (error.message.includes('not found')) {
                    res.status(404).json({ error: error.message });
                    return;
                }
            }

            logger.error({ error, interviewId }, 'Failed to transition interview state');
            res.status(500).json({ error: 'Failed to transition interview state' });
        }
    }
);

/**
 * GET /api/interviews/:interviewId/state
 * Get current state and allowed transitions
 */
router.get('/:interviewId/state', authenticate, async (req, res) => {
    try {
        const { interviewId } = req.params;
        const stateInfo = await getInterviewStateInfo(interviewId);
        res.status(200).json(stateInfo);
    } catch (error) {
        if (error instanceof Error && error.message.includes('not found')) {
            res.status(404).json({ error: error.message });
            return;
        }

        logger.error({ error, interviewId: req.params.interviewId }, 'Failed to get interview state');
        res.status(500).json({ error: 'Failed to get interview state' });
    }
});

/**
 * POST /api/interviews/:interviewId/no-show
 * Record interview no-show
 */
const NoShowSchema = z.object({
    reason: z.string().optional(),
});

router.post(
    '/:interviewId/no-show',
    authenticate,
    authorize(['recruiter', 'hr_manager', 'admin']),
    async (req, res) => {
        try {
            const { interviewId } = req.params;
            const body = NoShowSchema.parse(req.body);
            const userId = req.user!.id;

            const result = await recordNoShow({
                interviewStageId: interviewId,
                reason: body.reason,
                actorId: userId,
            });

            res.status(200).json(result);
        } catch (error) {
            if (error instanceof z.ZodError) {
                res.status(400).json({
                    error: 'Invalid request body',
                    details: error.issues,
                });
                return;
            }

            if (error instanceof Error) {
                if ((error as any).code === 'INVALID_STATE_TRANSITION') {
                    res.status(422).json({
                        error: error.message,
                        currentState: (error as any).currentState,
                        requestedState: (error as any).requestedState,
                    });
                    return;
                }

                if (error.message.includes('not found')) {
                    res.status(404).json({ error: error.message });
                    return;
                }
            }

            logger.error({ error, interviewId }, 'Failed to record no-show');
            res.status(500).json({ error: 'Failed to record no-show' });
        }
    }
);

/**
 * POST /api/interviews/:interviewId/reschedule
 * Reschedule an interview
 */
const RescheduleSchema = z.object({
    newScheduledAt: z.string().datetime(),
    newEndAt: z.string().datetime().optional(),
    newMeetingLink: z.string().url().optional(),
    newLocation: z.string().optional(),
    reason: z.string().optional(),
});

router.post(
    '/:interviewId/reschedule',
    authenticate,
    authorize(['recruiter', 'hr_manager', 'admin']),
    async (req, res) => {
        try {
            const { interviewId } = req.params;
            const body = RescheduleSchema.parse(req.body);
            const userId = req.user!.id;

            const result = await rescheduleInterview({
                originalInterviewId: interviewId,
                newScheduledAt: new Date(body.newScheduledAt),
                newEndAt: body.newEndAt ? new Date(body.newEndAt) : undefined,
                newMeetingLink: body.newMeetingLink,
                newLocation: body.newLocation,
                reason: body.reason,
                actorId: userId,
            });

            res.status(201).json(result);
        } catch (error) {
            if (error instanceof z.ZodError) {
                res.status(400).json({
                    error: 'Invalid request body',
                    details: error.issues,
                });
                return;
            }

            if (error instanceof Error) {
                if (error.message.includes('Cannot reschedule')) {
                    res.status(422).json({ error: error.message });
                    return;
                }

                if (error.message.includes('not found')) {
                    res.status(404).json({ error: error.message });
                    return;
                }
            }

            logger.error({ error, interviewId }, 'Failed to reschedule interview');
            res.status(500).json({ error: 'Failed to reschedule interview' });
        }
    }
);

/**
 * GET /api/interviews/:interviewId/reschedule-history
 * Get reschedule history for interview
 */
router.get('/:interviewId/reschedule-history', authenticate, async (req, res) => {
    try {
        const { interviewId } = req.params;
        const history = await getInterviewRescheduleHistory(interviewId);
        res.status(200).json(history);
    } catch (error) {
        if (error instanceof Error && error.message.includes('not found')) {
            res.status(404).json({ error: error.message });
            return;
        }

        logger.error({ error, interviewId: req.params.interviewId }, 'Failed to get reschedule history');
        res.status(500).json({ error: 'Failed to get reschedule history' });
    }
});

/**
 * GET /api/interviews/candidates/:candidateId/no-show-history
 * Get candidate's no-show history
 */
router.get('/candidates/:candidateId/no-show-history', authenticate, async (req, res) => {
    try {
        const { candidateId } = req.params;
        const history = await getCandidateNoShowHistory(candidateId);
        res.status(200).json(history);
    } catch (error) {
        if (error instanceof Error && error.message.includes('not found')) {
            res.status(404).json({ error: error.message });
            return;
        }

        logger.error({ error, candidateId: req.params.candidateId }, 'Failed to get candidate no-show history');
        res.status(500).json({ error: 'Failed to get candidate no-show history' });
    }
});

/**
 * GET /api/interviews/check-prerequisites/:applicationId/:stage
 * Check if a stage can be scheduled (prerequisite validation)
 */
router.get('/check-prerequisites/:applicationId/:stage', authenticate, async (req, res) => {
    try {
        const { applicationId, stage } = req.params;

        const prerequisiteCheck = await canScheduleStage(applicationId, stage as any);

        res.status(200).json({
            canSchedule: prerequisiteCheck.canSchedule,
            reason: prerequisiteCheck.reason,
            missingStages: prerequisiteCheck.missingStages,
        });
    } catch (error) {
        if (error instanceof Error && error.message.includes('not found')) {
            res.status(404).json({ error: 'Application not found' });
            return;
        }

        logger.error({ error, applicationId: req.params.applicationId, stage: req.params.stage }, 'Failed to check prerequisites');
        res.status(500).json({ error: 'Failed to check prerequisites' });
    }
});

export default router;
