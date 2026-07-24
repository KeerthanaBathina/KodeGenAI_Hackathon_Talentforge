import prisma from '../db/prisma';
import { auditEvent } from './auditService';
import { checkApplicationEligibility } from './applicationStatusService';
import { sendApplicationReceivedEmail } from './emailService';
import logger from '../utils/logger';
import type { Application, ApplicationStatus } from '@prisma/client';

/**
 * Application Draft Service
 * 
 * Manages draft applications with auto-save functionality.
 * Handles create, update, retrieve, and submission operations.
 */

export interface DraftDataStep1 {
    fullName?: string;
    email?: string;
    phone?: string;
    linkedinUrl?: string;
}

export interface DraftDataStep2 {
    yearsExperience?: number;
    currentRole?: string;
    currentCompany?: string;
}

export interface DraftDataStep3 {
    coverLetter?: string;
}

export interface DraftData {
    step1_personal?: DraftDataStep1;
    step2_experience?: DraftDataStep2;
    step3_coverLetter?: DraftDataStep3;
    currentStep: 1 | 2 | 3 | 4;
}

export interface SaveDraftParams {
    candidateId: string;
    requisitionId: string;
    draftData: DraftData;
}

export interface GetDraftParams {
    candidateId: string;
    requisitionId: string;
}

export interface SubmitDraftParams {
    candidateId: string;
    requisitionId: string;
}

export class DraftError extends Error {
    constructor(
        public code: string,
        message: string
    ) {
        super(message);
        this.name = 'DraftError';
    }
}

/**
 * Save or update application draft (upsert pattern)
 * Creates new draft on first save, updates existing draft on subsequent saves
 */
export async function saveDraft(params: SaveDraftParams): Promise<Application> {
    const { candidateId, requisitionId, draftData } = params;

    try {
        logger.debug('Saving draft', { candidateId, requisitionId, currentStep: draftData.currentStep });

        const application = await prisma.application.upsert({
            where: {
                unique_candidate_requisition_draft: {
                    candidateId,
                    requisitionId,
                    status: 'draft',
                },
            },
            update: {
                draftData: draftData as any,
                draftSavedAt: new Date(),
                updatedAt: new Date(),
            },
            create: {
                candidateId,
                requisitionId,
                status: 'draft',
                draftData: draftData as any,
                draftSavedAt: new Date(),
                submittedAt: null as any,
            },
        });

        await auditEvent({
            entityType: 'application',
            entityId: application.id,
            action: 'draft.saved',
            actorId: candidateId,
            metadata: {
                currentStep: draftData.currentStep,
                draftSavedAt: application.draftSavedAt,
            },
        });

        logger.info('Draft saved successfully', {
            applicationId: application.id,
            candidateId,
            requisitionId,
            currentStep: draftData.currentStep,
        });

        return application;
    } catch (error) {
        logger.error('Failed to save draft', {
            candidateId,
            requisitionId,
            error: error instanceof Error ? error.message : String(error),
        });
        throw new DraftError('DRAFT_SAVE_FAILED', 'Failed to save application draft');
    }
}

/**
 * Get active draft for candidate and requisition
 * Returns null if no draft exists
 */
export async function getDraft(params: GetDraftParams): Promise<Application | null> {
    const { candidateId, requisitionId } = params;

    try {
        logger.debug('Fetching draft', { candidateId, requisitionId });

        const draft = await prisma.application.findFirst({
            where: {
                candidateId,
                requisitionId,
                status: 'draft',
            },
            orderBy: {
                draftSavedAt: 'desc',
            },
        });

        if (draft) {
            logger.debug('Draft found', {
                applicationId: draft.id,
                candidateId,
                requisitionId,
                draftSavedAt: draft.draftSavedAt,
            });
        } else {
            logger.debug('No draft found', { candidateId, requisitionId });
        }

        return draft;
    } catch (error) {
        logger.error('Failed to fetch draft', {
            candidateId,
            requisitionId,
            error: error instanceof Error ? error.message : String(error),
        });
        throw new DraftError('DRAFT_FETCH_FAILED', 'Failed to retrieve application draft');
    }
}

/**
 * Check if candidate has an active draft for requisition
 */
export async function hasDraft(params: GetDraftParams): Promise<boolean> {
    const { candidateId, requisitionId } = params;

    try {
        const count = await prisma.application.count({
            where: {
                candidateId,
                requisitionId,
                status: 'draft',
            },
        });

        return count > 0;
    } catch (error) {
        logger.error('Failed to check draft existence', {
            candidateId,
            requisitionId,
            error: error instanceof Error ? error.message : String(error),
        });
        return false;
    }
}

/**
 * Submit draft application
 * Transitions status from 'draft' to 'submitted' and locks auto-save
 * Enforces duplicate prevention and cooling period
 */
export async function submitDraft(params: SubmitDraftParams): Promise<Application> {
    const { candidateId, requisitionId } = params;

    try {
        logger.debug('Submitting draft', { candidateId, requisitionId });

        // Find draft
        const draft = await getDraft({ candidateId, requisitionId });

        if (!draft) {
            throw new DraftError('DRAFT_NOT_FOUND', 'No draft application found to submit');
        }

        // Check eligibility (duplicate prevention + cooling period)
        const eligibility = await checkApplicationEligibility({ candidateId, requisitionId });

        if (!eligibility.canApply) {
            if (eligibility.reason === 'active_application') {
                throw new DraftError(
                    'DUPLICATE_APPLICATION',
                    'You already have an active application for this position'
                );
            } else if (eligibility.reason === 'cooling_period') {
                const days = eligibility.daysRemaining ?? 0;
                throw new DraftError(
                    'COOLING_PERIOD_ACTIVE',
                    `You must wait ${days} more day${days !== 1 ? 's' : ''} before re-applying to this position`
                );
            }
        }

        // Update to submitted status
        const submittedApplication = await prisma.application.update({
            where: { id: draft.id },
            data: {
                status: 'submitted',
                submittedAt: new Date(),
                draftData: null,
                draftSavedAt: null,
                updatedAt: new Date(),
            },
            include: {
                requisition: true,
                candidate: {
                    include: {
                        profile: true,
                    },
                },
            },
        });

        await auditEvent({
            entityType: 'application',
            entityId: submittedApplication.id,
            action: 'draft.submitted',
            actorId: candidateId,
            metadata: {
                requisitionId,
                submittedAt: submittedApplication.submittedAt,
            },
        });

        // Send confirmation email (async, don't block response)
        setImmediate(async () => {
            try {
                await sendApplicationReceivedEmail({
                    candidateEmail: submittedApplication.candidate.email,
                    candidateName: submittedApplication.candidate.profile?.fullName || 'Candidate',
                    requisitionTitle: submittedApplication.requisition.title,
                    requisitionDepartment: submittedApplication.requisition.department,
                    applicationId: submittedApplication.id,
                    submittedAt: submittedApplication.submittedAt!,
                });
            } catch (error) {
                logger.error('Email sending failed but submission succeeded', {
                    applicationId: submittedApplication.id,
                    error,
                });
            }
        });

        logger.info('Draft submitted successfully', {
            applicationId: submittedApplication.id,
            candidateId,
            requisitionId,
            submittedAt: submittedApplication.submittedAt,
        });

        return submittedApplication;
    } catch (error) {
        if (error instanceof DraftError) {
            throw error;
        }

        logger.error('Failed to submit draft', {
            candidateId,
            requisitionId,
            error: error instanceof Error ? error.message : String(error),
        });
        throw new DraftError('DRAFT_SUBMIT_FAILED', 'Failed to submit application');
    }
}
