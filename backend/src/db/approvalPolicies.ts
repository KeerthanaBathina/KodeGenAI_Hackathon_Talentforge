import prisma from './prisma';

export interface ActiveApprovalPolicy {
  requiredApprovers: string[];
  effectiveFrom: Date;
}

export async function getActiveApprovalPolicy(
  offerSalary: number,
  asOf: Date = new Date()
): Promise<ActiveApprovalPolicy | null> {
  const row = await prisma.approvalPolicy.findFirst({
    where: {
      compensationBandMin: { lte: offerSalary },
      compensationBandMax: { gte: offerSalary },
      effectiveFrom: { lte: asOf },
      active: true
    },
    orderBy: { effectiveFrom: 'desc' },
    select: {
      requiredApprovers: true,
      effectiveFrom: true
    }
  });

  if (!row) {
    return null;
  }

  return {
    requiredApprovers: row.requiredApprovers as string[],
    effectiveFrom: row.effectiveFrom
  };
}
