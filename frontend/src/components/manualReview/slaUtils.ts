export type SlaSeverity = 'normal' | 'amber' | 'red';

interface SlaChipColors {
  backgroundColor: string;
  color: string;
  borderColor: string;
}

const SLA_COLORS: Record<SlaSeverity, SlaChipColors> = {
  normal: {
    backgroundColor: '#ECFDF5',
    color: '#065F46',
    borderColor: '#A7F3D0',
  },
  amber: {
    backgroundColor: '#FFFBEB',
    color: '#92400E',
    borderColor: '#FCD34D',
  },
  red: {
    backgroundColor: '#FEF2F2',
    color: '#991B1B',
    borderColor: '#FCA5A5',
  },
};

function padTimeUnit(value: number): string {
  return value.toString().padStart(2, '0');
}

export function formatSlaDuration(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;

  return `${padTimeUnit(hours)}:${padTimeUnit(minutes)}:${padTimeUnit(seconds)}`;
}

export function getSlaChipColors(severity: SlaSeverity): SlaChipColors {
  return SLA_COLORS[severity];
}
