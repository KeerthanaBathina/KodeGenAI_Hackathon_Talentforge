#!/usr/bin/env tsx

import { refreshPipelineKpiMaterializedView } from '../src/services/pipelineKpiRefreshService';
import prisma from '../src/db/prisma';

async function main(): Promise<void> {
  const result = await refreshPipelineKpiMaterializedView();
  console.log(
    `[analytics:pipeline:refresh] refreshed at ${result.lastRefreshedAt.toISOString()} in ${result.durationMs}ms`
  );
}

main()
  .catch((error) => {
    console.error('[analytics:pipeline:refresh] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
