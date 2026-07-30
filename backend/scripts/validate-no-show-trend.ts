/**
 * Validation script for 30-day no-show trend
 * Checks completeness, ordering, and formula correctness
 */

import prisma from '../db/prisma';
import { getNoShowTrend30d, getLatestNoShowTrend, getNoShowTrend30dLastRefreshTimestamp } from '../db/noShowTrend30d';

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

async function validateNoShowTrend30d(): Promise<void> {
  console.log('\n=== Validating 30-Day No-Show Trend ===\n');

  try {
    // Check 1: Trend data exists
    const trendPoints = await getNoShowTrend30d();
    addResult(
      'Trend points retrieved',
      trendPoints.length > 0,
      `Found ${trendPoints.length} trend points`
    );

    // Check 2: Expect up to 30 points
    const pointsValid = trendPoints.length <= 30;
    addResult(
      'Trend points count',
      pointsValid,
      `${trendPoints.length} points (expected ≤30)`
    );

    // Check 3: Date ordering (descending)
    let orderValid = true;
    let orderDetails = '';

    for (let i = 0; i < trendPoints.length - 1; i++) {
      if (trendPoints[i].date.getTime() <= trendPoints[i + 1].date.getTime()) {
        orderValid = false;
        orderDetails = `Points not in descending order at index ${i}`;
        break;
      }
    }

    addResult(
      'Date ordering (descending)',
      orderValid && trendPoints.length > 0,
      orderDetails || 'Dates in correct descending order'
    );

    // Check 4: Validate date uniqueness
    const uniqueDates = new Set(trendPoints.map((p) => p.date.toDateString()));
    const dateUnique = uniqueDates.size === trendPoints.length;
    addResult(
      'Date uniqueness',
      dateUnique,
      `${uniqueDates.size} unique dates of ${trendPoints.length} total`
    );

    // Check 5: Validate rate formula accuracy
    let formulaValid = true;
    let formulaDetails = '';

    for (const point of trendPoints) {
      const { scheduledCount, noShowCount, noShowRatePct } = point;

      if (scheduledCount === 0) {
        if (noShowRatePct !== 0) {
          formulaValid = false;
          formulaDetails = `Date ${point.date.toDateString()}: zero denominator should yield 0%, got ${noShowRatePct}%`;
        }
      } else {
        const expectedRate = (noShowCount / scheduledCount) * 100;
        const rateDeviation = Math.abs(parseFloat(noShowRatePct.toString()) - expectedRate);

        if (rateDeviation > 0.01) {
          formulaValid = false;
          formulaDetails = `Date ${point.date.toDateString()}: expected ${expectedRate.toFixed(2)}%, got ${noShowRatePct}%`;
          break;
        }
      }
    }

    addResult(
      'Rate formula correctness',
      formulaValid,
      formulaDetails || 'All rates correctly computed'
    );

    // Check 6: Validate metric bounds
    let boundsValid = true;
    let boundsDetails = '';

    for (const point of trendPoints) {
      const { scheduledCount, noShowCount, noShowRatePct } = point;

      if (scheduledCount < 0 || noShowCount < 0) {
        boundsValid = false;
        boundsDetails = `Date ${point.date.toDateString()}: negative count detected`;
        break;
      }

      if (noShowRatePct < 0 || noShowRatePct > 100) {
        boundsValid = false;
        boundsDetails = `Date ${point.date.toDateString()}: rate out of bounds (${noShowRatePct}%)`;
        break;
      }

      if (noShowCount > scheduledCount) {
        boundsValid = false;
        boundsDetails = `Date ${point.date.toDateString()}: no_show count exceeds scheduled count`;
        break;
      }
    }

    addResult(
      'Metric bounds validation',
      boundsValid,
      boundsDetails || 'All metrics within valid bounds'
    );

    // Check 7: Latest trend point
    const latestTrend = await getLatestNoShowTrend();
    addResult(
      'Latest trend point available',
      latestTrend !== null,
      latestTrend ? `${latestTrend.date.toDateString()}: ${latestTrend.noShowCount} no-shows, ${latestTrend.noShowRatePct}%` : 'No latest point'
    );

    // Check 8: Refresh timestamp freshness (<5 minutes)
    const lastRefresh = await getNoShowTrend30dLastRefreshTimestamp();
    const now = new Date();
    const lagMs = lastRefresh ? now.getTime() - lastRefresh.getTime() : null;
    const lagMinutes = lagMs ? Math.floor(lagMs / 1000 / 60) : null;

    const freshness = lagMinutes !== null && lagMinutes <= 5;
    addResult(
      'Refresh freshness (<5 min)',
      freshness,
      lastRefresh ? `Last refreshed ${lagMinutes}m ago` : 'Never refreshed'
    );

    // Check 9: Timestamp ISO format validation
    let timestampValid = true;
    for (const point of trendPoints) {
      if (isNaN(point.refreshedAt.getTime())) {
        timestampValid = false;
        break;
      }
    }

    addResult(
      'Timestamp format validation',
      timestampValid && trendPoints.length > 0,
      'All timestamps in valid ISO format'
    );

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

validateNoShowTrend30d();
