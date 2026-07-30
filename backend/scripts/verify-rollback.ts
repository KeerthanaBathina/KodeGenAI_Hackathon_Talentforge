import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const SNAPSHOT_FILE = path.join(os.tmpdir(), 'rollback-snapshot.json');

interface Snapshot {
  candidateCount: number;
  applicationCount: number;
  auditEventCount: number;
  timestamp: string;
}

async function takeSnapshot(): Promise<Snapshot> {
  const [candidateCount, applicationCount, auditEventCount] = await Promise.all([
    prisma.candidate.count(),
    prisma.application.count(),
    prisma.auditEvent.count()
  ]);

  return {
    candidateCount,
    applicationCount,
    auditEventCount,
    timestamp: new Date().toISOString()
  };
}

async function main(): Promise<void> {
  const mode = process.argv[2];

  if (mode === 'pre') {
    const snapshot = await takeSnapshot();
    fs.writeFileSync(SNAPSHOT_FILE, JSON.stringify(snapshot, null, 2));
    console.log('Pre-rollback snapshot saved.');
    console.table(snapshot);
    console.log(`Snapshot path: ${SNAPSHOT_FILE}`);
    return;
  }

  if (mode === 'post') {
    if (!fs.existsSync(SNAPSHOT_FILE)) {
      console.error('No pre-rollback snapshot found. Run rollback:pre first.');
      process.exit(1);
    }

    const before = JSON.parse(fs.readFileSync(SNAPSHOT_FILE, 'utf-8')) as Snapshot;
    const after = await takeSnapshot();

    const checks: Array<{ table: string; before: number; after: number }> = [
      { table: 'candidates', before: before.candidateCount, after: after.candidateCount },
      { table: 'applications', before: before.applicationCount, after: after.applicationCount },
      { table: 'audit_events', before: before.auditEventCount, after: after.auditEventCount }
    ];

    let hasMismatch = false;
    for (const check of checks) {
      const pass = check.before === check.after;
      if (!pass) {
        hasMismatch = true;
      }
      console.log(`${pass ? 'PASS' : 'FAIL'} ${check.table}: before=${check.before}, after=${check.after}`);
    }

    if (hasMismatch) {
      console.error('FAIL: Row count mismatch detected.');
      process.exit(1);
    }

    console.log('PASS: All row counts match. Rollback completed without data loss.');
    fs.unlinkSync(SNAPSHOT_FILE);
    return;
  }

  console.error('Usage: npx tsx scripts/verify-rollback.ts [pre|post]');
  process.exit(1);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
