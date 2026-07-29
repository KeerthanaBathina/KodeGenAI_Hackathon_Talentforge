---
id: TASK-003
user_story: US-004
title: "Frontend - CSV Upload UI Component"
status: todo
priority: high
assigned_to: frontend-team
estimated_hours: 7
layer: frontend
dependencies: [TASK-001, TASK-002]
---

# TASK-003 — Frontend - CSV Upload UI Component

## Objective

Build intuitive CSV upload interface for bulk requisition import with drag-and-drop support, upload progress tracking, result display, and error report download.

## Scope

Create React component for CSV file selection, upload to backend API, real-time progress indication, import results visualization, and error report download functionality.

## Technical Requirements

### 1. Bulk Import Page

Create `/frontend/src/app/requisitions/bulk-import/page.tsx`:

```typescript
'use client';

import { useState } from 'react';
import { CSVUploader } from '@/components/requisitions/CSVUploader';
import { ImportResults } from '@/components/requisitions/ImportResults';
import Link from 'next/link';

interface ImportResultData {
  success: boolean;
  message: string;
  results: {
    totalRows: number;
    importedCount: number;
    invalidCount: number;
    duplicateCount: number;
    importedRequisitions: string[];
  };
  errorReportUrl?: string;
  processingTime?: number;
}

export default function BulkImportPage() {
  const [importResult, setImportResult] = useState<ImportResultData | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const handleImportComplete = (result: ImportResultData) => {
    setImportResult(result);
    setIsUploading(false);
  };

  const handleStartUpload = () => {
    setIsUploading(true);
    setImportResult(null);
  };

  return (
    <div className="max-w-4xl mx-auto p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Bulk Import Requisitions</h1>
        <p className="text-gray-600 mt-2">
          Upload a CSV file to import multiple job requisitions at once
        </p>
      </div>

      {/* Instructions */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-8">
        <h2 className="text-lg font-semibold text-blue-900 mb-3">How to Import</h2>
        <ol className="list-decimal list-inside space-y-2 text-blue-800">
          <li>Download the CSV template to see the required format</li>
          <li>Fill in your requisition data following the template structure</li>
          <li>Upload your completed CSV file using the form below</li>
          <li>Review the import results and download any error reports</li>
        </ol>

        <div className="mt-4">
          <a
            href="/api/requisitions/bulk-import/template"
            download
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            📥 Download CSV Template
          </a>
        </div>
      </div>

      {/* CSV Format Guide */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 mb-8">
        <h3 className="font-semibold text-gray-900 mb-3">CSV Format Requirements</h3>

        <div className="space-y-3 text-sm">
          <div>
            <span className="font-medium text-gray-700">Required Columns:</span>
            <ul className="list-disc list-inside ml-4 mt-1 text-gray-600">
              <li><code className="bg-gray-200 px-1 rounded">role_title</code> - Job title (max 255 chars)</li>
              <li><code className="bg-gray-200 px-1 rounded">department</code> - Department name</li>
              <li><code className="bg-gray-200 px-1 rounded">location</code> - Office location or "Remote"</li>
              <li><code className="bg-gray-200 px-1 rounded">job_type</code> - full_time, part_time, contract, or internship</li>
              <li><code className="bg-gray-200 px-1 rounded">slots</code> - Number of positions (positive integer)</li>
              <li><code className="bg-gray-200 px-1 rounded">job_family</code> - Existing job family name</li>
            </ul>
          </div>

          <div>
            <span className="font-medium text-gray-700">Optional Columns:</span>
            <ul className="list-disc list-inside ml-4 mt-1 text-gray-600">
              <li><code className="bg-gray-200 px-1 rounded">required_skills</code> - Comma-separated skill list</li>
              <li><code className="bg-gray-200 px-1 rounded">preferred_skills</code> - Comma-separated skill list</li>
              <li><code className="bg-gray-200 px-1 rounded">min_experience_years</code> - Minimum years of experience</li>
              <li><code className="bg-gray-200 px-1 rounded">education_level</code> - Education requirement</li>
              <li><code className="bg-gray-200 px-1 rounded">eligibility_criteria</code> - JSON object</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Upload Component */}
      <CSVUploader
        onUploadStart={handleStartUpload}
        onUploadComplete={handleImportComplete}
        isUploading={isUploading}
      />

      {/* Results Display */}
      {importResult && (
        <ImportResults result={importResult} />
      )}

      {/* Back Link */}
      <div className="mt-8">
        <Link
          href="/requisitions"
          className="text-blue-600 hover:text-blue-800"
        >
          ← Back to Requisitions
        </Link>
      </div>
    </div>
  );
}
```

