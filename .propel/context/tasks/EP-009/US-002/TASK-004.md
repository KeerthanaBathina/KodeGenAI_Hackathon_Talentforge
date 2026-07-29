---
id: TASK-004
user_story: US-002
title: "Frontend - Policy Change History Viewer"
status: todo
priority: medium
assigned_to: frontend-team
estimated_hours: 6
layer: frontend
dependencies: [TASK-002, TASK-003]
---

# TASK-004 — Frontend - Policy Change History Viewer

## Objective

Build interactive history viewer showing all policy versions with change tracking, creator information, and effective date timeline.

## Scope

Create comprehensive history view with filtering, comparison, and visual timeline for all policy types.

## Technical Requirements

### 1. History Tab Component

Component: `PolicyHistoryViewer.tsx`

**Tab Structure:**

```typescript
<div>
  <Tabs>
    <Tab label="Screening Thresholds">
      <ScreeningThresholdHistory />
    </Tab>
    <Tab label="Scoring Thresholds">
      <ScoringThresholdHistory />
    </Tab>
    <Tab label="Approval Policies">
      <ApprovalPolicyHistory />
    </Tab>
  </Tabs>
</div>
```

### 2. Screening Threshold History

Component: `ScreeningThresholdHistory.tsx`

**History Table:**

```typescript
<table>
  <thead>
    <tr>
      <th>Version</th>
      <th>Effective From</th>
      <th>Shortlist</th>
      <th>Borderline Range</th>
      <th>Reject</th>
      <th>Created</th>
      <th>Actions</th>
    </tr>
  </thead>
  <tbody>
    {history.map((version, index) => (
      <tr key={version.id} className={index === 0 ? 'bg-green-50' : ''}>
        <td>
          v{version.version}
          {index === 0 && <span className="ml-2 badge-success">Current</span>}
        </td>
        <td>{formatDateTime(version.effectiveFrom)}</td>
        <td>
          <ChangeBadge
            current={version.shortlistThreshold}
            previous={history[index + 1]?.shortlistThreshold}
          />
        </td>
        <td>
          {version.borderlineMin} - {version.borderlineMax}
          {showChangeIndicator(version, history[index + 1], ['borderlineMin', 'borderlineMax'])}
        </td>
        <td>
          <ChangeBadge
            current={version.rejectThreshold}
            previous={history[index + 1]?.rejectThreshold}
          />
        </td>
        <td>{formatDateTime(version.createdAt)}</td>
        <td>
          <button onClick={() => viewDetails(version)}>
            View Details
          </button>
          {index > 0 && (
            <button onClick={() => compareVersions(version, history[index - 1])}>
              Compare
            </button>
          )}
        </td>
      </tr>
    ))}
  </tbody>
</table>
```

**Change Badge Component:**

```typescript
function ChangeBadge({ current, previous }: { current: number; previous?: number }) {
  if (!previous) return <span>{current}</span>;

  const change = current - previous;
  if (change === 0) return <span>{current}</span>;

  return (
    <div className="flex items-center gap-2">
      <span>{current}</span>
      <span className={change > 0 ? 'text-green-600' : 'text-red-600'}>
        {change > 0 ? '↑' : '↓'} {Math.abs(change)}
      </span>
    </div>
  );
}
```

### 3. Scoring Threshold History

Component: `ScoringThresholdHistory.tsx`

**Job Family Filter:**

```typescript
<div className="mb-4">
  <label>Filter by Job Family</label>
  <select value={selectedJobFamily} onChange={handleJobFamilyChange}>
    <option value="">All Job Families</option>
    {jobFamilies.map(jf => (
      <option key={jf.id} value={jf.id}>{jf.name}</option>
    ))}
  </select>
</div>
```

**History List with Grouped by Job Family:**

