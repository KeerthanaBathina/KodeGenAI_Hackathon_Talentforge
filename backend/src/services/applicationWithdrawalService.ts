import prisma from '../db/prisma';
import { auditEvent } from './auditService';
import { sendApplicationWithdrawnEmail } from './emailService';
import logger from '../utils/logger';
import type { Application } from '@prisma/client';

export interface WithdrawApplicationParams {
    applicationId: string;
    candidateId: string;
}

export class WithdrawalError extends Error {
    constructor(
        public code: string,
        message: string
    ) {
        super(message);
        this.name = 'WithdrawalError';
    }
}

/**
 * Withdraw application before HR review
 * Only allows withdrawal when status is 'submitted'
 */
export async function withdrawApplication(
    params: WithdrawApplicationParams
): Promise<Application> {
    const { applicationId, candidateId } = params;

    try {
        logger.debug('Attempting to withdraw application', { applicationId, candidateId });

        // Fetch application with relations
        const application = await prisma.application.findUnique({
            where: { id: applicationId },
            include: {
                requisition: true,
                candidate: {
                    include: {
                        profile: true,
                    },
                },
            },
        });

        if (!application) {
            throw new WithdrawalError('APPLICATION_NOT_FOUND', 'Application not found');
        }

        // Verify ownership
        if (application.candidateId !== candidateId) {
            throw new WithdrawalError(
                'UNAUTHORIZED',
                'You are not authorized to withdraw this application'
            );
        }

        // Check if withdrawal is allowed (only 'submitted' status)
        if (application.status !== 'submitted') {
            const readableStatus = application.status.replace(/_/g, ' ');
            throw new WithdrawalError(
                'WITHDRAWAL_NOT_ALLOWED',
                `Cannot withdraw application with status "${readableStatus}". Withdrawal is only allowed for submitted applications that have not entered review.`
            );
        }

        // Update status to withdrawn
        const withdrawnApplication = await prisma.application.update({
            where: { id: applicationId },
            data: {
                status: 'withdrawn',
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

        // Audit event
        await auditEvent({
            entityType: 'application',
            entityId: withdrawnApplication.id,
            action: 'application.withdrawn',
            actorId: candidateId,
            metadata: {
                requisitionId: withdrawnApplication.requisitionId,
                withdrawnAt: withdrawnApplication.updatedAt,
                previousStatus: 'submitted',
            },
        });

        // Send withdrawal confirmation email (async)
        setImmediate(async () => {
            try {
                await sendApplicationWithdrawnEmail({
                    candidateEmail: withdrawnApplication.candidate.email,
                    candidateName: withdrawnApplication.candidate.profile?.fullName || 'Candidate',
                    requisitionTitle: withdrawnApplication.requisition.title,
                    applicationId: withdrawnApplication.id,
                    withdrawnAt: withdrawnApplication.updatedAt,
                });
            } catch (error) {
                logger.error('Withdrawal email failed but withdrawal succeeded', {
                    applicationId: withdrawnApplication.id,
                    error,
                });
            }
        });

        logger.info('Application withdrawn successfully', {
            applicationId: withdrawnApplication.id,
            candidateId,
            requisitionId: withdrawnApplication.requisitionId,
        });

        return withdrawnApplication;
    } catch (error) {
        if (error instanceof WithdrawalError) {
            throw error;
        }

        logger.error('Failed to withdraw application', {
            applicationId,
            candidateId,
            error: error instanceof Error ? error.message : String(error),
        });

        throw new WithdrawalError('WITHDRAWAL_FAILED', 'Failed to withdraw application');
    }
}

/**
 * Check if application can be withdrawn
 */
export async function canWithdrawApplication(
    params: WithdrawApplicationParams
): Promise<{ canWithdraw: boolean; reason?: string }> {
    const { applicationId, candidateId } = params;

    const application = await prisma.application.findUnique({
        where: { id: applicationId },
    });

    if (!application) {
        return { canWithdraw: false, reason: 'Application not found' };
    }

    if (application.candidateId !== candidateId) {
        return { canWithdraw: false, reason: 'Not authorized' };
    }

    if (application.status !== 'submitted') {
        const readableStatus = application.status.replace(/_/g, ' ');
        return {
            canWithdraw: false,
            reason: `Application is ${readableStatus} and cannot be withdrawn`,
        };
    }

    return { canWithdraw: true };
}
