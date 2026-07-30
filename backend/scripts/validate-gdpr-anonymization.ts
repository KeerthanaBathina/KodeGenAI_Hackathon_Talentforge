import crypto from 'node:crypto';
import { CandidateStatus, Prisma, PrismaClient } from '@prisma/client';
import { processGdprErasureRequestById } from '../src/services/candidateAnonymizationService';
import {
  __setAuditArchiveStorageAdapterForTests,
  archiveExpiredAuditEvents,
  calculateAuditArchiveCutoff
} from '../src/services/auditArchiveService';
import { calculateErasureDueAt } from '../src/services/gdprErasureRequestService';

const prisma = new PrismaClient();
const runStartedAt = new Date();

const createdUserIds = new Set<string>();
const createdCandidateIds = new Set<string>();
const createdJobFamilyIds = new Set<string>();
const createdRequisitionIds = new Set<string>();
const createdApplicationIds = new Set<string>();
const seededAuditEventIds = new Set<string>();
const createdArchivePaths = new Set<string>();

function section(title: string): void {
  console.log(`\n===== ${title} =====`);
}

async function cleanupAuditRows(): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SELECT set_config('app.audit_archive_purge', 'true', true)");

    if (seededAuditEventIds.size > 0) {
      await tx.auditEvent.deleteMany({
        where: {
          id: {
            in: Array.from(seededAuditEventIds)
          }
        }
      });
    }

    await tx.auditEvent.deleteMany({
      where: {
        eventType: {
          in: [
            'gdpr_erasure_processing_started',
            'gdpr_erasure_processing_completed',
            'gdpr_erasure_processing_failed',
            'candidate_anonymized',
            'compliance.audit_archive_chunk_completed',
            'compliance.audit_archive_run_completed',
            'compliance.audit_archive_run_failed'
          ]
        },
        createdAt: {
          gte: runStartedAt
        }
      }
    });
  });
}

