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
    effectiveFrom: new Date().toISOString().slice(0, 10),
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
      effectiveFrom: new Date().toISOString().slice(0, 10),
    });
    setErrors({});
  };

  const isValid = Object.keys(errors).length === 0;

  const formatCurrency = (value: number | string): string => {
    return Number(value).toLocaleString();
  };

  const formatApproverLabel = (approver: ApproverOption): string => {
    return `${approver.fullName} (${approver.email})`;
  };

  return (
    <div className="space-y-5">
      {/* Current Policies */}
      {!loading && policies.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-[var(--admin-color-border)] bg-[var(--admin-color-surface-0)] shadow-[var(--admin-shadow-sm)]">
          <div className="border-b border-[var(--admin-color-border)] bg-[var(--admin-color-surface-1)] px-5 py-4">
            <h2 className="admin-heading text-lg font-semibold text-[var(--admin-color-ink-primary)]">Current Policies</h2>
            <p className="mt-1 text-sm text-[var(--admin-color-ink-secondary)]">
              Approval chains grouped by compensation band.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-[var(--admin-color-border)]">
              <thead className="bg-[var(--admin-color-surface-1)]">
                <tr>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--admin-color-ink-tertiary)]">
                    Band
                  </th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--admin-color-ink-tertiary)]">
                    Salary Range
                  </th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--admin-color-ink-tertiary)]">
                    Approval Chain
                  </th>
                  <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--admin-color-ink-tertiary)]">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--admin-color-border)] bg-white">
                {policies.map((policy, index) => (
                  <tr key={policy.id} className="hover:bg-[var(--admin-color-surface-1)]">
                    <td className="px-4 py-3 text-sm font-medium text-[var(--admin-color-ink-primary)]">
                      Band {index + 1}
                    </td>
                    <td className="px-4 py-3 text-sm text-[var(--admin-color-ink-primary)]">
                      ${formatCurrency(policy.compensationBandMin)} - ${formatCurrency(policy.compensationBandMax)}
                    </td>
                    <td className="px-4 py-3 text-sm text-[var(--admin-color-ink-secondary)]">
                      {(policy.requiredApprovers || []).length > 0
                        ? policy.requiredApprovers
                            .slice()
                            .sort((a, b) => a.tier - b.tier)
                            .map((approver) => approver.displayName || approver.role)
                            .join(' -> ')
                        : 'No approvers configured'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {policy.active !== false ? (
                        <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                          Archived
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {loading && (
        <div className="animate-pulse rounded-2xl border border-[var(--admin-color-border)] bg-[var(--admin-color-surface-0)] p-6 shadow-[var(--admin-shadow-sm)]">
          <div className="mb-4 h-5 w-52 rounded bg-slate-200"></div>
          <div className="space-y-2">
            <div className="h-9 rounded bg-slate-200"></div>
            <div className="h-9 rounded bg-slate-200"></div>
            <div className="h-9 rounded bg-slate-200"></div>
          </div>
        </div>
      )}

      {/* Messages */}
      {successMessage && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-sm font-medium text-emerald-900">{successMessage}</p>
        </div>
      )}
      {errorMessage && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-4">
          <p className="text-sm font-medium text-rose-900">{errorMessage}</p>
        </div>
      )}

      {/* Form */}
      <form
        onSubmit={handleSubmit}
        className="overflow-hidden rounded-2xl border border-[var(--admin-color-border)] bg-[var(--admin-color-surface-0)] shadow-[var(--admin-shadow-sm)]"
      >
        <div className="border-b border-[var(--admin-color-border)] bg-[var(--admin-color-surface-1)] px-6 py-4">
          <h2 className="admin-heading text-lg font-semibold text-[var(--admin-color-ink-primary)]">Create New Policy</h2>
          <p className="mt-1 text-sm text-[var(--admin-color-ink-secondary)]">
            Configure compensation band and sequential approver chain.
          </p>
        </div>

        <div className="space-y-6 px-6 py-5">
          {/* Compensation Band */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label htmlFor="compensationBandMin" className="mb-1 block text-xs font-semibold uppercase tracking-[0.06em] text-[var(--admin-color-ink-tertiary)]">
                Compensation Min ($)
              </label>
              <input
                type="number"
                id="compensationBandMin"
                name="compensationBandMin"
                value={formData.compensationBandMin}
                onChange={handleChange}
                min="0"
                step="1000"
                className={`h-10 w-full rounded-md border px-3 text-sm text-[var(--admin-color-ink-primary)] focus:outline-none focus:ring-2 focus:ring-offset-1 ${
                  errors.compensationBandMin
                    ? 'border-rose-300 focus:ring-rose-500'
                    : 'border-[var(--admin-color-border)] focus:ring-[var(--admin-color-brand-primary)]'
                }`}
              />
              {errors.compensationBandMin && (
                <p className="mt-1 text-xs text-rose-700">{errors.compensationBandMin}</p>
              )}
            </div>
            <div>
              <label htmlFor="compensationBandMax" className="mb-1 block text-xs font-semibold uppercase tracking-[0.06em] text-[var(--admin-color-ink-tertiary)]">
                Compensation Max ($)
              </label>
              <input
                type="number"
                id="compensationBandMax"
                name="compensationBandMax"
                value={formData.compensationBandMax}
                onChange={handleChange}
                min="0"
                step="1000"
                className={`h-10 w-full rounded-md border px-3 text-sm text-[var(--admin-color-ink-primary)] focus:outline-none focus:ring-2 focus:ring-offset-1 ${
                  errors.compensationBandMax
                    ? 'border-rose-300 focus:ring-rose-500'
                    : 'border-[var(--admin-color-border)] focus:ring-[var(--admin-color-brand-primary)]'
                }`}
              />
              {errors.compensationBandMax && (
                <p className="mt-1 text-xs text-rose-700">{errors.compensationBandMax}</p>
              )}
            </div>
          </div>

          {/* Approvers */}
          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.06em] text-[var(--admin-color-ink-tertiary)]">
              Required Approvers
            </label>
            <div className="space-y-2">
              {formData.requiredApprovers.map((approver, index) => (
                <div
                  key={index}
                  className="flex flex-col gap-2 rounded-lg border border-[var(--admin-color-border)] bg-[var(--admin-color-surface-1)] p-3 md:flex-row md:items-center"
                >
                  <span className="min-w-[70px] text-xs font-semibold uppercase tracking-[0.06em] text-[var(--admin-color-ink-secondary)]">
                    Tier {approver.tier}
                  </span>

                  <select
                    value={approver.approverId}
                    onChange={(e) => handleApproverChange(index, 'approverId', e.target.value)}
                    className="h-9 flex-1 rounded-md border border-[var(--admin-color-border)] bg-white px-3 text-sm text-[var(--admin-color-ink-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--admin-color-brand-primary)]"
                    aria-label={`Approver for tier ${approver.tier}`}
                  >
                    <option value="">Select approver...</option>
                    {approvers.map((app) => (
                      <option key={app.id} value={app.id}>
                        {formatApproverLabel(app)}
                      </option>
                    ))}
                  </select>

                  {formData.requiredApprovers.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeApprover(index)}
                      className="h-9 rounded-md border border-rose-200 bg-rose-50 px-3 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}
            </div>

            {errors.requiredApprovers && (
              <p className="mt-2 text-xs text-rose-700">{errors.requiredApprovers}</p>
            )}

            <button
              type="button"
              onClick={addApprover}
              className="mt-3 h-9 rounded-md border border-dashed border-[var(--admin-color-border)] bg-white px-3 text-sm font-medium text-[var(--admin-color-ink-secondary)] hover:bg-[var(--admin-color-surface-1)]"
            >
              Add Approver Tier
            </button>
          </div>

          {/* Effective Date */}
          <div>
            <label htmlFor="approval-effectiveFrom" className="mb-1 block text-xs font-semibold uppercase tracking-[0.06em] text-[var(--admin-color-ink-tertiary)]">
              Effective From
            </label>
            <input
              type="date"
              id="approval-effectiveFrom"
              name="effectiveFrom"
              value={formData.effectiveFrom}
              onChange={handleChange}
              min={new Date().toISOString().slice(0, 10)}
              className={`h-10 w-full rounded-md border px-3 text-sm text-[var(--admin-color-ink-primary)] focus:outline-none focus:ring-2 focus:ring-offset-1 ${
                errors.effectiveFrom
                  ? 'border-rose-300 focus:ring-rose-500'
                  : 'border-[var(--admin-color-border)] focus:ring-[var(--admin-color-brand-primary)]'
              }`}
            />
            {errors.effectiveFrom && (
              <p className="mt-1 text-xs text-rose-700">{errors.effectiveFrom}</p>
            )}
            <p className="mt-1 text-xs text-[var(--admin-color-ink-secondary)]">
              New policy will apply to offers created from this date forward.
            </p>
          </div>
        </div>

        {/* Buttons */}
        <div className="flex flex-wrap items-center gap-3 border-t border-[var(--admin-color-border)] bg-[var(--admin-color-surface-1)] px-6 py-4">
          <button
            type="submit"
            disabled={!isValid || submitting}
            className={`h-10 rounded-md px-5 text-sm font-semibold ${
              isValid && !submitting
                ? 'bg-[var(--admin-color-brand-primary)] text-white hover:bg-[var(--admin-color-brand-primary-hover)]'
                : 'cursor-not-allowed bg-slate-300 text-slate-500'
            }`}
          >
            {submitting ? 'Creating...' : 'Create New Policy'}
          </button>
          <button
            type="button"
            onClick={resetForm}
            className="h-10 rounded-md border border-[var(--admin-color-border)] bg-white px-5 text-sm font-medium text-[var(--admin-color-ink-secondary)] hover:bg-[var(--admin-color-surface-1)]"
          >
            Reset
          </button>
        </div>
      </form>
    </div>
  );
};

export default ApprovalPolicyEditor;
