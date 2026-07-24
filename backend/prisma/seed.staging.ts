import { PrismaClient } from '@prisma/client';
import { runSharedSeeds } from './seed.shared';

export async function runStagingSeeds(prisma: PrismaClient): Promise<void> {
  console.log('Running staging seeds (configuration data only) ...');
  await runSharedSeeds(prisma);
  console.log('Staging seed complete.');
}
