import { shouldSendNotification } from '../src/services/notificationPreferenceService';
import { NotificationTypeEnum, NotificationChannel } from '@prisma/client';
import { prisma } from '../src/db/prisma';

async function benchmarkPreferenceCheck() {
  const testUserId = process.argv[2];
  const iterations = parseInt(process.argv[3] || '100');

  if (!testUserId) {
    console.error('Usage: ts-node benchmark-preference-check.ts <userId> [iterations]');
    console.error('Example: ts-node benchmark-preference-check.ts user-123 100');
    process.exit(1);
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log('Notification Preference Check Performance Benchmark');
  console.log(`${'='.repeat(60)}\n`);
  console.log(`User ID: ${testUserId}`);
  console.log(`Iterations: ${iterations}\n`);

  try {
    // Verify user exists
    const user = await prisma.user.findUnique({
      where: { id: testUserId }
    });

    if (!user) {
      console.error(`❌ User ${testUserId} not found`);
      process.exit(1);
    }
    console.log(`✅ User found: ${user.email}\n`);

    // Warm up (first call may be slower due to cold start)
    console.log('Warming up...');
    await shouldSendNotification(testUserId, NotificationTypeEnum.REVIEW_ASSIGNED, NotificationChannel.EMAIL);
    console.log('✅ Warm-up complete\n');

    // Benchmark different notification types
    const notificationTypes = [
      NotificationTypeEnum.APPLICATION_SUBMITTED,
      NotificationTypeEnum.REVIEW_ASSIGNED,
      NotificationTypeEnum.DECISION_MADE,
      NotificationTypeEnum.INTERVIEW_SCHEDULED,
      NotificationTypeEnum.SCORECARD_SUBMITTED
    ];

    const channels = [NotificationChannel.EMAIL, NotificationChannel.IN_APP];

    console.log('Running benchmarks...\n');

    const results: { type: string; channel: string; avgTime: number; minTime: number; maxTime: number }[] = [];

    for (const notificationType of notificationTypes) {
      for (const channel of channels) {
        const times: number[] = [];

        for (let i = 0; i < iterations; i++) {
          const start = Date.now();
          await shouldSendNotification(testUserId, notificationType, channel);
          const end = Date.now();
          times.push(end - start);
        }

        const avgTime = times.reduce((sum, t) => sum + t, 0) / times.length;
        const minTime = Math.min(...times);
        const maxTime = Math.max(...times);

        results.push({
          type: notificationType,
          channel,
          avgTime,
          minTime,
          maxTime
        });
      }
    }

    // Display results
    console.log(`${'='.repeat(60)}`);
    console.log('Results');
    console.log(`${'='.repeat(60)}\n`);
    console.log('Type'.padEnd(30) + 'Channel'.padEnd(10) + 'Avg (ms)'.padEnd(12) + 'Min (ms)'.padEnd(12) + 'Max (ms)');
    console.log('-'.repeat(75));

    results.forEach(result => {
      const status = result.avgTime < 10 ? '✅' : '⚠️ ';
      const typeDisplay = result.type.substring(0, 28).padEnd(30);
      const channelDisplay = result.channel.padEnd(10);
      const avgDisplay = result.avgTime.toFixed(2).padEnd(12);
      const minDisplay = result.minTime.toFixed(2).padEnd(12);
      const maxDisplay = result.maxTime.toFixed(2);
      
      console.log(`${status} ${typeDisplay}${channelDisplay}${avgDisplay}${minDisplay}${maxDisplay}`);
    });

    // Overall statistics
    const allTimes = results.map(r => r.avgTime);
    const overallAvg = allTimes.reduce((sum, t) => sum + t, 0) / allTimes.length;
    const overallMin = Math.min(...results.map(r => r.minTime));
    const overallMax = Math.max(...results.map(r => r.maxTime));

    console.log('');
    console.log(`${'='.repeat(60)}`);
    console.log('Overall Statistics');
    console.log(`${'='.repeat(60)}\n`);
    console.log(`Average latency across all checks: ${overallAvg.toFixed(2)}ms`);
    console.log(`Minimum latency: ${overallMin.toFixed(2)}ms`);
    console.log(`Maximum latency: ${overallMax.toFixed(2)}ms`);
    console.log(`Target latency: <10ms`);
    console.log('');

    if (overallAvg < 10) {
      console.log(`✅ Performance target met! (${overallAvg.toFixed(2)}ms < 10ms)`);
    } else {
      console.log(`⚠️  Performance target not met (${overallAvg.toFixed(2)}ms >= 10ms)`);
      console.log('   Consider adding caching or optimizing the database query');
    }
    console.log('');

    // Percentile analysis
    const allIndividualTimes: number[] = [];
    for (const notificationType of notificationTypes) {
      for (const channel of channels) {
        for (let i = 0; i < iterations; i++) {
          const start = Date.now();
          await shouldSendNotification(testUserId, notificationType, channel);
          const end = Date.now();
          allIndividualTimes.push(end - start);
        }
      }
    }

    allIndividualTimes.sort((a, b) => a - b);
    const p50 = allIndividualTimes[Math.floor(allIndividualTimes.length * 0.5)];
    const p95 = allIndividualTimes[Math.floor(allIndividualTimes.length * 0.95)];
    const p99 = allIndividualTimes[Math.floor(allIndividualTimes.length * 0.99)];

    console.log(`${'='.repeat(60)}`);
    console.log('Percentile Analysis');
    console.log(`${'='.repeat(60)}\n`);
    console.log(`P50 (median): ${p50.toFixed(2)}ms`);
    console.log(`P95: ${p95.toFixed(2)}ms`);
    console.log(`P99: ${p99.toFixed(2)}ms`);
    console.log('');

  } catch (error) {
    console.error('\n❌ Error during benchmark:');
    console.error(error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

benchmarkPreferenceCheck();
