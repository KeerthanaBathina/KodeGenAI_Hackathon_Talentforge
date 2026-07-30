import crypto from 'node:crypto';
import { JobType, PrismaClient, RequisitionStatus, UserRole } from '@prisma/client';
import { getActiveApprovalPolicy } from '../src/db/approvalPolicies';
import { getActiveThreshold } from '../src/db/scoringThresholds';
import { findMissingTokens, renderTemplate } from '../src/services/templateRenderer';

const prisma = new PrismaClient();

function section(title: string): void {
  console.log(`\n===== ${title} =====`);
}

async function scenario1ThresholdIsolation(): Promise<void> {
  section('SCENARIO 1: THRESHOLD EFFECTIVE DATE ISOLATION');

  const userId = crypto.randomUUID();
  const jobFamilyId = crypto.randomUUID();
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const yesterday = new Date(today.getTime() - 24 * 3600 * 1000);
  const tomorrow = new Date(today.getTime() + 24 * 3600 * 1000);

  await prisma.user.create({
    data: {
      id: userId,
      email: `threshold-test-${userId}@test.internal`,
      role: UserRole.admin,
      fullName: 'Threshold Test User'
    }
  });

  await prisma.jobFamily.create({
    data: {
      id: jobFamilyId,
      name: `Threshold Test Family ${Date.now()}`,
      matchScoreThreshold: 70,
      confidenceThreshold: 0.8,
      experienceThresholdYears: 3,
      effectiveFrom: today,
      createdById: userId
    }
  });

  await prisma.scoringThreshold.createMany({
    data: [
      {
        id: crypto.randomUUID(),
        jobFamilyId,
        aiShortlistThreshold: 0.7,
        confidenceThreshold: 0.8,
        experienceThresholdYears: 3,
        effectiveFrom: yesterday,
        createdById: userId
      },
      {
        id: crypto.randomUUID(),
        jobFamilyId,
        aiShortlistThreshold: 0.75,
        confidenceThreshold: 0.8,
        experienceThresholdYears: 3,
        effectiveFrom: tomorrow,
        createdById: userId
      }
    ]
  });

  const thresholdToday = await getActiveThreshold(jobFamilyId, today);
  const thresholdTomorrow = await getActiveThreshold(jobFamilyId, tomorrow);

  console.log(`Threshold at today: ${thresholdToday?.aiShortlistThreshold?.toFixed(4) ?? 'null'}`);
  console.log(`Threshold at tomorrow: ${thresholdTomorrow?.aiShortlistThreshold?.toFixed(4) ?? 'null'}`);

  await prisma.scoringThreshold.deleteMany({ where: { jobFamilyId } });
  await prisma.jobFamily.delete({ where: { id: jobFamilyId } });
  await prisma.user.delete({ where: { id: userId } });
}

