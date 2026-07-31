'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { CSVUploader } from '@/components/requisitions/CSVUploader';
import { ImportResults } from '@/components/requisitions/ImportResults';
import { getAuthToken } from '@/lib/auth';
import { useToast } from '@/contexts/ToastContext';
import type { ImportResultData } from '@/components/requisitions/types';
import styles from './page.module.css';

function getApiUrl(pathname: string): string {
  const base = process.env.NEXT_PUBLIC_API_URL?.trim() ?? '';
  const isLocalDevHost = typeof window !== 'undefined' &&
    (window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost');

  if (isLocalDevHost) {
    return `http://localhost:3001${pathname}`;
  }

  if (!base) {
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
    <main className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Bulk Import Requisitions</h1>
        <p className={styles.subtitle}>
          Upload a CSV file to import multiple job requisitions at once.
        </p>
      </header>

      <section className={styles.howToSection} aria-labelledby="bulk-import-howto">
        <h2 id="bulk-import-howto" className={styles.howToTitle}>
          How to Import
        </h2>
        <ol className={styles.howToList}>
          <li>Download the CSV template to see the required format.</li>
          <li>Fill in your requisition data following the template structure.</li>
          <li>Upload your completed CSV file using the uploader below.</li>
          <li>Review the import results and download any error reports.</li>
        </ol>

        <div className={styles.howToAction}>
          <button
            type="button"
            onClick={handleTemplateDownload}
            className={styles.templateButton}
            aria-label="Download CSV template"
          >
            Download CSV Template
          </button>
        </div>
      </section>

      <section className={styles.formatSection} aria-labelledby="csv-format-guide">
        <h3 id="csv-format-guide" className={styles.formatTitle}>
          CSV Format Requirements
        </h3>

        <div className={styles.formatBody}>
          <div>
            <span className={styles.groupLabel}>Required Columns:</span>
            <ul className={styles.columnList}>
              <li>
                <code className={styles.code}>role_title</code> - Job title (max 255 chars)
              </li>
              <li>
                <code className={styles.code}>department</code> - Department name
              </li>
              <li>
                <code className={styles.code}>location</code> - Office location or Remote
              </li>
              <li>
                <code className={styles.code}>job_type</code> - full_time, part_time, contract, or internship
              </li>
              <li>
                <code className={styles.code}>slots</code> - Number of positions (positive integer)
              </li>
              <li>
                <code className={styles.code}>job_family</code> - Existing job family name
              </li>
            </ul>
          </div>

          <div>
            <span className={styles.groupLabel}>Optional Columns:</span>
            <ul className={styles.columnList}>
              <li>
                <code className={styles.code}>required_skills</code> - Comma-separated skill list
              </li>
              <li>
                <code className={styles.code}>preferred_skills</code> - Comma-separated skill list
              </li>
              <li>
                <code className={styles.code}>min_experience_years</code> - Minimum years of experience
              </li>
              <li>
                <code className={styles.code}>education_level</code> - Education requirement
              </li>
              <li>
                <code className={styles.code}>eligibility_criteria</code> - JSON object
              </li>
            </ul>
          </div>
        </div>
      </section>

      <section className={styles.uploadSection}>
        <CSVUploader
          onUploadStart={handleStartUpload}
          onUploadComplete={handleImportComplete}
          isUploading={isUploading}
        />
      </section>

      {importResult ? (
        <section className={styles.resultsSection}>
          <ImportResults result={importResult} />
        </section>
      ) : null}

      <div className={styles.backLinkWrap}>
        <Link href="/jobs" className={styles.backLink}>
          Back to Jobs
        </Link>
      </div>
    </main>
  );
}
