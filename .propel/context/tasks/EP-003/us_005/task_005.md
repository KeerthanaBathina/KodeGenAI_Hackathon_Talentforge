---
id: task_005
us_id: us_005
epic: EP-003
title: "Manual Review Queue Dashboard UI"
status: done
layer: frontend
effort: 2.5h
priority: medium
created: 2026-07-24
completed: 2026-07-24
---

# TASK-005 — Manual Review Queue Dashboard UI

## Context

**User Story**: US-005 — Low-Confidence Escalation to Manual Review and AI Fallback Mode  
**Epic**: EP-003 — AI Resume Parsing  
**Addresses**: All scenarios (manual review queue visualization)

Build HR dashboard page for viewing and managing the manual review queue with filtering, sorting, and review actions.

---

## Objective

Create manual review queue dashboard:
1. Table view of applications pending manual review
2. Filtering by reason (low_confidence, fallback_mode, etc.)
3. "Low AI Confidence" badge display
4. Quick actions (view, shortlist, reject)
5. Pagination for large queues
6. Queue statistics summary

---

## Implementation Steps

### Step 1 — Create API Client Functions

Create `frontend/src/lib/api/manualReview.ts`:

```typescript
export interface ManualReviewQueueItem {
  id: string;
  candidateId: string;
  candidateName: string;
  candidateEmail: string;
  requisitionId: string;
  requisitionTitle: string;
  status: string;
  manualReviewReason: string | null;
  createdAt: string;
  resumeId?: string;
  screening?: {
    score: number;
    confidence: number | null;
    recommendation: string;
  };
}

export interface ManualReviewQueueResponse {
  items: ManualReviewQueueItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ManualReviewQueueStats {
  total: number;
  byReason: Record<string, number>;
  oldestApplicationAge: number | null;
}

export async function getManualReviewQueue(params: {
  page?: number;
  pageSize?: number;
  reason?: string;
  requisitionId?: string;
}): Promise<ManualReviewQueueResponse> {
  const searchParams = new URLSearchParams();
  if (params.page) searchParams.set('page', params.page.toString());
  if (params.pageSize) searchParams.set('pageSize', params.pageSize.toString());
  if (params.reason) searchParams.set('reason', params.reason);
  if (params.requisitionId) searchParams.set('requisitionId', params.requisitionId);

  const response = await fetch(`/api/manual-review-queue?${searchParams}`, {
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error('Failed to fetch manual review queue');
  }

  return response.json();
}

export async function getManualReviewQueueStats(): Promise<ManualReviewQueueStats> {
  const response = await fetch('/api/manual-review-queue/stats', {
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error('Failed to fetch queue statistics');
  }

  return response.json();
}

export async function markApplicationReviewed(
  applicationId: string,
  decision: 'shortlisted' | 'rejected',
  notes?: string
): Promise<void> {
  const response = await fetch(`/api/manual-review-queue/${applicationId}/review`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ decision, notes }),
  });

  if (!response.ok) {
    throw new Error('Failed to mark application as reviewed');
  }
}
```

### Step 2 — Create Review Reason Badge Component

Create `frontend/src/components/manualReview/ReviewReasonBadge.tsx`:

```tsx
'use client';

import React from 'react';

interface ReviewReasonBadgeProps {
  reason: string | null;
  className?: string;
}

export function ReviewReasonBadge({ reason, className = '' }: ReviewReasonBadgeProps) {
  if (!reason) return null;

  const badges = {
    low_confidence: {
      label: 'Low AI Confidence',
      bg: '#FEF3C7',
      text: '#92400E',
    },
    fallback_mode: {
      label: 'Fallback Mode',
      bg: '#FED7AA',
      text: '#9A3412',
    },
    screening_failed: {
      label: 'Screening Failed',
      bg: '#FEE2E2',
      text: '#991B1B',
    },
    flagged: {
      label: 'Flagged',
      bg: '#DBEAFE',
      text: '#1E40AF',
    },
  };

  const badge = badges[reason as keyof typeof badges] || {
    label: reason,
    bg: '#F3F4F6',
    text: '#374151',
  };

  return (
    <span
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '4px 10px',
        backgroundColor: badge.bg,
        color: badge.text,
        borderRadius: '12px',
        fontSize: '12px',
        fontWeight: 500,
      }}
    >
      {badge.label}
    </span>
  );
}
```

