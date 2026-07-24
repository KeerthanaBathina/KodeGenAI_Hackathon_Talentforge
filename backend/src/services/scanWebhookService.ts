import prisma from '../db/prisma';
import { auditEvent } from './auditService';
import { quarantineInfectedFile } from './quarantineService';
import { enqueueResumeForParse } from '../queues/resumeParseQueue';
import logger from '../utils/logger';

export interface ScanResult {
    resumeId: string;
    status: 'clean' | 'infected';
    threats?: string[];
    scannerVersion?: string;
    scanTime?: Date;
}

export class ScanWebhookError extends Error {
    constructor(
        public code: string,
        message: string
    ) {
        super(message);
        this.name = 'ScanWebhookError';
    }
}

export async function processScanResult(result: ScanResult): Promise<void> {
    const { resumeId, status, threats, scannerVersion, scanTime } = result;

    try {
        // Find resume
        const resume = await prisma.resume.findUnique({
            where: { id: resumeId },
            include: {
                application: {
                    include: {
                        candidate: true,
                    },
                },
            },
        });

        if (!resume) {
            throw new ScanWebhookError('RESUME_NOT_FOUND', 'Resume not found');
        }

        if (resume.scanStatus !== 'pending') {
            logger.warn('Scan result received for already-scanned resume', {
                resumeId,
                currentStatus: resume.scanStatus,
            });
            return;
        }

        // Update resume with scan results
        await prisma.resume.update({
            where: { id: resumeId },
            data: {
                scanStatus: status,
                scanResult: {
                    status,
                    threats: threats || [],
                    scannerVersion,
                    scanTime: scanTime || new Date(),
                },
            },
        });

        // Log audit event
        await auditEvent({
            entityType: 'resume',
            entityId: resumeId,
            action: `resume.scan.${status}`,
            actorId: 'system',
            metadata: {
                status,
                threats: threats || [],
                applicationId: resume.applicationId,
            },
        });

        logger.info('Resume scan completed', {
            resumeId,
            status,
            threats: threats?.length || 0,
            applicationId: resume.applicationId,
        });

        if (status === 'clean') {
            logger.info('Clean file ready for parsing', { resumeId });

            setImmediate(async () => {
                try {
                    const jobId = await enqueueResumeForParse({
                        resumeId,
                        applicationId: resume.applicationId,
                        storageKey: resume.storageKey,
                        candidateId: resume.application.candidateId,
                        fileName: resume.fileName,
                        mimeType: resume.mimeType,
                    });

                    // Update resume with parsing status
                    await prisma.resume.update({
                        where: { id: resumeId },
                        data: {
                            scanResult: {
                                ...(resume.scanResult as object),
                                parsingJobId: jobId,
                                parsingStatus: 'queued',
                            },
                        },
                    });

                    logger.info('Resume queued for AI parsing', { resumeId, jobId });
                } catch (error) {
                    logger.error('Failed to enqueue resume for parsing', { resumeId, error });
                }
            });
        } else {
            logger.warn('Infected file detected, initiating quarantine', { resumeId, threats });

            setImmediate(async () => {
                try {
                    await quarantineInfectedFile(resumeId);
                } catch (error) {
                    logger.error('Quarantine failed', { resumeId, error });
                }
            });
        }
    } catch (error) {
        logger.error('Failed to process scan result', {
            resumeId,
            error: error instanceof Error ? error.message : String(error),
        });
        throw error;
    }
}
