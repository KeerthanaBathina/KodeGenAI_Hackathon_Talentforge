import prisma from './prisma';

export interface ActiveThreshold {
  aiShortlistThreshold: number;
  confidenceThreshold: number;
  experienceThresholdYears: number;
  effectiveFrom: Date;
}

export async function getActiveThreshold(
  jobFamilyId: string,
  asOf: Date = new Date()
): Promise<ActiveThreshold | null> {
  const row = await prisma.scoringThreshold.findFirst({
    where: {
      jobFamilyId,
      effectiveFrom: { lte: asOf }
    },
    orderBy: { effectiveFrom: 'desc' },
    select: {
      aiShortlistThreshold: true,
      confidenceThreshold: true,
      experienceThresholdYears: true,
      effectiveFrom: true
    }
  });

  if (!row) {
    return null;
  }

  return {
    aiShortlistThreshold: row.aiShortlistThreshold.toNumber(),
    confidenceThreshold: row.confidenceThreshold.toNumber(),
    experienceThresholdYears: row.experienceThresholdYears,
    effectiveFrom: row.effectiveFrom
  };
}