### Step 3 — Create Manual Review Queue Table

Create `frontend/src/components/manualReview/ManualReviewQueueTable.tsx`:

```tsx
'use client';

import React, { useState, useEffect } from 'react';
import { ReviewReasonBadge } from './ReviewReasonBadge';
import {
  getManualReviewQueue,
  markApplicationReviewed,
  ManualReviewQueueItem,
} from '@/lib/api/manualReview';

interface ManualReviewQueueTableProps {
  reasonFilter?: string;
  requisitionFilter?: string;
  onReviewComplete?: () => void;
}

export function ManualReviewQueueTable({
  reasonFilter,
  requisitionFilter,
  onReviewComplete,
}: ManualReviewQueueTableProps) {
  const [items, setItems] = useState<ManualReviewQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 20;

  useEffect(() => {
    fetchQueue();
  }, [page, reasonFilter, requisitionFilter]);

  async function fetchQueue() {
    try {
      setLoading(true);
      const response = await getManualReviewQueue({
        page,
        pageSize,
        reason: reasonFilter,
        requisitionId: requisitionFilter,
      });
      setItems(response.items);
      setTotal(response.total);
    } catch (error) {
      console.error('Failed to fetch manual review queue:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleReview(applicationId: string, decision: 'shortlisted' | 'rejected') {
    try {
      await markApplicationReviewed(applicationId, decision);
      await fetchQueue(); // Refresh
      onReviewComplete?.();
    } catch (error) {
      console.error('Failed to mark as reviewed:', error);
      alert('Failed to mark application as reviewed');
    }
  }

  if (loading) {
    return <div style={{ padding: '24px', textAlign: 'center' }}>Loading queue...</div>;
  }

  if (items.length === 0) {
    return (
      <div style={{ padding: '48px', textAlign: 'center', color: '#6B7280' }}>
        <p style={{ fontSize: '16px', marginBottom: '8px' }}>No applications in manual review queue</p>
        <p style={{ fontSize: '14px' }}>All applications are being processed normally</p>
      </div>
    );
  }

  return (
    <div>
      {/* Table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: '#F9FAFB', borderBottom: '2px solid #E5E7EB' }}>
              <th style={headerStyle}>Candidate</th>
              <th style={headerStyle}>Requisition</th>
              <th style={headerStyle}>Reason</th>
              <th style={headerStyle}>AI Score</th>
              <th style={headerStyle}>Submitted</th>
              <th style={headerStyle}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} style={{ borderBottom: '1px solid #E5E7EB' }}>
                <td style={cellStyle}>
                  <div>
                    <div style={{ fontWeight: 500, color: '#111827' }}>{item.candidateName}</div>
                    <div style={{ fontSize: '13px', color: '#6B7280' }}>{item.candidateEmail}</div>
                  </div>
                </td>
                <td style={cellStyle}>
                  <div style={{ fontSize: '14px', color: '#111827' }}>{item.requisitionTitle}</div>
                </td>
                <td style={cellStyle}>
                  <ReviewReasonBadge reason={item.manualReviewReason} />
                </td>
                <td style={cellStyle}>
                  {item.screening ? (
                    <div>
                      <div style={{ fontWeight: 500 }}>{item.screening.score}%</div>
                      {item.screening.confidence !== null && (
                        <div style={{ fontSize: '12px', color: '#6B7280' }}>
                          Confidence: {Math.round(item.screening.confidence * 100)}%
                        </div>
                      )}
                    </div>
                  ) : (
                    <span style={{ color: '#9CA3AF', fontSize: '13px' }}>Not screened</span>
                  )}
                </td>
                <td style={cellStyle}>
                  <div style={{ fontSize: '13px', color: '#6B7280' }}>
                    {new Date(item.createdAt).toLocaleDateString()}
                  </div>
                </td>
                <td style={cellStyle}>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={() => handleReview(item.id, 'shortlisted')}
                      style={{
                        ...buttonStyle,
                        backgroundColor: '#10B981',
                        color: '#FFFFFF',
                      }}
                    >
                      Shortlist
                    </button>
                    <button
                      onClick={() => handleReview(item.id, 'rejected')}
                      style={{
                        ...buttonStyle,
                        backgroundColor: '#EF4444',
                        color: '#FFFFFF',
                      }}
                    >
                      Reject
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '24px' }}>
        <div style={{ fontSize: '14px', color: '#6B7280' }}>
          Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, total)} of {total}
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            style={paginationButtonStyle}
          >
            Previous
          </button>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={page * pageSize >= total}
            style={paginationButtonStyle}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}

const headerStyle: React.CSSProperties = {
  padding: '12px 16px',
  textAlign: 'left',
  fontSize: '12px',
  fontWeight: 600,
  color: '#374151',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
};

const cellStyle: React.CSSProperties = {
  padding: '16px',
  fontSize: '14px',
};

const buttonStyle: React.CSSProperties = {
  padding: '6px 12px',
  borderRadius: '6px',
  fontSize: '13px',
  fontWeight: 500,
  border: 'none',
  cursor: 'pointer',
};

const paginationButtonStyle: React.CSSProperties = {
  padding: '8px 16px',
  borderRadius: '6px',
  fontSize: '14px',
  fontWeight: 500,
  border: '1px solid #D1D5DB',
  backgroundColor: '#FFFFFF',
  color: '#374151',
  cursor: 'pointer',
};
```