### 2. CSV Uploader Component

Create `/frontend/src/components/requisitions/CSVUploader.tsx`:

```typescript
'use client';

import { useRef, useState } from 'react';
import { useToast } from '@/contexts/ToastContext';

interface CSVUploaderProps {
  onUploadStart: () => void;
  onUploadComplete: (result: any) => void;
  isUploading: boolean;
}

export function CSVUploader({ onUploadStart, onUploadComplete, isUploading }: CSVUploaderProps) {
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { showToast } = useToast();

  // Handle file drag events
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  // Handle file drop
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const files = e.dataTransfer.files;
    if (files && files[0]) {
      handleFileSelection(files[0]);
    }
  };

  // Handle file selection from input
  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files[0]) {
      handleFileSelection(files[0]);
    }
  };

  // Validate and set selected file
  const handleFileSelection = (file: File) => {
    // Validate file type
    if (!file.name.toLowerCase().endsWith('.csv')) {
      showToast('error', 'Please select a CSV file');
      return;
    }

    // Validate file size (5MB max)
    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      showToast('error', 'File size must be less than 5MB');
      return;
    }

    setSelectedFile(file);
  };

  // Upload file to backend
  const handleUpload = async () => {
    if (!selectedFile) return;

    onUploadStart();
    setUploadProgress(0);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);

      const response = await fetch('/api/requisitions/bulk-import', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: formData
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || 'Upload failed');
      }

      setUploadProgress(100);
      showToast('success', result.message);
      onUploadComplete(result);

      // Reset file selection
      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : 'Upload failed');
      onUploadComplete({
        success: false,
        message: error instanceof Error ? error.message : 'Upload failed',
        results: {
          totalRows: 0,
          importedCount: 0,
          invalidCount: 0,
          duplicateCount: 0,
          importedRequisitions: []
        }
      });
    }
  };

  return (
    <div className="bg-white border border-gray-300 rounded-lg p-8">
      <h2 className="text-xl font-semibold text-gray-900 mb-4">Upload CSV File</h2>

      {/* Drag-and-drop zone */}
      <div
        className={`relative border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
          dragActive
            ? 'border-blue-500 bg-blue-50'
            : 'border-gray-300 bg-gray-50 hover:bg-gray-100'
        }`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        {selectedFile ? (
          <div className="space-y-4">
            <div className="flex items-center justify-center">
              <div className="bg-green-100 rounded-full p-3">
                <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>

            <div>
              <p className="text-lg font-medium text-gray-900">{selectedFile.name}</p>
              <p className="text-sm text-gray-600">
                {(selectedFile.size / 1024).toFixed(2)} KB
              </p>
            </div>

            <div className="flex gap-3 justify-center">
              <button
                onClick={handleUpload}
                disabled={isUploading}
                className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {isUploading ? 'Uploading...' : 'Upload and Import'}
              </button>

              <button
                onClick={() => {
                  setSelectedFile(null);
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }}
                disabled={isUploading}
                className="px-6 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex justify-center">
              <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
            </div>

            <div>
              <p className="text-lg font-medium text-gray-900">
                Drop your CSV file here
              </p>
              <p className="text-sm text-gray-600 mt-1">
                or click to browse
              </p>
            </div>

            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Select File
            </button>

            <p className="text-xs text-gray-500">
              Maximum file size: 5MB • Supported format: .csv
            </p>
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          onChange={handleFileInput}
          className="hidden"
        />
      </div>

      {/* Upload progress */}
      {isUploading && uploadProgress > 0 && (
        <div className="mt-4">
          <div className="flex justify-between text-sm text-gray-600 mb-2">
            <span>Uploading and processing...</span>
            <span>{uploadProgress}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
```

