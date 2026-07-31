'use client';

import React from 'react';
import { ScreeningThreshold, ScoringThreshold, ApprovalPolicy } from '../../types/policy';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  size?: 'small' | 'medium' | 'large';
}

/**
 * Base Modal component used by all detail modals
 */
function BaseModal({
  isOpen,
  onClose,
  title,
  children,
  size = 'medium',
}: ModalProps) {
  if (!isOpen) return null;

  const sizeClasses = {
    small: 'max-w-md',
    medium: 'max-w-2xl',
    large: 'max-w-4xl',
  };

  return (
    <div className="fixed inset-0 z-50 bg-black bg-opacity-50 flex items-center justify-center">
      <div
        className={`bg-white rounded-lg shadow-xl ${sizeClasses[size]} w-full mx-4`}
      >
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

interface DetailFieldProps {
  label: string;
  value: string | number | boolean;
  highlight?: boolean;
}

/**
 * Display a single detail field in modal
 */
function DetailField({ label, value, highlight }: DetailFieldProps) {
  return (
    <div
      className={`py-3 px-4 rounded ${
        highlight ? 'bg-yellow-50 border border-yellow-200' : 'bg-gray-50'
      }`}
    >
      <p className="text-sm font-medium text-gray-600">{label}</p>
      <p className={`text-base font-semibold mt-1 ${highlight ? 'text-yellow-900' : 'text-gray-900'}`}>
        {String(value)}
      </p>
    </div>
  );
}

function formatOptionalDate(value?: string): string {
  return value ? new Date(value).toLocaleString() : 'N/A';
}

// ====== Screening Threshold Details Modal ======

interface ScreeningThresholdDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  version: ScreeningThreshold;
  previousVersion?: ScreeningThreshold;
}

export function ScreeningThresholdDetailsModal({
  isOpen,
  onClose,
  version,
  previousVersion,
}: ScreeningThresholdDetailsModalProps) {
  const hasChanges = (field: keyof ScreeningThreshold) => {
    if (!previousVersion) return false;
    return version[field] !== previousVersion[field];
  };

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      title={`Screening Threshold Version v${version.version}`}
      size="medium"
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <DetailField
            label="Version"
            value={`v${version.version}`}
          />
          <DetailField
            label="Effective From"
            value={new Date(version.effectiveFrom).toLocaleString()}
          />
          <DetailField
            label="Shortlist Threshold"
            value={version.shortlistThreshold}
            highlight={hasChanges('shortlistThreshold')}
          />
          <DetailField
            label="Borderline Min"
            value={version.borderlineMin}
            highlight={hasChanges('borderlineMin')}
          />
          <DetailField
            label="Borderline Max"
            value={version.borderlineMax}
            highlight={hasChanges('borderlineMax')}
          />
          <DetailField
            label="Reject Threshold"
            value={version.rejectThreshold}
            highlight={hasChanges('rejectThreshold')}
          />
          <DetailField
            label="Created"
            value={new Date(version.createdAt).toLocaleString()}
          />
        </div>

        {previousVersion && (
          <div className="mt-6 pt-4 border-t">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">
              Changes from Previous Version
            </h3>
            <div className="space-y-2 text-sm">
              {hasChanges('shortlistThreshold') && (
                <ChangeRow
                  label="Shortlist Threshold"
                  old={previousVersion.shortlistThreshold}
                  new={version.shortlistThreshold}
                />
              )}
              {hasChanges('borderlineMin') && (
                <ChangeRow
                  label="Borderline Min"
                  old={previousVersion.borderlineMin}
                  new={version.borderlineMin}
                />
              )}
              {hasChanges('borderlineMax') && (
                <ChangeRow
                  label="Borderline Max"
                  old={previousVersion.borderlineMax}
                  new={version.borderlineMax}
                />
              )}
              {hasChanges('rejectThreshold') && (
                <ChangeRow
                  label="Reject Threshold"
                  old={previousVersion.rejectThreshold}
                  new={version.rejectThreshold}
                />
              )}
            </div>
          </div>
        )}
      </div>
    </BaseModal>
  );
}

// ====== Scoring Threshold Details Modal ======

interface ScoringThresholdDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  version: ScoringThreshold;
  jobFamilyName?: string;
  previousVersion?: ScoringThreshold;
}

