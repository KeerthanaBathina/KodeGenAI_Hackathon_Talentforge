import { ScreeningThreshold, ScoringThreshold, ApprovalPolicy } from '../types/policy';

/**
 * Utility functions for exporting policy history to CSV format
 */

/**
 * Convert screening threshold history to CSV format
 */
export function screeningThresholdHistoryToCSV(
  history: ScreeningThreshold[]
): string {
  const headers = [
    'Version',
    'Effective From',
    'Shortlist Threshold',
    'Borderline Min',
    'Borderline Max',
    'Reject Threshold',
    'Created At',
  ];

  const rows = history.map((item) => [
    `v${item.version}`,
    formatDateForCSV(item.effectiveFrom),
    item.shortlistThreshold,
    item.borderlineMin,
    item.borderlineMax,
    item.rejectThreshold,
    formatDateForCSV(item.createdAt),
  ]);

  return formatCSV(headers, rows);
}

/**
 * Convert scoring threshold history to CSV format
 */
export function scoringThresholdHistoryToCSV(
  history: ScoringThreshold[]
): string {
  const headers = [
    'Job Family',
    'Effective From',
    'AI Shortlist Threshold',
    'Confidence Threshold',
    'Experience Threshold (Years)',
    'Created By',
    'Created At',
  ];

  const rows = history.map((item) => [
    item.jobFamilyId || 'N/A',
    formatDateForCSV(item.effectiveFrom),
    item.aiShortlistThreshold,
    item.confidenceThreshold,
    item.experienceThresholdYears,
    item.createdBy || 'N/A',
    formatDateForCSV(item.createdAt),
  ]);

  return formatCSV(headers, rows);
}

/**
 * Convert approval policy history to CSV format
 */
export function approvalPolicyHistoryToCSV(
  history: ApprovalPolicy[]
): string {
  const headers = [
    'Compensation Band Min',
    'Compensation Band Max',
    'Approver Tiers',
    'Effective From',
    'Active',
    'Created By',
    'Created At',
  ];

  const rows = history.map((item) => [
    item.compensationBandMin,
    item.compensationBandMax,
    formatApproverTiers(item.requiredApprovers),
    formatDateForCSV(item.effectiveFrom),
    item.active ? 'Yes' : 'No',
    item.createdBy || 'N/A',
    formatDateForCSV(item.createdAt),
  ]);

  return formatCSV(headers, rows);
}

/**
 * Download CSV file
 */
export function downloadCSV(filename: string, csvContent: string): void {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Format approver tiers as readable string
 */
function formatApproverTiers(approvers: any[]): string {
  if (!approvers || approvers.length === 0) return 'N/A';
  return approvers
    .sort((a, b) => a.tier - b.tier)
    .map((a) => `Tier ${a.tier}: ${a.displayName || a.approverId}`)
    .join('; ');
}

/**
 * Format date to ISO string for CSV
 */
function formatDateForCSV(date: string | Date): string {
  if (typeof date === 'string') {
    return new Date(date).toISOString().split('T')[0];
  }
  return date.toISOString().split('T')[0];
}

/**
 * Format headers and rows as CSV string
 */
function formatCSV(headers: string[], rows: (string | number | boolean)[][]): string {
  const escapedHeaders = headers.map(escapeCSVField);
  const escapedRows = rows.map((row) =>
    row.map((field) => escapeCSVField(String(field)))
  );

  return [escapedHeaders, ...escapedRows].map((row) => row.join(',')).join('\n');
}

/**
 * Escape CSV field (handle commas, quotes, newlines)
 */
function escapeCSVField(field: string): string {
  if (field.includes(',') || field.includes('"') || field.includes('\n')) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}
