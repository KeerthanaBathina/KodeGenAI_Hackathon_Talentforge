---
id: task_002
us_id: us_001
epic: EP-003
title: "Create Frontend Resume Upload Component with File Validation"
status: done
layer: frontend
effort: 2h
priority: critical
created: 2026-07-24
completed: 2026-07-24
---

# TASK-002 — Create Frontend Resume Upload Component with File Validation

## Context

**User Story**: US-001 — Secure Resume Upload via Presigned URL with Malware Scanning  
**Epic**: EP-003 — AI Resume Parsing  
**Addresses**: Scenario 1 (file selection), Scenario 2 (client-side validation)

Create React component for resume file upload with client-side validation. The component validates file type and size before requesting a presigned URL from the backend.

---

## Objective

Build resume upload component that:
1. Accepts file selection via file input
2. Validates file type (PDF, DOCX only)
3. Validates file size (≤ 10 MB)
4. Shows validation errors immediately
5. Requests presigned URL from backend
6. Uploads file directly to Supabase Storage
7. Handles upload success/failure states

---

## Implementation

### 1. Resume Upload Hook

**File**: `frontend/src/hooks/useResumeUpload.ts`

```typescript
import { useState, useCallback } from 'react';

interface UploadState {
  status: 'idle' | 'validating' | 'requesting_url' | 'uploading' | 'success' | 'error';
  progress: number;
  error: string | null;
  resumeId: string | null;
}

interface UseResumeUploadParams {
  applicationId: string;
  onSuccess?: (resumeId: string) => void;
  onError?: (error: string) => void;
}

const ALLOWED_TYPES = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
const MAX_FILE_SIZE_MB = 10;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

function getApiUrl(pathname: string): string {
  const base = process.env.NEXT_PUBLIC_API_URL?.trim() ?? '';
  if (!base || (typeof window !== 'undefined' && window.location.hostname === '127.0.0.1')) {
    return pathname;
  }
  return `${base}${pathname}`;
}

export function useResumeUpload({ applicationId, onSuccess, onError }: UseResumeUploadParams) {
  const [uploadState, setUploadState] = useState<UploadState>({
    status: 'idle',
    progress: 0,
    error: null,
    resumeId: null,
  });

  const validateFile = useCallback((file: File): string | null => {
    // Validate file type
    if (!ALLOWED_TYPES.includes(file.type)) {
      return 'Only PDF and DOCX files are accepted';
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return `File size must not exceed ${MAX_FILE_SIZE_MB} MB`;
    }

    return null;
  }, []);

  const uploadFile = useCallback(async (file: File) => {
    try {
      setUploadState({ status: 'validating', progress: 0, error: null, resumeId: null });

      // Client-side validation
      const validationError = validateFile(file);
      if (validationError) {
        setUploadState({ status: 'error', progress: 0, error: validationError, resumeId: null });
        onError?.(validationError);
        return;
      }

      // Request presigned URL
      setUploadState({ status: 'requesting_url', progress: 10, error: null, resumeId: null });

      const presignedResponse = await fetch(getApiUrl('/api/resumes/presigned-url'), {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          applicationId,
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type,
        }),
      });

      if (!presignedResponse.ok) {
        const errorData = await presignedResponse.json();
        throw new Error(errorData.error?.message || 'Failed to generate upload URL');
      }

      const { uploadUrl, resumeId } = await presignedResponse.json();

      // Upload file to Supabase Storage
      setUploadState({ status: 'uploading', progress: 20, error: null, resumeId });

      const uploadResponse = await fetch(uploadUrl, {
        method: 'PUT',
        body: file,
        headers: {
          'Content-Type': file.type,
        },
      });

      if (!uploadResponse.ok) {
        throw new Error('Failed to upload file to storage');
      }

      setUploadState({ status: 'success', progress: 100, error: null, resumeId });
      onSuccess?.(resumeId);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Upload failed';
      setUploadState({ status: 'error', progress: 0, error: errorMessage, resumeId: null });
      onError?.(errorMessage);
    }
  }, [applicationId, validateFile, onSuccess, onError]);

  const reset = useCallback(() => {
    setUploadState({ status: 'idle', progress: 0, error: null, resumeId: null });
  }, []);

  return {
    uploadState,
    uploadFile,
    reset,
  };
}
```

### 2. Resume Upload Component

**File**: `frontend/src/components/ResumeUpload.tsx`

