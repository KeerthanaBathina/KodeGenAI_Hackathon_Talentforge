'use client';

import React, { useRef, useState } from 'react';
import { useToast } from '@/contexts/ToastContext';
import { getAuthToken } from '@/lib/auth';
import { buildApiUrl } from '@/lib/api/url';
import type { ImportResultData } from './types';

interface CSVUploaderProps {
  onUploadStart: () => void;
  onUploadComplete: (result: ImportResultData) => void;
  isUploading: boolean;
}

function emptyImportResult(message: string): ImportResultData {
  return {
    success: false,
    message,
    results: {
      totalRows: 0,
      importedCount: 0,
      invalidCount: 0,
      duplicateCount: 0,
      importedRequisitions: []
    }
  };
}

export function CSVUploader({ onUploadStart, onUploadComplete, isUploading }: CSVUploaderProps) {
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { addToast } = useToast();

  const handleDrag = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();

    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const files = e.dataTransfer.files;
    if (files && files[0]) {
      handleFileSelection(files[0]);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files[0]) {
      handleFileSelection(files[0]);
    }
  };

  const resetSelection = () => {
    setSelectedFile(null);
    setUploadProgress(0);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleFileSelection = (file: File) => {
    if (!file.name.toLowerCase().endsWith('.csv')) {
      addToast({
        type: 'error',
        title: 'Invalid file type',
        message: 'Please select a CSV file.'
      });
      return;
    }

    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      addToast({
        type: 'error',
        title: 'File too large',
        message: 'File size must be 5 MB or smaller.'
      });
      return;
    }

    setSelectedFile(file);
  };

  const handleUpload = async () => {
    if (!selectedFile || isUploading) {
      return;
    }

    onUploadStart();
    setUploadProgress(15);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);

      const token = getAuthToken();
      const response = await fetch(buildApiUrl('/api/requisitions/bulk-import'), {
        method: 'POST',
        credentials: 'include',
        headers: token
          ? {
              Authorization: `Bearer ${token}`
            }
          : undefined,
        body: formData
      });

      setUploadProgress(85);

      const result = (await response.json()) as ImportResultData;

      if (!response.ok) {
        throw new Error(result.message || 'Upload failed');
      }

      setUploadProgress(100);
      addToast({
        type: 'success',
        title: 'Import complete',
        message: result.message
      });
      onUploadComplete(result);
      resetSelection();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Upload failed';
      addToast({
        type: 'error',
        title: 'Import failed',
        message
      });
      onUploadComplete(emptyImportResult(message));
      setUploadProgress(0);
    }
  };

  return (
    <section className="bg-white border border-gray-300 rounded-lg p-6 sm:p-8" aria-labelledby="csv-upload-heading">
      <h2 id="csv-upload-heading" className="text-xl font-semibold text-gray-900 mb-4">
        Upload CSV File
      </h2>

      <div
        className={`relative border-2 border-dashed rounded-lg p-6 sm:p-8 text-center transition-colors ${
          dragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 bg-gray-50 hover:bg-gray-100'
        }`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        role="button"
        tabIndex={0}
        aria-label="CSV file drop zone"
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            fileInputRef.current?.click();
          }
        }}
      >
        {selectedFile ? (
          <div className="space-y-4">
            <div className="flex items-center justify-center">
              <div className="bg-green-100 rounded-full p-3" aria-hidden="true">
                <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>

            <div>
              <p className="text-lg font-medium text-gray-900 break-all">{selectedFile.name}</p>
              <p className="text-sm text-gray-600">{(selectedFile.size / 1024).toFixed(2)} KB</p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button
                type="button"
                onClick={handleUpload}
                disabled={isUploading}
                className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {isUploading ? 'Uploading...' : 'Upload and Import'}
              </button>

              <button
                type="button"
                onClick={resetSelection}
                disabled={isUploading}
                className="px-6 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex justify-center" aria-hidden="true">
              <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
            </div>

            <div>
              <p className="text-lg font-medium text-gray-900">Drop your CSV file here</p>
              <p className="text-sm text-gray-600 mt-1">or click to browse</p>
            </div>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              aria-label="Select File"
            >
              Select File
            </button>

            <p className="text-xs text-gray-500">Maximum file size: 5 MB. Supported format: .csv</p>
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          onChange={handleFileInput}
          className="hidden"
          aria-label="CSV file input"
        />
      </div>

      {isUploading && (
        <div className="mt-4" role="status" aria-live="polite">
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
    </section>
  );
}