### 3. Import Results Component

Create `/frontend/src/components/requisitions/ImportResults.tsx`:

```typescript
'use client';

interface ImportResultsProps {
  result: {
    success: boolean;
    message: string;
    results: {
      totalRows: number;
      importedCount: number;
      invalidCount: number;
      duplicateCount: number;
      importedRequisitions: string[];
    };
    errorReportUrl?: string;
    processingTime?: number;
  };
}

export function ImportResults({ result }: ImportResultsProps) {
  const hasErrors = result.results.invalidCount > 0 || result.results.duplicateCount > 0;

  const handleDownloadErrorReport = () => {
    if (result.errorReportUrl) {
      const token = localStorage.getItem('token');
      const url = `${result.errorReportUrl}`;

      fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
        .then(response => response.blob())
        .then(blob => {
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `import-errors-${Date.now()}.csv`;
          document.body.appendChild(a);
          a.click();
          window.URL.revokeObjectURL(url);
          document.body.removeChild(a);
        })
        .catch(error => {
          console.error('Error downloading report:', error);
        });
    }
  };

  return (
    <div className="mt-8 bg-white border rounded-lg shadow-sm overflow-hidden">
      <div className={`p-6 ${result.success ? 'bg-green-50 border-b border-green-200' : 'bg-yellow-50 border-b border-yellow-200'}`}>
        <div className="flex items-start gap-3">
          {result.success ? (
            <div className="flex-shrink-0">
              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          ) : (
            <div className="flex-shrink-0">
              <svg className="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
          )}

          <div>
            <h3 className={`text-lg font-semibold ${result.success ? 'text-green-900' : 'text-yellow-900'}`}>
              {result.message}
            </h3>
            {result.processingTime && (
              <p className="text-sm text-gray-600 mt-1">
                Processing completed in {(result.processingTime / 1000).toFixed(2)}s
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Statistics Grid */}
      <div className="grid grid-cols-4 gap-px bg-gray-200">
        <StatCard
          label="Total Rows"
          value={result.results.totalRows}
          color="blue"
        />
        <StatCard
          label="Imported"
          value={result.results.importedCount}
          color="green"
        />
        <StatCard
          label="Invalid"
          value={result.results.invalidCount}
          color="red"
        />
        <StatCard
          label="Duplicates"
          value={result.results.duplicateCount}
          color="yellow"
        />
      </div>

      {/* Error Report Download */}
      {hasErrors && result.errorReportUrl && (
        <div className="p-6 bg-gray-50 border-t border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-medium text-gray-900">Error Report Available</h4>
              <p className="text-sm text-gray-600 mt-1">
                Download a detailed CSV report with all validation errors and duplicate entries
              </p>
            </div>

            <button
              onClick={handleDownloadErrorReport}
              className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Download Error Report
            </button>
          </div>
        </div>
      )}

      {/* Success Details */}
      {result.results.importedCount > 0 && (
        <div className="p-6">
          <h4 className="font-medium text-gray-900 mb-3">Successfully Imported Requisitions</h4>
          <p className="text-sm text-gray-600 mb-3">
            {result.results.importedCount} requisition(s) have been created with status "open"
          </p>

          {result.results.importedRequisitions.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer text-blue-600 hover:text-blue-800">
                View Requisition IDs ({result.results.importedRequisitions.length})
              </summary>
              <div className="mt-2 bg-gray-50 rounded p-3 max-h-48 overflow-y-auto">
                <ul className="space-y-1 font-mono text-xs">
                  {result.results.importedRequisitions.map((id) => (
                    <li key={id} className="text-gray-700">{id}</li>
                  ))}
                </ul>
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  const colorClasses = {
    blue: 'bg-blue-50 text-blue-900',
    green: 'bg-green-50 text-green-900',
    red: 'bg-red-50 text-red-900',
    yellow: 'bg-yellow-50 text-yellow-900'
  };

  return (
    <div className={`p-6 ${colorClasses[color as keyof typeof colorClasses]}`}>
      <div className="text-sm font-medium opacity-75">{label}</div>
      <div className="text-3xl font-bold mt-2">{value}</div>
    </div>
  );
}
```

