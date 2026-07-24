import { ApplicationStatus, JobType, PrismaClient, RequisitionStatus, ReviewDecision, UserRole } from '@prisma/client';
import { runSharedSeeds } from './seed.shared';

const IDS = {
  users: {
    admin: '00000001-0000-0000-0000-000000000001',
    recruiter: '00000001-0000-0000-0000-000000000002',
    hrReviewer: '00000001-0000-0000-0000-000000000003',
    hrManager: '00000001-0000-0000-0000-000000000004',
    techInterviewer: '00000001-0000-0000-0000-000000000005'
  },
  candidates: {
    alice: '00000002-0000-0000-0000-000000000001',
    bob: '00000002-0000-0000-0000-000000000002',
    carol: '00000002-0000-0000-0000-000000000003'
  },
  jobFamily: '00000003-0000-0000-0000-000000000001',
  threshold: '00000008-0000-0000-0000-000000000001',
  requisitions: {
    open: '00000004-0000-0000-0000-000000000001',
    closed: '00000004-0000-0000-0000-000000000002'
  },
  applications: {
    alice: '00000005-0000-0000-0000-000000000001',
    bob: '00000005-0000-0000-0000-000000000002',
    carol: '00000005-0000-0000-0000-000000000003'
  },
  screenings: {
    alice: '00000006-0000-0000-0000-000000000001',
    bob: '00000006-0000-0000-0000-000000000002'
  },
  reviews: {
    alice: '00000007-0000-0000-0000-000000000001'
  }
};

async function seedUsers(prisma: PrismaClient): Promise<void> {
  const users: Array<{ id: string; email: string; role: UserRole; fullName: string }> = [
    { id: IDS.users.admin, email: 'admin@dev.local', role: UserRole.admin, fullName: 'Dev Admin' },
    { id: IDS.users.recruiter, email: 'recruiter@dev.local', role: UserRole.recruiter, fullName: 'Dev Recruiter' },
    { id: IDS.users.hrReviewer, email: 'hr-reviewer@dev.local', role: UserRole.hr_reviewer, fullName: 'Dev HR Reviewer' },
    { id: IDS.users.hrManager, email: 'hr-manager@dev.local', role: UserRole.hr_manager, fullName: 'Dev HR Manager' },
    { id: IDS.users.techInterviewer, email: 'tech@dev.local', role: UserRole.tech_interviewer, fullName: 'Dev Tech Interviewer' }
  ];

  for (const user of users) {
    await prisma.user.upsert({
      where: { email: user.email },
      update: { role: user.role, fullName: user.fullName, active: true },
      create: { ...user, active: true }
    });
  }
}

async function seedCandidates(prisma: PrismaClient): Promise<void> {
  const candidates = [
    {
      id: IDS.candidates.alice,
      email: 'alice@dev.local',
      phone: '+10000000001',
      consentVersion: '1.0',
      consentTimestamp: new Date('2026-07-01T00:00:00.000Z'),
      status: 'active' as const
    },
    {
      id: IDS.candidates.bob,
      email: 'bob@dev.local',
      phone: '+10000000002',
      consentVersion: '1.0',
      consentTimestamp: new Date('2026-07-05T00:00:00.000Z'),
      status: 'active' as const
    },
    {
      id: IDS.candidates.carol,
      email: 'carol@dev.local',
      phone: '+10000000003',
      consentVersion: '1.0',
      consentTimestamp: new Date('2026-07-10T00:00:00.000Z'),
      status: 'active' as const
    }
  ];

  for (const candidate of candidates) {
    await prisma.candidate.upsert({
      where: { email: candidate.email },
      update: {
        phone: candidate.phone,
        consentVersion: candidate.consentVersion,
        consentTimestamp: candidate.consentTimestamp,
        status: candidate.status
      },
      create: candidate
    });
  }
}

async function seedJobFamilyAndThreshold(prisma: PrismaClient): Promise<void> {
  await prisma.jobFamily.upsert({
    where: { id: IDS.jobFamily },
    update: {},
    create: {
      id: IDS.jobFamily,
      name: 'Software Engineering',
      matchScoreThreshold: 70,
      confidenceThreshold: 0.8,
      experienceThresholdYears: 3,
      effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
      createdById: IDS.users.admin
    }
  });

  await prisma.scoringThreshold.upsert({
    where: { id: IDS.threshold },
    update: {
      aiShortlistThreshold: 0.7,
      confidenceThreshold: 0.8,
      experienceThresholdYears: 3,
      effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
      createdById: IDS.users.admin
    },
    create: {
      id: IDS.threshold,
      jobFamilyId: IDS.jobFamily,
      aiShortlistThreshold: 0.7,
      confidenceThreshold: 0.8,
      experienceThresholdYears: 3,
      effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
      createdById: IDS.users.admin
    }
  });
}

