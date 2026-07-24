import prisma from '../db/prisma';
import { computeScreeningScore } from './scoringService';
import { getActiveThresholds, getRecommendation } from './thresholdService';
import { processRejection } from './rejectionService';
import { auditEvent } from './auditService';
import { calculateConfidence, requiresManualReview, formatConfidenceForDb } from './confidenceService';
import logger from '../utils/logger';

export interface ScreeningResult {
    id: string;
    applicationId: string;
    score: number;
    recommendation: 'shortlist' | 'manual_review' | 'reject';
    factors: any;
    thresholdVersion: number;
}

export class ScreeningError extends Error {
    code: string;

    constructor(message: string, code: string) {
        super(message);
        this.name = 'ScreeningError';
        this.code = code;
    }
}

export async function performScreening(applicationId: string): Promise<ScreeningResult> {
    const startTime = Date.now();

    try {
        // 1. Fetch application with parsed resume and requisition
        const application = await prisma.application.findUnique({
            where: { id: applicationId },
            include: {
                resume: true,
                requisition: {
                    select: {
                        id: true,
                        title: true,
                        requiredSkills: true,
                        preferredSkills: true,
                        minExperienceYears: true,
                        educationLevel: true,
                    },
                },
                candidate: {
                    include: {
                        profile: true,
                    },
                },
            },
        });

        if (!application) {
            throw new ScreeningError('Application not found', 'APPLICATION_NOT_FOUND');
        }

        if (!application.resume) {
            throw new ScreeningError('Resume not found for application', 'RESUME_NOT_FOUND');
        }

        if (!application.resume.parsedData) {
            throw new ScreeningError('Resume not parsed yet', 'RESUME_NOT_PARSED');
        }

        // 2. Get active thresholds
        const thresholds = await getActiveThresholds();

        // 3. Compute screening score
        const { score, factors } = computeScreeningScore({
            parsedData: application.resume.parsedData as any,
            requisition: {
                requiredSkills: application.requisition.requiredSkills as string[],
                preferredSkills: application.requisition.preferredSkills as string[],
                minExperienceYears: application.requisition.minExperienceYears,
                educationLevel: application.requisition.educationLevel,
            },
        });

        // 3.5. Calculate confidence score
        const confidenceResult = calculateConfidence({
            score,
            thresholds: {
                shortlistMin: thresholds.shortlistMin,
                manualReviewMin: thresholds.manualReviewMin,
            },
            parsedData: application.resume.parsedData as any,
            factors: {
                positive: factors.positive || [],
                gaps: factors.gaps || [],
            },
        });

        const isLowConfidence = requiresManualReview(confidenceResult.confidence);

        // 4. Determine recommendation (override if low confidence)
        let recommendation = getRecommendation(score, thresholds);
        let manualReviewReason: string | null = null;

        if (isLowConfidence) {
            recommendation = 'manual_review';
            manualReviewReason = 'low_confidence';
            logger.info('Low confidence detected - escalating to manual review', {
                applicationId,
                score,
                confidence: confidenceResult.confidence,
                reason: confidenceResult.reason,
            });
        }

        // 5. Store screening result with confidence
        const screening = await prisma.screening.create({
            data: {
                applicationId,
                score,
                recommendation,
                factors: factors as any,
                thresholdVersion: thresholds.version,
                confidence: formatConfidenceForDb(confidenceResult.confidence),
                screenedAt: new Date(),
            },
        });

        // 6. Update application status based on recommendation
        let newStatus: string;
        switch (recommendation) {
            case 'shortlist':
                newStatus = 'shortlisted';
                break;
            case 'manual_review':
                newStatus = 'pending_review';
                break;
            case 'reject':
                newStatus = 'rejected';
                break;
        }

        await prisma.application.update({
            where: { id: applicationId },
            data: {
                status: newStatus as any,
                manualReviewReason,
            },
        });

        // 7. Log audit event
        await auditEvent({
            entityType: 'application',
            entityId: applicationId,
            action: `screening.${recommendation}`,
            actorId: 'system',
            metadata: {
                score,
                recommendation,
                thresholdVersion: thresholds.version,
                candidateId: application.candidateId,
            },
        });

        // 8. Trigger rejection flow if needed
        if (recommendation === 'reject') {
            setImmediate(async () => {
                try {
                    await processRejection({
                        applicationId,
                        reason: 'screening',
                        screeningScore: score,
                    });
                } catch (error) {
                    logger.error('Auto-rejection failed', { applicationId, error });
                }
            });
        }

        const elapsed = Date.now() - startTime;
        logger.info('Screening completed', {
            applicationId,
            score,
            recommendation,
            elapsed: `${elapsed}ms`,
            candidateId: application.candidateId,
        });

        return {
            id: screening.id,
            applicationId,
            score,
            recommendation,
            factors,
            thresholdVersion: thresholds.version,
        };
    } catch (error) {
        const elapsed = Date.now() - startTime;
        logger.error('Screening failed', {
            applicationId,
            elapsed: `${elapsed}ms`,
            error: error instanceof Error ? error.message : String(error),
        });
        throw error;
    }
}

export async function getScreeningByApplication(
    applicationId: string
): Promise<ScreeningResult | null> {
    const screening = await prisma.screening.findFirst({
        where: { applicationId },
        orderBy: { screenedAt: 'desc' },
    });

    if (!screening) {
        return null;
    }

    return {
        id: screening.id,
        applicationId: screening.applicationId,
        score: screening.score,
        recommendation: screening.recommendation as any,
        factors: screening.factors,
        thresholdVersion: screening.thresholdVersion || 1,
    };
}
