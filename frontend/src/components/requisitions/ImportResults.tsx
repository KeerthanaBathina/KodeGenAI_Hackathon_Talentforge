'use client';

import React from 'react';
import { useToast } from '@/contexts/ToastContext';
import { getAuthToken } from '@/lib/auth';
import { buildApiUrl } from '@/lib/api/url';
import type { ImportResultData } from './types';

interface ImportResultsProps {
  result: ImportResultData;
}

type StatColor = 'blue' | 'green' | 'red' | 'yellow';

function StatCard({ label, value, color }: { label: string; value: number; color: StatColor }) {
  const colorClasses: Record<StatColor, string> = {
    blue: 'bg-blue-50 text-blue-900',
    green: 'bg-green-50 text-green-900',
    red: 'bg-red-50 text-red-900',
    yellow: 'bg-yellow-50 text-yellow-900'
  };

  return (
    <div className={`p-4 sm:p-6 ${colorClasses[color]}`}>
      <div className="text-sm font-medium opacity-75">{label}</div>
      <div className="text-2xl sm:text-3xl font-bold mt-2">{value}</div>
    </div>
  );
}

export function ImportResults({ result }: ImportResultsProps) {
  const hasErrors = result.results.invalidCount > 0 || result.results.duplicateCount > 0;
  const { addToast } = useToast();

  const handleDownloadErrorReport = async () => {
    if (!result.errorReportUrl) {
      return;
    }

    try {
      const token = getAuthToken();
      const response = await fetch(buildApiUrl(result.errorReportUrl), {
        credentials: 'include',
        headers: token
          ? {
              Authorization: `Bearer ${token}`
            }
          : undefined
      });

      if (!response.ok) {
        throw new Error('Failed to download error report');
      }

      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `import-errors-${Date.now()}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(downloadUrl);
      document.body.removeChild(a);
    } catch (error) {
      addToast({
        type: 'error',
        title: 'Download failed',
        message: error instanceof Error ? error.message : 'Unable to download error report.'
      });
    }
  };

  const successBanner = result.success && !hasErrors;

  return (
    <section className="mt-8 bg-white border rounded-lg shadow-sm overflow-hidden" aria-labelledby="import-results-heading">
      <div
        className={`p-6 ${
          successBanner ? 'bg-green-50 border-b border-green-200' : 'bg-yellow-50 border-b border-yellow-200'
        }`}
      >
        <div className="flex items-start gap-3">
          {successBanner ? (
            <div className="flex-shrink-0" aria-hidden="true">
              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          ) : (
            <div className="flex-shrink-0" aria-hidden="true">
              <svg className="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
          )}

          <div>
            <h3 id="import-results-heading" className={`text-lg font-semibold ${successBanner ? 'text-green-900' : 'text-yellow-900'}`}>
              {result.message}
            </h3>
            {result.processingTime ? (
              <p className="text-sm text-gray-600 mt-1">
                Processing completed in {(result.processingTime / 1000).toFixed(2)}s
              </p>
            ) : null}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-gray-200">
        <StatCard label="Total Rows" value={result.results.totalRows} color="blue" />
        <StatCard label="Imported" value={result.results.importedCount} color="green" />
        <StatCard label="Invalid" value={result.results.invalidCount} color="red" />
        <StatCard label="Duplicates" value={result.results.duplicateCount} color="yellow" />
      </div>

      {hasErrors && result.errorReportUrl ? (
        <div className="p-6 bg-gray-50 border-t border-gray-200">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h4 className="font-medium text-gray-900">Error Report Available</h4>
              <p className="text-sm text-gray-600 mt-1">
                Download a detailed CSV report with all validation errors and duplicate entries.
              </p>
            </div>

            <button
              type="button"
              onClick={handleDownloadErrorReport}
              className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 flex items-center gap-2"
              aria-label="Download error report"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Download Error Report
            </button>
          </div>
        </div>
      ) : null}

      {result.results.importedCount > 0 ? (
        <div className="p-6">
          <h4 className="font-medium text-gray-900 mb-3">Successfully Imported Requisitions</h4>
          <p className="text-sm text-gray-600 mb-3">
            {result.results.importedCount} requisition(s) have been created with status open.
          </p>

          {result.results.importedRequisitions.length > 0 ? (
            <details className="text-sm">
              <summary className="cursor-pointer text-blue-600 hover:text-blue-800">
                View Requisition IDs ({result.results.importedRequisitions.length})
              </summary>
              <div className="mt-2 bg-gray-50 rounded p-3 max-h-48 overflow-y-auto">
                <ul className="space-y-1 font-mono text-xs">
                  {result.results.importedRequisitions.map((id) => (
                    <li key={id} className="text-gray-700">
                      {id}
                    </li>
                  ))}
                </ul>
              </div>
            </details>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
