export type ScorecardStatus = 'draft' | 'submitted';
export type InterviewRecommendation = 'advance' | 'hold' | 'reject';

export interface DimensionScore {
    id?: string;
    dimensionName: string;
    score: number | null;
    notes: string | null;
    description?: string;
    displayOrder?: number;
}

export interface Scorecard {
    id: string;
    interviewStageId: string;
    interviewerId: string;
    status: ScorecardStatus;
    recommendation: InterviewRecommendation | null;
    aggregateScore: number | null;
    submittedAt: string | null;
    createdAt: string;
    updatedAt: string;
    dimensions: DimensionScore[];
}

export interface ScorecardValidation {
    isComplete: boolean;
    missingDimensions: string[];
    hasRecommendation: boolean;
    completionPercentage: number;
}

export interface RubricDimension {
    dimensionName: string;
    displayOrder: number;
    description: string;
}

export interface RubricTemplate {
    stageType: string;
    dimensions: RubricDimension[];
}

export interface CreateScorecardRequest {
    interviewStageId: string;
}

export interface UpdateScorecardRequest {
    dimensions: Array<{
        dimensionName: string;
        score: number;
        notes?: string;
    }>;
    recommendation?: InterviewRecommendation;
}