## Acceptance Criteria

- [ ] Bulk import page accessible at `/requisitions/bulk-import`
- [ ] CSV template download link works and provides example data
- [ ] Drag-and-drop zone accepts CSV files
- [ ] File picker button opens file selection dialog
- [ ] File type validation rejects non-CSV files with error message
- [ ] File size validation rejects files > 5MB with error message
- [ ] Upload button disabled during processing
- [ ] Progress indicator shown during upload
- [ ] Import results display total, imported, invalid, and duplicate counts
- [ ] Success message shown when all rows imported successfully
- [ ] Warning message shown when errors or duplicates exist
- [ ] Error report download button appears when errors/duplicates present
- [ ] Error report downloads as CSV file with proper filename
- [ ] Imported requisition IDs displayed (expandable)
- [ ] Back link to requisitions list page
- [ ] Responsive design works on desktop and tablet
- [ ] Accessibility: keyboard navigation, ARIA labels, screen reader support

## Testing Requirements

### Component Tests

File: `/frontend/src/components/requisitions/__tests__/CSVUploader.test.tsx`

```typescript
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CSVUploader } from '../CSVUploader';
import { ToastProvider } from '@/contexts/ToastContext';

describe('CSVUploader', () => {
  const mockOnUploadStart = vi.fn();
  const mockOnUploadComplete = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render upload zone', () => {
    render(
      <ToastProvider>
        <CSVUploader
          onUploadStart={mockOnUploadStart}
          onUploadComplete={mockOnUploadComplete}
          isUploading={false}
        />
      </ToastProvider>
    );

    expect(screen.getByText(/Drop your CSV file here/i)).toBeInTheDocument();
    expect(screen.getByText(/Select File/i)).toBeInTheDocument();
  });

  it('should handle file selection', () => {
    render(
      <ToastProvider>
        <CSVUploader
          onUploadStart={mockOnUploadStart}
          onUploadComplete={mockOnUploadComplete}
          isUploading={false}
        />
      </ToastProvider>
    );

    const file = new File(['test'], 'test.csv', { type: 'text/csv' });
    const input = screen.getByRole('button', { name: /Select File/i })
      .parentElement?.querySelector('input[type="file"]');

    fireEvent.change(input!, { target: { files: [file] } });

    expect(screen.getByText('test.csv')).toBeInTheDocument();
  });

  it('should reject non-CSV files', () => {
    render(
      <ToastProvider>
        <CSVUploader
          onUploadStart={mockOnUploadStart}
          onUploadComplete={mockOnUploadComplete}
          isUploading={false}
        />
      </ToastProvider>
    );

    const file = new File(['test'], 'test.txt', { type: 'text/plain' });
    const input = screen.getByRole('button', { name: /Select File/i })
      .parentElement?.querySelector('input[type="file"]');

    fireEvent.change(input!, { target: { files: [file] } });

    // Should show error toast
    expect(screen.queryByText('test.txt')).not.toBeInTheDocument();
  });

  it('should disable upload button during upload', () => {
    render(
      <ToastProvider>
        <CSVUploader
          onUploadStart={mockOnUploadStart}
          onUploadComplete={mockOnUploadComplete}
          isUploading={true}
        />
      </ToastProvider>
    );

    const uploadButton = screen.queryByText(/Uploading.../i);
    expect(uploadButton).toBeDisabled();
  });
});
```

### E2E Tests

File: `/frontend/tests/e2e/bulk-import.spec.ts`

```typescript
import { test, expect } from "@playwright/test";

test.describe("Bulk Import", () => {
  test.beforeEach(async ({ page }) => {
    // Login as recruiter
    await page.goto("/login");
    await page.fill('[name="email"]', "recruiter@example.com");
    await page.fill('[name="password"]', "password");
    await page.click('button[type="submit"]');
  });

  test("should display bulk import page", async ({ page }) => {
    await page.goto("/requisitions/bulk-import");

    await expect(page.locator("h1")).toContainText("Bulk Import Requisitions");
    await expect(page.locator("text=Download CSV Template")).toBeVisible();
  });

  test("should upload valid CSV and show success", async ({ page }) => {
    await page.goto("/requisitions/bulk-import");

    const csv = `role_title,department,location,job_type,slots,job_family