```typescript
{groupedHistory.map(({ jobFamily, versions }) => (
  <div key={jobFamily.id} className="mb-6">
    <h3 className="text-lg font-medium mb-2">{jobFamily.name}</h3>
    <table>
      <thead>
        <tr>
          <th>Effective From</th>
          <th>AI Threshold</th>
          <th>Confidence</th>
          <th>Experience (Years)</th>
          <th>Created By</th>
          <th>Created</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        {versions.map((version, index) => (
          <tr key={version.id} className={index === 0 ? 'bg-blue-50' : ''}>
            <td>{formatDateTime(version.effectiveFrom)}</td>
            <td>
              <DecimalChangeBadge
                current={version.aiShortlistThreshold}
                previous={versions[index + 1]?.aiShortlistThreshold}
                decimals={4}
              />
            </td>
            <td>
              <DecimalChangeBadge
                current={version.confidenceThreshold}
                previous={versions[index + 1]?.confidenceThreshold}
                decimals={4}
              />
            </td>
            <td>
              <ChangeBadge
                current={version.experienceThresholdYears}
                previous={versions[index + 1]?.experienceThresholdYears}
              />
            </td>
            <td>
              <UserDisplay user={version.createdBy} />
            </td>
            <td>{formatDateTime(version.createdAt)}</td>
            <td>
              <button onClick={() => viewDetails(version)}>Details</button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
))}
```

### 4. Approval Policy History

Component: `ApprovalPolicyHistory.tsx`

**History Table:**

```typescript
<table>
  <thead>
    <tr>
      <th>Compensation Band</th>
      <th>Approver Tiers</th>
      <th>Effective From</th>
      <th>Status</th>
      <th>Created By</th>
      <th>Created</th>
      <th>Actions</th>
    </tr>
  </thead>
  <tbody>
    {history.map((policy) => (
      <tr key={policy.id} className={policy.active ? 'bg-green-50' : ''}>
        <td>
          ${formatCurrency(policy.compensationBandMin)} - ${formatCurrency(policy.compensationBandMax)}
        </td>
        <td>
          <ApproverTierSummary approvers={policy.requiredApprovers} />
        </td>
        <td>{formatDateTime(policy.effectiveFrom)}</td>
        <td>
          <StatusBadge active={policy.active} />
        </td>
        <td>
          <UserDisplay user={policy.createdBy} />
        </td>
        <td>{formatDateTime(policy.createdAt)}</td>
        <td>
          <button onClick={() => viewDetails(policy)}>Details</button>
        </td>
      </tr>
    ))}
  </tbody>
</table>
```

**Approver Tier Summary:**

```typescript
function ApproverTierSummary({ approvers }: { approvers: ApprovalTier[] }) {
  return (
    <div className="flex flex-col gap-1">
      {approvers.map(approver => (
        <div key={approver.tier} className="text-sm">
          <span className="font-medium">Tier {approver.tier}:</span> {approver.displayName} ({approver.role})
        </div>
      ))}
    </div>
  );
}
```

### 5. Version Details Modal

Component: `PolicyVersionDetailsModal.tsx`

**For Screening Thresholds:**

```typescript
<Modal isOpen={isOpen} onClose={onClose}>
  <div>
    <h2>Screening Threshold Version {version.version}</h2>

    <div className="grid grid-cols-2 gap-4 mt-4">
      <DetailField label="Shortlist Threshold" value={version.shortlistThreshold} />
      <DetailField label="Borderline Min" value={version.borderlineMin} />
      <DetailField label="Borderline Max" value={version.borderlineMax} />
      <DetailField label="Reject Threshold" value={version.rejectThreshold} />
      <DetailField label="Effective From" value={formatDateTime(version.effectiveFrom)} />
      <DetailField label="Created" value={formatDateTime(version.createdAt)} />
    </div>

    {previousVersion && (
      <div className="mt-6">
        <h3>Changes from Previous Version</h3>
        <ChangeList
          current={version}
          previous={previousVersion}
          fields={['shortlistThreshold', 'borderlineMin', 'borderlineMax', 'rejectThreshold']}
        />
      </div>
    )}
  </div>
</Modal>
```

### 6. Version Comparison View

Component: `PolicyVersionComparisonModal.tsx`

**Side-by-Side Comparison:**

