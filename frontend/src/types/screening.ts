export interface ScreeningThresholds {
    shortlistThreshold: number;
    borderlineMin: number;
    borderlineMax: number;
    rejectThreshold: number;
    version: number;
    effectiveFrom: string;
}

export interface ScreeningFactors {
    positiveFactors: string[];
    skillGaps: string[];
    scoreBreakdown: {
        skillMatch: number;
        experienceMatch: number;
        educationMatch: number;
    };
}

export type ScreeningRecommendation = 'shortlist' | 'manual_review' | 'reject';

export interface ScreeningResult {
    id: string;
    applicationId: string;
    score: number;
    recommendation: ScreeningRecommendation;
    factors: ScreeningFactors;
    thresholdVersion: number;
    screenedAt: string;
    createdAt: string;
    updatedAt: string;
}
