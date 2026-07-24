---
id: task_003
us_id: us_001
epic: EP-003
title: "Add Upload Progress Indicator to Resume Component"
status: done
layer: frontend
effort: 1h
priority: medium
created: 2026-07-24
completed: 2026-07-24
---

# TASK-003 — Add Upload Progress Indicator to Resume Component

## Context

**User Story**: US-001 — Secure Resume Upload via Presigned URL with Malware Scanning  
**Epic**: EP-003 — AI Resume Parsing  
**Addresses**: Scenario 1 (upload progress bar)

Enhance resume upload component with visual progress indicator during file upload. Shows upload percentage and status messages.

---

## Objective

Add upload progress tracking that:
1. Tracks upload progress via XMLHttpRequest
2. Displays progress bar (0-100%)
3. Shows status messages ("Requesting upload URL", "Uploading", "Scanning for malware")
4. Updates in real-time during upload
5. Handles completion and error states

---

## Implementation

### Enhanced useResumeUpload Hook

**File**: `frontend/src/hooks/useResumeUpload.ts`

```typescript
// Update uploadFile function to track progress
const uploadFile = useCallback(async (file: File) => {
  try {
    // ... existing validation code

    setUploadState({ status: 'requesting_url', progress: 10, error: null, resumeId: null });

    const { uploadUrl, resumeId } = await getPresignedUrl();

    // Upload with progress tracking
    setUploadState({ status: 'uploading', progress: 20, error: null, resumeId });

    await uploadWithProgress(uploadUrl, file, (progress) => {
      setUploadState(prev => ({ ...prev, progress: 20 + (progress * 0.7) })); // 20-90%
    });

    // Scanning phase
    setUploadState({ status: 'scanning', progress: 95, error: null, resumeId });

    // Poll for scan results
    await pollScanResults(resumeId);

    setUploadState({ status: 'success', progress: 100, error: null, resumeId });
  } catch (error) {
    // ... error handling
  }
}, [applicationId]);

function uploadWithProgress(
  url: string,
  file: File,
  onProgress: (progress: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) {
        const progress = (event.loaded / event.total);
        onProgress(progress);
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error('Upload failed'));
      }
    });

    xhr.addEventListener('error', () => reject(new Error('Upload failed')));

    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', file.type);
    xhr.send(file);
  });
}
```

### Progress Bar Component

**File**: `frontend/src/components/ProgressBar.tsx`

```typescript
export interface ProgressBarProps {
  progress: number;
  status: string;
}

export function ProgressBar({ progress, status }: ProgressBarProps) {
  return (
    <div style={{ width: '100%', marginBottom: '1rem' }} data-testid="progress-container">
      {/* Progress Bar */}
      <div
        style={{
          width: '100%',
          height: '8px',
          backgroundColor: '#e5e7eb',
          borderRadius: '4px',
          overflow: 'hidden',
          marginBottom: '0.5rem',
        }}
      >
        <div
          style={{
            width: `${progress}%`,
            height: '100%',
            backgroundColor: '#3b82f6',
            transition: 'width 0.3s ease',
          }}
          data-testid="progress-bar"
        />
      </div>

      {/* Status Text */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <p style={{ fontSize: '0.875rem', color: '#6b7280', margin: 0 }}>
          {status}
        </p>
        <p style={{ fontSize: '0.875rem', color: '#6b7280', margin: 0 }}>
          {Math.round(progress)}%
        </p>
      </div>
    </div>
  );
}
```

### Update ResumeUpload Component

```typescript
import { ProgressBar } from './ProgressBar';

// Inside ResumeUpload component:
{isUploading && (
  <ProgressBar
    progress={uploadState.progress}
    status={getStatusMessage(uploadState.status)}
  />
)}

function getStatusMessage(status: string): string {
  switch (status) {
    case 'validating':
      return 'Validating file...';
    case 'requesting_url':
      return 'Preparing upload...';
    case 'uploading':
      return 'Uploading file...';
    case 'scanning':
      return 'Scanning for malware...';
    default:
      return 'Processing...';
  }
}
```

---

## Acceptance Criteria

- [x] XMLHttpRequest used for upload with progress tracking
- [x] Progress bar displays 0-100% during upload
- [x] Status messages update based on upload phase
- [x] Progress bar smoothly animates (CSS transition)
- [x] ProgressBar component created
- [x] Integrated into ResumeUpload component
- [x] Progress shown during: validating, requesting URL, uploading, scanning

---

## Testing Requirements

- ✓ Progress bar renders during upload
- ✓ Progress percentage updates (mocked)
- ✓ Status message changes with upload phase
- ✓ Progress bar hidden on success/error

---

## Effort Estimate

**1 hour** — Standard progress indicator implementation
