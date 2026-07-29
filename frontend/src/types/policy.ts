/**
 * Policy management types
 *
 * TypeScript types for screening thresholds, scoring thresholds, and approval policies
 */

// ============================================================================
// Screening Thresholds
// ============================================================================

export interface ScreeningThreshold {
  id: string;
  shortlistThreshold: number;
  borderlineMin: number;
  borderlineMax: number;
  rejectThreshold: number;
  version: number;
  effectiveFrom: string; // ISO date
  createdAt: string; // ISO date
}

export interface CreateScreeningThresholdInput {
  shortlistThreshold: number;
  borderlineMin: number;
  borderlineMax: number;
  rejectThreshold: number;
  effectiveFrom: string; // ISO date
}

export interface ScreeningThresholdFormData extends CreateScreeningThresholdInput {
  effectiveFrom: string; // ISO date string
}

// ============================================================================
// Scoring Thresholds
// ============================================================================

export interface ScoringThreshold {
  id: string;
  jobFamilyId: string;
  aiShortlistThreshold: number;
  confidenceThreshold: number;
  experienceThresholdYears: number;
  effectiveFrom: string; // ISO date
  createdAt: string; // ISO date
  createdBy: string;
}

export interface CreateScoringThresholdInput {
  jobFamilyId: string;
  aiShortlistThreshold: number;
  confidenceThreshold: number;
  experienceThresholdYears: number;
  effectiveFrom: string; // ISO date
}

export interface ScoringThresholdFormData extends CreateScoringThresholdInput {
  effectiveFrom: string; // ISO date string
}

export interface JobFamily {
  id: string;
  name: string;
}

// ============================================================================
// Approval Policies
// ============================================================================

export interface ApprovalTier {
  tier: number;
  approverId: string;
  role: string;
}

export interface ApprovalPolicy {
  id: string;
  compensationBandMin: string; // Decimal as string
  compensationBandMax: string; // Decimal as string
  requiredApprovers: ApprovalTier[];
  effectiveFrom?: string; // ISO date
  active?: boolean;
}

export interface CreateApprovalPolicyInput {
  compensationBandMin: number | string;
  compensationBandMax: number | string;
  requiredApprovers: ApprovalTier[];
  effectiveFrom: string; // ISO date
}

export interface ApprovalPolicyFormData {
  compensationBandMin: number | string;
  compensationBandMax: number | string;
  requiredApprovers: ApprovalTier[];
  effectiveFrom: string; // ISO date string
}

// ============================================================================
// API Response Types
// ============================================================================

export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    details?: string[];
  };
}

export class PolicyValidationError extends Error {
  constructor(public details: string[]) {
    super('Policy validation failed');
    this.name = 'PolicyValidationError';
  }
}

// ============================================================================
// Form State Types
// ============================================================================

export interface FormErrors {
  [key: string]: string;
}

export interface RangeValidationError {
  field: string;
  message: string;
}