```typescript
'use client';

import React, { useRef } from 'react';
import { useResumeUpload } from '../hooks/useResumeUpload';

interface ResumeUploadProps {
  applicationId: string;
  onUploadSuccess?: (resumeId: string) => void;
  onUploadError?: (error: string) => void;
}

export function ResumeUpload({ applicationId, onUploadSuccess, onUploadError }: ResumeUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { uploadState, uploadFile, reset } = useResumeUpload({
    applicationId,
    onSuccess: onUploadSuccess,
    onError: onUploadError,
  });

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    await uploadFile(file);
  };

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  const handleReset = () => {
    reset();
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const isUploading = uploadState.status === 'requesting_url' || uploadState.status === 'uploading';
  const showError = uploadState.status === 'error';
  const showSuccess = uploadState.status === 'success';

  return (
    <div style={{ width: '100%' }}>
      {/* File Input (Hidden) */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        onChange={handleFileChange}
        style={{ display: 'none' }}
        disabled={isUploading}
        data-testid="resume-file-input"
      />

      {/* Upload Button */}
      {!showSuccess && (
        <button
          onClick={handleClick}
          disabled={isUploading}
          style={{
            width: '100%',
            padding: '1rem',
            backgroundColor: isUploading ? '#9ca3af' : '#3b82f6',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            fontSize: '1rem',
            fontWeight: '500',
            cursor: isUploading ? 'not-allowed' : 'pointer',
            marginBottom: '1rem',
          }}
          data-testid="resume-upload-button"
        >
          {isUploading ? 'Uploading...' : 'Upload Resume (PDF or DOCX, max 10 MB)'}
        </button>
      )}

      {/* Error Message */}
      {showError && uploadState.error && (
        <div
          style={{
            backgroundColor: '#fee2e2',
            border: '1px solid #f87171',
            borderRadius: '6px',
            padding: '0.75rem',
            marginBottom: '1rem',
          }}
          data-testid="resume-upload-error"
        >
          <p style={{ fontSize: '0.875rem', color: '#991b1b', margin: 0 }}>
            {uploadState.error}
          </p>
          <button
            onClick={handleReset}
            style={{
              marginTop: '0.5rem',
              padding: '0.5rem 1rem',
              backgroundColor: '#ef4444',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              fontSize: '0.875rem',
              cursor: 'pointer',
            }}
          >
            Try Again
          </button>
        </div>
      )}

      {/* Success Message */}
      {showSuccess && (
        <div
          style={{
            backgroundColor: '#d1fae5',
            border: '1px solid #10b981',
            borderRadius: '6px',
            padding: '0.75rem',
            marginBottom: '1rem',
          }}
          data-testid="resume-upload-success"
        >
          <p style={{ fontSize: '0.875rem', color: '#065f46', margin: 0 }}>
            ✓ Resume uploaded successfully
          </p>
        </div>
      )}

      {/* Format Info */}
      <p style={{ fontSize: '0.75rem', color: '#6b7280', textAlign: 'center', margin: 0 }}>
        Accepted formats: PDF, DOCX • Maximum size: 10 MB
      </p>
    </div>
  );
}
```

---

## Acceptance Criteria

- [x] useResumeUpload hook created
- [x] Client-side validation for file type (PDF, DOCX)
- [x] Client-side validation for file size (≤ 10 MB)
- [x] Validation errors shown immediately before upload
- [x] Presigned URL requested from backend
- [x] File uploaded directly to Supabase Storage via PUT
- [x] ResumeUpload component with file input
- [x] Upload button with disabled state during upload
- [x] Error message display with "Try Again" button
- [x] Success message display
- [x] Format info displayed below button
- [x] Proper data-testid attributes for testing

---

## Testing Requirements

**Unit Tests** (`ResumeUpload.test.tsx`):
- ✓ Renders upload button
- ✓ Shows validation error for invalid file type
- ✓ Shows validation error for oversized file
- ✓ Disables button during upload
- ✓ Shows success message on completion
- ✓ Shows error message on failure
- ✓ Reset button clears error state

**Integration Tests**:
- ✓ Uploads PDF file successfully
- ✓ Uploads DOCX file successfully
- ✓ Rejects .exe file
- ✓ Rejects 15 MB file

---

## Dependencies

- Backend POST /api/resumes/presigned-url endpoint (TASK-001)
- Supabase Storage bucket configured

---

## Effort Estimate

**2 hours** — Standard file upload component with validation
