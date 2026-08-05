'use client';

/**
 * Scoring Threshold Editor Component
 *
 * UI for viewing and creating new scoring threshold versions per job family
 */

import React, { useState, useEffect } from 'react';
import {
  validateScoringThresholds,
  validateEffectiveDate,
} from '@/utils/policyValidation';
import { policyService } from '@/services/policyService';
import type {
  ScoringThreshold,
  JobFamily,
  ScoringThresholdFormData,
  FormErrors,
} from '@/types/policy';

export const ScoringThresholdEditor: React.FC = () => {
  const [jobFamilies, setJobFamilies] = useState<JobFamily[]>([]);
  const [selectedJobFamilyId, setSelectedJobFamilyId] = useState<string>('');
  const [currentThreshold, setCurrentThreshold] = useState<ScoringThreshold | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [successMessage, setSuccessMessage] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');

  const [formData, setFormData] = useState<ScoringThresholdFormData>({
    jobFamilyId: '',
    aiShortlistThreshold: 0.85,
    confidenceThreshold: 0.75,
    experienceThresholdYears: 5,
    effectiveFrom: new Date().toISOString().slice(0, 10),
  });

  // Load job families on mount
  useEffect(() => {
    const loadJobFamilies = async () => {
      try {
        setLoading(true);
        const families = await policyService.getJobFamilies();
        setJobFamilies(families);
      } catch (err) {
        console.error('Failed to load job families:', err);
        setErrorMessage('Failed to load job families');
      } finally {
        setLoading(false);
      }
    };

    loadJobFamilies();
  }, []);

  // Load current threshold when job family changes
  useEffect(() => {
    const loadThreshold = async () => {
      if (!selectedJobFamilyId) {
        setCurrentThreshold(null);
        return;
      }

      try {
        const threshold = await policyService.getEffectiveScoringThreshold(selectedJobFamilyId);
        setCurrentThreshold(threshold);
      } catch (err) {
        console.error('Failed to load scoring threshold:', err);
        setCurrentThreshold(null);
      }
    };

    loadThreshold();
  }, [selectedJobFamilyId]);

  const handleJobFamilyChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;
    setSelectedJobFamilyId(id);
    setFormData((prev) => ({
      ...prev,
      jobFamilyId: id,
    }));
  };

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

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    // Validate job family
    if (!formData.jobFamilyId) {
      newErrors.jobFamilyId = 'Job family is required';
    }

    // Validate required fields
    if (formData.aiShortlistThreshold === undefined || Number.isNaN(formData.aiShortlistThreshold)) {
      newErrors.aiShortlistThreshold = 'Required';
    }
    if (formData.confidenceThreshold === undefined || Number.isNaN(formData.confidenceThreshold)) {
      newErrors.confidenceThreshold = 'Required';
    }
    if (
      formData.experienceThresholdYears === undefined ||
      Number.isNaN(formData.experienceThresholdYears)
    ) {
      newErrors.experienceThresholdYears = 'Required';
    }
    if (!formData.effectiveFrom) {
      newErrors.effectiveFrom = 'Required';
    }

    // Validate values
    const validationErrors = validateScoringThresholds(formData);
    validationErrors.forEach((err) => {
      if (err.includes('AI shortlist')) newErrors.aiShortlistThreshold = err;
      if (err.includes('Confidence')) newErrors.confidenceThreshold = err;
      if (err.includes('Experience')) newErrors.experienceThresholdYears = err;
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

      await policyService.createScoringThreshold({
        jobFamilyId: formData.jobFamilyId,
        aiShortlistThreshold: Number(formData.aiShortlistThreshold),
        confidenceThreshold: Number(formData.confidenceThreshold),
        experienceThresholdYears: Number(formData.experienceThresholdYears),
        effectiveFrom: new Date(formData.effectiveFrom).toISOString(),
      });

      const selectedFamily = jobFamilies.find((jf) => jf.id === formData.jobFamilyId);
      setSuccessMessage(
        `New scoring threshold version created for ${selectedFamily?.name} and will be effective from ${formData.effectiveFrom}`,
      );

      // Reload current threshold
      const threshold = await policyService.getEffectiveScoringThreshold(formData.jobFamilyId);
      setCurrentThreshold(threshold);

      // Reset form
      resetForm();
    } catch (err: any) {
      console.error('Failed to create scoring threshold:', err);
      if (err.details && Array.isArray(err.details)) {
        setErrorMessage(err.details.join('; '));
      } else {
        setErrorMessage(err.message || 'Failed to create scoring threshold');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setFormData({
      jobFamilyId: selectedJobFamilyId,
      aiShortlistThreshold: 0.85,
      confidenceThreshold: 0.75,
      experienceThresholdYears: 5,
      effectiveFrom: new Date().toISOString().slice(0, 10),
    });
    setErrors({});
  };

  const isValid = Object.keys(errors).length === 0;
  const selectedJobFamily = jobFamilies.find((jf) => jf.id === selectedJobFamilyId);

  return (
    <div className="space-y-5">
      {/* Job Family Selection */}
      <div className="rounded-2xl border border-[var(--admin-color-border)] bg-[var(--admin-color-surface-0)] p-5 shadow-[var(--admin-shadow-sm)]">
        <label htmlFor="jobFamily" className="mb-2 block text-xs font-semibold uppercase tracking-[0.06em] text-[var(--admin-color-ink-tertiary)]">
          Select Job Family
        </label>
        <select
          id="jobFamily"
          value={selectedJobFamilyId}
          onChange={handleJobFamilyChange}
          disabled={loading}
          className={`h-10 w-full rounded-md border px-3 text-sm text-[var(--admin-color-ink-primary)] focus:outline-none focus:ring-2 focus:ring-offset-1 ${
            errors.jobFamilyId
              ? 'border-rose-300 focus:ring-rose-500'
              : 'border-[var(--admin-color-border)] focus:ring-[var(--admin-color-brand-primary)]'
          }`}
          aria-label="Select Job Family"
        >
          <option value="">
            {loading ? 'Loading job families...' : 'Select a job family...'}
          </option>
          {jobFamilies.map((jf) => (
            <option key={jf.id} value={jf.id}>
              {jf.name}
            </option>
          ))}
        </select>
        {errors.jobFamilyId && (
          <p className="mt-1 text-xs text-rose-700">{errors.jobFamilyId}</p>
        )}
        {selectedJobFamily && (
          <p className="mt-2 text-xs text-[var(--admin-color-ink-secondary)]">
            Showing thresholds for: <span className="font-semibold text-[var(--admin-color-ink-primary)]">{selectedJobFamily.name}</span>
          </p>
        )}
      </div>

      {/* Current Threshold Display */}
      {selectedJobFamily && currentThreshold && (
        <div className="rounded-2xl border border-[var(--admin-color-border)] bg-[var(--admin-color-surface-0)] p-6 shadow-[var(--admin-shadow-sm)]">
          <h2 className="admin-heading mb-4 text-lg font-semibold text-[var(--admin-color-ink-primary)]">
            Current Thresholds for {selectedJobFamily.name}
          </h2>
          <dl className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-[0.06em] text-[var(--admin-color-ink-tertiary)]">AI Shortlist Threshold</dt>
              <dd className="mt-2 text-2xl font-bold text-[var(--admin-color-brand-primary)]">
                {currentThreshold.aiShortlistThreshold.toFixed(4)}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-[0.06em] text-[var(--admin-color-ink-tertiary)]">Confidence Threshold</dt>
              <dd className="mt-2 text-2xl font-bold text-amber-600">
                {currentThreshold.confidenceThreshold.toFixed(4)}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-[0.06em] text-[var(--admin-color-ink-tertiary)]">Experience (Years)</dt>
              <dd className="mt-2 text-2xl font-bold text-[var(--admin-color-ink-primary)]">
                {currentThreshold.experienceThresholdYears}
              </dd>
            </div>
          </dl>
          <p className="mt-4 text-sm text-[var(--admin-color-ink-secondary)]">
            Effective since {new Date(currentThreshold.effectiveFrom).toLocaleDateString()}
          </p>
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
      {selectedJobFamily && (
        <form
          onSubmit={handleSubmit}
          className="overflow-hidden rounded-2xl border border-[var(--admin-color-border)] bg-[var(--admin-color-surface-0)] shadow-[var(--admin-shadow-sm)]"
        >
          <div className="border-b border-[var(--admin-color-border)] bg-[var(--admin-color-surface-1)] px-6 py-4">
            <h2 className="admin-heading text-lg font-semibold text-[var(--admin-color-ink-primary)]">
              Create New Version for {selectedJobFamily.name}
            </h2>
            <p className="mt-1 text-sm text-[var(--admin-color-ink-secondary)]">
              Adjust scoring cutoffs for this job family.
            </p>
          </div>

          <div className="space-y-5 px-6 py-5">
            {/* AI Shortlist Threshold */}
            <div>
              <label htmlFor="aiShortlistThreshold" className="mb-1 block text-xs font-semibold uppercase tracking-[0.06em] text-[var(--admin-color-ink-tertiary)]">
                AI Shortlist Threshold
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  id="aiShortlistThreshold"
                  name="aiShortlistThreshold"
                  value={formData.aiShortlistThreshold}
                  onChange={handleChange}
                  min="0"
                  max="1"
                  step="0.0001"
                  className="h-2 flex-1 cursor-pointer accent-[var(--admin-color-brand-primary)]"
                />
                <span className="w-20 text-right text-lg font-semibold text-[var(--admin-color-brand-primary)]">
                  {Number(formData.aiShortlistThreshold).toFixed(4)}
                </span>
              </div>
              {errors.aiShortlistThreshold && (
                <p className="mt-1 text-xs text-rose-700">{errors.aiShortlistThreshold}</p>
              )}
              <p className="mt-1 text-xs text-[var(--admin-color-ink-secondary)]">
                Minimum AI confidence score for automatic shortlisting (0.0-1.0)
              </p>
            </div>

            {/* Confidence Threshold */}
            <div>
              <label htmlFor="confidenceThreshold" className="mb-1 block text-xs font-semibold uppercase tracking-[0.06em] text-[var(--admin-color-ink-tertiary)]">
                Confidence Threshold
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  id="confidenceThreshold"
                  name="confidenceThreshold"
                  value={formData.confidenceThreshold}
                  onChange={handleChange}
                  min="0"
                  max="1"
                  step="0.0001"
                  className="h-2 flex-1 cursor-pointer accent-amber-500"
                />
                <span className="w-20 text-right text-lg font-semibold text-amber-600">
                  {Number(formData.confidenceThreshold).toFixed(4)}
                </span>
              </div>
              {errors.confidenceThreshold && (
                <p className="mt-1 text-xs text-rose-700">{errors.confidenceThreshold}</p>
              )}
              <p className="mt-1 text-xs text-[var(--admin-color-ink-secondary)]">
                Minimum confidence level required (0.0-1.0)
              </p>
            </div>

            {/* Experience Threshold */}
            <div>
              <label htmlFor="experienceThresholdYears" className="mb-1 block text-xs font-semibold uppercase tracking-[0.06em] text-[var(--admin-color-ink-tertiary)]">
                Experience Threshold (Years)
              </label>
              <input
                type="number"
                id="experienceThresholdYears"
                name="experienceThresholdYears"
                value={formData.experienceThresholdYears}
                onChange={handleChange}
                min="0"
                max="50"
                step="1"
                className={`h-10 w-full rounded-md border px-3 text-sm text-[var(--admin-color-ink-primary)] focus:outline-none focus:ring-2 focus:ring-offset-1 ${
                  errors.experienceThresholdYears
                    ? 'border-rose-300 focus:ring-rose-500'
                    : 'border-[var(--admin-color-border)] focus:ring-[var(--admin-color-brand-primary)]'
                }`}
              />
              {errors.experienceThresholdYears && (
                <p className="mt-1 text-xs text-rose-700">{errors.experienceThresholdYears}</p>
              )}
              <p className="mt-1 text-xs text-[var(--admin-color-ink-secondary)]">Minimum years of experience required.</p>
            </div>

            {/* Effective Date */}
            <div>
              <label htmlFor="scoring-effectiveFrom" className="mb-1 block text-xs font-semibold uppercase tracking-[0.06em] text-[var(--admin-color-ink-tertiary)]">
                Effective From
              </label>
              <input
                type="date"
                id="scoring-effectiveFrom"
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
      )}
    </div>
  );
};

export default ScoringThresholdEditor;
