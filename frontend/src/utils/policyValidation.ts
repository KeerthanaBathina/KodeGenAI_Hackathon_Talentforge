/**
 * Client-side validation for policy forms
 *
 * Mirrors backend validation rules to provide real-time feedback
 */

import type { RangeValidationError } from '@/types/policy';

// ============================================================================
// Screening Threshold Validation
// ============================================================================

export function validateScreeningThresholds(data: {
  shortlistThreshold: number | string;
  borderlineMin: number | string;
  borderlineMax: number | string;
  rejectThreshold: number | string;
}): string[] {
  const errors: string[] = [];

  const shortlist = Number(data.shortlistThreshold);
  const borderlineMin = Number(data.borderlineMin);
  const borderlineMax = Number(data.borderlineMax);
  const reject = Number(data.rejectThreshold);

  // Range checks
  if (isNaN(shortlist) || shortlist < 0 || shortlist > 100) {
    errors.push('Shortlist threshold must be between 0 and 100');
  }
  if (isNaN(borderlineMin) || borderlineMin < 0 || borderlineMin > 100) {
    errors.push('Borderline min must be between 0 and 100');
  }
  if (isNaN(borderlineMax) || borderlineMax < 0 || borderlineMax > 100) {
    errors.push('Borderline max must be between 0 and 100');
  }
  if (isNaN(reject) || reject < 0 || reject > 100) {
    errors.push('Reject threshold must be between 0 and 100');
  }

  // Logical order checks (only if individual values are valid)
  if (!isNaN(reject) && !isNaN(borderlineMin) && reject >= borderlineMin) {
    errors.push('Reject threshold must be less than borderline min');
  }
  if (!isNaN(borderlineMin) && !isNaN(borderlineMax) && borderlineMin >= borderlineMax) {
    errors.push('Borderline min must be less than borderline max');
  }
  if (!isNaN(borderlineMax) && !isNaN(shortlist) && borderlineMax >= shortlist) {
    errors.push('Borderline max must be less than shortlist threshold');
  }

  return errors;
}

export function getScreeningThresholdRangeErrors(data: {
  shortlistThreshold: number | string;
  borderlineMin: number | string;
  borderlineMax: number | string;
  rejectThreshold: number | string;
}): RangeValidationError[] {
  const errors: RangeValidationError[] = [];

  const shortlist = Number(data.shortlistThreshold);
  const borderlineMin = Number(data.borderlineMin);
  const borderlineMax = Number(data.borderlineMax);
  const reject = Number(data.rejectThreshold);

  if (!isNaN(reject) && !isNaN(borderlineMin) && reject >= borderlineMin) {
    errors.push({
      field: 'rejectThreshold',
      message: 'Reject must be < Borderline Min',
    });
  }
  if (!isNaN(borderlineMin) && !isNaN(borderlineMax) && borderlineMin >= borderlineMax) {
    errors.push({
      field: 'borderlineMin',
      message: 'Borderline Min must be < Borderline Max',
    });
  }
  if (!isNaN(borderlineMax) && !isNaN(shortlist) && borderlineMax >= shortlist) {
    errors.push({
      field: 'borderlineMax',
      message: 'Borderline Max must be < Shortlist',
    });
  }

  return errors;
}

// ============================================================================
// Scoring Threshold Validation
// ============================================================================

export function validateScoringThresholds(data: {
  aiShortlistThreshold: number | string;
  confidenceThreshold: number | string;
  experienceThresholdYears: number | string;
}): string[] {
  const errors: string[] = [];

  const ai = Number(data.aiShortlistThreshold);
  const confidence = Number(data.confidenceThreshold);
  const experience = Number(data.experienceThresholdYears);

  if (isNaN(ai) || ai < 0 || ai > 1) {
    errors.push('AI shortlist threshold must be between 0.0 and 1.0');
  }
  if (isNaN(confidence) || confidence < 0 || confidence > 1) {
    errors.push('Confidence threshold must be between 0.0 and 1.0');
  }
  if (isNaN(experience) || experience < 0 || experience > 50) {
    errors.push('Experience threshold must be between 0 and 50 years');
  }

  return errors;
}

// ============================================================================
// Approval Policy Validation
// ============================================================================

export interface ApprovalTier {
  tier: number;
  approverId: string;
  role: string;
}

export function validateApprovalPolicy(data: {
  compensationBandMin: number | string;
  compensationBandMax: number | string;
  requiredApprovers: ApprovalTier[];
}): string[] {
  const errors: string[] = [];

  const min = Number(data.compensationBandMin);
  const max = Number(data.compensationBandMax);

  if (isNaN(min)) {
    errors.push('Compensation min must be a valid number');
  }
  if (isNaN(max)) {
    errors.push('Compensation max must be a valid number');
  }

  if (!isNaN(min) && !isNaN(max) && min >= max) {
    errors.push('Compensation min must be less than max');
  }

  if (!data.requiredApprovers || data.requiredApprovers.length === 0) {
    errors.push('At least one approver tier is required');
  }

  // Check tier sequential order
  if (data.requiredApprovers && data.requiredApprovers.length > 0) {
    const tiers = data.requiredApprovers
      .map((a) => a.tier)
      .sort((a, b) => a - b);

    // Check for duplicates
    const uniqueTiers = new Set(tiers);
    if (uniqueTiers.size !== tiers.length) {
      errors.push('Duplicate approver tiers found');
    }

    // Check for sequential starting from 1
    for (let i = 0; i < tiers.length; i++) {
      if (tiers[i] !== i + 1) {
        errors.push('Approver tiers must be sequential starting from 1');
        break;
      }
    }

    // Check for missing approvers
    for (const approver of data.requiredApprovers) {
      if (!approver.approverId) {
        errors.push(`Tier ${approver.tier} is missing an approver`);
      }
    }
  }

  return errors;
}

// ============================================================================
// Common Date Validation
// ============================================================================

export function validateEffectiveDate(effectiveFrom: string | Date): string | null {
  try {
    const date = typeof effectiveFrom === 'string' ? new Date(effectiveFrom) : effectiveFrom;

    if (isNaN(date.getTime())) {
      return 'Invalid date format';
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (date < today) {
      return 'Effective date cannot be in the past (must be today or later)';
    }

    return null;
  } catch {
    return 'Invalid date format';
  }
}

// ============================================================================
// Field-Level Validation
// ============================================================================

export function validateNumberField(
  value: string | number,
  min: number,
  max: number,
  fieldName: string,
): string | null {
  const num = Number(value);

  if (isNaN(num)) {
    return `${fieldName} must be a valid number`;
  }
  if (num < min || num > max) {
    return `${fieldName} must be between ${min} and ${max}`;
  }

  return null;
}

export function validateRequiredField(value: string | number, fieldName: string): string | null {
  if (value === '' || value === null || value === undefined) {
    return `${fieldName} is required`;
  }
  return null;
}

export function validateCurrencyField(
  value: string | number,
  fieldName: string,
): string | null {
  const num = Number(value);

  if (isNaN(num)) {
    return `${fieldName} must be a valid number`;
  }
  if (num < 0) {
    return `${fieldName} cannot be negative`;
  }

  return null;
}
