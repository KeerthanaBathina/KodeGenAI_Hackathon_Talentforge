import crypto from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { Prisma, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function section(name: string): void {
  console.log(`\n===== ${name} =====`);
}

async function validateSchemaAndPolicies(): Promise<void> {
  section('SCHEMA, TRIGGER, AND RLS POLICY STATE');

  const columns = await prisma.$queryRaw<
    Array<{
      column_name: string;
      data_type: string;
      character_maximum_length: number | null;
      is_nullable: string;
      column_default: string | null;
    }>
  >`
    SELECT column_name, data_type, character_maximum_length, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'audit_events'
    ORDER BY ordinal_position
  `;
  console.log('Columns:', JSON.stringify(columns, null, 2));

  const triggers = await prisma.$queryRaw<
    Array<{ trigger_name: string; event_manipulation: string; action_timing: string; action_orientation: string }>
  >`
    SELECT trigger_name, event_manipulation, action_timing, action_orientation
    FROM information_schema.triggers
    WHERE event_object_table = 'audit_events'
    ORDER BY trigger_name, event_manipulation
  `;
  console.log('Triggers:', JSON.stringify(triggers, null, 2));

  const rls = await prisma.$queryRaw<Array<{ relname: string; relrowsecurity: boolean }>>`
    SELECT relname, relrowsecurity
    FROM pg_class
    WHERE relname = 'audit_events'
  `;
  console.log('RLS enabled:', JSON.stringify(rls, null, 2));

  const policies = await prisma.$queryRaw<Array<{ policyname: string; cmd: string }>>`
    SELECT policyname, cmd
    FROM pg_policies
    WHERE tablename = 'audit_events'
    ORDER BY policyname
  `;
  console.log('Policies:', JSON.stringify(policies, null, 2));
}

async function validateImmutability(): Promise<void> {
  section('SCENARIO 1/2: IMMUTABILITY UPDATE/DELETE REJECTION');

  const row = await prisma.auditEvent.create({
    data: {
      eventType: 'validate.immutability',
      entityType: 'test',
      entityId: crypto.randomUUID(),
      payloadJson: { scenario: 'immutability' } as Prisma.InputJsonValue,
      userAgent: 'evidence-script'
    }
  });

  try {
    await prisma.auditEvent.update({
      where: { id: row.id },
      data: { eventType: 'tampered' }
    });
    console.log('FAIL: UPDATE unexpectedly succeeded');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(message.includes('IMMUTABLE_AUDIT_RECORD') ? 'PASS: UPDATE blocked' : `FAIL: UPDATE unexpected error: ${message}`);
  }

  try {
    await prisma.auditEvent.delete({ where: { id: row.id } });
    console.log('FAIL: DELETE unexpectedly succeeded');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(message.includes('IMMUTABLE_AUDIT_RECORD') ? 'PASS: DELETE blocked' : `FAIL: DELETE unexpected error: ${message}`);
  }
}

async function validateInsertContract(): Promise<void> {
  section('SCENARIO 3: INSERT WITH FULL FIELD CONTRACT');

  const inserted = await prisma.auditEvent.create({
    data: {
      eventType: 'validate.insert_contract',
      entityType: 'application',
      entityId: crypto.randomUUID(),
      payloadJson: { key: 'value', count: 1 } as Prisma.InputJsonValue,
      ipAddress: '203.0.113.42',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36'
    }
  });

  console.log(
    JSON.stringify(
      {
        id: inserted.id,
        actorId: inserted.actorId,
        eventType: inserted.eventType,
        entityType: inserted.entityType,
        entityId: inserted.entityId,
        payloadJson: inserted.payloadJson,
        ipAddress: inserted.ipAddress,
        userAgent: inserted.userAgent,
        createdAt: inserted.createdAt
      },
      null,
      2
    )
  );
}

async function runBurstInsert(concurrency: number): Promise<number> {
  const burst = await prisma.$queryRaw<Array<{ elapsed_ms: number; inserted_rows: number }>>`
    WITH t0 AS (
      SELECT clock_timestamp() AS started_at
    ),
    ins AS (
      INSERT INTO "audit_events" ("id", "eventType", "entityType", "entityId", "payloadJson", "ipAddress", "userAgent")
      SELECT
        gen_random_uuid(),
        'validate.bulk_insert',
        'test',
        gen_random_uuid(),
        jsonb_build_object('index', gs, 'ts', floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint),
        '127.0.0.1'::inet,
        concat('LoadTestAgent/', gs)
      FROM generate_series(1, ${concurrency}) AS gs
      CROSS JOIN t0
      RETURNING 1
    )
    SELECT
      EXTRACT(EPOCH FROM (clock_timestamp() - t0.started_at)) * 1000 AS elapsed_ms,
      (SELECT COUNT(*) FROM ins)::int AS inserted_rows
    FROM t0
  `;

  const elapsed = burst[0]?.elapsed_ms ?? 0;
  const inserted = burst[0]?.inserted_rows ?? 0;
  console.log(`Burst rows inserted: ${inserted}`);
  console.log(`Burst elapsed (DB-side): ${elapsed.toFixed(2)} ms`);

  return elapsed;
}

async function validateLoad(): Promise<void> {
  section('SCENARIO 4: BULK WRITES PERFORMANCE + DEADLOCK CHECK');

  const elapsed = await runBurstInsert(50);
  if (elapsed < 100) {
    console.log('PASS: 50-event burst completed under 100 ms');
  } else {
    console.log(`FAIL: 50-event burst exceeded 100 ms (${elapsed.toFixed(2)} ms)`);
  }

  let deadlocks = 0;
  const rounds = 3;
  const start = performance.now();
  for (let i = 0; i < rounds; i += 1) {
    const inserts = await Promise.all(
      Array.from({ length: 50 }, async (_, index) => {
        try {
          await prisma.auditEvent.create({
            data: {
              eventType: 'validate.deadlock_probe',
              entityType: 'test',
              entityId: crypto.randomUUID(),
              payloadJson: { round: i + 1, index } as Prisma.InputJsonValue
            }
          });
        } catch (error) {
          const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
          if (message.includes('deadlock')) {
            deadlocks += 1;
          }
        }
      })
    );
    void inserts;
  }
  const total = performance.now() - start;
  console.log(`Deadlocks detected across 3 x 50 inserts: ${deadlocks}`);
  console.log(`Probe elapsed (client-side): ${total.toFixed(2)} ms`);
}

async function validateRlsBehavior(): Promise<void> {
  section('RLS BEHAVIOR CHECK (CANDIDATE VS ADMIN CLAIMS)');

  const candidateA = await prisma.user.create({
    data: {
      id: crypto.randomUUID(),
      email: `audit-rls-candidate-a-${Date.now()}@test.internal`,
      role: 'candidate',
      fullName: 'Audit Candidate A'
    }
  });
  const candidateB = await prisma.user.create({
    data: {
      id: crypto.randomUUID(),
      email: `audit-rls-candidate-b-${Date.now()}@test.internal`,
      role: 'candidate',
      fullName: 'Audit Candidate B'
    }
  });

  await prisma.auditEvent.createMany({
    data: [
      {
        id: crypto.randomUUID(),
        actorId: candidateA.id,
        eventType: 'validate.rls',
        entityType: 'candidate',
        entityId: candidateA.id,
        payloadJson: { owner: 'a' }
      },
      {
        id: crypto.randomUUID(),
        actorId: candidateB.id,
        eventType: 'validate.rls',
        entityType: 'candidate',
        entityId: candidateB.id,
        payloadJson: { owner: 'b' }
      }
    ]
  });

  const candidateRows = await prisma.$transaction(async (tx) => {
    const claims = JSON.stringify({ sub: candidateA.id, role: 'candidate' }).replace(/'/g, "''");
    await tx.$executeRawUnsafe('SET LOCAL ROLE authenticated');
    await tx.$executeRawUnsafe(`SELECT set_config('request.jwt.claims', '${claims}', true)`);
    return tx.$queryRawUnsafe<Array<{ actorId: string | null }>>(
      "SELECT \"actorId\" FROM \"audit_events\" WHERE \"eventType\" = 'validate.rls' ORDER BY \"createdAt\" DESC LIMIT 20"
    );
  });

  const candidateLeak = candidateRows.filter((row) => row.actorId !== candidateA.id);
  console.log(`Candidate claim rows: ${candidateRows.length}`);
  console.log(candidateLeak.length === 0 ? 'PASS: candidate sees only own rows' : `FAIL: candidate leak rows = ${candidateLeak.length}`);

  const adminRows = await prisma.$transaction(async (tx) => {
    const claims = JSON.stringify({ sub: crypto.randomUUID(), role: 'admin' }).replace(/'/g, "''");
    await tx.$executeRawUnsafe('SET LOCAL ROLE authenticated');
    await tx.$executeRawUnsafe(`SELECT set_config('request.jwt.claims', '${claims}', true)`);
    return tx.$queryRawUnsafe<Array<{ actorId: string | null }>>(
      "SELECT \"actorId\" FROM \"audit_events\" WHERE \"eventType\" = 'validate.rls' ORDER BY \"createdAt\" DESC LIMIT 20"
    );
  });

  const adminActorIds = new Set(adminRows.map((row) => row.actorId).filter((id): id is string => Boolean(id)));
  console.log(`Admin claim rows: ${adminRows.length}`);
  console.log(adminActorIds.has(candidateA.id) && adminActorIds.has(candidateB.id) ? 'PASS: admin can read both actor rows' : 'FAIL: admin cannot read full audit scope');
}

async function main(): Promise<void> {
  await validateSchemaAndPolicies();
  await validateImmutability();
  await validateInsertContract();
  await validateLoad();
  await validateRlsBehavior();
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
