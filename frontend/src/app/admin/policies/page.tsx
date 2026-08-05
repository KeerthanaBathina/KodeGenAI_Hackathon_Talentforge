'use client';

/**
 * Admin Policies Management Page
 *
 * Tab-based interface for managing AI screening thresholds, scoring thresholds, and approval policies
 */

import React, { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AdminPageShell } from '@/components/admin/AdminPageShell';
import { ScreeningThresholdEditor } from '@/components/admin/ScreeningThresholdEditor';
import { ScoringThresholdEditor } from '@/components/admin/ScoringThresholdEditor';
import { ApprovalPolicyEditor } from '@/components/admin/ApprovalPolicyEditor';
import { PolicyHistoryViewer } from '@/components/admin/PolicyHistoryViewer';

type TabKey = 'screening' | 'scoring' | 'approval' | 'history';

interface Tab {
  key: TabKey;
  label: string;
  shortLabel: string;
}

const TABS: Tab[] = [
  {
    key: 'screening',
    label: 'Threshold Configuration',
    shortLabel: 'Thresholds',
  },
  {
    key: 'scoring',
    label: 'Business Rules',
    shortLabel: 'Rules',
  },
  {
    key: 'approval',
    label: 'Approval Matrix',
    shortLabel: 'Approvals',
  },
  {
    key: 'history',
    label: 'Change History',
    shortLabel: 'History',
  },
];

function parseTabKey(value: string | null): TabKey {
  if (value === 'screening' || value === 'scoring' || value === 'approval' || value === 'history') {
    return value;
  }

  return 'screening';
}

export default function PoliciesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<TabKey>(parseTabKey(searchParams.get('tab')));

  React.useEffect(() => {
    setActiveTab(parseTabKey(searchParams.get('tab')));
  }, [searchParams]);

  const handleTabChange = (tab: TabKey) => {
    setActiveTab(tab);
    router.replace(`/admin/policies?tab=${tab}`, { scroll: false });
  };

  return (
    <AdminPageShell
      title="Policy Management"
      description="Configure thresholds, business rules, and approval controls with explicit effective dates and full audit traceability."
    >
      {/* Tab Navigation */}
      <div className="mb-5 rounded-2xl border border-[var(--admin-color-border)] bg-[var(--admin-color-surface-0)] p-2 shadow-[var(--admin-shadow-sm)]">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4" role="tablist" aria-label="Policy sections">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.key;

            return (
              <button
                key={tab.key}
                role="tab"
                aria-selected={isActive}
                aria-controls={`policy-panel-${tab.key}`}
                id={`policy-tab-${tab.key}`}
                onClick={() => handleTabChange(tab.key)}
                className={`min-h-[48px] rounded-xl border px-4 py-3 text-left text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--admin-color-brand-primary)] ${
                  isActive
                    ? 'border-[var(--admin-color-brand-primary)] bg-[var(--admin-color-brand-primary)] text-white'
                    : 'border-[var(--admin-color-border)] bg-[var(--admin-color-surface-1)] text-[var(--admin-color-ink-secondary)] hover:bg-[var(--admin-color-surface-2)]'
                }`}
              >
                <span className="block leading-tight">{tab.shortLabel}</span>
                <span className={`mt-0.5 block text-xs ${isActive ? 'text-indigo-100' : 'text-[var(--admin-color-ink-tertiary)]'}`}>
                  {tab.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Content */}
      <div className="motion-reduce:transition-none">
        {activeTab === 'screening' && (
          <section id="policy-panel-screening" role="tabpanel" aria-labelledby="policy-tab-screening">
            <ScreeningThresholdEditor />
          </section>
        )}

        {activeTab === 'scoring' && (
          <section id="policy-panel-scoring" role="tabpanel" aria-labelledby="policy-tab-scoring">
            <ScoringThresholdEditor />
          </section>
        )}

        {activeTab === 'approval' && (
          <section id="policy-panel-approval" role="tabpanel" aria-labelledby="policy-tab-approval">
            <ApprovalPolicyEditor />
          </section>
        )}

        {activeTab === 'history' && (
          <section id="policy-panel-history" role="tabpanel" aria-labelledby="policy-tab-history">
            <PolicyHistoryViewer />
          </section>
        )}
      </div>

      {/* Help Section */}
      <div className="mt-8 rounded-2xl border border-amber-200 bg-amber-50 p-6">
        <h2 className="admin-heading mb-3 text-lg font-semibold text-amber-900">About effective dates</h2>
        <p className="mb-3 text-sm text-amber-800">
          New policy versions activate on the date you choose. In-flight applications and offers remain on
          the previous version to preserve review consistency and compliance.
        </p>
        <p className="text-xs text-amber-700">
          Example: a screening threshold created with an effective date of July 31 only applies to
          applications submitted on or after July 31.
        </p>
      </div>
    </AdminPageShell>
  );
}
