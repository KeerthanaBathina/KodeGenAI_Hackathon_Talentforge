/**
 * Validation script for weekly activity signals (digest skip logic)
 * Checks that prior week activity counts are accurate
 */

import prisma from '../db/prisma';
import {
  getLatestWeeklyActivitySignal,
  hasPriorWeekActivity,
  computePriorWeekActivity,
  getWeeklyActivitySignalsLastRefreshTimestamp
} from '../db/weeklyActivitySignals';

interface ValidationResult {
  name: string;
  passed: boolean;
  details: string;
}

const results: ValidationResult[] = [];

function addResult(name: string, passed: boolean, details: string): void {
  results.push({ name, passed, details });
  const status = passed ? '✓' : '✗';
  console.log(`[${status}] ${name}: ${details}`);
}

async function validateWeeklyActivitySignals(): Promise<void> {
  console.log('\n=== Validating Weekly Activity Signals ===\n');

  try {
    // Check 1: Signal exists
    const latestSignal = await getLatestWeeklyActivitySignal();
    addResult(
      'Activity signal exists',
      latestSignal !== null,
      latestSignal ? `Week ending ${latestSignal.weekEndingDate.toDateString()}` : 'No signal found'
    );

    // Check 2: Activity count accuracy
    if (latestSignal) {
      const computed = await computePriorWeekActivity();
      const appCountMatch = latestSignal.applicationCountPriorWeek === computed.applicationCount;
      const interviewCountMatch = latestSignal.interviewCountPriorWeek === computed.interviewCount;

      addResult(
        'Application count accuracy',
        appCountMatch,
        `Stored: ${latestSignal.applicationCountPriorWeek}, Computed: ${computed.applicationCount}`
      );

      addResult(
        'Interview count accuracy',
        interviewCountMatch,
        `Stored: ${latestSignal.interviewCountPriorWeek}, Computed: ${computed.interviewCount}`
      );

      // Check 3: Has activity flag correctness
      const expectedHasActivity = computed.applicationCount > 0 || computed.interviewCount > 0;
      const hasActivityMatch = latestSignal.hasActivity === expectedHasActivity;

      addResult(
        'Has activity flag correctness',
        hasActivityMatch,
        `Expected: ${expectedHasActivity}, Stored: ${latestSignal.hasActivity}`
      );
    }

    // Check 4: Activity signal getter works correctly
    if (latestSignal) {
      const hasActivity = await hasPriorWeekActivity(latestSignal.weekEndingDate);
      addResult(
        'Activity signal query works',
        hasActivity === latestSignal.hasActivity,
        `Query returned: ${hasActivity}, Expected: ${latestSignal.hasActivity}`
      );
    }

    // Check 5: Refresh timestamp freshness (<5 minutes)
    const lastRefresh = await getWeeklyActivitySignalsLastRefreshTimestamp();
    const now = new Date();
    const lagMs = lastRefresh ? now.getTime() - lastRefresh.getTime() : null;
    const lagMinutes = lagMs ? Math.floor(lagMs / 1000 / 60) : null;

    const freshness = lagMinutes !== null && lagMinutes <= 5;
    addResult(
      'Refresh freshness (<5 min)',
      freshness,
      lastRefresh ? `Last refreshed ${lagMinutes}m ago` : 'Never refreshed'
    );

    // Check 6: Timestamp validity
    if (latestSignal) {
      const refreshedValid = !isNaN(latestSignal.refreshedAt.getTime());
      const updatedValid = !isNaN(latestSignal.updatedAt.getTime());

      addResult(
        'Timestamp validity',
        refreshedValid && updatedValid,
        `Refreshed: ${latestSignal.refreshedAt.toISOString()}, Updated: ${latestSignal.updatedAt.toISOString()}`
      );
    }

    // Check 7: Non-negative counts
    if (latestSignal) {
      const countsValid = latestSignal.applicationCountPriorWeek >= 0 && latestSignal.interviewCountPriorWeek >= 0;

      addResult(
        'Non-negative counts',
        countsValid,
        `Apps: ${latestSignal.applicationCountPriorWeek}, Interviews: ${latestSignal.interviewCountPriorWeek}`
      );
    }

    // Summary
    const passed = results.filter((r) => r.passed).length;
    const total = results.length;
    console.log(`\n=== Summary: ${passed}/${total} checks passed ===\n`);

    if (passed === total) {
      console.log('✓ All validations passed');
      process.exit(0);
    } else {
      console.log('✗ Some validations failed');
      process.exit(1);
    }
  } catch (error) {
    console.error('Validation error:', error);
    process.exit(1);
  }
}

validateWeeklyActivitySignals();
