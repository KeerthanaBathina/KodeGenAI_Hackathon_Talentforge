import { prisma } from '../db/prisma';
import { InterviewRecommendation, ScorecardStatus, InterviewStageType } from '@prisma/client';
import {
    CreateScorecardDTO,
    UpdateScorecardDTO,
    ScorecardValidation,
    ScorecardWithDimensions,
    RubricTemplateResponse,
} from '../types/scorecard';
import { Decimal } from '@prisma/client/runtime/library';

/**
 * Get rubric template dimensions for a specific interview stage type
 */
export async function getRubricTemplateForStageType(
    stageType: string
): Promise<RubricTemplateResponse> {
    const dimensions = await prisma.rubricTemplate.findMany({
        where: {
            stageType,
            isActive: true,
        },
        orderBy: {
            displayOrder: 'asc',
        },
        select: {
            dimensionName: true,
            displayOrder: true,
            description: true,
        },
    });

    return {
        stageType,
        dimensions,
    };
}

/**
 * Create a new draft scorecard with initialized dimensions
 */
export async function createDraftScorecard(
    dto: CreateScorecardDTO
): Promise<ScorecardWithDimensions> {
    // Check if scorecard already exists for this interviewer and stage
    const existing = await prisma.interviewScorecard.findUnique({
        where: {
            interviewStageId_interviewerId: {
                interviewStageId: dto.interviewStageId,
                interviewerId: dto.interviewerId,
            },
        },
        include: {
            dimensions: true,
        },
    });

    if (existing) {
        // Return existing scorecard if already created
        return formatScorecardWithDimensions(existing);
    }

    // Get interview stage to determine rubric template
    const interviewStage = await prisma.interviewStage.findUnique({
        where: { id: dto.interviewStageId },
        select: { type: true },
    });

    if (!interviewStage) {
        throw new Error('Interview stage not found');
    }

    // Map InterviewStageType enum to rubric stage type string
    const stageTypeMap: Record<InterviewStageType, string> = {
        technical: 'technical',
        aptitude: 'technical',
        coding: 'technical',
        hr: 'hr',
    };
    const rubricStageType = stageTypeMap[interviewStage.type];

    // Get rubric template for this stage type
    const rubricTemplate = await getRubricTemplateForStageType(rubricStageType);

    if (rubricTemplate.dimensions.length === 0) {
        throw new Error(`No rubric template found for stage type: ${rubricStageType}`);
    }

    // Create scorecard with dimensions in a transaction
    const scorecard = await prisma.interviewScorecard.create({
        data: {
            interviewStageId: dto.interviewStageId,
            interviewerId: dto.interviewerId,
            status: ScorecardStatus.draft,
            dimensions: {
                create: rubricTemplate.dimensions.map((dim) => ({
                    dimensionName: dim.dimensionName,
                    score: null,
                    notes: null,
                })),
            },
        },
        include: {
            dimensions: true,
        },
    });

    return formatScorecardWithDimensions(scorecard);
}

/**
 * Get scorecard by ID with dimensions
 */
export async function getScorecardById(scorecardId: string): Promise<ScorecardWithDimensions | null> {
    const scorecard = await prisma.interviewScorecard.findUnique({
        where: { id: scorecardId },
        include: {
            dimensions: {
                orderBy: {
                    dimensionName: 'asc',
                },
            },
        },
    });

    if (!scorecard) {
        return null;
    }

    return formatScorecardWithDimensions(scorecard);
}

/**
 * Update scorecard dimensions (partial save)
 */
export async function updateScorecardDimensions(
    scorecardId: string,
    dto: UpdateScorecardDTO
): Promise<ScorecardWithDimensions> {
    // Verify scorecard exists and is in draft status
    const scorecard = await prisma.interviewScorecard.findUnique({
        where: { id: scorecardId },
        select: { status: true, interviewStageId: true },
    });

    if (!scorecard) {
        throw new Error('Scorecard not found');
    }

    if (scorecard.status === ScorecardStatus.submitted) {
        throw new Error('Cannot update submitted scorecard');
    }

    // Validate scores are 1-5
    for (const dim of dto.dimensions) {
        if (dim.score < 1 || dim.score > 5) {
            throw new Error(`Invalid score for dimension ${dim.dimensionName}: must be between 1 and 5`);
        }
    }

    // Update dimensions and recommendation in a transaction
    await prisma.$transaction(async (tx) => {
        // Upsert each dimension
        for (const dim of dto.dimensions) {
            await tx.scorecardDimension.upsert({
                where: {
                    scorecardId_dimensionName: {
                        scorecardId,
                        dimensionName: dim.dimensionName,
                    },
                },
                create: {
                    scorecardId,
                    dimensionName: dim.dimensionName,
                    score: dim.score,
                    notes: dim.notes || null,
                },
                update: {
                    score: dim.score,
                    notes: dim.notes || null,
                },
            });
        }

        // Update recommendation if provided
        if (dto.recommendation !== undefined) {
            await tx.interviewScorecard.update({
                where: { id: scorecardId },
                data: { recommendation: dto.recommendation },
            });
        }
    });

    // Fetch and return updated scorecard
    const updated = await getScorecardById(scorecardId);
    if (!updated) {
        throw new Error('Failed to fetch updated scorecard');
    }

    return updated;
}

/**
 * Validate scorecard completeness
 */