async function cleanupSeedData(): Promise<void> {
  if (createdArchivePaths.size > 0) {
    await prisma.auditArchiveIndex.deleteMany({
      where: {
        storagePath: {
          in: Array.from(createdArchivePaths)
        }
      }
    });
  }

  if (createdApplicationIds.size > 0) {
    await prisma.decision.deleteMany({
      where: {
        applicationId: {
          in: Array.from(createdApplicationIds)
        }
      }
    });

    await prisma.interviewStage.deleteMany({
      where: {
        applicationId: {
          in: Array.from(createdApplicationIds)
        }
      }
    });

    await prisma.screening.deleteMany({
      where: {
        applicationId: {
          in: Array.from(createdApplicationIds)
        }
      }
    });

    await prisma.application.deleteMany({
      where: {
        id: {
          in: Array.from(createdApplicationIds)
        }
      }
    });
  }

  if (createdRequisitionIds.size > 0) {
    await prisma.requisition.deleteMany({
      where: {
        id: {
          in: Array.from(createdRequisitionIds)
        }
      }
    });
  }

  if (createdJobFamilyIds.size > 0) {
    await prisma.jobFamily.deleteMany({
      where: {
        id: {
          in: Array.from(createdJobFamilyIds)
        }
      }
    });
  }

  if (createdCandidateIds.size > 0) {
    await prisma.gdprErasureRequest.deleteMany({
      where: {
        candidateId: {
          in: Array.from(createdCandidateIds)
        }
      }
    });

    await prisma.profile.deleteMany({
      where: {
        candidateId: {
          in: Array.from(createdCandidateIds)
        }
      }
    });

    await prisma.candidate.deleteMany({
      where: {
        id: {
          in: Array.from(createdCandidateIds)
        }
      }
    });
  }

  if (createdUserIds.size > 0) {
    await prisma.user.deleteMany({
      where: {
        id: {
          in: Array.from(createdUserIds)
        }
      }
    });
  }
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Do not run validate-gdpr-anonymization.ts in production environments.');
  }

  const payloadStore = new Map<string, Buffer>();
  __setAuditArchiveStorageAdapterForTests({
    async upload(_bucket, path, payload) {
      payloadStore.set(path, Buffer.from(payload));
    },
    async download(_bucket, path) {
      const payload = payloadStore.get(path);
      if (!payload) {
        throw new Error(`Missing in-memory archive payload for ${path}`);
      }

      return Buffer.from(payload);
    }
  });

  section('SEED ANONYMIZATION FIXTURE DATA');

  const seedSuffix = Date.now();
  const adminUser = await prisma.user.create({
    data: {
      email: `gdpr-validator-admin-${seedSuffix}@example.com`,
      role: 'admin',
      fullName: 'GDPR Validation Admin'
    }
  });
  createdUserIds.add(adminUser.id);

  const candidate = await prisma.candidate.create({
    data: {
      email: `gdpr-validator-candidate-${seedSuffix}@example.com`,
      status: CandidateStatus.active
    }
  });
  createdCandidateIds.add(candidate.id);

  await prisma.profile.create({
    data: {
      candidateId: candidate.id,
      fullName: 'Validation Candidate',
      experienceYears: 5,
      skills: ['typescript', 'nodejs'],
      education: [
        {
          institution: 'State University',
          dateOfBirth: '1992-04-20',
          contactEmail: 'validation.candidate@example.com',
          address: '88 Redaction Road'
        }
      ] as Prisma.InputJsonValue,
      workHistory: [
        {
          employer: 'Acme Corp',
          mobileNumber: '+1-555-3030',
          city: 'Dallas'
        }
      ] as Prisma.InputJsonValue,
      rawParseJson: {
        fullName: 'Validation Candidate',
        email: 'validation.candidate@example.com',
        dob: '1992-04-20',
        address: '88 Redaction Road'
      } as Prisma.InputJsonValue
    }
  });

  const jobFamily = await prisma.jobFamily.create({
    data: {
      name: `GDPR Validation Family ${seedSuffix}`,
      matchScoreThreshold: 75,
      confidenceThreshold: new Prisma.Decimal('0.80'),
      experienceThresholdYears: 2,
      effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
      createdById: adminUser.id
    }
  });
  createdJobFamilyIds.add(jobFamily.id);

  const requisition = await prisma.requisition.create({
    data: {
      title: `GDPR Validation Requisition ${seedSuffix}`,
      department: 'Engineering',
      jobFamilyId: jobFamily.id,
      location: 'Remote',
      jobType: 'full_time',
      slots: 1,
      eligibilityCriteria: {
        minExperienceYears: 2
      } as Prisma.InputJsonValue,
      requiredSkills: ['typescript'],
      preferredSkills: ['postgres']
    }
  });
  createdRequisitionIds.add(requisition.id);

  const application = await prisma.application.create({
    data: {
      candidateId: candidate.id,
      requisitionId: requisition.id,
      status: 'submitted'
    }
  });
  createdApplicationIds.add(application.id);

  await prisma.screening.create({
    data: {
      applicationId: application.id,
      score: 82,
      recommendation: 'shortlist',
      factors: {
        positiveFactors: ['skills_match'],
        skillGaps: []
      } as Prisma.InputJsonValue,
      thresholdVersion: 1
    }
  });

  await prisma.interviewStage.create({
    data: {
      applicationId: application.id,
      type: 'technical',
      timezone: 'UTC',
      panelMembers: [adminUser.id],
      state: 'scheduled'
    }
  });

  await prisma.decision.create({
    data: {
      applicationId: application.id,
      outcome: 'hold',
      decidedById: adminUser.id
    }
  });

  const requestedAt = new Date('2026-07-01T00:00:00.000Z');
  const dueAt = calculateErasureDueAt(requestedAt);
  const erasureRequest = await prisma.gdprErasureRequest.create({
    data: {
      candidateId: candidate.id,
      requestedAt,
      dueAt,
      status: 'pending',
      requestReason: 'Validation scenario for GDPR anonymization evidence'
    }
  });

  section('VALIDATE ANONYMIZATION CORRECTNESS + TIMING');

  const anonymizationResult = await processGdprErasureRequestById(erasureRequest.id);
  if (anonymizationResult.outcome !== 'completed') {
    throw new Error(`Anonymization did not complete successfully: ${anonymizationResult.outcome}`);
  }

  const candidateAfter = await prisma.candidate.findUnique({
    where: { id: candidate.id },
    include: {
      profile: true
    }
  });

  const expectedDueAtIso = dueAt.toISOString();
  const dueDatePass = erasureRequest.dueAt.toISOString() === expectedDueAtIso;

  const anonymizationPass =
    candidateAfter?.status === CandidateStatus.anonymized
    && typeof candidateAfter.email === 'string'
    && candidateAfter.email.startsWith(`anon-${candidate.id.toLowerCase()}@redacted`)
    && candidateAfter.phone === null
    && candidateAfter.profile?.fullName === 'ANONYMISED';

  const preservedCounts = await prisma.$transaction(async (tx) => {
    const applicationCount = await tx.application.count({ where: { id: application.id } });
    const screeningCount = await tx.screening.count({ where: { applicationId: application.id } });
    const interviewCount = await tx.interviewStage.count({ where: { applicationId: application.id } });
    const decisionCount = await tx.decision.count({ where: { applicationId: application.id } });

    return {
      applicationCount,
      screeningCount,
      interviewCount,
      decisionCount
    };
  });

  const preservationPass =
    preservedCounts.applicationCount === 1
    && preservedCounts.screeningCount === 1
    && preservedCounts.interviewCount === 1
    && preservedCounts.decisionCount === 1;

  console.log(`dueDatePass=${dueDatePass} expectedDueAt=${expectedDueAtIso}`);
  console.log(`anonymizationPass=${anonymizationPass}`);
  console.log(`preservationPass=${preservationPass}`);

  section('VALIDATE RETENTION CUTOFF + ARCHIVE INDEX RECONCILIATION');

  const archiveNow = new Date('2026-07-30T00:00:00.000Z');
  const computedCutoff = calculateAuditArchiveCutoff(archiveNow, 7);
  const expectedCutoffIso = '2019-07-30T00:00:00.000Z';
  const cutoffPass = computedCutoff.toISOString() === expectedCutoffIso;

  const oldAuditOne = await prisma.auditEvent.create({
    data: {
      eventType: 'validate.gdpr_retention',
      entityType: 'gdpr_validation',
      entityId: crypto.randomUUID(),
      payloadJson: {
        marker: `seed-1-${seedSuffix}`
      } as Prisma.InputJsonValue,
      createdAt: new Date('1900-01-01T00:00:00.000Z')
    }
  });

  const oldAuditTwo = await prisma.auditEvent.create({
    data: {
      eventType: 'validate.gdpr_retention',
      entityType: 'gdpr_validation',
      entityId: crypto.randomUUID(),
      payloadJson: {
        marker: `seed-2-${seedSuffix}`
      } as Prisma.InputJsonValue,
      createdAt: new Date('1900-01-01T00:01:00.000Z')
    }
  });

  seededAuditEventIds.add(oldAuditOne.id);
  seededAuditEventIds.add(oldAuditTwo.id);

  const archiveResult = await archiveExpiredAuditEvents({
    now: archiveNow,
    retentionYears: 7,
    batchSize: 2,
    chunkSize: 2
  });

  archiveResult.chunks.forEach((chunk) => {
    createdArchivePaths.add(chunk.storagePath);
  });

  const remainingSeedRows = await prisma.auditEvent.count({
    where: {
      id: {
        in: [oldAuditOne.id, oldAuditTwo.id]
      }
    }
  });

  const archiveIndexRows = await prisma.auditArchiveIndex.count({
    where: {
      storagePath: {
        in: Array.from(createdArchivePaths)
      }
    }
  });

  const archiveReconciliationPass = remainingSeedRows === 0 && archiveIndexRows > 0;

  console.log(`cutoffPass=${cutoffPass} computedCutoff=${computedCutoff.toISOString()}`);
  console.log(`archiveReconciliationPass=${archiveReconciliationPass}`);
  console.log(`archiveChunkCount=${archiveResult.chunkCount}`);
  console.log(`archiveArchivedRows=${archiveResult.archivedRowCount}`);
  console.log(`archiveDeletedRows=${archiveResult.deletedRowCount}`);

  const pass = dueDatePass && anonymizationPass && preservationPass && cutoffPass && archiveReconciliationPass;

  if (!pass) {
    throw new Error('GDPR anonymization/retention validation failed. Review output above.');
  }

  console.log('PASS: GDPR anonymization and retention validation checks succeeded');
}

main()
  .catch(async (error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    __setAuditArchiveStorageAdapterForTests(null);

    try {
      await cleanupAuditRows();
      await cleanupSeedData();
    } catch (cleanupError) {
      console.error('Cleanup failed:', cleanupError);
      process.exitCode = 1;
    }

    await prisma.$disconnect();
  });