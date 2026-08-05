'use client';

import React, { useState } from 'react';
import { ScreeningThresholdHistory } from './ScreeningThresholdHistory';
import { ScoringThresholdHistory } from './ScoringThresholdHistory';
import { ApprovalPolicyHistory } from './ApprovalPolicyHistory';
import {
  screeningThresholdHistoryToCSV,
  scoringThresholdHistoryToCSV,
  approvalPolicyHistoryToCSV,
  downloadCSV,
} from '../../utils/historyExport';
import { policyService } from '../../services/policyService';

type HistoryTab = 'screening' | 'scoring' | 'approval';

const TABS: { key: HistoryTab; label: string }[] = [
  { key: 'screening', label: 'Screening Thresholds' },
  { key: 'scoring', label: 'Scoring Thresholds' },
  { key: 'approval', label: 'Approval Policies' },
];

/**
 * Main policy history viewer component
 * Tab-based navigation for viewing and comparing policy versions
 */
export function PolicyHistoryViewer() {
  const [activeTab, setActiveTab] = useState<HistoryTab>('screening');
  const [exporting, setExporting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  async function handleExport() {
    try {
      setExporting(true);
      setStatusMessage(null);

      if (activeTab === 'screening') {
        const data = await policyService.getScreeningThresholdHistory(1000);
        const csv = screeningThresholdHistoryToCSV(data);
        downloadCSV(`screening-threshold-history-${new Date().toISOString().slice(0, 10)}.csv`, csv);
        setStatusMessage({ type: 'success', text: 'Screening threshold history export generated.' });
      } else if (activeTab === 'scoring') {
        const data = await policyService.getScoringThresholdHistory(1000);
        const csv = scoringThresholdHistoryToCSV(data);
        downloadCSV(`scoring-threshold-history-${new Date().toISOString().slice(0, 10)}.csv`, csv);
        setStatusMessage({ type: 'success', text: 'Scoring threshold history export generated.' });
      } else if (activeTab === 'approval') {
        const data = await policyService.getApprovalPoliciesHistory(1000);
        const csv = approvalPolicyHistoryToCSV(data);
        downloadCSV(`approval-policy-history-${new Date().toISOString().slice(0, 10)}.csv`, csv);
        setStatusMessage({ type: 'success', text: 'Approval policy history export generated.' });
      }
    } catch (error) {
      console.error('Export failed:', error);
      setStatusMessage({ type: 'error', text: 'Failed to export history. Please try again.' });
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="rounded-2xl border border-[var(--admin-color-border)] bg-[var(--admin-color-surface-0)] px-5 py-4 shadow-[var(--admin-shadow-sm)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
            <h2 className="admin-heading text-2xl font-bold text-[var(--admin-color-ink-primary)]">Policy Change History</h2>
            <p className="mt-1 text-sm text-[var(--admin-color-ink-secondary)]">
            View all policy versions with change tracking and comparison tools
          </p>
        </div>
        <button
          onClick={handleExport}
          disabled={exporting}
            className={`h-10 rounded-md px-4 text-sm font-semibold ${
            exporting
                ? 'cursor-not-allowed bg-slate-300 text-slate-600'
                : 'bg-[var(--admin-color-brand-primary)] text-white hover:bg-[var(--admin-color-brand-primary-hover)]'
          }`}
        >
          {exporting ? 'Exporting...' : 'Export to CSV'}
        </button>
        </div>

        {statusMessage && (
          <div
            role="status"
            aria-live="polite"
            className={`mt-3 rounded-md border px-3 py-2 text-sm ${
              statusMessage.type === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                : 'border-rose-200 bg-rose-50 text-rose-900'
            }`}
          >
            {statusMessage.text}
          </div>
        )}
      </div>

      {/* Tab Navigation */}
      <div className="rounded-2xl border border-[var(--admin-color-border)] bg-[var(--admin-color-surface-0)] p-2 shadow-[var(--admin-shadow-sm)]">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Policy history sections">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.key}
              aria-controls={`history-panel-${tab.key}`}
              id={`history-tab-${tab.key}`}
              onClick={() => setActiveTab(tab.key)}
              className={`rounded-md border px-4 py-2 text-sm font-semibold transition-colors ${
                activeTab === tab.key
                  ? 'border-blue-600 bg-indigo-50 text-[var(--admin-color-brand-primary)]'
                  : 'border-[var(--admin-color-border)] bg-[var(--admin-color-surface-1)] text-[var(--admin-color-ink-secondary)] hover:bg-[var(--admin-color-surface-2)]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="rounded-2xl border border-[var(--admin-color-border)] bg-[var(--admin-color-surface-0)] p-5 shadow-[var(--admin-shadow-sm)]">
        {activeTab === 'screening' && (
          <div id="history-panel-screening" role="tabpanel" aria-labelledby="history-tab-screening">
            <ScreeningThresholdHistory />
          </div>
        )}
        {activeTab === 'scoring' && (
          <div id="history-panel-scoring" role="tabpanel" aria-labelledby="history-tab-scoring">
            <ScoringThresholdHistory />
          </div>
        )}
        {activeTab === 'approval' && (
          <div id="history-panel-approval" role="tabpanel" aria-labelledby="history-tab-approval">
            <ApprovalPolicyHistory />
          </div>
        )}
      </div>

      {/* Help Section */}
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
        <h3 className="mb-2 text-sm font-semibold text-amber-900">How to use this viewer</h3>
        <ul className="list-disc space-y-1 pl-5 text-sm text-amber-800">
          <li>View all policy versions in reverse chronological order (newest first)</li>
          <li>Change indicators (↑/↓) show increases or decreases from the previous version</li>
          <li>
            Click <strong>Details</strong> to see full information for a specific version
          </li>
          <li>
            Click <strong>Compare</strong> to see side-by-side comparison of two consecutive versions
          </li>
          <li>Use the Export button to download the current tab's history as CSV</li>
          <li>
            For Scoring Thresholds, use the job family filter to view history for a specific job
            family
          </li>
        </ul>
      </div>
    </div>
  );
}