export async function validateScorecardComplete(scorecardId: string): Promise<ScorecardValidation> {
    const scorecard = await prisma.interviewScorecard.findUnique({
        where: { id: scorecardId },
        include: {
            dimensions: true,
            interviewStage: {
                select: { type: true },
            },
        },
    });

    if (!scorecard) {
        throw new Error('Scorecard not found');
    }

    // Map stage type to rubric stage type
    const stageTypeMap: Record<InterviewStageType, string> = {
        technical: 'technical',
        aptitude: 'technical',
        coding: 'technical',
        hr: 'hr',
    };
    const rubricStageType = stageTypeMap[scorecard.interviewStage.type];

    // Get expected dimensions from rubric template
    const rubricTemplate = await getRubricTemplateForStageType(rubricStageType);
    const expectedDimensions = rubricTemplate.dimensions.map((d) => d.dimensionName);

    // Check which dimensions are scored
    const scoredDimensions = scorecard.dimensions
        .filter((d) => d.score !== null)
        .map((d) => d.dimensionName);

    const missingDimensions = expectedDimensions.filter((dim) => !scoredDimensions.includes(dim));

    const hasRecommendation = scorecard.recommendation !== null;
    const isComplete = missingDimensions.length === 0 && hasRecommendation;

    const totalDimensions = expectedDimensions.length;
    const scoredCount = scoredDimensions.length;
    const completionPercentage = totalDimensions > 0 ? Math.round((scoredCount / totalDimensions) * 100) : 0;

    return {
        isComplete,
        missingDimensions,
        hasRecommendation,
        completionPercentage,
    };
}

/**
 * Calculate aggregate score from dimension scores
 */
export async function calculateAggregateScore(scorecardId: string): Promise<number> {
    const dimensions = await prisma.scorecardDimension.findMany({
        where: {
            scorecardId,
            score: { not: null },
        },
        select: { score: true },
    });

    if (dimensions.length === 0) {
        return 0;
    }

    const sum = dimensions.reduce((acc, dim) => acc + (dim.score || 0), 0);
    const average = sum / dimensions.length;

    // Round to 1 decimal place
    return Math.round(average * 10) / 10;
}

/**
 * Format scorecard with dimensions for API response
 */
function formatScorecardWithDimensions(scorecard: any): ScorecardWithDimensions {
    return {
        id: scorecard.id,
        interviewStageId: scorecard.interviewStageId,
        interviewerId: scorecard.interviewerId,
        status: scorecard.status,
        recommendation: scorecard.recommendation,
        aggregateScore: scorecard.aggregateScore ? Number(scorecard.aggregateScore) : null,
        submittedAt: scorecard.submittedAt,
        createdAt: scorecard.createdAt,
        updatedAt: scorecard.updatedAt,
        dimensions: scorecard.dimensions.map((dim: any) => ({
            id: dim.id,
            dimensionName: dim.dimensionName,
            score: dim.score,
            notes: dim.notes,
        })),
    };
}

/**
 * Check if user is authorized to view scorecard
 */
export async function canViewScorecard(userId: string, scorecardId: string): Promise<boolean> {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { role: true, id: true },
    });

    if (!user) {
        return false;
    }

    // Recruiters, HR managers, and admins can view all scorecards
    if (['recruiter', 'hr_manager', 'admin'].includes(user.role)) {
        return true;
    }

    // Interviewers can only view their own scorecards
    const scorecard = await prisma.interviewScorecard.findUnique({
        where: { id: scorecardId },
        select: { interviewerId: true },
    });

    return scorecard?.interviewerId === userId;
}

/**
 * Check if user is authorized to update scorecard
 */
export async function canUpdateScorecard(userId: string, scorecardId: string): Promise<boolean> {
    const scorecard = await prisma.interviewScorecard.findUnique({
        where: { id: scorecardId },
        select: { interviewerId: true, status: true },
    });

    if (!scorecard) {
        return false;
    }

    // Only the interviewer who owns the scorecard can update it
    // And only if it's still in draft status
    return scorecard.interviewerId === userId && scorecard.status === ScorecardStatus.draft;
}

/**
 * Submit a scorecard - validates completeness, calculates aggregate, and locks it
 */
export async function submitScorecard(
    scorecardId: string,
    userId: string
): Promise<ScorecardWithDimensions> {
    // Verify scorecard exists and belongs to the user
    const scorecard = await prisma.interviewScorecard.findUnique({
        where: { id: scorecardId },
        select: {
            id: true,
            interviewerId: true,
            interviewStageId: true,
            status: true,
            recommendation: true,
        },
    });

    if (!scorecard) {
        throw new Error('Scorecard not found');
    }

    if (scorecard.interviewerId !== userId) {
        throw new Error('Unauthorized: You can only submit your own scorecard');
    }

    if (scorecard.status === ScorecardStatus.submitted) {
        throw new Error('Scorecard has already been submitted');
    }

    // Validate completeness
    const validation = await validateScorecardComplete(scorecardId);
    if (!validation.isComplete) {
        const error: any = new Error('Scorecard is incomplete');
        error.validation = validation;
        error.code = 'INCOMPLETE_SCORECARD';
        throw error;
    }

    // Calculate aggregate score
    const aggregateScore = await calculateAggregateScore(scorecardId);

    // Update scorecard to submitted status
    const submittedScorecard = await prisma.interviewScorecard.update({
        where: { id: scorecardId },
        data: {
            status: ScorecardStatus.submitted,
            aggregateScore: new Decimal(aggregateScore),
            submittedAt: new Date(),
        },
        include: {
            dimensions: true,
        },
    });

    return formatScorecardWithDimensions(submittedScorecard);
}

