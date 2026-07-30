import crypto from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { archiveExpiredAuditEvents } from '../src/services/auditArchiveService';

const prisma = new PrismaClient();

function section(title: string): void {
  console.log(`\n===== ${title} =====`);
}

async function cleanupSeededRows(rowIds: string[]): Promise<void> {
  if (rowIds.length === 0) {
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SELECT set_config('app.audit_archive_purge', 'true', true)");
    await tx.auditEvent.deleteMany({
      where: {
        id: {
          in: rowIds
        }
      }
    });
  });
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Do not run validate-audit-retention-archive.ts in production environments.');
  }

  const seededRowIds: string[] = [];

  section('SEED ELIGIBLE AUDIT EVENTS');

  const seededRows = await prisma.$transaction(async (tx) => {
    const one = await tx.auditEvent.create({
      data: {
        eventType: 'validate.audit_retention_archive',
        entityType: 'retention_validation',
        entityId: crypto.randomUUID(),
        payloadJson: {
          scenario: 'seed-1',
          marker: Date.now()
        } as Prisma.InputJsonValue,
        createdAt: new Date('2016-01-01T00:00:00.000Z')
      }
    });

    const two = await tx.auditEvent.create({
      data: {
        eventType: 'validate.audit_retention_archive',
        entityType: 'retention_validation',
        entityId: crypto.randomUUID(),
        payloadJson: {
          scenario: 'seed-2',
          marker: Date.now() + 1
        } as Prisma.InputJsonValue,
        createdAt: new Date('2016-01-01T00:01:00.000Z')
      }
    });

    return [one, two];
  });

  seededRows.forEach((row) => seededRowIds.push(row.id));

  console.log('Seeded row IDs:', seededRowIds.join(', '));

  section('RUN ARCHIVE SERVICE');

  const result = await archiveExpiredAuditEvents({
    now: new Date('2026-07-30T00:00:00.000Z'),
    retentionYears: 7,
    batchSize: 2,
    chunkSize: 2
  });

  console.log(
    JSON.stringify(
      {
        cutoff: result.cutoff.toISOString(),
        chunkCount: result.chunkCount,
        archivedRowCount: result.archivedRowCount,
        deletedRowCount: result.deletedRowCount,
        durationMs: result.durationMs,
        chunks: result.chunks.map((chunk) => ({
          storagePath: chunk.storagePath,
          checksum: chunk.checksum,
          rowCount: chunk.rowCount,
          deletedRowCount: chunk.deletedRowCount
        }))
      },
      null,
      2
    )
  );

  section('VERIFY ARCHIVE INDEX AND SOURCE PURGE LINKAGE');

  const remainingSourceRows = await prisma.auditEvent.count({
    where: {
      id: {
        in: seededRowIds
      }
    }
  });

  const firstChunk = result.chunks[0];
  const indexEntry = firstChunk
    ? await prisma.auditArchiveIndex.findUnique({
        where: {
          storagePath: firstChunk.storagePath
        }
      })
    : null;

  console.log(`remainingSourceRows=${remainingSourceRows}`);
  console.log(`archiveIndexFound=${Boolean(indexEntry)}`);
  console.log(`archiveIndexRowCount=${indexEntry?.rowCount ?? 'n/a'}`);
  console.log(`archiveStoragePath=${indexEntry?.storagePath ?? 'n/a'}`);

  const linkagePass = remainingSourceRows === 0 && Boolean(indexEntry) && indexEntry?.rowCount === seededRowIds.length;
  console.log(linkagePass ? 'PASS: archive index and source purge linkage verified' : 'FAIL: linkage verification failed');

  if (!linkagePass) {
    throw new Error('Archive retention validation failed: linkage checks did not pass');
  }

  section('CLEANUP VALIDATION INDEX ENTRY');

  if (firstChunk) {
    await prisma.auditArchiveIndex.deleteMany({
      where: {
        storagePath: firstChunk.storagePath
      }
    });
  }

  await cleanupSeededRows(seededRowIds);
}

main()
  .catch(async (error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
