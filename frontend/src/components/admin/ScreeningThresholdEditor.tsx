'use client';

/**
 * Screening Threshold Editor Component
 *
 * UI for viewing and creating new screening threshold versions
 */

import React, { useState, useEffect } from 'react';
import {
  validateScreeningThresholds,
  getScreeningThresholdRangeErrors,
  validateEffectiveDate,
} from '@/utils/policyValidation';
import { policyService } from '@/services/policyService';
import type {
  ScreeningThreshold,
  ScreeningThresholdFormData,
  FormErrors,
  RangeValidationError,
} from '@/types/policy';
import { ThresholdRangeVisualizer } from './ThresholdRangeVisualizer';

export const ScreeningThresholdEditor: React.FC = () => {
  const [currentThreshold, setCurrentThreshold] = useState<ScreeningThreshold | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [rangeErrors, setRangeErrors] = useState<RangeValidationError[]>([]);
  const [successMessage, setSuccessMessage] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');

  const [formData, setFormData] = useState<ScreeningThresholdFormData>({
    shortlistThreshold: 80,
    borderlineMin: 40,
    borderlineMax: 60,
    rejectThreshold: 20,
    effectiveFrom: new Date().toISOString().slice(0, 10),
  });

  // Load current threshold on mount
  useEffect(() => {
    const loadThreshold = async () => {
      try {
        setLoading(true);
        const threshold = await policyService.getActiveScreeningThreshold();
        setCurrentThreshold(threshold);
      } catch (err) {
        console.error('Failed to load screening threshold:', err);
        setErrorMessage('Failed to load current threshold');
      } finally {
        setLoading(false);
      }
    };

    loadThreshold();
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    const numValue = name === 'effectiveFrom' ? value : Number(value);

    setFormData((prev) => ({
      ...prev,
      [name]: numValue,
    }));

    // Clear error for this field as user is correcting it
    setErrors((prev) => {
      const newErrors = { ...prev };
      delete newErrors[name];
      return newErrors;
    });

    // Validate range in real-time
    const updated = {
      ...formData,
      [name]: numValue,
    };
    const newRangeErrors = getScreeningThresholdRangeErrors(updated);
    setRangeErrors(newRangeErrors);
  };

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    // Validate required fields
    if (formData.shortlistThreshold === undefined || Number.isNaN(formData.shortlistThreshold)) {
      newErrors.shortlistThreshold = 'Required';
    }
    if (formData.borderlineMin === undefined || Number.isNaN(formData.borderlineMin)) {
      newErrors.borderlineMin = 'Required';
    }
    if (formData.borderlineMax === undefined || Number.isNaN(formData.borderlineMax)) {
      newErrors.borderlineMax = 'Required';
    }
    if (formData.rejectThreshold === undefined || Number.isNaN(formData.rejectThreshold)) {
      newErrors.rejectThreshold = 'Required';
    }
    if (!formData.effectiveFrom) {
      newErrors.effectiveFrom = 'Required';
    }

    // Validate values
    const validationErrors = validateScreeningThresholds(formData);
    validationErrors.forEach((err) => {
      if (err.includes('Shortlist')) newErrors.shortlistThreshold = err;
      if (err.includes('Borderline min')) newErrors.borderlineMin = err;
      if (err.includes('Borderline max')) newErrors.borderlineMax = err;
      if (err.includes('Reject')) newErrors.rejectThreshold = err;
    });

    // Validate effective date
    const dateError = validateEffectiveDate(formData.effectiveFrom);
    if (dateError) {
      newErrors.effectiveFrom = dateError;
    }

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

      await policyService.createScreeningThreshold({
        shortlistThreshold: Number(formData.shortlistThreshold),
        borderlineMin: Number(formData.borderlineMin),
        borderlineMax: Number(formData.borderlineMax),
        rejectThreshold: Number(formData.rejectThreshold),
        effectiveFrom: new Date(formData.effectiveFrom).toISOString(),
      });

      setSuccessMessage(
        `New screening threshold version created and will be effective from ${formData.effectiveFrom}`,
      );

      // Reset form
      resetForm();

      // Reload current threshold
      const threshold = await policyService.getActiveScreeningThreshold();
      setCurrentThreshold(threshold);
    } catch (err: any) {
      console.error('Failed to create threshold:', err);
      if (err.details && Array.isArray(err.details)) {
        setErrorMessage(err.details.join('; '));
      } else {
        setErrorMessage(err.message || 'Failed to create screening threshold');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setFormData({
      shortlistThreshold: 80,
      borderlineMin: 40,
      borderlineMax: 60,
      rejectThreshold: 20,
      effectiveFrom: new Date().toISOString().slice(0, 10),
    });
    setErrors({});
    setRangeErrors([]);
  };

  const isValid = Object.keys(errors).length === 0 && rangeErrors.length === 0;

  return (
    <div className="space-y-5">
      {/* Current Threshold Display */}
      {loading ? (
        <div className="animate-pulse rounded-2xl border border-[var(--admin-color-border)] bg-[var(--admin-color-surface-0)] p-6 shadow-[var(--admin-shadow-sm)]">
          <div className="mb-4 h-6 w-1/4 rounded bg-slate-200"></div>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-20 rounded bg-slate-200"></div>
            ))}
          </div>
        </div>
      ) : currentThreshold ? (
        <div className="rounded-2xl border border-[var(--admin-color-border)] bg-[var(--admin-color-surface-0)] p-6 shadow-[var(--admin-shadow-sm)]">
          <h2 className="admin-heading mb-4 text-lg font-semibold text-[var(--admin-color-ink-primary)]">
            Current Screening Thresholds
          </h2>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {[
              {
                label: 'Shortlist',
                value: currentThreshold.shortlistThreshold,
                toneClasses: 'border-emerald-200 bg-emerald-50',
              },
              {
                label: 'Borderline Min',
                value: currentThreshold.borderlineMin,
                toneClasses: 'border-amber-200 bg-amber-50',
              },
              {
                label: 'Borderline Max',
                value: currentThreshold.borderlineMax,
                toneClasses: 'border-amber-200 bg-amber-50',
              },
              {
                label: 'Reject',
                value: currentThreshold.rejectThreshold,
                toneClasses: 'border-rose-200 bg-rose-50',
              },
            ].map((item) => (
              <div
                key={item.label}
                className={`rounded-lg border p-4 ${item.toneClasses}`}
              >
                <div className="text-xs font-semibold uppercase tracking-[0.06em] text-[var(--admin-color-ink-secondary)]">
                  {item.label}
                </div>
                <div className="mt-2 text-3xl font-bold text-[var(--admin-color-ink-primary)]">{item.value}</div>
              </div>
            ))}
          </div>
          <p className="mt-4 text-sm text-[var(--admin-color-ink-secondary)]">
            Version {currentThreshold.version} • Effective since{' '}
            {new Date(currentThreshold.effectiveFrom).toLocaleDateString()}
          </p>
        </div>
      ) : null}

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
          <h2 className="admin-heading text-lg font-semibold text-[var(--admin-color-ink-primary)]">Create New Version</h2>
          <p className="mt-1 text-sm text-[var(--admin-color-ink-secondary)]">
            Configure threshold ranges for upcoming candidate evaluations.
          </p>
        </div>

        <div className="space-y-6 px-6 py-5">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {[
            {
              name: 'shortlistThreshold',
              label: 'Shortlist Threshold',
              help: 'Applications scoring at or above this value are automatically shortlisted',
            },
            {
              name: 'borderlineMin',
              label: 'Borderline Min',
              help: 'Lower bound for manual review range',
            },
            {
              name: 'borderlineMax',
              label: 'Borderline Max',
              help: 'Upper bound for manual review range',
            },
            {
              name: 'rejectThreshold',
              label: 'Reject Threshold',
              help: 'Applications scoring at or below this value are automatically rejected',
            },
          ].map((field) => (
            <div key={field.name}>
              <label
                htmlFor={`screening-${field.name}`}
                className="mb-1 block text-xs font-semibold uppercase tracking-[0.06em] text-[var(--admin-color-ink-tertiary)]"
              >
                {field.label}
              </label>
              <input
                type="number"
                id={`screening-${field.name}`}
                name={field.name}
                value={formData[field.name as keyof typeof formData]}
                onChange={handleChange}
                min="0"
                max="100"
                step="1"
                className={`h-10 w-full rounded-md border px-3 text-sm text-[var(--admin-color-ink-primary)] focus:outline-none focus:ring-2 focus:ring-offset-1 ${
                  errors[field.name]
                    ? 'border-rose-300 focus:ring-rose-500'
                    : 'border-[var(--admin-color-border)] focus:ring-[var(--admin-color-brand-primary)]'
                }`}
                aria-label={field.label}
              />
              {errors[field.name] && (
                <p className="mt-1 text-xs text-rose-700">{errors[field.name]}</p>
              )}
              <p className="mt-1 text-xs text-[var(--admin-color-ink-secondary)]">{field.help}</p>
            </div>
          ))}
          </div>

          {/* Threshold Range Visualizer */}
          <ThresholdRangeVisualizer
            reject={formData.rejectThreshold}
            borderlineMin={formData.borderlineMin}
            borderlineMax={formData.borderlineMax}
            shortlist={formData.shortlistThreshold}
            errors={rangeErrors}
          />

          {/* Effective Date */}
          <div>
            <label
              htmlFor="screening-effectiveFrom"
              className="mb-1 block text-xs font-semibold uppercase tracking-[0.06em] text-[var(--admin-color-ink-tertiary)]"
            >
              Effective From
            </label>
            <input
              type="date"
              id="screening-effectiveFrom"
              name="effectiveFrom"
              value={formData.effectiveFrom}
              onChange={handleChange}
              min={new Date().toISOString().slice(0, 10)}
              className={`h-10 w-full rounded-md border px-3 text-sm text-[var(--admin-color-ink-primary)] focus:outline-none focus:ring-2 focus:ring-offset-1 ${
                errors.effectiveFrom
                  ? 'border-rose-300 focus:ring-rose-500'
                  : 'border-[var(--admin-color-border)] focus:ring-[var(--admin-color-brand-primary)]'
              }`}
              aria-label="Effective From"
            />
            {errors.effectiveFrom && (
              <p className="mt-1 text-xs text-rose-700">{errors.effectiveFrom}</p>
            )}
            <p className="mt-1 text-xs text-[var(--admin-color-ink-secondary)]">
              New threshold will apply to applications submitted from this date forward.
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
            {submitting ? 'Creating...' : 'Create New Version'}
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

export default ScreeningThresholdEditor;
