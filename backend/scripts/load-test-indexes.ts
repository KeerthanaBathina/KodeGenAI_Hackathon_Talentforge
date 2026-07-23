import crypto from 'node:crypto';
import {
  ApplicationStatus,
  CandidateStatus,
  JobType,
  PrismaClient,
  RequisitionStatus,
  UserRole
} from '@prisma/client';

const prisma = new PrismaClient();

async function seed100kApplications(): Promise<void> {
  const existing = await prisma.application.count();
  if (existing >= 100_000) {
    console.log(`Seed already present: ${existing} rows`);
    return;
  }

  console.log('Seeding 100 000 application rows ...');

  const seedUserEmail = 'seed-user@test.internal';
  const existingUser = await prisma.user.findUnique({ where: { email: seedUserEmail } });

  const user =
    existingUser ??
    (await prisma.user.create({
      data: {
        id: crypto.randomUUID(),
        email: seedUserEmail,
        role: UserRole.recruiter,
        fullName: 'Seed User'
      }
    }));

  const jobFamily = await prisma.jobFamily.create({
    data: {
      name: `Seed Family ${Date.now()}`,
      matchScoreThreshold: 70,
      confidenceThreshold: 0.8,
      experienceThresholdYears: 3,
      effectiveFrom: new Date(),
      createdById: user.id
    }
  });

  const requisitions = await Promise.all(
    Array.from({ length: 10 }, (_, i) =>
      prisma.requisition.create({
        data: {
          title: `Test Requisition ${i}`,
          department: 'Engineering',
          jobFamilyId: jobFamily.id,
          location: 'Remote',
          jobType: JobType.full_time,
          slots: 10_000,
          status: RequisitionStatus.open,
          eligibilityCriteria: {},
          openedAt: new Date()
        }
      })
    )
  );

  const statuses: ApplicationStatus[] = [
    ApplicationStatus.submitted,
    ApplicationStatus.screening,
    ApplicationStatus.shortlisted,
    ApplicationStatus.rejected
  ];

  const batchSize = 1000;
  const totalRows = 100_000;

  const seedEpoch = Date.now().toString();

  for (let offset = 0; offset < totalRows; offset += batchSize) {
    const candidates = Array.from({ length: batchSize }, (_, index) => ({
      id: crypto.randomUUID(),
      email: `seed-${crypto.randomUUID()}@example.com`,
      phone: `+1${seedEpoch}${(offset + index).toString().padStart(6, '0')}`,
      consentVersion: '1.0',
      consentTimestamp: new Date(),
      status: CandidateStatus.active
    }));

    await prisma.candidate.createMany({ data: candidates });

    await prisma.application.createMany({
      data: candidates.map((candidate, index) => ({
        candidateId: candidate.id,
        requisitionId: requisitions[(offset + index) % requisitions.length]!.id,
        status: statuses[Math.floor(Math.random() * statuses.length)]!,
        submittedAt: new Date(Date.now() - Math.random() * 30 * 24 * 3600 * 1000)
      }))
    });

    if ((offset + batchSize) % 10_000 === 0) {
      console.log(`  ... ${offset + batchSize} rows inserted`);
    }
  }

  console.log('Seed complete.');
}

async function runExplainAnalyze(requisitionId: string): Promise<number> {
  const result = await prisma.$queryRaw<Array<{ 'QUERY PLAN': string }>>`
    EXPLAIN (ANALYZE, FORMAT TEXT, BUFFERS)
    SELECT id, status, "submittedAt"
    FROM applications
    WHERE "requisitionId" = ${requisitionId}::uuid
      AND status IN ('submitted', 'screening')
    ORDER BY "submittedAt" DESC
    LIMIT 50
  `;

  const plan = result.map((row) => row['QUERY PLAN']).join('\n');

  if (!plan.includes('Index Scan') && !plan.includes('Index Only Scan') && !plan.includes('Bitmap Index Scan')) {
    throw new Error(`Sequential scan detected!\n${plan}`);
  }

  const match = /Execution Time:\s+([\d.]+) ms/.exec(plan);
  if (!match || !match[1]) {
    throw new Error(`Could not parse execution time from plan:\n${plan}`);
  }

  return Number.parseFloat(match[1]);
}

async function main(): Promise<void> {
  await seed100kApplications();

  const topRequisition = await prisma.application.groupBy({
    by: ['requisitionId'],
    _count: { _all: true },
    orderBy: { _count: { requisitionId: 'desc' } },
    take: 1
  });

  const requisitionId = topRequisition[0]?.requisitionId;
  if (!requisitionId) {
    throw new Error('No applications found.');
  }

  console.log(`\nRunning EXPLAIN ANALYZE on requisitionId = ${requisitionId}`);
  console.log(`Row count for this requisition: ${topRequisition[0]?._count._all ?? 0}`);

  const times: number[] = [];
  for (let i = 0; i < 10; i += 1) {
    times.push(await runExplainAnalyze(requisitionId));
  }

  times.sort((a, b) => a - b);
  const p50 = times[Math.floor(times.length * 0.5)] ?? 0;
  const p95 = times[Math.min(times.length - 1, Math.floor(times.length * 0.95))] ?? 0;
  const p99 = times[Math.min(times.length - 1, Math.floor(times.length * 0.99))] ?? 0;

  console.log('\nResults:');
  console.log(`  P50: ${p50.toFixed(3)} ms`);
  console.log(`  P95: ${p95.toFixed(3)} ms`);
  console.log(`  P99: ${p99.toFixed(3)} ms`);

  if (p95 >= 50) {
    throw new Error(`P95 ${p95.toFixed(3)} ms exceeds the 50 ms target.`);
  }

  console.log(`\nPASS: P95 ${p95.toFixed(3)} ms < 50 ms target`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
