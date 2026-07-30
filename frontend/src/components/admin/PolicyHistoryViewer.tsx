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
} from '../utils/historyExport';
import { policyService } from '../services/policyService';

type HistoryTab = 'screening' | 'scoring' | 'approval';

const TABS: { key: HistoryTab; label: string; icon: string }[] = [
  { key: 'screening', label: 'Screening Thresholds', icon: '📊' },
  { key: 'scoring', label: 'Scoring Thresholds', icon: '🎯' },
  { key: 'approval', label: 'Approval Policies', icon: '✓' },
];

/**
 * Main policy history viewer component
 * Tab-based navigation for viewing and comparing policy versions
 */
export function PolicyHistoryViewer() {
  const [activeTab, setActiveTab] = useState<HistoryTab>('screening');
  const [exporting, setExporting] = useState(false);

  async function handleExport() {
    try {
      setExporting(true);

      if (activeTab === 'screening') {
        const data = await policyService.getScreeningThresholdHistory(1000);
        const csv = screeningThresholdHistoryToCSV(data);
        downloadCSV(`screening-threshold-history-${new Date().toISOString().split('T')[0]}.csv`, csv);
      } else if (activeTab === 'scoring') {
        const data = await policyService.getScoringThresholdHistory(1000);
        const csv = scoringThresholdHistoryToCSV(data);
        downloadCSV(`scoring-threshold-history-${new Date().toISOString().split('T')[0]}.csv`, csv);
      } else if (activeTab === 'approval') {
        const data = await policyService.getApprovalPoliciesHistory(1000);
        const csv = approvalPolicyHistoryToCSV(data);
        downloadCSV(`approval-policy-history-${new Date().toISOString().split('T')[0]}.csv`, csv);
      }
    } catch (error) {
      console.error('Export failed:', error);
      alert('Failed to export history. Please try again.');
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Policy Change History</h1>
          <p className="mt-2 text-gray-600">
            View all policy versions with change tracking and comparison tools
          </p>
        </div>
        <button
          onClick={handleExport}
          disabled={exporting}
          className={`px-4 py-2 rounded font-medium ${
            exporting
              ? 'bg-gray-300 text-gray-600 cursor-not-allowed'
              : 'bg-blue-600 text-white hover:bg-blue-700'
          }`}
        >
          {exporting ? 'Exporting...' : 'Export to CSV'}
        </button>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-gray-200">
        <div className="flex gap-1 flex-wrap">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-3 font-medium text-sm border-b-2 transition-colors ${
                activeTab === tab.key
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              <span className="mr-2">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        {activeTab === 'screening' && <ScreeningThresholdHistory />}
        {activeTab === 'scoring' && <ScoringThresholdHistory />}
        {activeTab === 'approval' && <ApprovalPolicyHistory />}
      </div>

      {/* Help Section */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="font-semibold text-blue-900 mb-2">How to use this viewer</h3>
        <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
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
