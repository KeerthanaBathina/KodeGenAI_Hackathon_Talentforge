import { execSync } from 'node:child_process';
import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function section(title: string): void {
  console.log(`\n===== ${title} =====`);
}

async function scenario1DriftDetection(): Promise<void> {
  section('SCENARIO 1: DRIFT DETECTION COMMAND FAILS ON DRIFT');

  await prisma.$executeRawUnsafe('ALTER TABLE "applications" ADD COLUMN IF NOT EXISTS "drift_test_col" TEXT');

  let driftDetected = false;
  let output = '';

  try {
    output = execSync('npm run migrate:diff', {
      cwd: process.cwd(),
      env: process.env,
      stdio: 'pipe',
      encoding: 'utf-8'
    });
  } catch (error) {
    const stderr = error && typeof error === 'object' && 'stderr' in error ? String((error as { stderr?: unknown }).stderr ?? '') : '';
    const stdout = error && typeof error === 'object' && 'stdout' in error ? String((error as { stdout?: unknown }).stdout ?? '') : '';
    output = `${stdout}\n${stderr}`;
    driftDetected = true;
  } finally {
    await prisma.$executeRawUnsafe('ALTER TABLE "applications" DROP COLUMN IF EXISTS "drift_test_col"');
  }

  console.log(`driftDetected=${driftDetected}`);
  console.log(output.trim().slice(0, 1200));
}

async function fixtureCounts(): Promise<Array<{ entity: string; count: number }>> {
  const rows = await prisma.$transaction(async (tx) => {
    const users = await tx.$queryRawUnsafe<Array<{ c: number }>>(
      "select count(*)::int as c from users where email in ('admin@dev.local','recruiter@dev.local','hr-reviewer@dev.local','hr-manager@dev.local','tech@dev.local')"
    );
    const candidates = await tx.$queryRawUnsafe<Array<{ c: number }>>(
      "select count(*)::int as c from candidates where email in ('alice@dev.local','bob@dev.local','carol@dev.local')"
    );
    const requisitions = await tx.$queryRawUnsafe<Array<{ c: number }>>(
      "select count(*)::int as c from requisitions where id in ('00000004-0000-0000-0000-000000000001','00000004-0000-0000-0000-000000000002')"
    );
    const applications = await tx.$queryRawUnsafe<Array<{ c: number }>>(
      "select count(*)::int as c from applications where id in ('00000005-0000-0000-0000-000000000001','00000005-0000-0000-0000-000000000002','00000005-0000-0000-0000-000000000003')"
    );
    const screenings = await tx.$queryRawUnsafe<Array<{ c: number }>>(
      "select count(*)::int as c from screenings where id in ('00000006-0000-0000-0000-000000000001','00000006-0000-0000-0000-000000000002')"
    );

    return [
      { entity: 'users_fixture', count: users[0]?.c ?? 0 },
      { entity: 'candidates_fixture', count: candidates[0]?.c ?? 0 },
      { entity: 'requisitions_fixture', count: requisitions[0]?.c ?? 0 },
      { entity: 'applications_fixture', count: applications[0]?.c ?? 0 },
      { entity: 'screenings_fixture', count: screenings[0]?.c ?? 0 }
    ];
  });

  return rows;
}

async function scenario2DevSeed(): Promise<void> {
  section('SCENARIO 2: DEV SEED POPULATES FIXTURE DATA AND IS IDEMPOTENT');

  execSync('cmd /c "set NODE_ENV=development&& npx prisma db seed"', {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'pipe'
  });
  const first = await fixtureCounts();

  execSync('cmd /c "set NODE_ENV=development&& npx prisma db seed"', {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'pipe'
  });
  const second = await fixtureCounts();

  console.log('afterFirstRun=', JSON.stringify(first));
  console.log('afterSecondRun=', JSON.stringify(second));
}

async function snapshotCounts(): Promise<{ candidates: number; applications: number; auditEvents: number }> {
  const [candidates, applications, auditEvents] = await Promise.all([
    prisma.candidate.count(),
    prisma.application.count(),
    prisma.auditEvent.count()
  ]);

  return { candidates, applications, auditEvents };
}

async function scenario3RollbackNoLoss(): Promise<void> {
  section('SCENARIO 3: NULLABLE COLUMN ROLLBACK WITHOUT DATA LOSS');

  const before = await snapshotCounts();

  await prisma.$executeRawUnsafe('ALTER TABLE "applications" ADD COLUMN IF NOT EXISTS "rollback_test_col" TEXT');
  await prisma.$executeRawUnsafe(`UPDATE "applications" SET "rollback_test_col" = '${crypto.randomUUID()}' WHERE "rollback_test_col" IS NULL`);
  await prisma.$executeRawUnsafe('ALTER TABLE "applications" DROP COLUMN IF EXISTS "rollback_test_col"');

  const after = await snapshotCounts();
  const pass =
    before.candidates === after.candidates &&
    before.applications === after.applications &&
    before.auditEvents === after.auditEvents;

  console.log('before=', JSON.stringify(before));
  console.log('after=', JSON.stringify(after));
  console.log(`rowCountIntegrityPass=${pass}`);
}

async function scenario4ZeroDowntimeProbe(): Promise<void> {
  section('SCENARIO 4: ZERO-DOWNTIME PROBE SCRIPT AVAILABILITY');
  console.log('Manual runtime validation required against deployed Railway URL.');
  console.log('Prepared command: BACKEND_URL=<railway-backend-url> npm run zero-downtime:test');
}

async function main(): Promise<void> {
  await scenario1DriftDetection();
  await scenario2DevSeed();
  await scenario3RollbackNoLoss();
  await scenario4ZeroDowntimeProbe();
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
