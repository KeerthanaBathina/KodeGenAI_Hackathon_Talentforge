'use client';

/**
 * Approval Policy Editor Component
 *
 * UI for viewing and creating new approval policy versions with tier management
 */

import React, { useState, useEffect } from 'react';
import {
  validateApprovalPolicy,
  validateEffectiveDate,
  validateCurrencyField,
} from '@/utils/policyValidation';
import { policyService } from '@/services/policyService';
import type {
  ApprovalPolicy,
  ApprovalPolicyFormData,
  ApprovalTier,
  FormErrors,
} from '@/types/policy';

interface ApproverOption {
  id: string;
  fullName: string;
  email: string;
  role: string;
}

export const ApprovalPolicyEditor: React.FC = () => {
  const [policies, setPolicies] = useState<ApprovalPolicy[]>([]);
  const [approvers, setApprovers] = useState<ApproverOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [successMessage, setSuccessMessage] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');

  const [formData, setFormData] = useState<ApprovalPolicyFormData>({
    compensationBandMin: 50000,
    compensationBandMax: 100000,
    requiredApprovers: [{ tier: 1, approverId: '', role: 'hr_manager' }],
    effectiveFrom: new Date().toISOString().split('T')[0],
  });

  // Load data on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        // In a real app, would fetch from /api/users?role=hr_manager
        // For now, using mock data
        setApprovers([
          { id: '1', fullName: 'Alice Manager', email: 'alice@example.com', role: 'hr_manager' },
          { id: '2', fullName: 'Bob Manager', email: 'bob@example.com', role: 'hr_manager' },
          { id: '3', fullName: 'Carol Admin', email: 'carol@example.com', role: 'admin' },
        ]);

        const result = await policyService.getApprovalPolicies();
        setPolicies(result.policies);
      } catch (err) {
        console.error('Failed to load approval policies:', err);
        setErrorMessage('Failed to load approval policies');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    let numValue: number | string = value;

    if (name !== 'effectiveFrom') {
      numValue = Number(value);
    }

    setFormData((prev) => ({
      ...prev,
      [name]: numValue,
    }));

    // Clear error for this field
    setErrors((prev) => {
      const newErrors = { ...prev };
      delete newErrors[name];
      return newErrors;
    });
  };

  const handleApproverChange = (index: number, field: string, value: string) => {
    setFormData((prev) => {
      const newApprovers = [...prev.requiredApprovers];
      if (field === 'tier') {
        (newApprovers[index] as any)[field] = Number(value);
      } else {
        (newApprovers[index] as any)[field] = value;
      }
      return {
        ...prev,
        requiredApprovers: newApprovers,
      };
    });
  };

  const addApprover = () => {
    const nextTier = Math.max(...formData.requiredApprovers.map((a) => a.tier), 0) + 1;
    setFormData((prev) => ({
      ...prev,
      requiredApprovers: [
        ...prev.requiredApprovers,
        { tier: nextTier, approverId: '', role: 'hr_manager' },
      ],
    }));
  };

  const removeApprover = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      requiredApprovers: prev.requiredApprovers.filter((_, i) => i !== index),
    }));
  };

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    // Validate compensation band
    const minError = validateCurrencyField(formData.compensationBandMin, 'Compensation Min');
    if (minError) newErrors.compensationBandMin = minError;

    const maxError = validateCurrencyField(formData.compensationBandMax, 'Compensation Max');
    if (maxError) newErrors.compensationBandMax = maxError;

    // Validate effective date
    const dateError = validateEffectiveDate(formData.effectiveFrom);
    if (dateError) newErrors.effectiveFrom = dateError;

    // Validate policy rules
    const validationErrors = validateApprovalPolicy(formData);
    validationErrors.forEach((err) => {
      if (err.includes('Compensation')) newErrors.compensationBandMin = err;
      if (err.includes('approver')) newErrors.requiredApprovers = err;
      if (err.includes('tier') || err.includes('Tier')) newErrors.requiredApprovers = err;
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    try {
      setSubmitting(true);
      setErrorMessage('');
      setSuccessMessage('');

      await policyService.createApprovalPolicy({
        compensationBandMin: Number(formData.compensationBandMin),
        compensationBandMax: Number(formData.compensationBandMax),
        requiredApprovers: formData.requiredApprovers,
        effectiveFrom: new Date(formData.effectiveFrom).toISOString(),
      });

      setSuccessMessage(
        `New approval policy created for band $${formData.compensationBandMin} - $${formData.compensationBandMax} and will be effective from ${formData.effectiveFrom}`,
      );

      // Reset form
      resetForm();

      // Reload policies
      const result = await policyService.getApprovalPolicies();
      setPolicies(result.policies);
    } catch (err: any) {
      console.error('Failed to create approval policy:', err);
      if (err.details && Array.isArray(err.details)) {
        setErrorMessage(err.details.join('; '));
      } else {
        setErrorMessage(err.message || 'Failed to create approval policy');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setFormData({
      compensationBandMin: 50000,
      compensationBandMax: 100000,
      requiredApprovers: [{ tier: 1, approverId: '', role: 'hr_manager' }],
      effectiveFrom: new Date().toISOString().split('T')[0],
    });
    setErrors({});
  };

  const isValid = Object.keys(errors).length === 0;

  return (
    <div className="space-y-6">
      {/* Current Policies */}
      {!loading && policies.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Current Policies</h2>
          <div className="space-y-3">
            {policies.map((policy) => (
              <div key={policy.id} className="p-3 bg-gray-50 rounded border border-gray-200">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      ${Number(policy.compensationBandMin).toLocaleString()} - $
                      {Number(policy.compensationBandMax).toLocaleString()}
                    </p>
                    <p className="text-xs text-gray-600 mt-1">
                      {policy.requiredApprovers?.length || 0} approvers
                      {policy.effectiveFrom && (
                        <> • Effective {new Date(policy.effectiveFrom).toLocaleDateString()}</>
                      )}
                    </p>
                  </div>
                  {policy.active !== false && (
                    <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded">
                      Active
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Messages */}
      {successMessage && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
          <p className="text-green-800 font-medium">{successMessage}</p>
        </div>
      )}
      {errorMessage && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-800 font-medium">{errorMessage}</p>
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-6">Create New Policy</h2>

        {/* Compensation Band */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Compensation Min ($)
            </label>
            <input
              type="number"
              name="compensationBandMin"
              value={formData.compensationBandMin}
              onChange={handleChange}
              min="0"
              step="1000"
              className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 ${
                errors.compensationBandMin
                  ? 'border-red-300 focus:ring-red-500'
                  : 'border-gray-300 focus:ring-blue-500'
              }`}
            />
            {errors.compensationBandMin && (
              <p className="text-xs text-red-600 mt-1">{errors.compensationBandMin}</p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Compensation Max ($)
            </label>
            <input
              type="number"
              name="compensationBandMax"
              value={formData.compensationBandMax}
              onChange={handleChange}
              min="0"
              step="1000"
              className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 ${
                errors.compensationBandMax
                  ? 'border-red-300 focus:ring-red-500'
                  : 'border-gray-300 focus:ring-blue-500'
              }`}
            />
            {errors.compensationBandMax && (
              <p className="text-xs text-red-600 mt-1">{errors.compensationBandMax}</p>
            )}
          </div>
        </div>

        {/* Approvers */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-3">
            Required Approvers
          </label>
          <div className="space-y-3">
            {formData.requiredApprovers.map((approver, index) => (
              <div
                key={index}
                className="p-4 bg-gray-50 rounded border border-gray-200 flex items-center gap-3"
              >
                <span className="font-semibold text-gray-700 w-12">Tier {approver.tier}</span>

                <select
                  value={approver.approverId}
                  onChange={(e) => handleApproverChange(index, 'approverId', e.target.value)}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select approver...</option>
                  {approvers.map((app) => (
                    <option key={app.id} value={app.id}>
                      {app.fullName} ({app.email})
                    </option>
                  ))}
                </select>

                {formData.requiredApprovers.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeApprover(index)}
                    className="px-3 py-2 text-red-600 hover:text-red-700 font-medium"
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>

          {errors.requiredApprovers && (
            <p className="text-xs text-red-600 mt-2">{errors.requiredApprovers}</p>
          )}

          <button
            type="button"
            onClick={addApprover}
            className="mt-3 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 font-medium text-sm"
          >
            + Add Approver Tier
          </button>
        </div>

        {/* Effective Date */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Effective From
          </label>
          <input
            type="date"
            name="effectiveFrom"
            value={formData.effectiveFrom}
            onChange={handleChange}
            min={new Date().toISOString().split('T')[0]}
            className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 ${
              errors.effectiveFrom
                ? 'border-red-300 focus:ring-red-500'
                : 'border-gray-300 focus:ring-blue-500'
            }`}
          />
          {errors.effectiveFrom && (
            <p className="text-xs text-red-600 mt-1">{errors.effectiveFrom}</p>
          )}
          <p className="text-xs text-gray-500 mt-1">
            New policy will apply to offers created from this date forward
          </p>
        </div>

        {/* Buttons */}
        <div className="flex gap-3">
          <button
            type="submit"
            disabled={!isValid || submitting}
            className={`px-6 py-2 rounded-lg font-medium ${
              isValid && !submitting
                ? 'bg-blue-600 hover:bg-blue-700 text-white'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }`}
          >
            {submitting ? 'Creating...' : 'Create New Policy'}
          </button>
          <button
            type="button"
            onClick={resetForm}
            className="px-6 py-2 rounded-lg font-medium bg-gray-200 text-gray-700 hover:bg-gray-300"
          >
            Reset
          </button>
        </div>
      </form>
    </div>
  );
};

export default ApprovalPolicyEditor;
