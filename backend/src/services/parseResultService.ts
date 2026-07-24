import prisma from '../db/prisma';
import { auditEvent } from './auditService';
import { enqueueScreening } from '../queues/screeningQueue';
import logger from '../utils/logger';

export interface ParsedResumeData {
    name: string;
    email: string;
    phone: string;
    skills: string[];
    experience_years: number;
    employers: Array<{
        name: string;
        title: string;
        duration?: string;
    }>;
    education: Array<{
        degree: string;
        field: string;
        institution: string;
    }>;
    raw_text?: string;
    extracted_at: string;
}

export interface ParseResultPayload {
    resumeId: string;
    status: 'success' | 'failed';
    parsedData?: ParsedResumeData;
    error?: string;
}

export class ParseResultError extends Error {
    code: string;
    statusCode: number;

    constructor(message: string, code: string, statusCode: number = 500) {
        super(message);
        this.name = 'ParseResultError';
        this.code = code;
        this.statusCode = statusCode;
    }
}

export async function processParseResult(payload: ParseResultPayload): Promise<void> {
    const { resumeId, status, parsedData, error } = payload;

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
            throw new ParseResultError('Resume not found', 'RESUME_NOT_FOUND', 404);
        }

        if (status === 'success' && parsedData) {
            // Store parsed data
            await prisma.resume.update({
                where: { id: resumeId },
                data: {
                    parsedData: parsedData as any,
                    updatedAt: new Date(),
                },
            });

            // Log audit event
            await auditEvent({
                entityType: 'resume',
                entityId: resumeId,
                action: 'resume.parsed',
                actorId: 'system',
                metadata: {
                    skillsCount: parsedData.skills.length,
                    experienceYears: parsedData.experience_years,
                    employersCount: parsedData.employers.length,
                    educationCount: parsedData.education.length,
                },
            });

            logger.info('Resume parsed successfully', {
                resumeId,
                candidateId: resume.application.candidateId,
                skillsCount: parsedData.skills.length,
                experienceYears: parsedData.experience_years,
            });

            // Trigger screening after successful parsing
            setImmediate(async () => {
                try {
                    await enqueueScreening({
                        applicationId: resume.application.id,
                        resumeId,
                        triggeredBy: 'parsing',
                    });
                    logger.info('Screening enqueued after parsing', {
                        resumeId,
                        applicationId: resume.application.id,
                    });
                } catch (error) {
                    logger.error('Failed to enqueue screening', {
                        resumeId,
                        error: error instanceof Error ? error.message : String(error),
                    });
                }
            });
        } else if (status === 'failed') {
            // Update with parse error
            await prisma.resume.update({
                where: { id: resumeId },
                data: {
                    scanResult: {
                        ...(resume.scanResult as object),
                        parseError: error,
                        parseFailedAt: new Date().toISOString(),
                    } as any,
                },
            });

            logger.error('Resume parsing failed', {
                resumeId,
                error,
            });
        }
    } catch (error) {
        logger.error('Failed to process parse result', {
            resumeId,
            error: error instanceof Error ? error.message : String(error),
        });
        throw error;
    }
}
