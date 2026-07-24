import { useState, useCallback } from 'react';

interface UploadState {
    status: 'idle' | 'validating' | 'requesting_url' | 'uploading' | 'scanning' | 'success' | 'error';
    progress: number;
    error: string | null;
    resumeId: string | null;
}

interface UseResumeUploadParams {
    applicationId: string;
    onSuccess?: (resumeId: string) => void;
    onError?: (error: string) => void;
}

const ALLOWED_TYPES = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];
const MAX_FILE_SIZE_MB = 10;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

function getApiUrl(pathname: string): string {
    const base = process.env.NEXT_PUBLIC_API_URL?.trim() ?? '';
    if (!base || (typeof window !== 'undefined' && window.location.hostname === '127.0.0.1')) {
        return pathname;
    }
    return `${base}${pathname}`;
}

function uploadWithProgress(
    url: string,
    file: File,
    onProgress: (progress: number) => void
): Promise<void> {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        xhr.upload.addEventListener('progress', (event) => {
            if (event.lengthComputable) {
                const progress = event.loaded / event.total;
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

    const uploadFile = useCallback(
        async (file: File) => {
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

                // Upload file to Supabase Storage with progress tracking
                setUploadState({ status: 'uploading', progress: 20, error: null, resumeId });

                await uploadWithProgress(uploadUrl, file, (progress) => {
                    setUploadState((prev) => ({ ...prev, progress: 20 + progress * 70 })); // 20-90%
                });

                // Scanning phase
                setUploadState({ status: 'scanning', progress: 95, error: null, resumeId });

                // Simulate scan completion (in real scenario, would poll or use websocket)
                await new Promise((resolve) => setTimeout(resolve, 1000));

                setUploadState({ status: 'success', progress: 100, error: null, resumeId });
                onSuccess?.(resumeId);
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Upload failed';
                setUploadState({ status: 'error', progress: 0, error: errorMessage, resumeId: null });
                onError?.(errorMessage);
            }
        },
        [applicationId, validateFile, onSuccess, onError]
    );

    const reset = useCallback(() => {
        setUploadState({ status: 'idle', progress: 0, error: null, resumeId: null });
    }, []);

    return {
        uploadState,
        uploadFile,
        reset,
    };
}