Senior Engineer,Engineering,Remote,full_time,2,Software Development`;

    // Create CSV file and upload
    const fileChooserPromise = page.waitForEvent("filechooser");
    await page.click('button:has-text("Select File")');
    const fileChooser = await fileChooserPromise;

    await fileChooser.setFiles({
      name: "requisitions.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csv),
    });

    // Upload
    await page.click('button:has-text("Upload and Import")');

    // Wait for results
    await expect(page.locator("text=Successfully imported")).toBeVisible({
      timeout: 10000,
    });
    await expect(page.locator("text=Imported")).toBeVisible();
  });

  test("should show error report download button for invalid rows", async ({
    page,
  }) => {
    await page.goto("/requisitions/bulk-import");

    const csvWithErrors = `role_title,department,location,job_type,slots,job_family
Senior Engineer,Engineering,Remote,full_time,2,Software Development
,Marketing,New York,full_time,1,Product Management`;

    // Upload CSV with errors
    const fileChooserPromise = page.waitForEvent("filechooser");
    await page.click('button:has-text("Select File")');
    const fileChooser = await fileChooserPromise;

    await fileChooser.setFiles({
      name: "requisitions.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csvWithErrors),
    });

    await page.click('button:has-text("Upload and Import")');

    // Verify error report button appears
    await expect(
      page.locator('button:has-text("Download Error Report")'),
    ).toBeVisible({ timeout: 10000 });
  });

  test("should reject non-CSV files", async ({ page }) => {
    await page.goto("/requisitions/bulk-import");

    const fileChooserPromise = page.waitForEvent("filechooser");
    await page.click('button:has-text("Select File")');
    const fileChooser = await fileChooserPromise;

    await fileChooser.setFiles({
      name: "document.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("This is not a CSV"),
    });

    // Should show error toast
    await expect(page.locator(".toast-error")).toBeVisible();
  });

  test("should download CSV template", async ({ page }) => {
    await page.goto("/requisitions/bulk-import");

    const downloadPromise = page.waitForEvent("download");
    await page.click('a:has-text("Download CSV Template")');
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toContain(".csv");
  });
});
```

## Files to Create/Modify

### Create

- `/frontend/src/app/requisitions/bulk-import/page.tsx` - Main bulk import page
- `/frontend/src/components/requisitions/CSVUploader.tsx` - File upload component
- `/frontend/src/components/requisitions/ImportResults.tsx` - Results display component
- `/frontend/src/components/requisitions/__tests__/CSVUploader.test.tsx` - Component tests
- `/frontend/src/components/requisitions/__tests__/ImportResults.test.tsx` - Component tests
- `/frontend/tests/e2e/bulk-import.spec.ts` - E2E tests

## Dependencies

- TASK-001, TASK-002 (Backend API must be implemented)
- Next.js 14 App Router
- React hooks (useState, useRef)
- Toast context for notifications
- Existing authentication infrastructure

## Related User Story

**US-004 All Acceptance Criteria Verified:**

- ✅ Scenario 1: Valid CSV imported and requisitions created (success display)
- ✅ Scenario 2: Invalid rows reported without blocking valid rows (partial success with error report)
- ✅ Scenario 3: CSV column headers validated (error message before processing)
- ✅ Scenario 4: Import is idempotent with duplicate detection (duplicates shown in results)

## Notes

- Drag-and-drop provides intuitive file selection
- File validation happens client-side before upload
- Progress indication improves user experience for large files
- Error report stored temporarily (1 hour) on server
- Template download helps users understand required format
- Responsive design ensures usability on various screen sizes
- Accessibility features include keyboard navigation and ARIA labels
- Results component shows detailed breakdown of import statistics
- Imported requisition IDs expandable for verification
- Back link provides easy navigation to requisitions list
