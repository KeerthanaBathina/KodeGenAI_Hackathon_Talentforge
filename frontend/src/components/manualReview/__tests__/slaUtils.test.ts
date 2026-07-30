import { describe, expect, it } from 'vitest';
import { formatSlaDuration, getSlaChipColors } from '../slaUtils';

describe('slaUtils', () => {
  it('formats seconds to HH:MM:SS', () => {
    expect(formatSlaDuration(0)).toBe('00:00:00');
    expect(formatSlaDuration(59)).toBe('00:00:59');
    expect(formatSlaDuration(3661)).toBe('01:01:01');
  });

  it('clamps negative values to zero', () => {
    expect(formatSlaDuration(-12)).toBe('00:00:00');
  });

  it('maps severity to expected chip colors', () => {
    expect(getSlaChipColors('normal')).toMatchObject({
      backgroundColor: '#ECFDF5',
      color: '#065F46',
    });

    expect(getSlaChipColors('amber')).toMatchObject({
      backgroundColor: '#FFFBEB',
      color: '#92400E',
    });

    expect(getSlaChipColors('red')).toMatchObject({
      backgroundColor: '#FEF2F2',
      color: '#991B1B',
    });
  });
});
