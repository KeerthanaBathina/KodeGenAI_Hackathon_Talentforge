import prisma from '../db/prisma';
import { sendEmail } from './emailService';
import { renderApplicationRejectedEmail } from '../email/templateRenderer';
import { auditEvent } from './auditService';
import { env } from '../config/env';
import logger from '../utils/logger';

export interface RejectionParams {
    applicationId: string;
    reason: 'screening' | 'manual';
    screeningScore?: number;
}

export async function processRejection(params: RejectionParams): Promise<void> {
    const { applicationId, reason, screeningScore } = params;

    try {
        // Fetch application with candidate and requisition
        const application = await prisma.application.findUnique({
            where: { id: applicationId },
            include: {
                candidate: {
                    include: {
                        profile: true,
                    },
                },
                requisition: true,
            },
        });

        if (!application) {
            throw new Error('Application not found');
        }

        // Update application status
        await prisma.application.update({
            where: { id: applicationId },
            data: {
                status: 'rejected',
            },
        });

        // Send rejection email
        const candidateName = application.candidate.profile?.fullName || 'Candidate';
        const careersUrl = `${env.FRONTEND_URL}/careers`;

        const emailData = {
            candidateName,
            requisitionTitle: application.requisition.title,
            companyName: 'TalentForge',
            applicationId: applicationId.substring(0, 8).toUpperCase(),
            careersUrl,
        };

        const htmlBody = await renderApplicationRejectedEmail(emailData);

        setImmediate(async () => {
            try {
                await sendEmail({
                    to: application.candidate.email,
                    subject: `Application Status Update - ${application.requisition.title}`,
                    html: htmlBody,
                });

                logger.info('Rejection email sent', {
                    applicationId,
                    candidateEmail: application.candidate.email,
                });
            } catch (emailError) {
                logger.error('Failed to send rejection email', {
                    applicationId,
                    error: emailError,
                });
            }
        });

        // Log audit event
        await auditEvent({
            entityType: 'application',
            entityId: applicationId,
            action: `application.rejected.${reason}`,
            actorId: 'system',
            metadata: {
                reason,
                screeningScore,
                candidateId: application.candidateId,
            },
        });

        logger.info('Application rejected', {
            applicationId,
            reason,
            score: screeningScore,
        });
    } catch (error) {
        logger.error('Rejection processing failed', {
            applicationId,
            error: error instanceof Error ? error.message : String(error),
        });
        throw error;
    }
}
