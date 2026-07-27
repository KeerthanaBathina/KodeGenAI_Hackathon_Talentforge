/**
 * DecisionPanel Component
 * 
 * Manages final hiring decisions (offer/reject) with prerequisite gating.
 * 
 * Features:
 * - Prerequisite validation checklist
 * - Gated decision controls (disabled until prerequisites complete)
 * - Visual feedback for disabled state
 * - Form validation and submission
 * - Error handling for HTTP 422 (prerequisite failures)
 * - Loading states
 */

'use client';

import React, { useState, useCallback, useRef } from 'react';
import { PrerequisiteChecklist, type PrerequisiteChecklistHandle } from './PrerequisiteChecklist';
import { useReasonCodes } from '../hooks/useReasonCodes';

export interface DecisionPanelProps {
  applicationId: string;
  candidateName: string;
  onDecisionSubmitted?: () => void;
}

type DecisionOutcome = 'offer' | 'reject' | 'hold' | 'withdraw' | null;

export function DecisionPanel({
  applicationId,
  candidateName,
  onDecisionSubmitted
}: DecisionPanelProps) {
  // Prerequisite state
  const [prerequisitesComplete, setPrerequisitesComplete] = useState(false);
  const checklistRef = useRef<PrerequisiteChecklistHandle>(null);

  // Form state
  const [outcome, setOutcome] = useState<DecisionOutcome>(null);
  const [reasonCodeId, setReasonCodeId] = useState<string>('');
  const [justification, setJustification] = useState('');

  // Get reason code category based on outcome
  const reasonCodeCategory = outcome ? `${outcome}_decision` : null;
  
  // Fetch reason codes for selected outcome
  const { reasonCodes, loading: loadingReasonCodes } = useReasonCodes(reasonCodeCategory);

  // UI state
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  // Handle prerequisite status changes
  const handlePrerequisiteChange = useCallback((isComplete: boolean) => {
    setPrerequisitesComplete(isComplete);
    setError(null); // Clear errors when status changes
  }, []);

  // Handle outcome change - reset reason code when outcome changes
  const handleOutcomeChange = (newOutcome: DecisionOutcome) => {
    setOutcome(newOutcome);
    setReasonCodeId(''); // Reset reason code when changing outcome
    setError(null);
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!prerequisitesComplete) {
      setError('Cannot submit: Prerequisites incomplete');
      return;
    }

    if (!outcome) {
      setError('Please select a decision outcome');
      return;
    }

    if (!reasonCodeId) {
      setError('Please select a reason code');
      return;
    }

    if (!justification.trim() || justification.trim().length < 20) {
      setError('Justification must be at least 20 characters');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch('/api/decisions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          applicationId,
          outcome,
          reasonCodeId,
          justification: justification.trim()
        })
      });

      if (response.status === 422) {
        // Prerequisite validation failed on server
        const errorData = await response.json();
        setError(
          `Prerequisites validation failed: ${errorData.error?.message || 'Please complete all evaluation stages'}`
        );
        // Refresh prerequisite checklist
        checklistRef.current?.refresh();
        return;
      }

      if (response.status === 409) {
        // Decision already exists
        const errorData = await response.json();
        setError(errorData.error?.message || 'A decision has already been made for this application');
        return;
      }

      if (response.status === 404) {
        setError('Application not found');
        return;
      }

      if (response.status === 403) {
        setError('You do not have permission to make this decision');
        return;
      }

      if (!response.ok) {
        throw new Error('Failed to submit decision');
      }

      // Success
      setSubmitSuccess(true);
      onDecisionSubmitted?.();

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit decision');
    } finally {
      setSubmitting(false);
    }
  };

  // Determine if form can be submitted
  const canSubmit = prerequisitesComplete && 
                    outcome !== null &&
                    reasonCodeId !== '' &&
                    justification.trim().length >= 20 &&
                    !submitting;

  // Success state
  if (submitSuccess) {
    return (
      <div className="max-w-3xl mx-auto p-6">
        <div className="bg-green-50 border border-green-200 rounded-lg p-8 text-center">
          <svg
            className="h-16 w-16 text-green-500 mx-auto mb-4"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
              clipRule="evenodd"
            />
          </svg>
          <h2 className="text-2xl font-semibold text-green-900 mb-2">
            Decision Submitted Successfully
          </h2>
          <p className="text-green-700">
            Your {outcome === 'offer' ? 'offer' : outcome === 'reject' ? 'rejection' : outcome === 'hold' ? 'hold' : 'withdrawal'} decision for {candidateName} has been recorded.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6 p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          Final Hiring Decision
        </h1>
        <p className="text-gray-600">
          Candidate: <span className="font-medium text-gray-900">{candidateName}</span>
        </p>
      </div>

      {/* Prerequisites Section */}
      <section className="bg-white border border-gray-200 rounded-lg p-6">
        <PrerequisiteChecklist
          ref={checklistRef}
          applicationId={applicationId}
          onStatusChange={handlePrerequisiteChange}
        />
      </section>

      {/* Decision Form Section */}
      <section className="bg-white border border-gray-200 rounded-lg p-6 relative">
        {/* Warning banner when prerequisites incomplete */}
        {!prerequisitesComplete && (
          <div
            className="bg-yellow-50 border border-yellow-200 rounded-md p-4 mb-6"
            role="alert"
          >
            <div className="flex">
              <svg
                className="h-5 w-5 text-yellow-400 mr-3 flex-shrink-0 mt-0.5"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                  clipRule="evenodd"
                />
              </svg>
              <div>
                <h4 className="text-sm font-medium text-yellow-800">
                  Prerequisites Incomplete
                </h4>
                <p className="text-sm text-yellow-700 mt-1">
                  Complete all evaluation stages above before making a final decision.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Error message */}
        {error && (
          <div
            className="bg-red-50 border border-red-200 rounded-md p-4 mb-6"
            role="alert"
          >
            <div className="flex">
              <svg
                className="h-5 w-5 text-red-400 mr-3 flex-shrink-0"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                  clipRule="evenodd"
                />
              </svg>
              <div>
                <h4 className="text-sm font-medium text-red-800">Error</h4>
                <p className="text-sm text-red-700 mt-1">{error}</p>
              </div>
            </div>
          </div>
        )}

        {/* Decision Form */}
        <form onSubmit={handleSubmit}>
          <div className="space-y-6">
            {/* Outcome Selection */}
            <fieldset disabled={!prerequisitesComplete || submitting}>
              <legend className="text-sm font-medium text-gray-900 mb-3">
                Decision Outcome <span className="text-red-500">*</span>
              </legend>
              <div className="grid grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={() => handleOutcomeChange('offer')}
                  className={`
                    px-6 py-4 rounded-lg border-2 font-medium transition-all
                    ${outcome === 'offer'
                      ? 'bg-green-50 border-green-500 text-green-700'
                      : 'bg-white border-gray-300 text-gray-700 hover:border-gray-400'
                    }
                    ${(!prerequisitesComplete || submitting) && 'opacity-50 cursor-not-allowed'}
                  `}
                  disabled={!prerequisitesComplete || submitting}
                  aria-pressed={outcome === 'offer'}
                  aria-disabled={!prerequisitesComplete || submitting}
                >
                  <div className="flex flex-col items-center gap-2">
                    <span className="text-2xl">✅</span>
                    <span>Offer</span>
                    <span className="text-xs text-gray-500">Submit for approval</span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => handleOutcomeChange('reject')}
                  className={`
                    px-6 py-4 rounded-lg border-2 font-medium transition-all
                    ${outcome === 'reject'
                      ? 'bg-red-50 border-red-500 text-red-700'
                      : 'bg-white border-gray-300 text-gray-700 hover:border-gray-400'
                    }
                    ${(!prerequisitesComplete || submitting) && 'opacity-50 cursor-not-allowed'}
                  `}
                  disabled={!prerequisitesComplete || submitting}
                  aria-pressed={outcome === 'reject'}
                  aria-disabled={!prerequisitesComplete || submitting}
                >
                  <div className="flex flex-col items-center gap-2">
                    <span className="text-2xl">❌</span>
                    <span>Reject</span>
                    <span className="text-xs text-gray-500">Candidate notified</span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => handleOutcomeChange('hold')}
                  className={`
                    px-6 py-4 rounded-lg border-2 font-medium transition-all
                    ${outcome === 'hold'
                      ? 'bg-yellow-50 border-yellow-500 text-yellow-700'
                      : 'bg-white border-gray-300 text-gray-700 hover:border-gray-400'
                    }
                    ${(!prerequisitesComplete || submitting) && 'opacity-50 cursor-not-allowed'}
                  `}
                  disabled={!prerequisitesComplete || submitting}
                  aria-pressed={outcome === 'hold'}
                  aria-disabled={!prerequisitesComplete || submitting}
                >
                  <div className="flex flex-col items-center gap-2">
                    <span className="text-2xl">⏸️</span>
                    <span>Hold</span>
                    <span className="text-xs text-gray-500">Pause for 14 days</span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => handleOutcomeChange('withdraw')}
                  className={`
                    px-6 py-4 rounded-lg border-2 font-medium transition-all
                    ${outcome === 'withdraw'
                      ? 'bg-gray-50 border-gray-500 text-gray-700'
                      : 'bg-white border-gray-300 text-gray-700 hover:border-gray-400'
                    }
                    ${(!prerequisitesComplete || submitting) && 'opacity-50 cursor-not-allowed'}
                  `}
                  disabled={!prerequisitesComplete || submitting}
                  aria-pressed={outcome === 'withdraw'}
                  aria-disabled={!prerequisitesComplete || submitting}
                >
                  <div className="flex flex-col items-center gap-2">
                    <span className="text-2xl">🚫</span>
                    <span>Withdraw</span>
                    <span className="text-xs text-gray-500">Remove from consideration</span>
                  </div>
                </button>
              </div>
            </fieldset>

            {/* Reason Code Dropdown */}
            <div>
              <label
                htmlFor="reason-code"
                className="block text-sm font-medium text-gray-900 mb-2"
              >
                Reason Code <span className="text-red-500">*</span>
              </label>
              <select
                id="reason-code"
                value={reasonCodeId}
                onChange={(e) => setReasonCodeId(e.target.value)}
                disabled={!prerequisitesComplete || !outcome || loadingReasonCodes || submitting}
                required
                aria-required="true"
                aria-invalid={error?.includes('reason code') ? 'true' : 'false'}
                className={`
                  w-full border border-gray-300 rounded-md p-3
                  focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                  ${(!prerequisitesComplete || !outcome || loadingReasonCodes || submitting) && 'bg-gray-100 cursor-not-allowed'}
                `}
              >
                <option value="">
                  {!outcome 
                    ? 'Select an outcome first' 
                    : loadingReasonCodes 
                    ? 'Loading reasons...' 
                    : 'Select a reason'}
                </option>
                {reasonCodes.map((code) => (
                  <option key={code.id} value={code.id}>
                    {code.displayText}
                  </option>
                ))}
              </select>
              <p className="mt-2 text-sm text-gray-500">
                {outcome 
                  ? `Select the primary reason for this ${outcome} decision`
                  : 'Choose an outcome to see available reason codes'}
              </p>
            </div>

            {/* Justification */}
            <div>
              <label
                htmlFor="justification"
                className="block text-sm font-medium text-gray-900 mb-2"
              >
                Justification <span className="text-red-500">*</span>
              </label>
              <textarea
                id="justification"
                value={justification}
                onChange={(e) => setJustification(e.target.value)}
                rows={6}
                required
                disabled={!prerequisitesComplete || submitting}
                aria-disabled={!prerequisitesComplete || submitting}
                className={`
                  w-full border border-gray-300 rounded-md p-3
                  focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                  ${(!prerequisitesComplete || submitting) && 'bg-gray-100 cursor-not-allowed'}
                `}
                placeholder="Provide detailed justification for your decision (minimum 20 characters)..."
              />
              <div className="mt-2 flex justify-between items-center text-sm">
                <span className={justification.length < 20 ? 'text-red-600' : 'text-gray-500'}>
                  {justification.length < 20 && 'At least 20 characters required'}
                </span>
                <span className="text-gray-500">
                  {justification.length} / 2000
                </span>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={!canSubmit}
              className={`
                w-full py-4 rounded-md font-medium text-base transition-all
                ${canSubmit
                  ? 'bg-blue-600 text-white hover:bg-blue-700 focus:ring-4 focus:ring-blue-300'
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                }
              `}
            >
              {submitting ? (
                <span className="flex items-center justify-center gap-2">
                  <svg
                    className="animate-spin h-5 w-5"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  Submitting...
                </span>
              ) : !prerequisitesComplete ? (
                'Complete Prerequisites to Submit'
              ) : (
                'Submit Final Decision'
              )}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
