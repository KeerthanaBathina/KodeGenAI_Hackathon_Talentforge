const crypto = require('node:crypto');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

function printSection(title) {
  console.log(`\n===== ${title} =====`);
}

async function scenario1TableAndColumns() {
  printSection('SCENARIO 1: TABLE COUNT');
  const tableCount = await prisma.$queryRawUnsafe(`
    SELECT COUNT(*)::int AS table_count
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
  `);
  console.log(JSON.stringify(tableCount, null, 2));

  printSection('SCENARIO 1: COLUMN SPOT CHECK');
  const columns = await prisma.$queryRawUnsafe(`
    SELECT
      table_name,
      column_name,
      data_type,
      is_nullable,
      column_default
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name IN ('candidates', 'applications', 'screenings', 'users')
    ORDER BY table_name, ordinal_position
  `);
  console.log(JSON.stringify(columns, null, 2));
}

async function scenario2FkIntegrity() {
  printSection('SCENARIO 2: FK INTEGRITY');
  const userId = crypto.randomUUID();
  const familyId = crypto.randomUUID();
  const reqId = crypto.randomUUID();
  const candId = crypto.randomUUID();

  await prisma.user.create({
    data: {
      id: userId,
      email: `fk-user-${userId}@test.internal`,
      role: 'recruiter',
      fullName: 'FK User'
    }
  });

  await prisma.jobFamily.create({
    data: {
      id: familyId,
      name: `FK Family ${Date.now()}`,
      matchScoreThreshold: 70,
      confidenceThreshold: 0.8,
      experienceThresholdYears: 3,
      effectiveFrom: new Date(),
      createdById: userId
    }
  });

  await prisma.requisition.create({
    data: {
      id: reqId,
      title: 'FK Req',
      department: 'Engineering',
      jobFamilyId: familyId,
      location: 'Remote',
      jobType: 'full_time',
      slots: 1,
      status: 'open',
      eligibilityCriteria: {},
      openedAt: new Date()
    }
  });

  await prisma.candidate.create({
    data: {
      id: candId,
      email: `fk-candidate-${candId}@example.com`,
      phone: `+1${Date.now()}${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`,
      consentVersion: '1.0',
      consentTimestamp: new Date(),
      status: 'active'
    }
  });

  await prisma.application.create({
    data: {
      candidateId: candId,
      requisitionId: reqId,
      status: 'submitted'
    }
  });

  try {
    await prisma.requisition.delete({ where: { id: reqId } });
    console.log('FAIL: DELETE requisition succeeded unexpectedly');
  } catch (error) {
    const code = error && typeof error === 'object' ? error.code : undefined;
    if (code === 'P2003') {
      console.log('PASS: DELETE blocked by FK constraint (P2003)');
    } else {
      throw error;
    }
  }
}

async function scenario3UniqueConstraints() {
  printSection('SCENARIO 3: UNIQUE CONSTRAINTS');
  const baseEmail = `unique-${Date.now()}@example.com`;
  const firstPhone = `+1${Date.now()}111`;
  const secondPhone = `+1${Date.now()}222`;

  await prisma.candidate.create({
    data: {
      email: baseEmail,
      phone: firstPhone,
      consentVersion: '1.0',
      consentTimestamp: new Date(),
      status: 'active'
    }
  });

  try {
    await prisma.candidate.create({
      data: {
        email: baseEmail,
        phone: secondPhone,
        consentVersion: '1.0',
        consentTimestamp: new Date(),
        status: 'active'
      }
    });
    console.log('FAIL: duplicate email accepted unexpectedly');
  } catch (error) {
    const code = error && typeof error === 'object' ? error.code : undefined;
    console.log(code === 'P2002' ? 'PASS: duplicate email rejected (P2002)' : 'FAIL: unexpected duplicate email error');
  }

  const email1 = `phone-a-${Date.now()}@example.com`;
  const email2 = `phone-b-${Date.now()}@example.com`;
  const sharedPhone = `+1${Date.now()}999`;

  await prisma.candidate.create({
    data: {
      email: email1,
      phone: sharedPhone,
      consentVersion: '1.0',
      consentTimestamp: new Date(),
      status: 'active'
    }
  });

  try {
    await prisma.candidate.create({
      data: {
        email: email2,
        phone: sharedPhone,
        consentVersion: '1.0',
        consentTimestamp: new Date(),
        status: 'active'
      }
    });
    console.log('FAIL: duplicate phone accepted unexpectedly');
  } catch (error) {
    const code = error && typeof error === 'object' ? error.code : undefined;
    console.log(code === 'P2002' ? 'PASS: duplicate phone rejected (P2002)' : 'FAIL: unexpected duplicate phone error');
  }
}

async function scenario4ExplainPlan() {
  printSection('SCENARIO 4: EXPLAIN PLAN');
  const result = await prisma.$queryRawUnsafe(`
    EXPLAIN (ANALYZE, FORMAT TEXT)
    SELECT id, status, "submittedAt"
    FROM applications
    WHERE "requisitionId" = (SELECT "requisitionId" FROM applications LIMIT 1)
      AND status IN ('submitted', 'screening')
    ORDER BY "submittedAt" DESC
    LIMIT 50
  `);

  const plan = result.map((row) => row['QUERY PLAN']).join('\n');
  console.log(plan);
}

async function scenario5RlsEnabled() {
  printSection('SCENARIO 5: RLS ENABLED TABLES');
  const rows = await prisma.$queryRawUnsafe(`
    SELECT relname AS table_name, relrowsecurity AS rls_enabled
    FROM pg_class
    WHERE relname IN ('candidates', 'applications', 'screenings', 'reviews', 'decisions')
    ORDER BY relname
  `);
  console.log(JSON.stringify(rows, null, 2));
}

async function main() {
  await scenario1TableAndColumns();
  await scenario2FkIntegrity();
  await scenario3UniqueConstraints();
  await scenario4ExplainPlan();
  await scenario5RlsEnabled();
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
