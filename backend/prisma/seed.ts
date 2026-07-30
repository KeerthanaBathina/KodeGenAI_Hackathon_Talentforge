import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const env = process.env['NODE_ENV'] ?? 'development';
  console.log(`Seeding for environment: ${env}`);

  if (env === 'staging') {
    const { runStagingSeeds } = await import('./seed.staging');
    await runStagingSeeds(prisma);
    return;
  }

  if (env === 'production') {
    const { runSharedSeeds } = await import('./seed.shared');
    await runSharedSeeds(prisma);
    return;
  }

  const { runDevSeeds } = await import('./seed.dev');
  await runDevSeeds(prisma);
}

main()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
