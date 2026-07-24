import { PrismaClient, ReasonCodeCategory, TemplateType, UserRole } from '@prisma/client';

const REASON_CODES: Array<{ code: string; category: ReasonCodeCategory; displayText: string }> = [
  { code: 'did_not_meet_requirements', category: 'rejection', displayText: 'Did not meet minimum job requirements' },
  { code: 'insufficient_experience', category: 'rejection', displayText: 'Insufficient years of relevant experience' },
  { code: 'skills_gap', category: 'rejection', displayText: 'Significant gap in required technical skills' },
  { code: 'failed_technical_assessment', category: 'rejection', displayText: 'Did not pass technical assessment threshold' },
  { code: 'salary_expectations_unmet', category: 'rejection', displayText: 'Salary expectations exceed approved compensation band' },
  { code: 'overqualified', category: 'rejection', displayText: 'Candidate is overqualified for the role' },
  { code: 'position_filled', category: 'rejection', displayText: 'Position has been filled by another candidate' },
  { code: 'duplicate_application', category: 'rejection', displayText: 'Duplicate application submitted within the cooling-off period' },
  { code: 'candidate_withdrew', category: 'withdrawal', displayText: 'Candidate voluntarily withdrew the application' },
  { code: 'candidate_unresponsive', category: 'withdrawal', displayText: 'Candidate did not respond within the required SLA window' },
  { code: 'candidate_no_show', category: 'interview_cancellation', displayText: 'Candidate did not attend the scheduled interview' },
  { code: 'scheduling_conflict', category: 'interview_cancellation', displayText: 'Interview was cancelled due to an unresolvable scheduling conflict' }
];

const APPROVAL_POLICIES: Array<{
  compensationBandMin: number;
  compensationBandMax: number;
  requiredApprovers: string[];
}> = [
    { compensationBandMin: 0, compensationBandMax: 50_000, requiredApprovers: ['hiring_manager'] },
    { compensationBandMin: 50_001, compensationBandMax: 80_000, requiredApprovers: ['hiring_manager'] },
    { compensationBandMin: 80_001, compensationBandMax: 110_000, requiredApprovers: ['hiring_manager', 'hr_manager'] },
    { compensationBandMin: 110_001, compensationBandMax: 140_000, requiredApprovers: ['hiring_manager', 'hr_manager'] },
    { compensationBandMin: 140_001, compensationBandMax: 180_000, requiredApprovers: ['hiring_manager', 'hr_manager', 'finance_director'] },
    { compensationBandMin: 180_001, compensationBandMax: 999_999, requiredApprovers: ['hiring_manager', 'hr_manager', 'finance_director', 'ceo'] }
  ];

const EMAIL_TEMPLATES: Array<{
  name: string;
  type: TemplateType;
  locale: string;
  version: number;
  subject: string;
  bodyHtml: string;
  bodyText: string;
}> = [
    {
      name: 'Offer Extended',
      type: 'offer',
      locale: 'en',
      version: 1,
      subject: 'Congratulations {{candidate_name}} - Offer for {{role_title}}',
      bodyHtml: '<p>Dear {{candidate_name}},</p><p>We are pleased to offer you the role of {{role_title}}.</p>',
      bodyText: 'Dear {{candidate_name}}, We are pleased to offer you the role of {{role_title}}.'
    },
    {
      name: 'Application Rejected',
      type: 'rejection',
      locale: 'en',
      version: 1,
      subject: 'Update on your application for {{role_title}}',
      bodyHtml: '<p>Hi {{candidate_name}},</p><p>Thank you for applying for {{role_title}}. We are not moving forward at this time.</p>',
      bodyText: 'Hi {{candidate_name}}, thank you for applying for {{role_title}}. We are not moving forward at this time.'
    },
    {
      name: 'Screening Invite',
      type: 'screening_invite',
      locale: 'en',
      version: 1,
      subject: 'Next step for {{role_title}}',
      bodyHtml: '<p>Hi {{candidate_name}},</p><p>You are invited to the screening round for {{role_title}}.</p>',
      bodyText: 'Hi {{candidate_name}}, you are invited to the screening round for {{role_title}}.'
    },
    {
      name: 'Interview Invite',
      type: 'interview_invite',
      locale: 'en',
      version: 1,
      subject: 'Interview scheduled for {{role_title}}',
      bodyHtml: '<p>Hi {{candidate_name}},</p><p>Your interview for {{role_title}} is scheduled on {{interview_date}}.</p>',
      bodyText: 'Hi {{candidate_name}}, your interview for {{role_title}} is scheduled on {{interview_date}}.'
    },
    {
      name: 'Assessment Invite',
      type: 'assessment_invite',
      locale: 'en',
      version: 1,
      subject: 'Assessment link for {{role_title}}',
      bodyHtml: '<p>Hi {{candidate_name}},</p><p>Please complete your {{assessment_type}} assessment for {{role_title}}.</p>',
      bodyText: 'Hi {{candidate_name}}, please complete your {{assessment_type}} assessment for {{role_title}}.'
    },
    {
      name: 'Withdrawal Acknowledgement',
      type: 'withdrawal_ack',
      locale: 'en',
      version: 1,
      subject: 'Withdrawal confirmed for {{role_title}}',
      bodyHtml: '<p>Hi {{candidate_name}},</p><p>Your withdrawal for {{role_title}} has been recorded.</p>',
      bodyText: 'Hi {{candidate_name}}, your withdrawal for {{role_title}} has been recorded.'
    },
    {
      name: 'Registration Welcome',
      type: 'general',
      locale: 'en',
      version: 1,
      subject: 'Welcome to {{platform_name}}, {{candidate_name}}',
      bodyHtml: '<p>Hi {{candidate_name}},</p><p>Welcome to {{platform_name}}.</p>',
      bodyText: 'Hi {{candidate_name}}, welcome to {{platform_name}}.'
    },
    {
      name: 'Application Confirmation',
      type: 'general',
      locale: 'en',
      version: 2,
      subject: 'Application received for {{role_title}}',
      bodyHtml: '<p>Hi {{candidate_name}},</p><p>We received your application for {{role_title}}.</p>',
      bodyText: 'Hi {{candidate_name}}, we received your application for {{role_title}}.'
    },
    {
      name: 'Shortlist Notification',
      type: 'general',
      locale: 'en',
      version: 3,
      subject: 'You are shortlisted for {{role_title}}',
      bodyHtml: '<p>Hi {{candidate_name}},</p><p>You are shortlisted for {{role_title}}.</p>',
      bodyText: 'Hi {{candidate_name}}, you are shortlisted for {{role_title}}.'
    },
    {
      name: 'Offer Reminder',
      type: 'offer',
      locale: 'en',
      version: 2,
      subject: 'Reminder: offer response needed for {{role_title}}',
      bodyHtml: '<p>Hi {{candidate_name}},</p><p>Please respond to your {{role_title}} offer by {{offer_expiry_date}}.</p>',
      bodyText: 'Hi {{candidate_name}}, please respond to your {{role_title}} offer by {{offer_expiry_date}}.'
    },
    {
      name: 'General Update',
      type: 'general',
      locale: 'en',
      version: 4,
      subject: 'Update for {{candidate_name}}',
      bodyHtml: '<p>Hi {{candidate_name}},</p><p>{{update_message}}</p>',
      bodyText: 'Hi {{candidate_name}}, {{update_message}}'
    }
  ];

