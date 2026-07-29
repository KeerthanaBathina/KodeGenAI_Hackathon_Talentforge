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
    effectiveFrom: new Date().toISOString().split('T')[0],
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
    if (!formData.shortlistThreshold || formData.shortlistThreshold === '') {
      newErrors.shortlistThreshold = 'Required';
    }
    if (!formData.borderlineMin && formData.borderlineMin !== 0) {
      newErrors.borderlineMin = 'Required';
    }
    if (!formData.borderlineMax && formData.borderlineMax !== 0) {
      newErrors.borderlineMax = 'Required';
    }
    if (!formData.rejectThreshold && formData.rejectThreshold !== 0) {
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
      effectiveFrom: new Date().toISOString().split('T')[0],
    });
    setErrors({});
    setRangeErrors([]);
  };

  const isValid = Object.keys(errors).length === 0 && rangeErrors.length === 0;

  return (
    <div className="space-y-6">
      {/* Current Threshold Display */}
      {loading ? (
        <div className="bg-white rounded-lg shadow p-6 animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-20 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      ) : currentThreshold ? (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Current Screening Thresholds
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Shortlist', value: currentThreshold.shortlistThreshold, color: 'green' },
              { label: 'Borderline Min', value: currentThreshold.borderlineMin, color: 'yellow' },
              { label: 'Borderline Max', value: currentThreshold.borderlineMax, color: 'yellow' },
              { label: 'Reject', value: currentThreshold.rejectThreshold, color: 'red' },
            ].map((item) => (
              <div
                key={item.label}
                className={`p-4 rounded-lg border-2 border-${item.color}-200 bg-${item.color}-50`}
              >
                <div className="text-sm text-gray-600 font-medium">{item.label}</div>
                <div className="text-3xl font-bold text-gray-900 mt-2">{item.value}</div>
              </div>
            ))}
          </div>
          <p className="text-sm text-gray-600 mt-4">
            Version {currentThreshold.version} • Effective since{' '}
            {new Date(currentThreshold.effectiveFrom).toLocaleDateString()}
          </p>
        </div>
      ) : null}

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
        <h2 className="text-lg font-semibold text-gray-900 mb-6">Create New Version</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
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
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {field.label}
              </label>
              <input
                type="number"
                name={field.name}
                value={formData[field.name as keyof typeof formData]}
                onChange={handleChange}
                min="0"
                max="100"
                step="1"
                className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 ${
                  errors[field.name]
                    ? 'border-red-300 focus:ring-red-500'
                    : 'border-gray-300 focus:ring-blue-500'
                }`}
              />
              {errors[field.name] && (
                <p className="text-xs text-red-600 mt-1">{errors[field.name]}</p>
              )}
              <p className="text-xs text-gray-500 mt-1">{field.help}</p>
            </div>
          ))}
        </div>

        {/* Threshold Range Visualizer */}
        <div className="mb-6">
          <ThresholdRangeVisualizer
            reject={formData.rejectThreshold}
            borderlineMin={formData.borderlineMin}
            borderlineMax={formData.borderlineMax}
            shortlist={formData.shortlistThreshold}
            errors={rangeErrors}
          />
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
    </div>
  );
};

export default ScreeningThresholdEditor;