async function scenario2ReasonCodesAndFkRestrict(): Promise<void> {
  section('SCENARIO 2: REASON CODES SEEDED AND FK RESTRICT');

  const counts = await prisma.$queryRaw<Array<{ category: string; cnt: bigint }>>`
    SELECT category::text AS category, COUNT(*)::bigint AS cnt
    FROM reason_codes
    GROUP BY category
    ORDER BY category
  `;

  const printableCounts = counts.map((row) => ({
    category: row.category,
    cnt: Number(row.cnt)
  }));
  console.log('Reason code counts by category:', JSON.stringify(printableCounts, null, 2));

  const reasonCode = await prisma.reasonCode.findFirst({ where: { code: 'position_filled' } });
  if (!reasonCode) {
    throw new Error('Expected reason code "position_filled" to exist after seed.');
  }

  const userId = crypto.randomUUID();
  const jobFamilyId = crypto.randomUUID();
  const requisitionId = crypto.randomUUID();
  const candidateId = crypto.randomUUID();
  const applicationId = crypto.randomUUID();
  const decisionId = crypto.randomUUID();

  await prisma.user.create({
    data: {
      id: userId,
      email: `rc-fk-user-${userId}@test.internal`,
      role: UserRole.hr_manager,
      fullName: 'Reason Code FK User'
    }
  });

  await prisma.jobFamily.create({
    data: {
      id: jobFamilyId,
      name: `Reason FK Family ${Date.now()}`,
      matchScoreThreshold: 70,
      confidenceThreshold: 0.8,
      experienceThresholdYears: 3,
      effectiveFrom: new Date(),
      createdById: userId
    }
  });

  await prisma.requisition.create({
    data: {
      id: requisitionId,
      title: 'Reason FK Requisition',
      department: 'Engineering',
      jobFamilyId,
      location: 'Remote',
      jobType: JobType.full_time,
      slots: 3,
      status: RequisitionStatus.open,
      eligibilityCriteria: {}
    }
  });

  await prisma.candidate.create({
    data: {
      id: candidateId,
      email: `rc-candidate-${candidateId}@example.com`,
      phone: `+1${Date.now()}101`,
      consentVersion: '1.0',
      consentTimestamp: new Date(),
      status: 'active'
    }
  });

  await prisma.application.create({
    data: {
      id: applicationId,
      candidateId,
      requisitionId,
      status: 'shortlisted'
    }
  });

  await prisma.decision.create({
    data: {
      id: decisionId,
      applicationId,
      outcome: 'reject',
      reasonCodeId: reasonCode.id,
      decidedById: userId
    }
  });

  try {
    await prisma.reasonCode.delete({ where: { id: reasonCode.id } });
    console.log('FAIL: reason code delete unexpectedly succeeded');
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === 'P2003') {
      console.log('PASS: reason code delete blocked by FK RESTRICT (P2003)');
    } else {
      throw error;
    }
  }

  await prisma.decision.delete({ where: { id: decisionId } });
  await prisma.application.delete({ where: { id: applicationId } });
  await prisma.candidate.delete({ where: { id: candidateId } });
  await prisma.requisition.delete({ where: { id: requisitionId } });
  await prisma.jobFamily.delete({ where: { id: jobFamilyId } });
  await prisma.user.delete({ where: { id: userId } });
}

async function scenario3TemplateRendering(): Promise<void> {
  section('SCENARIO 3: TEMPLATE TOKEN RENDERING');

  const offerTemplate = await prisma.template.findFirst({
    where: { type: 'offer', active: true },
    orderBy: { version: 'asc' }
  });

  if (!offerTemplate) {
    throw new Error('No active offer template found.');
  }

  const tokens = {
    candidate_name: 'Jane Smith',
    role_title: 'Senior Engineer',
    offer_expiry_date: '2026-08-30',
    platform_name: 'TalentForge',
    interview_date: '2026-08-01',
    assessment_type: 'technical',
    update_message: 'Your profile is under review.'
  };

  const missing = findMissingTokens(offerTemplate, tokens);
  const rendered = renderTemplate(offerTemplate, tokens);
  const allText = `${rendered.subject}\n${rendered.bodyHtml}\n${rendered.bodyText}`;

  console.log(`Missing tokens: ${JSON.stringify(missing)}`);
  console.log(`Rendered subject: ${rendered.subject}`);
  console.log(`Contains unresolved token pattern: ${/\{\{.*?\}\}/.test(allText)}`);
}

async function scenario4ApprovalChain(): Promise<void> {
  section('SCENARIO 4: L5 APPROVER CHAIN');

  const activePolicies = await prisma.$queryRaw<
    Array<{ compensationBandMin: string; compensationBandMax: string; requiredApprovers: unknown; effectiveFrom: Date }>
  >`
    SELECT "compensationBandMin", "compensationBandMax", "requiredApprovers", "effectiveFrom"
    FROM approval_policies
    WHERE active = true
    ORDER BY "compensationBandMin"
  `;

  console.log(`Active policy rows: ${activePolicies.length}`);

  const l5Policy = await getActiveApprovalPolicy(160_000);
  console.log(`L5 policy approvers: ${JSON.stringify(l5Policy?.requiredApprovers ?? null)}`);
}

async function main(): Promise<void> {
  await scenario1ThresholdIsolation();
  await scenario2ReasonCodesAndFkRestrict();
  await scenario3TemplateRendering();
  await scenario4ApprovalChain();
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
