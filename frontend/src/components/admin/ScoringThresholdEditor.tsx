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
    effectiveFrom: new Date().toISOString().split('T')[0],
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
    if (
      formData.aiShortlistThreshold === '' ||
      formData.aiShortlistThreshold === null ||
      formData.aiShortlistThreshold === undefined
    ) {
      newErrors.aiShortlistThreshold = 'Required';
    }
    if (
      formData.confidenceThreshold === '' ||
      formData.confidenceThreshold === null ||
      formData.confidenceThreshold === undefined
    ) {
      newErrors.confidenceThreshold = 'Required';
    }
    if (
      formData.experienceThresholdYears === '' ||
      formData.experienceThresholdYears === null ||
      formData.experienceThresholdYears === undefined
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
      effectiveFrom: new Date().toISOString().split('T')[0],
    });
    setErrors({});
  };

  const isValid = Object.keys(errors).length === 0;
  const selectedJobFamily = jobFamilies.find((jf) => jf.id === selectedJobFamilyId);

  return (
    <div className="space-y-6">
      {/* Job Family Selection */}
      <div className="bg-white rounded-lg shadow p-6">
        <label className="block text-sm font-medium text-gray-700 mb-3">
          Select Job Family
        </label>
        <select
          value={selectedJobFamilyId}
          onChange={handleJobFamilyChange}
          disabled={loading}
          className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 ${
            errors.jobFamilyId
              ? 'border-red-300 focus:ring-red-500'
              : 'border-gray-300 focus:ring-blue-500'
          }`}
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
          <p className="text-xs text-red-600 mt-1">{errors.jobFamilyId}</p>
        )}
      </div>

      {/* Current Threshold Display */}
      {selectedJobFamily && currentThreshold && (
        <div className="bg-blue-50 rounded-lg shadow p-6 border border-blue-200">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Current Thresholds for {selectedJobFamily.name}
          </h2>
          <dl className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <dt className="text-sm text-gray-600 font-medium">AI Shortlist Threshold</dt>
              <dd className="text-2xl font-bold text-gray-900 mt-2">
                {currentThreshold.aiShortlistThreshold.toFixed(4)}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-gray-600 font-medium">Confidence Threshold</dt>
              <dd className="text-2xl font-bold text-gray-900 mt-2">
                {currentThreshold.confidenceThreshold.toFixed(4)}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-gray-600 font-medium">Experience (Years)</dt>
              <dd className="text-2xl font-bold text-gray-900 mt-2">
                {currentThreshold.experienceThresholdYears}
              </dd>
            </div>
          </dl>
          <p className="text-sm text-gray-600 mt-4">
            Effective since {new Date(currentThreshold.effectiveFrom).toLocaleDateString()}
          </p>
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
      {selectedJobFamily && (
        <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-6">
            Create New Version for {selectedJobFamily.name}
          </h2>

          <div className="space-y-4 mb-6">
            {/* AI Shortlist Threshold */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                AI Shortlist Threshold
              </label>
              <div className="flex items-center gap-4">
                <input
                  type="range"
                  name="aiShortlistThreshold"
                  value={formData.aiShortlistThreshold}
                  onChange={handleChange}
                  min="0"
                  max="1"
                  step="0.0001"
                  className="flex-1"
                />
                <span className="text-lg font-medium text-gray-900 w-20">
                  {Number(formData.aiShortlistThreshold).toFixed(4)}
                </span>
              </div>
              {errors.aiShortlistThreshold && (
                <p className="text-xs text-red-600 mt-1">{errors.aiShortlistThreshold}</p>
              )}
              <p className="text-xs text-gray-500 mt-1">
                Minimum AI confidence score for automatic shortlisting (0.0-1.0)
              </p>
            </div>

            {/* Confidence Threshold */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Confidence Threshold
              </label>
              <div className="flex items-center gap-4">
                <input
                  type="range"
                  name="confidenceThreshold"
                  value={formData.confidenceThreshold}
                  onChange={handleChange}
                  min="0"
                  max="1"
                  step="0.0001"
                  className="flex-1"
                />
                <span className="text-lg font-medium text-gray-900 w-20">
                  {Number(formData.confidenceThreshold).toFixed(4)}
                </span>
              </div>
              {errors.confidenceThreshold && (
                <p className="text-xs text-red-600 mt-1">{errors.confidenceThreshold}</p>
              )}
              <p className="text-xs text-gray-500 mt-1">
                Minimum confidence level required (0.0-1.0)
              </p>
            </div>

            {/* Experience Threshold */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Experience Threshold (Years)
              </label>
              <input
                type="number"
                name="experienceThresholdYears"
                value={formData.experienceThresholdYears}
                onChange={handleChange}
                min="0"
                max="50"
                step="1"
                className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 ${
                  errors.experienceThresholdYears
                    ? 'border-red-300 focus:ring-red-500'
                    : 'border-gray-300 focus:ring-blue-500'
                }`}
              />
              {errors.experienceThresholdYears && (
                <p className="text-xs text-red-600 mt-1">{errors.experienceThresholdYears}</p>
              )}
              <p className="text-xs text-gray-500 mt-1">Minimum years of experience required</p>
            </div>
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
              New threshold will apply to applications submitted from this date forward
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
              {submitting ? 'Creating...' : 'Create New Version'}
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
      )}
    </div>
  );
};

export default ScoringThresholdEditor;
