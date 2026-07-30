#!/usr/bin/env tsx

import prisma from '../src/db/prisma';

interface ConfusionMatrixViolation {
  requisition_id: string | null;
  true_positives: number | bigint;
  false_positives: number | bigint;
  true_negatives: number | bigint;
  false_negatives: number | bigint;
  precision: number;
  recall: number;
  f1_score: number;
}

async function main(): Promise<void> {
  console.log('[analytics:confusion:validate] starting confusion matrix validation...');

  // Check 1: Verify precision is between 0-1 (handles zero-denominator as 0)
  const precisionViolations = await prisma.$queryRaw<ConfusionMatrixViolation[]>`
    SELECT
      "requisition_id",
      "true_positives",
      "false_positives",
      "true_negatives",
      "false_negatives",
      "precision",
      "recall",
      "f1_score"
    FROM "ai_confusion_matrix_mv"
    WHERE "precision" < 0 OR "precision" > 1
  `;

  if (precisionViolations.length > 0) {
    console.error(
      `[analytics:confusion:validate] found ${precisionViolations.length} precision violation(s)`
    );
    console.error(JSON.stringify(precisionViolations.slice(0, 10), null, 2));
    process.exitCode = 1;
    return;
  }

  // Check 2: Verify recall is between 0-1
  const recallViolations = await prisma.$queryRaw<ConfusionMatrixViolation[]>`
    SELECT
      "requisition_id",
      "true_positives",
      "false_positives",
      "true_negatives",
      "false_negatives",
      "precision",
      "recall",
      "f1_score"
    FROM "ai_confusion_matrix_mv"
    WHERE "recall" < 0 OR "recall" > 1
  `;

  if (recallViolations.length > 0) {
    console.error(
      `[analytics:confusion:validate] found ${recallViolations.length} recall violation(s)`
    );
    console.error(JSON.stringify(recallViolations.slice(0, 10), null, 2));
    process.exitCode = 1;
    return;
  }

  // Check 3: Verify F1 is between 0-1
  const f1Violations = await prisma.$queryRaw<ConfusionMatrixViolation[]>`
    SELECT
      "requisition_id",
      "true_positives",
      "false_positives",
      "true_negatives",
      "false_negatives",
      "precision",
      "recall",
      "f1_score"
    FROM "ai_confusion_matrix_mv"
    WHERE "f1_score" < 0 OR "f1_score" > 1
  `;

  if (f1Violations.length > 0) {
    console.error(`[analytics:confusion:validate] found ${f1Violations.length} F1 violation(s)`);
    console.error(JSON.stringify(f1Violations.slice(0, 10), null, 2));
    process.exitCode = 1;
    return;
  }

  // Check 4: Verify all confusion matrix counts are non-negative
  const countViolations = await prisma.$queryRaw<ConfusionMatrixViolation[]>`
    SELECT
      "requisition_id",
      "true_positives",
      "false_positives",
      "true_negatives",
      "false_negatives",
      "precision",
      "recall",
      "f1_score"
    FROM "ai_confusion_matrix_mv"
    WHERE "true_positives" < 0
      OR "false_positives" < 0
      OR "true_negatives" < 0
      OR "false_negatives" < 0
  `;

  if (countViolations.length > 0) {
    console.error(
      `[analytics:confusion:validate] found ${countViolations.length} count violation(s)`
    );
    console.error(JSON.stringify(countViolations.slice(0, 10), null, 2));
    process.exitCode = 1;
    return;
  }

  // Check 5: Verify F1 formula: F1 = 2 * precision * recall / (precision + recall)
  // (allowing small floating point tolerance)
  const f1FormulaViolations = await prisma.$queryRaw<ConfusionMatrixViolation[]>`
    SELECT
      "requisition_id",
      "true_positives",
      "false_positives",
      "true_negatives",
      "false_negatives",
      "precision",
      "recall",
      "f1_score"
    FROM "ai_confusion_matrix_mv"
    WHERE "precision" + "recall" > 0
      AND ABS(
        "f1_score" - (
          2.0 * "precision" * "recall" / ("precision" + "recall")
        )
      ) > 0.0001
  `;

  if (f1FormulaViolations.length > 0) {
    console.error(
      `[analytics:confusion:validate] found ${f1FormulaViolations.length} F1 formula violation(s)`
    );
    console.error(JSON.stringify(f1FormulaViolations.slice(0, 10), null, 2));
    process.exitCode = 1;
    return;
  }

  console.log('[analytics:confusion:validate] all validations passed');
}

main()
  .catch((error) => {
    console.error('[analytics:confusion:validate] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