export function ScoringThresholdDetailsModal({
  isOpen,
  onClose,
  version,
  jobFamilyName,
  previousVersion,
}: ScoringThresholdDetailsModalProps) {
  const hasChanges = (field: keyof ScoringThreshold) => {
    if (!previousVersion) return false;
    return version[field] !== previousVersion[field];
  };

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      title={`Scoring Threshold - ${jobFamilyName || version.jobFamilyId}`}
      size="medium"
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <DetailField
            label="Job Family"
            value={jobFamilyName || version.jobFamilyId}
          />
          <DetailField
            label="Effective From"
            value={new Date(version.effectiveFrom).toLocaleString()}
          />
          <DetailField
            label="AI Shortlist Threshold"
            value={Number(version.aiShortlistThreshold).toFixed(4)}
            highlight={hasChanges('aiShortlistThreshold')}
          />
          <DetailField
            label="Confidence Threshold"
            value={Number(version.confidenceThreshold).toFixed(4)}
            highlight={hasChanges('confidenceThreshold')}
          />
          <DetailField
            label="Experience Threshold (Years)"
            value={version.experienceThresholdYears}
            highlight={hasChanges('experienceThresholdYears')}
          />
          <DetailField
            label="Created By"
            value={version.createdBy || 'N/A'}
          />
          <DetailField
            label="Created"
            value={new Date(version.createdAt).toLocaleString()}
          />
        </div>

        {previousVersion && (
          <div className="mt-6 pt-4 border-t">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">
              Changes from Previous Version
            </h3>
            <div className="space-y-2 text-sm">
              {hasChanges('aiShortlistThreshold') && (
                <ChangeRow
                  label="AI Shortlist Threshold"
                  old={Number(previousVersion.aiShortlistThreshold).toFixed(4)}
                  new={Number(version.aiShortlistThreshold).toFixed(4)}
                  isDecimal
                />
              )}
              {hasChanges('confidenceThreshold') && (
                <ChangeRow
                  label="Confidence Threshold"
                  old={Number(previousVersion.confidenceThreshold).toFixed(4)}
                  new={Number(version.confidenceThreshold).toFixed(4)}
                  isDecimal
                />
              )}
              {hasChanges('experienceThresholdYears') && (
                <ChangeRow
                  label="Experience Threshold (Years)"
                  old={previousVersion.experienceThresholdYears}
                  new={version.experienceThresholdYears}
                />
              )}
            </div>
          </div>
        )}
      </div>
    </BaseModal>
  );
}

// ====== Approval Policy Details Modal ======

interface ApprovalPolicyDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  policy: ApprovalPolicy;
}

export function ApprovalPolicyDetailsModal({
  isOpen,
  onClose,
  policy,
}: ApprovalPolicyDetailsModalProps) {
  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      title={`Approval Policy - $${parseFloat(policy.compensationBandMin).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} to $${parseFloat(policy.compensationBandMax).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
      size="medium"
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <DetailField
            label="Compensation Band Min"
            value={`$${parseFloat(policy.compensationBandMin).toLocaleString('en-US', {
              minimumFractionDigits: 2,
            })}`}
          />
          <DetailField
            label="Compensation Band Max"
            value={`$${parseFloat(policy.compensationBandMax).toLocaleString('en-US', {
              minimumFractionDigits: 2,
            })}`}
          />
          <DetailField
            label="Status"
            value={policy.active ? 'Active' : 'Inactive'}
          />
          <DetailField
            label="Effective From"
            value={formatOptionalDate(policy.effectiveFrom)}
          />
          <DetailField
            label="Created By"
            value={policy.createdBy || 'N/A'}
          />
          <DetailField
            label="Created"
            value={formatOptionalDate(policy.createdAt)}
          />
        </div>

        <div className="mt-6 pt-4 border-t">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">
            Approver Tiers
          </h3>
          <div className="space-y-2">
            {policy.requiredApprovers &&
              policy.requiredApprovers
                .sort((a, b) => (a.tier || 0) - (b.tier || 0))
                .map((approver) => (
                  <div
                    key={approver.tier}
                    className="p-3 bg-blue-50 border border-blue-200 rounded"
                  >
                    <p className="font-medium text-gray-900">
                      Tier {approver.tier}
                    </p>
                    <p className="text-sm text-gray-600 mt-1">
                      {approver.displayName || approver.approverId} (
                      {approver.role || 'N/A'})
                    </p>
                  </div>
                ))}
          </div>
        </div>
      </div>
    </BaseModal>
  );
}

// ====== Change Row Helper ======

interface ChangeRowProps {
  label: string;
  old: string | number;
  new: string | number;
  isDecimal?: boolean;
}

function ChangeRow({ label, old, new: newVal, isDecimal }: ChangeRowProps) {
  return (
    <div className="flex items-center justify-between p-2 bg-gray-50 rounded">
      <span className="text-gray-600">{label}:</span>
      <span className="font-mono text-sm">
        <span className="text-red-600">{old}</span>
        <span className="text-gray-400 mx-2">→</span>
        <span className="text-green-600">{newVal}</span>
      </span>
    </div>
  );
}
