import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';
import { JobType, PrismaClient, RequisitionStatus, UserRole } from '@prisma/client';

const supabaseUrl = process.env['SUPABASE_URL'];
const supabaseAnonKey = process.env['SUPABASE_ANON_KEY'];
const prisma = new PrismaClient();

async function signIn(email: string, password: string): Promise<string> {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY are required for Supabase auth mode.');
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey);
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.session) {
    throw new Error(`Sign-in failed: ${error?.message ?? 'missing session'}`);
  }
  return data.session.access_token;
}

async function testCandidateRLS(
  candidateEmail: string,
  candidatePassword: string,
  expectedCandidateId: string
): Promise<void> {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY are required for Supabase auth mode.');
  }

  console.log(`\nTesting RLS for candidate: ${candidateEmail}`);

  const token = await signIn(candidateEmail, candidatePassword);
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  });

  const { data: applications, error } = await supabase
    .from('applications')
    .select('id, candidate_id, status');

  if (error) {
    throw new Error(`Query failed: ${error.message}`);
  }

  const rows = applications ?? [];
  const leaked = rows.filter((row) => row.candidate_id !== expectedCandidateId);

  if (leaked.length > 0) {
    throw new Error(`RLS failure: ${leaked.length} rows leaked from other candidates.`);
  }

  console.log(`  PASS: ${rows.length} rows returned, all owned by ${expectedCandidateId}`);
}

async function ensureRlsSeedData(): Promise<{ candidateAId: string; candidateBId: string }> {
  const requisition = await prisma.requisition.findFirst({ select: { id: true } });
  let requisitionId = requisition?.id;

  if (!requisitionId) {
    const seedUserEmail = `rls-seed-user-${Date.now()}@test.internal`;
    const user = await prisma.user.create({
      data: {
        id: crypto.randomUUID(),
        email: seedUserEmail,
        role: UserRole.recruiter,
        fullName: 'RLS Seed User'
      }
    });

    const jobFamily = await prisma.jobFamily.create({
      data: {
        name: `RLS Seed Family ${Date.now()}`,
        matchScoreThreshold: 70,
        confidenceThreshold: 0.8,
        experienceThresholdYears: 3,
        effectiveFrom: new Date(),
        createdById: user.id
      }
    });

    const createdRequisition = await prisma.requisition.create({
      data: {
        title: 'RLS Seed Requisition',
        department: 'Engineering',
        jobFamilyId: jobFamily.id,
        location: 'Remote',
        jobType: JobType.full_time,
        slots: 10,
        status: RequisitionStatus.open,
        eligibilityCriteria: {},
        openedAt: new Date()
      }
    });
    requisitionId = createdRequisition.id;
  }

  const candidateAId = crypto.randomUUID();
  const candidateBId = crypto.randomUUID();

  await prisma.candidate.createMany({
    data: [
      {
        id: candidateAId,
        email: `rls-a-${candidateAId}@example.com`,
        phone: `+1${Date.now()}001`,
        consentVersion: '1.0',
        consentTimestamp: new Date(),
        status: 'active'
      },
      {
        id: candidateBId,
        email: `rls-b-${candidateBId}@example.com`,
        phone: `+1${Date.now()}002`,
        consentVersion: '1.0',
        consentTimestamp: new Date(),
        status: 'active'
      }
    ]
  });

  await prisma.application.createMany({
    data: [
      {
        candidateId: candidateAId,
        requisitionId,
        status: 'submitted'
      },
      {
        candidateId: candidateBId,
        requisitionId,
        status: 'screening'
      }
    ]
  });

  return { candidateAId, candidateBId };
}

async function testCandidateRlsViaDb(expectedCandidateId: string, label: string): Promise<void> {
  console.log(`\nTesting DB-level RLS for candidate: ${label}`);

  const rows = await prisma.$transaction(async (tx) => {
    const claimsJson = JSON.stringify({ sub: expectedCandidateId, role: 'candidate' }).replace(/'/g, "''");
    await tx.$executeRawUnsafe('SET LOCAL ROLE authenticated');
    await tx.$executeRawUnsafe(`SELECT set_config('request.jwt.claims', '${claimsJson}', true)`);
    return tx.$queryRawUnsafe<Array<{ id: string; candidateId: string }>>(
      'SELECT id, "candidateId" FROM applications ORDER BY "createdAt" DESC LIMIT 200'
    );
  });

  const leaked = rows.filter((row) => row.candidateId !== expectedCandidateId);
  if (leaked.length > 0) {
    throw new Error(`RLS failure: ${leaked.length} rows leaked from other candidates.`);
  }

  console.log(`  PASS: ${rows.length} rows returned, all owned by ${expectedCandidateId}`);
}

async function main(): Promise<void> {
  const candidate1Email = process.env['TEST_CANDIDATE_1_EMAIL'];
  const candidate1Password = process.env['TEST_CANDIDATE_1_PASSWORD'];
  const candidate1Id = process.env['TEST_CANDIDATE_1_ID'];

  const candidate2Email = process.env['TEST_CANDIDATE_2_EMAIL'];
  const candidate2Password = process.env['TEST_CANDIDATE_2_PASSWORD'];
  const candidate2Id = process.env['TEST_CANDIDATE_2_ID'];

  const canUseSupabaseAuthMode =
    Boolean(supabaseUrl && supabaseAnonKey) &&
    Boolean(candidate1Email && candidate1Password && candidate1Id) &&
    Boolean(candidate2Email && candidate2Password && candidate2Id);

  if (canUseSupabaseAuthMode) {
    await testCandidateRLS(candidate1Email!, candidate1Password!, candidate1Id!);
    await testCandidateRLS(candidate2Email!, candidate2Password!, candidate2Id!);

    console.log('\nAll RLS checks passed.');
    return;
  }

  console.log('Supabase auth test inputs are incomplete; running DB-level RLS fallback validation.');

  const { candidateAId, candidateBId } = await ensureRlsSeedData();
  await testCandidateRlsViaDb(candidateAId, 'candidate-a');
  await testCandidateRlsViaDb(candidateBId, 'candidate-b');

  console.log('\nAll RLS checks passed.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
