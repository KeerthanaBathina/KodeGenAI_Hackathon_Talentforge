/**
 * Confidence Scoring Service
 * 
 * Calculates AI confidence score for screening results based on three factors:
 * 1. Score Stability (40%) - Distance from threshold boundaries
 * 2. Data Quality (40%) - Completeness of parsed resume data
 * 3. Match Clarity (20%) - Number of clear positive/negative factors
 * 
 * Confidence range: 0.0 to 1.0
 * Low confidence threshold: < 0.5 triggers manual review escalation
 */

import type { Prisma } from '@prisma/client';

export interface ConfidenceCalculationInput {
    score: number;
    thresholds: {
        shortlistMin: number;
        manualReviewMin: number;
    };
    parsedData: {
        skills?: string[];
        experience?: Array<{ title: string; duration: string }>;
        education?: Array<{ degree: string; institution: string }>;
        hasContactInfo?: boolean;
    };
    factors: {
        positive: string[];
        gaps: string[];
    };
}

export interface ConfidenceResult {
    confidence: number;
    breakdown: {
        scoreStability: number;
        dataQuality: number;
        matchClarity: number;
    };
    reason?: string;
}

const CONFIDENCE_WEIGHTS = {
    SCORE_STABILITY: 0.4,
    DATA_QUALITY: 0.4,
    MATCH_CLARITY: 0.2,
};

const LOW_CONFIDENCE_THRESHOLD = 0.5;

/**
 * Calculate confidence score for a screening result
 */
export function calculateConfidence(
    input: ConfidenceCalculationInput
): ConfidenceResult {
    const scoreStability = calculateScoreStability(input.score, input.thresholds);
    const dataQuality = calculateDataQuality(input.parsedData);
    const matchClarity = calculateMatchClarity(input.factors);

    const confidence =
        scoreStability * CONFIDENCE_WEIGHTS.SCORE_STABILITY +
        dataQuality * CONFIDENCE_WEIGHTS.DATA_QUALITY +
        matchClarity * CONFIDENCE_WEIGHTS.MATCH_CLARITY;

    const breakdown = {
        scoreStability,
        dataQuality,
        matchClarity,
    };

    let reason: string | undefined;
    if (confidence < LOW_CONFIDENCE_THRESHOLD) {
        reason = determineReason(breakdown);
    }

    return {
        confidence: Math.round(confidence * 10000) / 10000, // Round to 4 decimal places
        breakdown,
        reason,
    };
}

/**
 * Calculate score stability factor (0.0 to 1.0)
 * Higher value = score is far from threshold boundaries
 * Lower value = score is near a threshold (borderline case)
 */
function calculateScoreStability(
    score: number,
    thresholds: { shortlistMin: number; manualReviewMin: number }
): number {
    const { shortlistMin, manualReviewMin } = thresholds;

    // Calculate distances from both thresholds
    const distanceFromShortlist = Math.abs(score - shortlistMin);
    const distanceFromManualReview = Math.abs(score - manualReviewMin);

    // Use minimum distance (closest threshold)
    const minDistance = Math.min(distanceFromShortlist, distanceFromManualReview);

    // Convert distance to stability score (0-1)
    // Max distance of 20 points = full stability (1.0)
    const stability = Math.min(minDistance / 20, 1.0);

    return stability;
}

/**
 * Calculate data quality factor (0.0 to 1.0)
 * Based on completeness of parsed resume data
 */
function calculateDataQuality(
    parsedData: ConfidenceCalculationInput['parsedData']
): number {
    let qualityScore = 0;
    let maxScore = 0;

    // Skills (25 points)
    maxScore += 25;
    if (parsedData.skills && parsedData.skills.length >= 5) {
        qualityScore += 25;
    } else if (parsedData.skills && parsedData.skills.length >= 2) {
        qualityScore += 15;
    } else if (parsedData.skills && parsedData.skills.length >= 1) {
        qualityScore += 8;
    }

    // Experience (35 points)
    maxScore += 35;
    if (parsedData.experience && parsedData.experience.length >= 2) {
        qualityScore += 35;
    } else if (parsedData.experience && parsedData.experience.length >= 1) {
        qualityScore += 20;
    }

    // Education (25 points)
    maxScore += 25;
    if (parsedData.education && parsedData.education.length >= 1) {
        const hasCompleteDegree = parsedData.education.some(
            (edu) => edu.degree && edu.institution
        );
        qualityScore += hasCompleteDegree ? 25 : 15;
    }

    // Contact info (15 points)
    maxScore += 15;
    if (parsedData.hasContactInfo) {
        qualityScore += 15;
    }

    return qualityScore / maxScore;
}

/**
 * Calculate match clarity factor (0.0 to 1.0)
 * Based on number of clear positive/negative factors
 */
function calculateMatchClarity(factors: {
    positive: string[];
    gaps: string[];
}): number {
    const totalFactors = factors.positive.length + factors.gaps.length;

    // More factors = clearer match/mismatch assessment
    if (totalFactors >= 8) return 1.0;
    if (totalFactors >= 5) return 0.8;
    if (totalFactors >= 3) return 0.6;
    if (totalFactors >= 1) return 0.4;
    return 0.2; // Very few factors = unclear
}

/**
 * Determine the primary reason for low confidence
 */
function determineReason(breakdown: {
    scoreStability: number;
    dataQuality: number;
    matchClarity: number;
}): string {
    const reasons: Array<{ factor: string; score: number; message: string }> = [
        {
            factor: 'scoreStability',
            score: breakdown.scoreStability,
            message: 'borderline score near threshold',
        },
        {
            factor: 'dataQuality',
            score: breakdown.dataQuality,
            message: 'incomplete resume data',
        },
        {
            factor: 'matchClarity',
            score: breakdown.matchClarity,
            message: 'unclear match factors',
        },
    ];

    // Find the weakest factor
    reasons.sort((a, b) => a.score - b.score);
    return reasons[0].message;
}

/**
 * Check if a confidence score requires manual review escalation
 */
export function requiresManualReview(confidence: number): boolean {
    return confidence < LOW_CONFIDENCE_THRESHOLD;
}

/**
 * Format confidence for database storage (Decimal precision)
 */
export function formatConfidenceForDb(confidence: number): Prisma.Decimal {
    return new Prisma.Decimal(confidence.toFixed(4));
}

export const ConfidenceService = {
    calculateConfidence,
    requiresManualReview,
    formatConfidenceForDb,
    LOW_CONFIDENCE_THRESHOLD,
};
