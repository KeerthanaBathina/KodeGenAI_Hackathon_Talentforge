'use client';

import React from 'react';
import { ScreeningThreshold, ScoringThreshold, ApprovalPolicy } from '../../types/policy';

interface BaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

/**
 * Base Modal component for comparison
 */
function BaseComparisonModal({
  isOpen,
  onClose,
  title,
  children,
}: BaseModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black bg-opacity-50 flex items-center justify-center">
      <div className="bg-white rounded-lg shadow-xl max-w-5xl w-full mx-4">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl font-light"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-4 overflow-y-auto max-h-[calc(100vh-200px)]">
          {children}
        </div>

        {/* Footer */}
        <div className="border-t px-6 py-4 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

interface ComparisonFieldProps {
  label: string;
  valueA: string | number;
  valueB: string | number;
  isChanged: boolean;
}

/**
 * Display a single comparison field
 */
function ComparisonField({
  label,
  valueA,
  valueB,
  isChanged,
}: ComparisonFieldProps) {
  return (
    <div className="py-3 px-4 rounded border">
      <p className="text-xs font-medium text-gray-600 uppercase">{label}</p>
      <p
        className={`text-base font-semibold mt-2 ${
          isChanged ? 'text-red-600 bg-red-50 px-2 py-1 rounded' : 'text-gray-900'
        }`}
      >
        {valueA}
      </p>
    </div>
  );
}

// ====== Screening Threshold Comparison Modal ======

interface ScreeningThresholdComparisonModalProps {
  isOpen: boolean;
  onClose: () => void;
  versionA: ScreeningThreshold;
  versionB: ScreeningThreshold;
}

export function ScreeningThresholdComparisonModal({
  isOpen,
  onClose,
  versionA,
  versionB,
}: ScreeningThresholdComparisonModalProps) {
  const fields = [
    { key: 'shortlistThreshold', label: 'Shortlist Threshold' },
    { key: 'borderlineMin', label: 'Borderline Min' },
    { key: 'borderlineMax', label: 'Borderline Max' },
    { key: 'rejectThreshold', label: 'Reject Threshold' },
  ];

  return (
    <BaseComparisonModal
      isOpen={isOpen}
      onClose={onClose}
      title={`Compare Versions: v${versionA.version} vs v${versionB.version}`}
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-6">
          {/* Column A */}
          <div>
            <h3 className="text-base font-semibold text-gray-900 mb-4">
              Version v{versionA.version}
            </h3>
            <div className="space-y-2">
              <div className="p-3 bg-gray-50 rounded">
                <p className="text-xs text-gray-600">Effective From</p>
                <p className="font-semibold text-sm mt-1">
                  {new Date(versionA.effectiveFrom).toLocaleString()}
                </p>
              </div>
              {fields.map((field) => (
                <ComparisonField
                  key={field.key}
                  label={field.label}
                  valueA={String(versionA[field.key as keyof ScreeningThreshold])}
                  valueB={String(versionB[field.key as keyof ScreeningThreshold])}
                  isChanged={
                    versionA[field.key as keyof ScreeningThreshold] !==
                    versionB[field.key as keyof ScreeningThreshold]
                  }
                />
              ))}
            </div>
          </div>

          {/* Column B */}
          <div>
            <h3 className="text-base font-semibold text-gray-900 mb-4">
              Version v{versionB.version}
            </h3>
            <div className="space-y-2">
              <div className="p-3 bg-gray-50 rounded">
                <p className="text-xs text-gray-600">Effective From</p>
                <p className="font-semibold text-sm mt-1">
                  {new Date(versionB.effectiveFrom).toLocaleString()}
                </p>
              </div>
              {fields.map((field) => (
                <div key={field.key} className="py-3 px-4 rounded border bg-blue-50">
                  <p className="text-xs font-medium text-gray-600 uppercase">
                    {field.label}
                  </p>
                  <p
                    className={`text-base font-semibold mt-2 ${
                      versionA[field.key as keyof ScreeningThreshold] !==
                      versionB[field.key as keyof ScreeningThreshold]
                        ? 'text-green-600'
                        : 'text-gray-900'
                    }`}
                  >
                    {versionB[field.key as keyof ScreeningThreshold]}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Summary of changes */}
        <div className="mt-6 pt-4 border-t">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">
            Changes
          </h3>
          <div className="space-y-2">
            {fields.map((field) => {
              const valA = versionA[field.key as keyof ScreeningThreshold];
              const valB = versionB[field.key as keyof ScreeningThreshold];
              if (valA === valB) return null;

              return (
                <div
                  key={field.key}
                  className="flex items-center justify-between p-2 bg-yellow-50 rounded border border-yellow-200"
                >
                  <span className="text-gray-900 font-medium">{field.label}</span>
                  <span className="font-mono text-sm">
                    <span className="text-red-600">{valA}</span>
                    <span className="text-gray-400 mx-2">→</span>
                    <span className="text-green-600">{valB}</span>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </BaseComparisonModal>
  );
}

// ====== Scoring Threshold Comparison Modal ======

interface ScoringThresholdComparisonModalProps {
  isOpen: boolean;
  onClose: () => void;
  versionA: ScoringThreshold;
  versionB: ScoringThreshold;
  jobFamilyName?: string;
}

export function ScoringThresholdComparisonModal({
  isOpen,
  onClose,
  versionA,
  versionB,
  jobFamilyName,
}: ScoringThresholdComparisonModalProps) {
  const fields = [
    { key: 'aiShortlistThreshold', label: 'AI Shortlist Threshold' },
    { key: 'confidenceThreshold', label: 'Confidence Threshold' },
    { key: 'experienceThresholdYears', label: 'Experience Threshold (Years)' },
  ];

  const formatValue = (key: string, value: any) => {
    if (key.includes('Threshold') && typeof value === 'number') {
      return value.toFixed(4);
    }
    return String(value);
  };

  return (
    <BaseComparisonModal
      isOpen={isOpen}
      onClose={onClose}
      title={`Compare Scoring Thresholds - ${jobFamilyName || 'Job Family'}`}
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-6">
          {/* Column A */}
          <div>
            <h3 className="text-base font-semibold text-gray-900 mb-4">
              Previous Version
            </h3>
            <div className="space-y-2">
              <div className="p-3 bg-gray-50 rounded">
                <p className="text-xs text-gray-600">Effective From</p>
                <p className="font-semibold text-sm mt-1">
                  {new Date(versionA.effectiveFrom).toLocaleString()}
                </p>
              </div>
              {fields.map((field) => (
                <ComparisonField
                  key={field.key}
                  label={field.label}
                  valueA={formatValue(
                    field.key,
                    versionA[field.key as keyof ScoringThreshold]
                  )}
                  valueB={formatValue(
                    field.key,
                    versionB[field.key as keyof ScoringThreshold]
                  )}
                  isChanged={
                    versionA[field.key as keyof ScoringThreshold] !==
                    versionB[field.key as keyof ScoringThreshold]
                  }
                />
              ))}
            </div>
          </div>

          {/* Column B */}
          <div>
            <h3 className="text-base font-semibold text-gray-900 mb-4">
              Current Version
            </h3>
            <div className="space-y-2">
              <div className="p-3 bg-gray-50 rounded">
                <p className="text-xs text-gray-600">Effective From</p>
                <p className="font-semibold text-sm mt-1">
                  {new Date(versionB.effectiveFrom).toLocaleString()}
                </p>
              </div>
              {fields.map((field) => (
                <div key={field.key} className="py-3 px-4 rounded border bg-blue-50">
                  <p className="text-xs font-medium text-gray-600 uppercase">
                    {field.label}
                  </p>
                  <p
                    className={`text-base font-semibold mt-2 ${
                      versionA[field.key as keyof ScoringThreshold] !==
                      versionB[field.key as keyof ScoringThreshold]
                        ? 'text-green-600'
                        : 'text-gray-900'
                    }`}
                  >
                    {formatValue(
                      field.key,
                      versionB[field.key as keyof ScoringThreshold]
                    )}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Summary of changes */}
        <div className="mt-6 pt-4 border-t">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">
            Changes
          </h3>
          <div className="space-y-2">
            {fields.map((field) => {
              const valA = versionA[field.key as keyof ScoringThreshold];
              const valB = versionB[field.key as keyof ScoringThreshold];
              if (valA === valB) return null;

              return (
                <div
                  key={field.key}
                  className="flex items-center justify-between p-2 bg-yellow-50 rounded border border-yellow-200"
                >
                  <span className="text-gray-900 font-medium">{field.label}</span>
                  <span className="font-mono text-sm">
                    <span className="text-red-600">{formatValue(field.key, valA)}</span>
                    <span className="text-gray-400 mx-2">→</span>
                    <span className="text-green-600">{formatValue(field.key, valB)}</span>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </BaseComparisonModal>
  );
}

// ====== Approval Policy Comparison Modal ======

interface ApprovalPolicyComparisonModalProps {
  isOpen: boolean;
  onClose: () => void;
  policyA: ApprovalPolicy;
  policyB: ApprovalPolicy;
}

export function ApprovalPolicyComparisonModal({
  isOpen,
  onClose,
  policyA,
  policyB,
}: ApprovalPolicyComparisonModalProps) {
  const formatOptionalDate = (value?: string) => (value ? new Date(value).toLocaleString() : 'N/A');

  const formatCurrency = (val: string | number) => {
    const num = typeof val === 'string' ? parseFloat(val) : val;
    return `$${num.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  return (
    <BaseComparisonModal
      isOpen={isOpen}
      onClose={onClose}
      title="Compare Approval Policies"
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-6">
          {/* Policy A */}
          <div>
            <h3 className="text-base font-semibold text-gray-900 mb-4">
              Policy A
            </h3>
            <div className="space-y-2">
              <div className="p-3 bg-gray-50 rounded">
                <p className="text-xs text-gray-600">Compensation Band</p>
                <p className="font-semibold text-sm mt-1">
                  {formatCurrency(policyA.compensationBandMin)} -{' '}
                  {formatCurrency(policyA.compensationBandMax)}
                </p>
              </div>
              <div className="p-3 bg-gray-50 rounded">
                <p className="text-xs text-gray-600">Effective From</p>
                <p className="font-semibold text-sm mt-1">
                  {formatOptionalDate(policyA.effectiveFrom)}
                </p>
              </div>
              <div className="p-3 bg-gray-50 rounded">
                <p className="text-xs text-gray-600">Approver Tiers</p>
                <div className="mt-2 space-y-1">
                  {policyA.requiredApprovers
                    ?.sort((a, b) => (a.tier || 0) - (b.tier || 0))
                    .map((a) => (
                      <p key={a.tier} className="text-sm">
                        Tier {a.tier}: {a.displayName || a.approverId}
                      </p>
                    ))}
                </div>
              </div>
            </div>
          </div>

          {/* Policy B */}
          <div>
            <h3 className="text-base font-semibold text-gray-900 mb-4">
              Policy B
            </h3>
            <div className="space-y-2">
              <div
                className={`p-3 rounded ${
                  policyA.compensationBandMin !== policyB.compensationBandMin ||
                  policyA.compensationBandMax !== policyB.compensationBandMax
                    ? 'bg-green-50'
                    : 'bg-gray-50'
                }`}
              >
                <p className="text-xs text-gray-600">Compensation Band</p>
                <p className="font-semibold text-sm mt-1">
                  {formatCurrency(policyB.compensationBandMin)} -{' '}
                  {formatCurrency(policyB.compensationBandMax)}
                </p>
              </div>
              <div className="p-3 bg-gray-50 rounded">
                <p className="text-xs text-gray-600">Effective From</p>
                <p className="font-semibold text-sm mt-1">
                  {formatOptionalDate(policyB.effectiveFrom)}
                </p>
              </div>
              <div className="p-3 bg-gray-50 rounded">
                <p className="text-xs text-gray-600">Approver Tiers</p>
                <div className="mt-2 space-y-1">
                  {policyB.requiredApprovers
                    ?.sort((a, b) => (a.tier || 0) - (b.tier || 0))
                    .map((a) => (
                      <p key={a.tier} className="text-sm">
                        Tier {a.tier}: {a.displayName || a.approverId}
                      </p>
                    ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </BaseComparisonModal>
  );
}
