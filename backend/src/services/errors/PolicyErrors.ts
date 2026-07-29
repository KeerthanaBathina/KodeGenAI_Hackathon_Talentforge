/**
 * Policy-specific error types for versioning and validation
 */

export class PolicyError extends Error {
  constructor(
    message: string,
    public code: string = 'POLICY_ERROR',
    public statusCode: number = 400,
  ) {
    super(message);
    this.name = 'PolicyError';
    Error.captureStackTrace(this, this.constructor);
  }
}

export class PolicyValidationError extends PolicyError {
  constructor(
    message: string,
    public errors: string[] = [],
  ) {
    super(message, 'POLICY_VALIDATION_ERROR', 400);
    this.name = 'PolicyValidationError';
  }
}

export class PolicyNotFoundError extends PolicyError {
  constructor(message: string = 'Policy not found') {
    super(message, 'POLICY_NOT_FOUND', 404);
    this.name = 'PolicyNotFoundError';
  }
}

export class InvalidThresholdRangeError extends PolicyValidationError {
  constructor(errors: string[] = ['Invalid threshold range']) {
    super('Threshold validation failed', errors);
    this.name = 'InvalidThresholdRangeError';
  }
}

export class InvalidCompensationBandError extends PolicyValidationError {
  constructor(errors: string[] = ['Invalid compensation band']) {
    super('Compensation band validation failed', errors);
    this.name = 'InvalidCompensationBandError';
  }
}

export class InvalidApproverError extends PolicyValidationError {
  constructor(approverId: string, reason: string = 'Approver not found or inactive') {
    super(`Invalid approver: ${approverId}`, [reason]);
    this.name = 'InvalidApproverError';
  }
}

export class EffectiveDateConflictError extends PolicyError {
  constructor(message: string = 'Effective date conflicts with existing policy') {
    super(message, 'EFFECTIVE_DATE_CONFLICT', 409);
    this.name = 'EffectiveDateConflictError';
  }
}
