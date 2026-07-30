'use client';

import React from 'react';

interface ChangeBadgeProps {
  current: number | string;
  previous?: number | string;
  decimals?: number;
  isDecimal?: boolean;
}

/**
 * Visual badge showing the current value with change indicator
 * comparing to the previous version
 */
export function ChangeBadge({
  current,
  previous,
  decimals = 0,
  isDecimal = false,
}: ChangeBadgeProps) {
  // Format value based on decimal flag
  const formatValue = (val: number | string) => {
    if (typeof val === 'string') return val;
    if (isDecimal && decimals > 0) {
      return val.toFixed(decimals);
    }
    return String(val);
  };

  const currentFormatted = formatValue(current);
  const previousNum = typeof previous === 'string' ? parseFloat(previous) : previous;
  const currentNum = typeof current === 'string' ? parseFloat(current) : current;

  if (!previous || previousNum === undefined || previousNum === null) {
    return <span className="font-medium">{currentFormatted}</span>;
  }

  const change = currentNum - previousNum;

  if (change === 0) {
    return <span className="font-medium">{currentFormatted}</span>;
  }

  const isIncrease = change > 0;
  const changeFormatted = isDecimal && decimals > 0 ? Math.abs(change).toFixed(decimals) : String(Math.abs(change));

  return (
    <div className="flex items-center gap-2">
      <span className="font-medium">{currentFormatted}</span>
      <span
        className={`text-sm font-semibold ${
          isIncrease
            ? 'text-green-600 bg-green-50 px-2 py-1 rounded'
            : 'text-red-600 bg-red-50 px-2 py-1 rounded'
        }`}
        title={`Previous: ${formatValue(previousNum)}`}
      >
        {isIncrease ? '↑' : '↓'} {changeFormatted}
      </span>
    </div>
  );
}

interface DecimalChangeBadgeProps {
  current: string | number;
  previous?: string | number;
  decimals: number;
}

/**
 * Specialized badge for decimal values (e.g., thresholds with 0.0000 precision)
 */
export function DecimalChangeBadge({
  current,
  previous,
  decimals,
}: DecimalChangeBadgeProps) {
  return (
    <ChangeBadge
      current={current}
      previous={previous}
      decimals={decimals}
      isDecimal={true}
    />
  );
}

interface CurrencyChangeBadgeProps {
  current: number | string;
  previous?: number | string;
}

/**
 * Specialized badge for currency values
 */
export function CurrencyChangeBadge({
  current,
  previous,
}: CurrencyChangeBadgeProps) {
  const formatCurrency = (val: number | string) => {
    const num = typeof val === 'string' ? parseFloat(val) : val;
    return `$${num.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  const currentNum = typeof current === 'string' ? parseFloat(current) : current;
  const previousNum = typeof previous === 'string' ? parseFloat(previous) : previous;

  if (!previous || previousNum === undefined || previousNum === null) {
    return <span className="font-medium">{formatCurrency(currentNum)}</span>;
  }

  const change = currentNum - previousNum;

  if (change === 0) {
    return <span className="font-medium">{formatCurrency(currentNum)}</span>;
  }

  const isIncrease = change > 0;
  const changeFormatted = formatCurrency(Math.abs(change));

  return (
    <div className="flex items-center gap-2">
      <span className="font-medium">{formatCurrency(currentNum)}</span>
      <span
        className={`text-sm font-semibold ${
          isIncrease
            ? 'text-green-600 bg-green-50 px-2 py-1 rounded'
            : 'text-red-600 bg-red-50 px-2 py-1 rounded'
        }`}
        title={`Previous: ${formatCurrency(previousNum)}`}
      >
        {isIncrease ? '↑' : '↓'} {changeFormatted}
      </span>
    </div>
  );
}
