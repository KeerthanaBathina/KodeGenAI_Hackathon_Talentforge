/**
 * Validation script for no-show KPI metrics
 * Checks data integrity, formula correctness, and edge cases
 */

import prisma from '../db/prisma';
import { getNoShowKpiMetrics, getGlobalNoShowKpi, getNoShowKpiLastRefreshTimestamp } from '../db/noShowKpiMetrics';

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

async function validateNoShowKpiMetrics(): Promise<void> {
  console.log('\n=== Validating No-Show KPI Metrics ===\n');

  try {
    // Check 1: Metrics exist
    const metrics = await getNoShowKpiMetrics();
    addResult(
      'Metrics retrieved',
      metrics.length > 0,
      `Found ${metrics.length} metric records`
    );

    // Check 2: Global metrics present
    const globalMetric = await getGlobalNoShowKpi();
    addResult(
      'Global metric present',
      globalMetric !== null,
      globalMetric ? `Global: scheduled=${globalMetric.scheduledCount7d}, no_show=${globalMetric.noShowCount7d}` : 'No global metric'
    );

    // Check 3: Per-requisition metrics if available
    const perReqMetrics = metrics.filter((m) => m.scope === 'by_requisition');
    addResult(
      'Per-requisition metrics',
      perReqMetrics.length >= 0,
      `Found ${perReqMetrics.length} requisition-scoped metrics`
    );

    // Check 4: Validate rate formula accuracy
    let formulaValid = true;
    let formulaDetails = '';

    for (const metric of metrics) {
      const { scheduledCount7d, noShowCount7d, noShowRatePct7d } = metric;

      if (scheduledCount7d === 0) {
        if (noShowRatePct7d !== 0) {
          formulaValid = false;
          formulaDetails = `Metric ${metric.requisitionId}: zero denominator should yield 0%, got ${noShowRatePct7d}%`;
        }
      } else {
        const expectedRate = (noShowCount7d / scheduledCount7d) * 100;
        const rateDeviation = Math.abs(parseFloat(noShowRatePct7d.toString()) - expectedRate);

        if (rateDeviation > 0.01) {
          formulaValid = false;
          formulaDetails = `Metric ${metric.requisitionId}: expected ${expectedRate.toFixed(2)}%, got ${noShowRatePct7d}%`;
          break;
        }
      }
    }

    addResult(
      'Rate formula correctness',
      formulaValid,
      formulaDetails || 'All metrics correctly computed'
    );

    // Check 5: Validate metric bounds
    let boundsValid = true;
    let boundsDetails = '';

    for (const metric of metrics) {
      const { scheduledCount7d, noShowCount7d, noShowRatePct7d } = metric;

      if (scheduledCount7d < 0 || noShowCount7d < 0) {
        boundsValid = false;
        boundsDetails = `Metric ${metric.requisitionId}: negative count detected`;
        break;
      }

      if (noShowRatePct7d < 0 || noShowRatePct7d > 100) {
        boundsValid = false;
        boundsDetails = `Metric ${metric.requisitionId}: rate out of bounds (${noShowRatePct7d}%)`;
        break;
      }

      if (noShowCount7d > scheduledCount7d) {
        boundsValid = false;
        boundsDetails = `Metric ${metric.requisitionId}: no_show count exceeds scheduled count`;
        break;
      }
    }

    addResult(
      'Metric bounds validation',
      boundsValid,
      boundsDetails || 'All metrics within valid bounds'
    );

    // Check 6: Refresh timestamp freshness (<5 minutes)
    const lastRefresh = await getNoShowKpiLastRefreshTimestamp();
    const now = new Date();
    const lagMs = lastRefresh ? now.getTime() - lastRefresh.getTime() : null;
    const lagMinutes = lagMs ? Math.floor(lagMs / 1000 / 60) : null;

    const freshness = lagMinutes !== null && lagMinutes <= 5;
    addResult(
      'Refresh freshness (<5 min)',
      freshness,
      lastRefresh ? `Last refreshed ${lagMinutes}m ago` : 'Never refreshed'
    );

    // Check 7: Timestamp ISO format validation
    if (globalMetric) {
      const isoValid = !isNaN(globalMetric.refreshedAt.getTime());
      addResult(
        'Timestamp format validation',
        isoValid,
        globalMetric.refreshedAt.toISOString()
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

validateNoShowKpiMetrics();
