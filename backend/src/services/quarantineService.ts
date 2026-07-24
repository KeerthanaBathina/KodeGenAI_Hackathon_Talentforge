import { createClient } from '@supabase/supabase-js';
import prisma from '../db/prisma';
import { env } from '../config/env';
import { sendQuarantineNotificationEmail } from './emailService';
import logger from '../utils/logger';

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

export async function quarantineInfectedFile(resumeId: string): Promise<void> {
    try {
        const resume = await prisma.resume.findUnique({
            where: { id: resumeId },
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

        if (!resume) {
            throw new Error('Resume not found');
        }

        if (resume.scanStatus !== 'infected') {
            logger.warn('Attempted to quarantine non-infected file', { resumeId });
            return;
        }

        // Move file from resumes bucket to quarantine bucket
        const sourceKey = resume.storageKey;
        const quarantineKey = `quarantine/${resume.id}/${resume.fileName}`;

        // Copy to quarantine
        const { error: copyError } = await supabase.storage
            .from('resumes')
            .copy(sourceKey, `../quarantine/${quarantineKey}`);

        if (copyError) {
            logger.error('Failed to copy file to quarantine', { resumeId, error: copyError });
            throw new Error('Failed to quarantine file');
        }

        // Delete from resumes bucket
        const { error: deleteError } = await supabase.storage.from('resumes').remove([sourceKey]);

        if (deleteError) {
            logger.error('Failed to delete infected file from resumes bucket', {
                resumeId,
                error: deleteError,
            });
        }

        // Update resume record with quarantine location
        await prisma.resume.update({
            where: { id: resumeId },
            data: {
                storageKey: quarantineKey,
            },
        });

        logger.info('File quarantined', {
            resumeId,
            originalKey: sourceKey,
            quarantineKey,
        });

        // Send notification email to candidate
        setImmediate(async () => {
            try {
                await sendQuarantineNotificationEmail({
                    candidateEmail: resume.application.candidate.email,
                    candidateName: resume.application.candidate.profile?.fullName || 'Candidate',
                    requisitionTitle: resume.application.requisition.title,
                    fileName: resume.fileName,
                });
            } catch (error) {
                logger.error('Failed to send quarantine notification email', { resumeId, error });
            }
        });
    } catch (error) {
        logger.error('Quarantine process failed', {
            resumeId,
            error: error instanceof Error ? error.message : String(error),
        });
        throw error;
    }
}
