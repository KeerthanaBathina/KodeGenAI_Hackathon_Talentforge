'use client';

import React, { useEffect, useState } from 'react';
import { ApprovalPolicy, ApprovalTier } from '../types/policy';
import { policyService } from '../services/policyService';
import { ApprovalPolicyDetailsModal } from './PolicyVersionDetailsModal';
import { ApprovalPolicyComparisonModal } from './PolicyVersionComparisonModal';

interface ApprovalPolicyHistoryProps {
  limit?: number;
}

/**
 * History viewer for Approval Policies
 * Shows compensation band, approver tiers, and status
 */
export function ApprovalPolicyHistory({ limit = 20 }: ApprovalPolicyHistoryProps) {
  const [history, setHistory] = useState<ApprovalPolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPolicy, setSelectedPolicy] = useState<ApprovalPolicy | null>(null);
  const [comparePolicies, setComparePolicies] = useState<[ApprovalPolicy, ApprovalPolicy] | null>(null);

  useEffect(() => {
    loadHistory();
  }, []);

  async function loadHistory() {
    try {
      setLoading(true);
      const data = await policyService.getApprovalPoliciesHistory(limit);
      setHistory(data);
    } catch (error) {
      console.error('Failed to load approval policy history:', error);
    } finally {
      setLoading(false);
    }
  }

  const formatCurrency = (val: string | number) => {
    const num = typeof val === 'string' ? parseFloat(val) : val;
    return `$${num.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-12 bg-gray-200 rounded animate-pulse" />
        ))}
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">No approval policy history available</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-gray-100 border-b">
              <th className="px-4 py-3 text-left text-sm font-semibold">
                Compensation Band
              </th>
              <th className="px-4 py-3 text-left text-sm font-semibold">
                Approver Tiers
              </th>
              <th className="px-4 py-3 text-left text-sm font-semibold">
                Effective From
              </th>
              <th className="px-4 py-3 text-left text-sm font-semibold">Status</th>
              <th className="px-4 py-3 text-left text-sm font-semibold">
                Created By
              </th>
              <th className="px-4 py-3 text-left text-sm font-semibold">Created</th>
              <th className="px-4 py-3 text-left text-sm font-semibold">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {history.map((policy, index) => (
              <tr
                key={policy.id}
                className={`border-b hover:bg-gray-50 ${
                  policy.active ? 'bg-green-50' : ''
                }`}
              >
                <td className="px-4 py-3 text-sm font-semibold">
                  {formatCurrency(policy.compensationBandMin)} -{' '}
                  {formatCurrency(policy.compensationBandMax)}
                </td>
                <td className="px-4 py-3 text-sm">
                  <ApproverTierSummary approvers={policy.requiredApprovers} />
                </td>
                <td className="px-4 py-3 text-sm">
                  {new Date(policy.effectiveFrom).toLocaleString()}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge active={policy.active} />
                </td>
                <td className="px-4 py-3 text-sm">
                  {policy.createdBy || 'N/A'}
                </td>
                <td className="px-4 py-3 text-sm">
                  {new Date(policy.createdAt).toLocaleString()}
                </td>
                <td className="px-4 py-3 text-sm space-x-2">
                  <button
                    onClick={() => setSelectedPolicy(policy)}
                    className="px-3 py-1 text-blue-600 hover:bg-blue-50 rounded"
                  >
                    Details
                  </button>
                  {index < history.length - 1 && (
                    <button
                      onClick={() => setComparePolicies([policy, history[index + 1]])}
                      className="px-3 py-1 text-purple-600 hover:bg-purple-50 rounded"
                    >
                      Compare
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modals */}
      {selectedPolicy && (
        <ApprovalPolicyDetailsModal
          isOpen={!!selectedPolicy}
          onClose={() => setSelectedPolicy(null)}
          policy={selectedPolicy}
        />
      )}

      {comparePolicies && (
        <ApprovalPolicyComparisonModal
          isOpen={!!comparePolicies}
          onClose={() => setComparePolicies(null)}
          policyA={comparePolicies[0]}
          policyB={comparePolicies[1]}
        />
      )}
    </div>
  );
}

// ====== Helper Components ======

interface ApproverTierSummaryProps {
  approvers: ApprovalTier[] | undefined;
}

/**
 * Display summary of approver tiers
 */
function ApproverTierSummary({ approvers }: ApproverTierSummaryProps) {
  if (!approvers || approvers.length === 0) {
    return <span className="text-gray-500">No approvers</span>;
  }

  return (
    <div className="flex flex-col gap-1">
      {approvers
        .sort((a, b) => (a.tier || 0) - (b.tier || 0))
        .map((approver) => (
          <div key={approver.tier} className="text-xs">
            <span className="font-semibold">Tier {approver.tier}:</span>{' '}
            <span className="text-gray-600">
              {approver.displayName || approver.approverId} ({approver.role || 'N/A'})
            </span>
          </div>
        ))}
    </div>
  );
}

interface StatusBadgeProps {
  active: boolean;
}

/**
 * Display status badge for policy
 */
function StatusBadge({ active }: StatusBadgeProps) {
  return (
    <span
      className={`inline-block px-3 py-1 rounded font-semibold text-xs ${
        active
          ? 'bg-green-100 text-green-800'
          : 'bg-gray-100 text-gray-800'
      }`}
    >
      {active ? '✓ Active' : '○ Inactive'}
    </span>
  );
}
