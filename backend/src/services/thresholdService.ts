import prisma from '../db/prisma';
import logger from '../utils/logger';

export interface ScreeningThresholds {
    id: string;
    shortlistThreshold: number;
    borderlineMin: number;
    borderlineMax: number;
    rejectThreshold: number;
    version: number;
    effectiveFrom: Date;
    createdAt: Date;
}

export type RecommendationType = 'shortlist' | 'manual_review' | 'reject';

// In-memory cache for active thresholds
let cachedThresholds: ScreeningThresholds | null = null;
let cacheTimestamp: number = 0;
const CACHE_TTL = 60000; // 1 minute

export async function getActiveThresholds(): Promise<ScreeningThresholds> {
    const now = Date.now();

    // Return cached if still valid
    if (cachedThresholds && now - cacheTimestamp < CACHE_TTL) {
        return cachedThresholds;
    }

    // Fetch from database
    const thresholds = await prisma.screeningThreshold.findFirst({
        where: {
            effectiveFrom: {
                lte: new Date(),
            },
        },
        orderBy: {
            effectiveFrom: 'desc',
        },
    });

    if (!thresholds) {
        throw new Error('No active screening thresholds found');
    }

    cachedThresholds = thresholds as ScreeningThresholds;
    cacheTimestamp = now;

    logger.info('Loaded active thresholds', {
        version: thresholds.version,
        shortlist: thresholds.shortlistThreshold,
        borderline: `${thresholds.borderlineMin}-${thresholds.borderlineMax}`,
    });

    return cachedThresholds;
}

export function getRecommendation(
    score: number,
    thresholds: ScreeningThresholds
): RecommendationType {
    if (score >= thresholds.shortlistThreshold) {
        return 'shortlist';
    }

    if (score <= thresholds.rejectThreshold) {
        return 'reject';
    }

    // Between reject and shortlist = manual review
    return 'manual_review';
}

export async function createThresholdVersion(data: {
    shortlistThreshold: number;
    borderlineMin: number;
    borderlineMax: number;
    rejectThreshold: number;
    effectiveFrom?: Date;
}): Promise<ScreeningThresholds> {
    // Get current max version
    const latestThreshold = await prisma.screeningThreshold.findFirst({
        orderBy: { version: 'desc' },
    });

    const newVersion = (latestThreshold?.version || 0) + 1;

    const threshold = await prisma.screeningThreshold.create({
        data: {
            ...data,
            version: newVersion,
            effectiveFrom: data.effectiveFrom || new Date(),
        },
    });

    // Invalidate cache
    cachedThresholds = null;

    logger.info('Created new threshold version', {
        version: newVersion,
        effectiveFrom: threshold.effectiveFrom,
    });

    return threshold as ScreeningThresholds;
}

export async function getThresholdHistory(): Promise<ScreeningThresholds[]> {
    const history = await prisma.screeningThreshold.findMany({
        orderBy: { effectiveFrom: 'desc' },
        take: 10,
    });

    return history as ScreeningThresholds[];
}

export function clearThresholdCache(): void {
    cachedThresholds = null;
    cacheTimestamp = 0;
}
