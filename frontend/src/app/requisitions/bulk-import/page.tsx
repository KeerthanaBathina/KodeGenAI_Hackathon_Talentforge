'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { CSVUploader } from '@/components/requisitions/CSVUploader';
import { ImportResults } from '@/components/requisitions/ImportResults';
import { getAuthToken } from '@/lib/auth';
import { useToast } from '@/contexts/ToastContext';
import type { ImportResultData } from '@/components/requisitions/types';

function getApiUrl(pathname: string): string {
  const base = process.env.NEXT_PUBLIC_API_URL?.trim() ?? '';
  if (!base || (typeof window !== 'undefined' && window.location.hostname === '127.0.0.1')) {
    return pathname;
  }

  return `${base}${pathname}`;
}

export default function BulkImportPage() {
  const [importResult, setImportResult] = useState<ImportResultData | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const { addToast } = useToast();

  const handleImportComplete = (result: ImportResultData) => {
    setImportResult(result);
    setIsUploading(false);
  };

  const handleStartUpload = () => {
    setIsUploading(true);
    setImportResult(null);
  };

  const handleTemplateDownload = async () => {
    try {
      const token = getAuthToken();
      const response = await fetch(getApiUrl('/api/requisitions/bulk-import/template'), {
        credentials: 'include',
        headers: token
          ? {
              Authorization: `Bearer ${token}`
            }
          : undefined
      });

      if (!response.ok) {
        throw new Error('Unable to download CSV template');
      }

      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = 'requisition-import-template.csv';
      document.body.appendChild(link);
      link.click();
      window.URL.revokeObjectURL(downloadUrl);
      document.body.removeChild(link);
    } catch (error) {
      addToast({
        type: 'error',
        title: 'Template download failed',
        message: error instanceof Error ? error.message : 'Please try again later.'
      });
    }
  };

  return (
    <main className="max-w-4xl mx-auto p-4 sm:p-8">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Bulk Import Requisitions</h1>
        <p className="text-gray-600 mt-2">
          Upload a CSV file to import multiple job requisitions at once.
        </p>
      </header>

      <section className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-8" aria-labelledby="bulk-import-howto">
        <h2 id="bulk-import-howto" className="text-lg font-semibold text-blue-900 mb-3">
          How to Import
        </h2>
        <ol className="list-decimal list-inside space-y-2 text-blue-800">
          <li>Download the CSV template to see the required format.</li>
          <li>Fill in your requisition data following the template structure.</li>
          <li>Upload your completed CSV file using the uploader below.</li>
          <li>Review the import results and download any error reports.</li>
        </ol>

        <div className="mt-4">
          <button
            type="button"
            onClick={handleTemplateDownload}
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            aria-label="Download CSV template"
          >
            Download CSV Template
          </button>
        </div>
      </section>

      <section className="bg-gray-50 border border-gray-200 rounded-lg p-6 mb-8" aria-labelledby="csv-format-guide">
        <h3 id="csv-format-guide" className="font-semibold text-gray-900 mb-3">
          CSV Format Requirements
        </h3>

        <div className="space-y-3 text-sm">
          <div>
            <span className="font-medium text-gray-700">Required Columns:</span>
            <ul className="list-disc list-inside ml-4 mt-1 text-gray-600">
              <li>
                <code className="bg-gray-200 px-1 rounded">role_title</code> - Job title (max 255 chars)
              </li>
              <li>
                <code className="bg-gray-200 px-1 rounded">department</code> - Department name
              </li>
              <li>
                <code className="bg-gray-200 px-1 rounded">location</code> - Office location or Remote
              </li>
              <li>
                <code className="bg-gray-200 px-1 rounded">job_type</code> - full_time, part_time, contract, or internship
              </li>
              <li>
                <code className="bg-gray-200 px-1 rounded">slots</code> - Number of positions (positive integer)
              </li>
              <li>
                <code className="bg-gray-200 px-1 rounded">job_family</code> - Existing job family name
              </li>
            </ul>
          </div>

          <div>
            <span className="font-medium text-gray-700">Optional Columns:</span>
            <ul className="list-disc list-inside ml-4 mt-1 text-gray-600">
              <li>
                <code className="bg-gray-200 px-1 rounded">required_skills</code> - Comma-separated skill list
              </li>
              <li>
                <code className="bg-gray-200 px-1 rounded">preferred_skills</code> - Comma-separated skill list
              </li>
              <li>
                <code className="bg-gray-200 px-1 rounded">min_experience_years</code> - Minimum years of experience
              </li>
              <li>
                <code className="bg-gray-200 px-1 rounded">education_level</code> - Education requirement
              </li>
              <li>
                <code className="bg-gray-200 px-1 rounded">eligibility_criteria</code> - JSON object
              </li>
            </ul>
          </div>
        </div>
      </section>

      <CSVUploader
        onUploadStart={handleStartUpload}
        onUploadComplete={handleImportComplete}
        isUploading={isUploading}
      />

      {importResult ? <ImportResults result={importResult} /> : null}

      <div className="mt-8">
        <Link href="/requisitions" className="text-blue-600 hover:text-blue-800">
          Back to Requisitions
        </Link>
      </div>
    </main>
  );
}