### Step 4 — Create Queue Statistics Summary

Create `frontend/src/components/manualReview/QueueStatsSummary.tsx`:

```tsx
'use client';

import React, { useEffect, useState } from 'react';
import { getManualReviewQueueStats, ManualReviewQueueStats } from '@/lib/api/manualReview';

export function QueueStatsSummary() {
  const [stats, setStats] = useState<ManualReviewQueueStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  async function fetchStats() {
    try {
      const data = await getManualReviewQueueStats();
      setStats(data);
    } catch (error) {
      console.error('Failed to fetch queue stats:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading || !stats) {
    return null;
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
      <StatCard
        label="Total in Queue"
        value={stats.total}
        color="#3B82F6"
      />
      <StatCard
        label="Low Confidence"
        value={stats.byReason.low_confidence || 0}
        color="#F59E0B"
      />
      <StatCard
        label="Fallback Mode"
        value={stats.byReason.fallback_mode || 0}
        color="#EF4444"
      />
      <StatCard
        label="Oldest (hours)"
        value={stats.oldestApplicationAge || 0}
        color="#8B5CF6"
      />
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div
      style={{
        padding: '20px',
        backgroundColor: '#FFFFFF',
        borderRadius: '8px',
        border: '1px solid #E5E7EB',
      }}
    >
      <div style={{ fontSize: '14px', color: '#6B7280', marginBottom: '8px' }}>{label}</div>
      <div style={{ fontSize: '32px', fontWeight: 700, color }}>{value}</div>
    </div>
  );
}
```

---

## Acceptance Criteria

- [ ] Queue table displays all pending manual review applications
- [ ] Review reason badges shown for each application
- [ ] AI score and confidence displayed when available
- [ ] Shortlist and Reject buttons functional
- [ ] Pagination works for large queues
- [ ] Queue statistics summary shown

---

## Testing Checklist

- [ ] Component test: Table renders queue items
- [ ] Component test: Empty state shown when no items
- [ ] Component test: Pagination buttons work
- [ ] Component test: Review actions call API
- [ ] E2E test: Navigate to manual review dashboard
- [ ] E2E test: Filter by reason
- [ ] E2E test: Shortlist application from queue

---

## Dependencies

- Manual review queue API (TASK-003)
- Review reason badge component
- Authentication

---

## Definition of Done

- [ ] Queue table component created
- [ ] Review reason badges implemented
- [ ] Queue statistics summary created
- [ ] Pagination implemented
- [ ] Component tests passing (6+ tests)
- [ ] E2E tests passing
- [ ] Responsive design (desktop/tablet)
