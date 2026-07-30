import prisma from '../prisma';

export interface AiConfusionMatrixMetric {
  requisitionId: string | null;
  truePositives: number | bigint;
  falsePositives: number | bigint;
  trueNegatives: number | bigint;
  falseNegatives: number | bigint;
  precision: number;
  recall: number;
  f1Score: number;
  refreshedAt: Date;
}

export interface ConfusionMatrixRow {
  requisition_id: string | null;
  true_positives: number | bigint;
  false_positives: number | bigint;
  true_negatives: number | bigint;
  false_negatives: number | bigint;
  precision: number;
  recall: number;
  f1_score: number;
  refreshed_at: Date;
}

/**
 * Fetch AI confusion matrix metrics from materialized view
 * @param requisitionId Optional filter for specific requisition
 * @returns Array of AiConfusionMatrixMetric objects
 */
export async function getAiConfusionMatrixMetrics(
  requisitionId?: string
): Promise<AiConfusionMatrixMetric[]> {
  const rows = await prisma.$queryRaw<ConfusionMatrixRow[]>`
    SELECT
      "requisition_id",
      "true_positives",
      "false_positives",
      "true_negatives",
      "false_negatives",
      "precision",
      "recall",
      "f1_score",
      "refreshed_at"
    FROM "ai_confusion_matrix_mv"
    ${requisitionId ? prisma.$literal` WHERE "requisition_id" = ${requisitionId}` : prisma.$literal``}
  `;

  return rows.map((row) => ({
    requisitionId: row.requisition_id,
    truePositives: Number(row.true_positives),
    falsePositives: Number(row.false_positives),
    trueNegatives: Number(row.true_negatives),
    falseNegatives: Number(row.false_negatives),
    precision: Number(row.precision),
    recall: Number(row.recall),
    f1Score: Number(row.f1_score),
    refreshedAt: row.refreshed_at
  }));
}

/**
 * Get confusion matrix last refresh timestamp
 */
export async function getAiConfusionMatrixLastRefreshTimestamp(): Promise<Date | null> {
  const result = await prisma.$queryRaw<Array<{ last_refreshed_at: Date }>>`
    SELECT MAX("refreshed_at") AS "last_refreshed_at"
    FROM "ai_confusion_matrix_mv"
    WHERE "requisition_id" IS NULL
  `;

  return result[0]?.last_refreshed_at ?? null;
}