async function seedRequisitions(prisma: PrismaClient): Promise<void> {
  await prisma.requisition.upsert({
    where: { id: IDS.requisitions.open },
    update: {},
    create: {
      id: IDS.requisitions.open,
      title: 'Senior Software Engineer',
      department: 'Engineering',
      jobFamilyId: IDS.jobFamily,
      location: 'Remote',
      jobType: JobType.full_time,
      slots: 3,
      filledSlots: 0,
      status: RequisitionStatus.open,
      eligibilityCriteria: { minYearsExperience: 4 },
      openedAt: new Date('2026-07-01T00:00:00.000Z')
    }
  });

  await prisma.requisition.upsert({
    where: { id: IDS.requisitions.closed },
    update: {},
    create: {
      id: IDS.requisitions.closed,
      title: 'Junior Frontend Developer',
      department: 'Engineering',
      jobFamilyId: IDS.jobFamily,
      location: 'Hybrid',
      jobType: JobType.full_time,
      slots: 1,
      filledSlots: 1,
      status: RequisitionStatus.closed,
      eligibilityCriteria: {},
      openedAt: new Date('2026-06-01T00:00:00.000Z'),
      closedAt: new Date('2026-07-15T00:00:00.000Z')
    }
  });
}

async function seedApplications(prisma: PrismaClient): Promise<void> {
  const applications = [
    {
      id: IDS.applications.alice,
      candidateId: IDS.candidates.alice,
      requisitionId: IDS.requisitions.open,
      status: ApplicationStatus.shortlisted,
      submittedAt: new Date('2026-07-10T00:00:00.000Z')
    },
    {
      id: IDS.applications.bob,
      candidateId: IDS.candidates.bob,
      requisitionId: IDS.requisitions.open,
      status: ApplicationStatus.rejected,
      submittedAt: new Date('2026-07-11T00:00:00.000Z')
    },
    {
      id: IDS.applications.carol,
      candidateId: IDS.candidates.carol,
      requisitionId: IDS.requisitions.closed,
      status: ApplicationStatus.submitted,
      submittedAt: new Date('2026-07-12T00:00:00.000Z')
    }
  ];

  for (const application of applications) {
    await prisma.application.upsert({
      where: { id: application.id },
      update: {
        status: application.status,
        submittedAt: application.submittedAt
      },
      create: application
    });
  }
}

async function seedScreeningsAndReviews(prisma: PrismaClient): Promise<void> {
  await prisma.screening.upsert({
    where: { id: IDS.screenings.alice },
    update: {},
    create: {
      id: IDS.screenings.alice,
      applicationId: IDS.applications.alice,
      modelVersion: 'v1.0.0',
      score: 82,
      confidence: 0.91,
      factorsJson: { skillMatch: 0.88, experienceMatch: 0.76 },
      evaluatedAt: new Date('2026-07-10T02:00:00.000Z'),
      version: 1
    }
  });

  await prisma.screening.upsert({
    where: { id: IDS.screenings.bob },
    update: {},
    create: {
      id: IDS.screenings.bob,
      applicationId: IDS.applications.bob,
      modelVersion: 'v1.0.0',
      score: 58,
      confidence: 0.86,
      factorsJson: { skillMatch: 0.52, experienceMatch: 0.61 },
      evaluatedAt: new Date('2026-07-11T02:00:00.000Z'),
      version: 1
    }
  });

  await prisma.review.upsert({
    where: { id: IDS.reviews.alice },
    update: {},
    create: {
      id: IDS.reviews.alice,
      applicationId: IDS.applications.alice,
      reviewerId: IDS.users.hrReviewer,
      decision: ReviewDecision.shortlisted,
      notes: 'Strong profile for pipeline walkthrough testing.'
    }
  });
}

export async function runDevSeeds(prisma: PrismaClient): Promise<void> {
  console.log('Running development seeds (shared + fixture data) ...');

  await runSharedSeeds(prisma);
  await seedUsers(prisma);
  await seedCandidates(prisma);
  await seedJobFamilyAndThreshold(prisma);
  await seedRequisitions(prisma);
  await seedApplications(prisma);
  await seedScreeningsAndReviews(prisma);

  console.log('Development fixture seed complete.');
}
