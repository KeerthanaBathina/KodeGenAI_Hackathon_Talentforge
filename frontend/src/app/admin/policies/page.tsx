'use client';

/**
 * Admin Policies Management Page
 *
 * Tab-based interface for managing AI screening thresholds, scoring thresholds, and approval policies
 */

import React, { useState } from 'react';
import { ScreeningThresholdEditor } from '@/components/admin/ScreeningThresholdEditor';
import { ScoringThresholdEditor } from '@/components/admin/ScoringThresholdEditor';
import { ApprovalPolicyEditor } from '@/components/admin/ApprovalPolicyEditor';
import { PolicyHistoryViewer } from '@/components/admin/PolicyHistoryViewer';

type TabKey = 'screening' | 'scoring' | 'approval' | 'history';

interface Tab {
  key: TabKey;
  label: string;
  icon: string;
}

const TABS: Tab[] = [
  {
    key: 'screening',
    label: 'Screening Thresholds',
    icon: '📊',
  },
  {
    key: 'scoring',
    label: 'Scoring Thresholds',
    icon: '🎯',
  },
  {
    key: 'approval',
    label: 'Approval Policies',
    icon: '✅',
  },
  {
    key: 'history',
    label: 'Change History',
    icon: '📜',
  },
];

export default function PoliciesPage() {
  const [activeTab, setActiveTab] = useState<TabKey>('screening');

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Policy Management</h1>
          <p className="text-gray-600 mt-2">
            Configure AI thresholds, scoring parameters, and approval workflows
          </p>
        </div>

        {/* Tab Navigation */}
        <div className="bg-white rounded-lg shadow mb-6 border-b border-gray-200">
          <div className="flex flex-wrap">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex-1 px-4 py-4 text-center font-medium border-b-2 transition-colors ${
                  activeTab === tab.key
                    ? 'text-blue-600 border-blue-600'
                    : 'text-gray-600 border-transparent hover:text-gray-900'
                }`}
              >
                <span className="mr-2">{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tab Content */}
        <div className="animate-fadeIn">
          {activeTab === 'screening' && (
            <div className="transition-opacity duration-200">
              <ScreeningThresholdEditor />
            </div>
          )}

          {activeTab === 'scoring' && (
            <div className="transition-opacity duration-200">
              <ScoringThresholdEditor />
            </div>
          )}

          {activeTab === 'approval' && (
            <div className="transition-opacity duration-200">
              <ApprovalPolicyEditor />
            </div>
          )}

          {activeTab === 'history' && (
            <div className="transition-opacity duration-200">
              <PolicyHistoryViewer />
            </div>
          )}
        </div>

        {/* Help Section */}
        <div className="mt-12 bg-blue-50 rounded-lg border border-blue-200 p-6">
          <h2 className="text-lg font-semibold text-blue-900 mb-3">ℹ️ About Effective Dates</h2>
          <p className="text-blue-800 text-sm mb-3">
            When you create a new policy version, it takes effect on the specified date. Applications
            or offers submitted before that date will continue using the previous policy version.
            This ensures that in-flight candidates are not affected by policy changes.
          </p>
          <div className="space-y-2 text-xs text-blue-700">
            <p>
              <strong>Example:</strong> If you create a new screening threshold effective July 31st,
              all applications submitted on July 30th will use the old thresholds. Applications
              submitted on July 31st and later will use the new thresholds.
            </p>
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        .animate-fadeIn {
          animation: fadeIn 0.2s ease-in-out;
        }
      `}</style>
    </div>
  );
}