```typescript
<Modal isOpen={isOpen} onClose={onClose} size="large">
  <div>
    <h2>Compare Versions</h2>

    <div className="grid grid-cols-2 gap-6 mt-4">
      <div>
        <h3>Version {versionA.version}</h3>
        <div className="space-y-2">
          {fields.map(field => (
            <ComparisonField
              key={field}
              label={fieldLabels[field]}
              valueA={versionA[field]}
              valueB={versionB[field]}
              highlight={versionA[field] !== versionB[field]}
            />
          ))}
        </div>
      </div>

      <div>
        <h3>Version {versionB.version}</h3>
        <div className="space-y-2">
          {fields.map(field => (
            <ComparisonField
              key={field}
              label={fieldLabels[field]}
              valueA={versionA[field]}
              valueB={versionB[field]}
              highlight={versionA[field] !== versionB[field]}
              showDiff
            />
          ))}
        </div>
      </div>
    </div>
  </div>
</Modal>
```

### 7. Timeline Visualization (Optional Enhancement)

Component: `PolicyTimeline.tsx`

**Visual Timeline:**

```typescript
<div className="relative">
  <div className="absolute left-0 top-0 bottom-0 w-px bg-gray-300" />

  {sortedVersions.map((version, index) => (
    <div key={version.id} className="relative pl-8 pb-8">
      <div className="absolute left-0 w-3 h-3 bg-blue-500 rounded-full -ml-1.5 border-2 border-white" />

      <div className="bg-white p-4 rounded-lg shadow">
        <div className="flex justify-between items-start">
          <div>
            <span className="font-medium">Version {version.version}</span>
            {index === 0 && <span className="ml-2 badge-success">Current</span>}
          </div>
          <span className="text-sm text-gray-600">
            {formatDateTime(version.effectiveFrom)}
          </span>
        </div>

        <div className="mt-2 text-sm">
          {/* Show key changes */}
          {renderVersionSummary(version, sortedVersions[index + 1])}
        </div>
      </div>
    </div>
  ))}
</div>
```

### 8. Export Functionality

**Export History Button:**

```typescript
<button onClick={exportToCSV}>
  Export History to CSV
</button>

function exportToCSV() {
  const csv = convertHistoryToCSV(history);
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `policy-history-${new Date().toISOString()}.csv`;
  a.click();
}
```

## Acceptance Criteria

- [ ] History tab shows all policy versions in reverse chronological order
- [ ] Current version is visually distinguished
- [ ] Change indicators show increases/decreases from previous version
- [ ] Job family filter works for scoring thresholds
- [ ] User can view detailed information for any version
- [ ] User can compare two versions side-by-side
- [ ] Creator name and timestamp shown for each version
- [ ] Effective date clearly displayed
- [ ] History is paginated or lazy-loaded for performance
- [ ] Export to CSV functionality works
- [ ] Loading states shown while fetching history
- [ ] Empty state shown when no history exists

## Testing Requirements

- Component tests for all history viewers
- Test change badge calculations
- Test version comparison
- Test filtering and sorting
- Test export functionality
- Accessibility tests
- E2E tests for full history workflow

## Files to Create

- `/frontend/src/components/admin/PolicyHistoryViewer.tsx`
- `/frontend/src/components/admin/ScreeningThresholdHistory.tsx`
- `/frontend/src/components/admin/ScoringThresholdHistory.tsx`
- `/frontend/src/components/admin/ApprovalPolicyHistory.tsx`
- `/frontend/src/components/admin/PolicyVersionDetailsModal.tsx`
- `/frontend/src/components/admin/PolicyVersionComparisonModal.tsx`
- `/frontend/src/components/admin/ChangeBadge.tsx`
- `/frontend/src/utils/historyExport.ts`
- Component test files

## UI/UX Considerations

- Clear visual hierarchy for current vs. historical versions
- Color-coded change indicators (green for increase, red for decrease)
- Tooltip on change indicators showing old → new values
- Responsive table design with horizontal scroll on mobile
- Sticky table headers for long lists
- Loading skeletons while fetching data

## Related User Story

**US-002 Acceptance Criteria:**

- ✅ Scenario 2: Policy editor shows change history (This task)

## Dependencies

- TASK-002 (API endpoints for history)
- TASK-003 (Policy editor page structure)

## Performance Considerations

- Lazy load history on tab activation
- Paginate large history lists
- Cache history data with short TTL
- Debounce search/filter inputs

## Notes

- History is read-only; no editing of past versions
- Consider adding audit trail information (who accessed history, when)
- Future enhancement: Rollback to previous version functionality
- Timeline view provides at-a-glance change overview