async function getSeedAdminUserId(prisma: PrismaClient): Promise<string> {
  const email = 'seed-admin@test.internal';
  const user = await prisma.user.upsert({
    where: { email },
    update: { role: UserRole.admin, active: true },
    create: {
      email,
      role: UserRole.admin,
      fullName: 'Seed Admin'
    }
  });

  return user.id;
}

export async function seedReasonCodes(prisma: PrismaClient): Promise<void> {
  console.log('Seeding reason_codes ...');

  for (const reasonCode of REASON_CODES) {
    await prisma.reasonCode.upsert({
      where: {
        category_code: {
          category: reasonCode.category,
          code: reasonCode.code
        }
      },
      update: {
        displayText: reasonCode.displayText,
        active: true
      },
      create: {
        category: reasonCode.category,
        code: reasonCode.code,
        displayText: reasonCode.displayText,
        active: true
      }
    });
  }

  console.log(`  ${REASON_CODES.length} reason codes upserted.`);
}

export async function seedApprovalPolicies(prisma: PrismaClient): Promise<void> {
  console.log('Seeding approval_policies ...');

  const effectiveFrom = new Date('2026-01-01T00:00:00.000Z');
  const createdById = await getSeedAdminUserId(prisma);

  await prisma.$transaction(async (tx) => {
    await tx.approvalPolicy.updateMany({ data: { active: false } });

    await tx.approvalPolicy.deleteMany({
      where: {
        createdById,
        effectiveFrom
      }
    });

    await tx.approvalPolicy.createMany({
      data: APPROVAL_POLICIES.map((policy) => ({
        compensationBandMin: policy.compensationBandMin,
        compensationBandMax: policy.compensationBandMax,
        requiredApprovers: policy.requiredApprovers,
        active: true,
        effectiveFrom,
        createdById
      }))
    });
  });

  console.log(`  ${APPROVAL_POLICIES.length} approval policies seeded.`);
}

export async function seedEmailTemplates(prisma: PrismaClient): Promise<void> {
  console.log('Seeding templates ...');

  for (const template of EMAIL_TEMPLATES) {
    await prisma.template.upsert({
      where: {
        type_locale_version: {
          type: template.type,
          locale: template.locale,
          version: template.version
        }
      },
      update: {
        name: template.name,
        subject: template.subject,
        bodyHtml: template.bodyHtml,
        bodyText: template.bodyText,
        active: true
      },
      create: {
        name: template.name,
        type: template.type,
        locale: template.locale,
        version: template.version,
        subject: template.subject,
        bodyHtml: template.bodyHtml,
        bodyText: template.bodyText,
        active: true
      }
    });
  }

  console.log(`  ${EMAIL_TEMPLATES.length} templates upserted.`);
}

export async function seedScreeningThresholds(prisma: PrismaClient): Promise<void> {
  console.log('Seeding screening_thresholds ...');

  const existing = await prisma.screeningThreshold.findFirst();
  if (existing) {
    console.log('  Screening thresholds already exist, skipping seed');
    return;
  }

  await prisma.screeningThreshold.create({
    data: {
      shortlistThreshold: 75,
      borderlineMin: 40,
      borderlineMax: 74,
      rejectThreshold: 39,
      version: 1,
      effectiveFrom: new Date('2026-07-24T00:00:00.000Z'),
    },
  });

  console.log('  Default screening thresholds created (v1)');
}

export async function runSharedSeeds(prisma: PrismaClient): Promise<void> {
  await seedReasonCodes(prisma);
  await seedApprovalPolicies(prisma);
  await seedEmailTemplates(prisma);
  await seedScreeningThresholds(prisma);
}
