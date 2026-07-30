import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface ValidationResult {
  success: boolean;
  checks: {
    name: string;
    passed: boolean;
    details: string;
  }[];
  warnings: string[];
  summary: string;
}

/**
 * Validates policy version tracking migration
 * Checks columns, indexes, foreign keys, and backfill completeness
 */
async function validateMigration(): Promise<ValidationResult> {
  const result: ValidationResult = {
    success: true,
    checks: [],
    warnings: [],
    summary: '',
  };

  console.log('\n📋 Validating policy version tracking migration...\n');

  try {
    // Check 1: Verify columns exist on applications table
    const applicationColumns = await prisma.$queryRaw<any[]>`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'applications'
        AND column_name IN ('screening_threshold_id', 'scoring_threshold_id', 'approval_policy_id')
      ORDER BY column_name;
    `;

    const expectedColumns = ['screening_threshold_id', 'scoring_threshold_id', 'approval_policy_id'];
    const foundColumns = applicationColumns.map((col) => col.column_name);
    const allColumnsFound = expectedColumns.every((col) => foundColumns.includes(col));

    result.checks.push({
      name: 'Application table columns exist',
      passed: allColumnsFound && applicationColumns.length === 3,
      details: `Found ${applicationColumns.length}/3 expected columns: ${foundColumns.join(', ')}`,
    });

    // Check 2: Verify created_by_id column exists on screening_thresholds
    const screeningThresholdColumns = await prisma.$queryRaw<any[]>`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'screening_thresholds'
        AND column_name = 'created_by_id';
    `;

    result.checks.push({
      name: 'ScreeningThreshold.createdById column exists',
      passed: screeningThresholdColumns.length === 1,
      details: screeningThresholdColumns.length === 1 ? 'Column created successfully' : 'Column missing',
    });

    // Check 3: Verify foreign key constraints exist
    const foreignKeys = await prisma.$queryRaw<any[]>`
      SELECT constraint_name
      FROM information_schema.table_constraints
      WHERE table_schema = 'public'
        AND table_name = 'applications'
        AND constraint_type = 'FOREIGN KEY'
        AND constraint_name IN (
          'fk_application_screening_threshold',
          'fk_application_scoring_threshold',
          'fk_application_approval_policy'
        );
    `;

    result.checks.push({
      name: 'Foreign key constraints created',
      passed: foreignKeys.length === 3,
      details: `Found ${foreignKeys.length}/3 expected foreign key constraints`,
    });

    // Check 4: Verify indexes exist
    const indexes = await prisma.$queryRaw<any[]>`
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename IN ('applications', 'screening_thresholds')
        AND indexname IN (
          'idx_application_screening_threshold',
          'idx_application_scoring_threshold',
          'idx_application_approval_policy',
          'idx_screening_threshold_creator'
        );
    `;

    result.checks.push({
      name: 'Performance indexes created',
      passed: indexes.length >= 3,
      details: `Found ${indexes.length}/4 expected indexes: ${indexes.map((i) => i.indexname).join(', ')}`,
    });

    // Check 5: Count backfilled applications
    const submittedApps = await prisma.application.count({
      where: { submittedAt: { not: null } },
    });

    const appsWithScreeningThreshold = await prisma.application.count({
      where: {
        submittedAt: { not: null },
        screeningThresholdId: { not: null },
      },
    });

    const screeningThresholdBackfillPercentage =
      submittedApps > 0 ? (appsWithScreeningThreshold / submittedApps) * 100 : 0;

    result.checks.push({
      name: 'Screening threshold backfill',
      passed: screeningThresholdBackfillPercentage >= 90,
      details: `${appsWithScreeningThreshold}/${submittedApps} applications (${screeningThresholdBackfillPercentage.toFixed(1)}%)`,
    });

    // Check 6: Count scoring threshold backfilled
    const appsWithScoringThreshold = await prisma.application.count({
      where: {
        submittedAt: { not: null },
        scoringThresholdId: { not: null },
      },
    });

    const scoringThresholdBackfillPercentage =
      submittedApps > 0 ? (appsWithScoringThreshold / submittedApps) * 100 : 0;

    result.checks.push({
      name: 'Scoring threshold backfill',
      passed: scoringThresholdBackfillPercentage >= 90,
      details: `${appsWithScoringThreshold}/${submittedApps} applications (${scoringThresholdBackfillPercentage.toFixed(1)}%)`,
    });

    // Check 7: Count approval policy backfilled
    const appsWithApprovalPolicy = await prisma.application.count({
      where: {
        submittedAt: { not: null },
        approvalPolicyId: { not: null },
      },
    });

    const approvalPolicyBackfillPercentage =
      submittedApps > 0 ? (appsWithApprovalPolicy / submittedApps) * 100 : 0;

    result.checks.push({
      name: 'Approval policy backfill',
      passed: approvalPolicyBackfillPercentage >= 90,
      details: `${appsWithApprovalPolicy}/${submittedApps} applications (${approvalPolicyBackfillPercentage.toFixed(1)}%)`,
    });

    // Check 8: Verify ScreeningThreshold creator tracking
    const screeningThresholdsWithCreator = await prisma.screeningThreshold.count({
      where: { createdById: { not: null } },
    });

    const totalScreeningThresholds = await prisma.screeningThreshold.count();

    result.checks.push({
      name: 'ScreeningThreshold creator tracking',
      passed: screeningThresholdsWithCreator >= 0,
      details: `${screeningThresholdsWithCreator}/${totalScreeningThresholds} screening thresholds have creator info`,
    });

    // Check 9: Test referential integrity
    const invalidReferences = await prisma.$queryRaw<any[]>`
      SELECT COUNT(*)::int as count
      FROM applications
      WHERE screening_threshold_id IS NOT NULL
        AND screening_threshold_id NOT IN (SELECT id FROM screening_thresholds);
    `;

    result.checks.push({
      name: 'Referential integrity check',
      passed: invalidReferences[0].count === 0,
      details: `Found ${invalidReferences[0].count} broken references (should be 0)`,
    });

    // Generate summary
    const passedChecks = result.checks.filter((c) => c.passed).length;
    const totalChecks = result.checks.length;
    result.success = passedChecks === totalChecks && result.warnings.length === 0;

    result.summary =
      passedChecks === totalChecks
        ? `✅ All ${totalChecks} checks passed! Migration successful.`
        : `⚠️  ${passedChecks}/${totalChecks} checks passed. Review warnings above.`;

    // Add warnings if backfill is incomplete
    if (screeningThresholdBackfillPercentage < 100) {
      result.warnings.push(
        `Screening threshold backfill incomplete (${screeningThresholdBackfillPercentage.toFixed(1)}%). ` +
          `${submittedApps - appsWithScreeningThreshold} applications missing threshold reference.`
      );
    }

    if (scoringThresholdBackfillPercentage < 100) {
      result.warnings.push(
        `Scoring threshold backfill incomplete (${scoringThresholdBackfillPercentage.toFixed(1)}%). ` +
          `${submittedApps - appsWithScoringThreshold} applications missing threshold reference.`
      );
    }

    if (approvalPolicyBackfillPercentage < 100) {
      result.warnings.push(
        `Approval policy backfill incomplete (${approvalPolicyBackfillPercentage.toFixed(1)}%). ` +
          `${submittedApps - appsWithApprovalPolicy} applications missing policy reference.`
      );
    }
  } catch (error) {
    console.error('❌ Validation error:', error);
    result.success = false;
    result.summary = `Error during validation: ${error instanceof Error ? error.message : String(error)}`;
  } finally {
    await prisma.$disconnect();
  }

  // Print results
  console.log('\n📊 Validation Results:\n');
  result.checks.forEach((check) => {
    const icon = check.passed ? '✅' : '❌';
    console.log(`${icon} ${check.name}`);
    console.log(`   → ${check.details}`);
  });

  if (result.warnings.length > 0) {
    console.log('\n⚠️  Warnings:');
    result.warnings.forEach((warning) => {
      console.log(`   • ${warning}`);
    });
  }

  console.log(`\n${result.summary}\n`);

  return result;
}

// Run validation
validateMigration()
  .then((result) => {
    process.exit(result.success ? 0 : 1);
  })
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
