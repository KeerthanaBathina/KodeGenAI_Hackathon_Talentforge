/**
 * Tests for policy validation utilities
 */

import { describe, it, expect } from 'vitest';
import {
  validateScreeningThresholds,
  getScreeningThresholdRangeErrors,
  validateScoringThresholds,
  validateApprovalPolicy,
  validateEffectiveDate,
  validateNumberField,
  validateCurrencyField,
} from '@/utils/policyValidation';

describe('Policy Validation Utils', () => {
  describe('Screening Threshold Validation', () => {
    it('should accept valid screening thresholds', () => {
      const errors = validateScreeningThresholds({
        shortlistThreshold: 80,
        borderlineMin: 40,
        borderlineMax: 60,
        rejectThreshold: 20,
      });
      expect(errors).toEqual([]);
    });

    it('should reject shortlist threshold > 100', () => {
      const errors = validateScreeningThresholds({
        shortlistThreshold: 101,
        borderlineMin: 40,
        borderlineMax: 60,
        rejectThreshold: 20,
      });
      expect(errors[0]).toContain('Shortlist');
    });

    it('should reject shortlist threshold < 0', () => {
      const errors = validateScreeningThresholds({
        shortlistThreshold: -1,
        borderlineMin: 40,
        borderlineMax: 60,
        rejectThreshold: 20,
      });
      expect(errors[0]).toContain('Shortlist');
    });

    it('should reject reject threshold >= borderlineMin', () => {
      const errors = validateScreeningThresholds({
        shortlistThreshold: 80,
        borderlineMin: 40,
        borderlineMax: 60,
        rejectThreshold: 40, // Should be < 40
      });
      expect(errors.some((e) => e.includes('Reject'))).toBe(true);
    });

    it('should reject borderlineMin >= borderlineMax', () => {
      const errors = validateScreeningThresholds({
        shortlistThreshold: 80,
        borderlineMin: 60,
        borderlineMax: 60, // Should be < 80
        rejectThreshold: 20,
      });
      expect(errors.some((e) => e.includes('Borderline'))).toBe(true);
    });

    it('should reject borderlineMax >= shortlist', () => {
      const errors = validateScreeningThresholds({
        shortlistThreshold: 60,
        borderlineMin: 40,
        borderlineMax: 60, // Should be < 60
        rejectThreshold: 20,
      });
      expect(errors.some((e) => e.includes('Borderline max'))).toBe(true);
    });

    it('should handle string inputs', () => {
      const errors = validateScreeningThresholds({
        shortlistThreshold: '80',
        borderlineMin: '40',
        borderlineMax: '60',
        rejectThreshold: '20',
      });
      expect(errors).toEqual([]);
    });

    it('should reject non-numeric strings', () => {
      const errors = validateScreeningThresholds({
        shortlistThreshold: 'abc' as any,
        borderlineMin: 40,
        borderlineMax: 60,
        rejectThreshold: 20,
      });
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('Screening Threshold Range Errors', () => {
    it('should return range errors for invalid ordering', () => {
      const errors = getScreeningThresholdRangeErrors({
        shortlistThreshold: 60,
        borderlineMin: 40,
        borderlineMax: 60,
        rejectThreshold: 20,
      });
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].field).toBe('borderlineMax');
    });

    it('should return empty array for valid range', () => {
      const errors = getScreeningThresholdRangeErrors({
        shortlistThreshold: 80,
        borderlineMin: 40,
        borderlineMax: 60,
        rejectThreshold: 20,
      });
      expect(errors).toEqual([]);
    });
  });

  describe('Scoring Threshold Validation', () => {
    it('should accept valid scoring thresholds', () => {
      const errors = validateScoringThresholds({
        aiShortlistThreshold: 0.85,
        confidenceThreshold: 0.75,
        experienceThresholdYears: 5,
      });
      expect(errors).toEqual([]);
    });

    it('should reject aiShortlistThreshold > 1.0', () => {
      const errors = validateScoringThresholds({
        aiShortlistThreshold: 1.1,
        confidenceThreshold: 0.75,
        experienceThresholdYears: 5,
      });
      expect(errors[0]).toContain('AI shortlist');
    });

    it('should reject aiShortlistThreshold < 0', () => {
      const errors = validateScoringThresholds({
        aiShortlistThreshold: -0.1,
        confidenceThreshold: 0.75,
        experienceThresholdYears: 5,
      });
      expect(errors[0]).toContain('AI shortlist');
    });

    it('should reject experience > 50', () => {
      const errors = validateScoringThresholds({
        aiShortlistThreshold: 0.85,
        confidenceThreshold: 0.75,
        experienceThresholdYears: 51,
      });
      expect(errors[0]).toContain('Experience');
    });

    it('should reject experience < 0', () => {
      const errors = validateScoringThresholds({
        aiShortlistThreshold: 0.85,
        confidenceThreshold: 0.75,
        experienceThresholdYears: -1,
      });
      expect(errors[0]).toContain('Experience');
    });

    it('should handle boundary values', () => {
      const errors = validateScoringThresholds({
        aiShortlistThreshold: 0,
        confidenceThreshold: 1,
        experienceThresholdYears: 50,
      });
      expect(errors).toEqual([]);
    });
  });

  describe('Approval Policy Validation', () => {
    it('should accept valid approval policy', () => {
      const errors = validateApprovalPolicy({
        compensationBandMin: 50000,
        compensationBandMax: 100000,
        requiredApprovers: [
          { tier: 1, approverId: 'user1', role: 'hr_manager' },
        ],
      });
      expect(errors).toEqual([]);
    });

    it('should reject compensationBandMin >= max', () => {
      const errors = validateApprovalPolicy({
        compensationBandMin: 100000,
        compensationBandMax: 100000,
        requiredApprovers: [
          { tier: 1, approverId: 'user1', role: 'hr_manager' },
        ],
      });
      expect(errors.some((e) => e.includes('Compensation'))).toBe(true);
    });

    it('should reject duplicate tiers', () => {
      const errors = validateApprovalPolicy({
        compensationBandMin: 50000,
        compensationBandMax: 100000,
        requiredApprovers: [
          { tier: 1, approverId: 'user1', role: 'hr_manager' },
          { tier: 1, approverId: 'user2', role: 'hr_manager' },
        ],
      });
      expect(errors.some((e) => e.includes('Duplicate'))).toBe(true);
    });

    it('should reject non-sequential tiers', () => {
      const errors = validateApprovalPolicy({
        compensationBandMin: 50000,
        compensationBandMax: 100000,
        requiredApprovers: [
          { tier: 1, approverId: 'user1', role: 'hr_manager' },
          { tier: 3, approverId: 'user2', role: 'hr_manager' },
        ],
      });
      expect(errors.some((e) => e.includes('sequential'))).toBe(true);
    });

    it('should reject missing approvers', () => {
      const errors = validateApprovalPolicy({
        compensationBandMin: 50000,
        compensationBandMax: 100000,
        requiredApprovers: [
          { tier: 1, approverId: '', role: 'hr_manager' },
        ],
      });
      expect(errors.some((e) => e.includes('missing'))).toBe(true);
    });

    it('should reject empty approvers', () => {
      const errors = validateApprovalPolicy({
        compensationBandMin: 50000,
        compensationBandMax: 100000,
        requiredApprovers: [],
      });
      expect(errors.some((e) => e.includes('At least one'))).toBe(true);
    });

    it('should accept multiple sequential tiers', () => {
      const errors = validateApprovalPolicy({
        compensationBandMin: 50000,
        compensationBandMax: 100000,
        requiredApprovers: [
          { tier: 1, approverId: 'user1', role: 'hr_manager' },
          { tier: 2, approverId: 'user2', role: 'hr_manager' },
          { tier: 3, approverId: 'user3', role: 'admin' },
        ],
      });
      expect(errors).toEqual([]);
    });
  });

  describe('Effective Date Validation', () => {
    it('should accept today', () => {
      const today = new Date().toISOString().split('T')[0];
      const error = validateEffectiveDate(today);
      expect(error).toBeNull();
    });

    it('should accept future date', () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const error = validateEffectiveDate(tomorrow.toISOString());
      expect(error).toBeNull();
    });

    it('should reject past date', () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const error = validateEffectiveDate(yesterday.toISOString());
      expect(error).toContain('past');
    });

    it('should reject invalid date', () => {
      const error = validateEffectiveDate('invalid');
      expect(error).toContain('Invalid');
    });

    it('should handle Date objects', () => {
      const today = new Date();
      const error = validateEffectiveDate(today);
      expect(error).toBeNull();
    });
  });

  describe('Field-Level Validation', () => {
    it('should validate number field within range', () => {
      const error = validateNumberField(50, 0, 100, 'Score');
      expect(error).toBeNull();
    });

    it('should reject number field below min', () => {
      const error = validateNumberField(-1, 0, 100, 'Score');
      expect(error).toContain('between');
    });

    it('should reject number field above max', () => {
      const error = validateNumberField(101, 0, 100, 'Score');
      expect(error).toContain('between');
    });

    it('should reject non-numeric value', () => {
      const error = validateNumberField('abc', 0, 100, 'Score');
      expect(error).toContain('valid number');
    });

    it('should validate currency field', () => {
      const error = validateCurrencyField(50000, 'Salary');
      expect(error).toBeNull();
    });

    it('should reject negative currency', () => {
      const error = validateCurrencyField(-1000, 'Salary');
      expect(error).toContain('negative');
    });

    it('should reject non-numeric currency', () => {
      const error = validateCurrencyField('abc', 'Salary');
      expect(error).toContain('valid number');
    });
  });
});
