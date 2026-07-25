import { describe, expect, it } from 'vitest';
import { computeReviewQueueSlaState } from '../reviewQueueSla';

describe('computeReviewQueueSlaState', () => {
  const SLA_HOURS = 48;

  it('returns amber at exactly 50 percent elapsed', () => {
    const now = new Date('2026-07-25T12:00:00.000Z').getTime();
    const submittedAt = new Date(now - 24 * 60 * 60 * 1000);

    const state = computeReviewQueueSlaState(submittedAt, now, SLA_HOURS);

    expect(state.slaElapsedPercent).toBe(50);
    expect(state.slaSeverity).toBe('amber');
    expect(state.isUrgent).toBe(false);
  });

  it('returns red at exactly 80 percent elapsed', () => {
    const now = new Date('2026-07-25T12:00:00.000Z').getTime();
    const elapsedMs = 38.4 * 60 * 60 * 1000;
    const submittedAt = new Date(now - elapsedMs);

    const state = computeReviewQueueSlaState(submittedAt, now, SLA_HOURS);

    expect(state.slaElapsedPercent).toBe(80);
    expect(state.slaSeverity).toBe('red');
    expect(state.isUrgent).toBe(true);
  });

  it('keeps severity below threshold just before each boundary', () => {
    const now = new Date('2026-07-25T12:00:00.000Z').getTime();
    const totalSlaMs = SLA_HOURS * 60 * 60 * 1000;

    const justBeforeAmber = new Date(now - totalSlaMs * 0.4999);
    const amberCandidate = computeReviewQueueSlaState(justBeforeAmber, now, SLA_HOURS);
    expect(amberCandidate.slaElapsedPercent).toBe(49.99);
    expect(amberCandidate.slaSeverity).toBe('normal');

    const justBeforeRed = new Date(now - totalSlaMs * 0.7999);
    const redCandidate = computeReviewQueueSlaState(justBeforeRed, now, SLA_HOURS);
    expect(redCandidate.slaElapsedPercent).toBe(79.99);
    expect(redCandidate.slaSeverity).toBe('amber');
    expect(redCandidate.isUrgent).toBe(false);
  });

  it('clamps remaining seconds to zero once deadline is passed', () => {
    const now = new Date('2026-07-25T12:00:00.000Z').getTime();
    const submittedAt = new Date(now - 60 * 60 * 60 * 1000);

    const state = computeReviewQueueSlaState(submittedAt, now, SLA_HOURS);

    expect(state.slaRemainingSeconds).toBe(0);
    expect(state.slaSeverity).toBe('red');
  });
});
