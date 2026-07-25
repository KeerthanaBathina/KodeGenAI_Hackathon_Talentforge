export type SlaSeverity = 'normal' | 'amber' | 'red';

export interface ReviewQueueSlaState {
  slaDeadlineAt: string;
  slaRemainingSeconds: number;
  slaElapsedPercent: number;
  slaSeverity: SlaSeverity;
  isUrgent: boolean;
}

export function computeReviewQueueSlaState(
  submittedAt: Date,
  nowMs = Date.now(),
  slaHours = 48
): ReviewQueueSlaState {
  const slaWindowMs = slaHours * 60 * 60 * 1000;
  const submittedMs = submittedAt.getTime();
  const elapsedMs = Math.max(0, nowMs - submittedMs);
  const deadlineMs = submittedMs + slaWindowMs;
  const remainingSeconds = Math.max(0, Math.floor((deadlineMs - nowMs) / 1000));
  const elapsedPercent = Math.min(100, (elapsedMs / slaWindowMs) * 100);

  let slaSeverity: SlaSeverity = 'normal';
  if (elapsedPercent >= 80) {
    slaSeverity = 'red';
  } else if (elapsedPercent >= 50) {
    slaSeverity = 'amber';
  }

  return {
    slaDeadlineAt: new Date(deadlineMs).toISOString(),
    slaRemainingSeconds: remainingSeconds,
    slaElapsedPercent: Number(elapsedPercent.toFixed(2)),
    slaSeverity,
    isUrgent: slaSeverity === 'red',
  };
}
