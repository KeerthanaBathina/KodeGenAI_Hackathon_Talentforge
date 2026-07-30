import { InterviewRecommendation, ScorecardStatus } from '@prisma/client';

/**
 * DTO for creating a new draft scorecard
 */
export interface CreateScorecardDTO {
    interviewStageId: string;
    interviewerId: string;
}

/**
 * DTO for updating scorecard dimensions (partial save)
 */
export interface UpdateScorecardDTO {
    dimensions: Array<{
        dimensionName: string;
        score: number; // 1-5
        notes?: string;
    }>;
    recommendation?: InterviewRecommendation;
}

/**
 * DTO for submitting a complete scorecard
 */
export interface SubmitScorecardDTO {
    dimensions: Array<{
        dimensionName: string;
        score: number; // 1-5
        notes?: string;
    }>;
    recommendation: InterviewRecommendation;
}

/**
 * Scorecard validation response
 */
export interface ScorecardValidation {
    isComplete: boolean;
    missingDimensions: string[];
    hasRecommendation: boolean;
    completionPercentage: number;
}

/**
 * Scorecard with dimension details for API responses
 */
export interface ScorecardWithDimensions {
    id: string;
    interviewStageId: string;
    interviewerId: string;
    status: ScorecardStatus;
    recommendation: InterviewRecommendation | null;
    aggregateScore: number | null;
    submittedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    dimensions: Array<{
        id: string;
        dimensionName: string;
        score: number | null;
        notes: string | null;
    }>;
}

/**
 * Rubric template for a specific interview stage type
 */
export interface RubricTemplateResponse {
    stageType: string;
    dimensions: Array<{
        dimensionName: string;
        displayOrder: number;
        description: string;
    }>;
}
