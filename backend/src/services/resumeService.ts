import { createClient } from '@supabase/supabase-js';
import prisma from '../db/prisma';
import { env } from '../config/env';
import logger from '../utils/logger';

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const ALLOWED_MIME_TYPES = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];
const MAX_FILE_SIZE_MB = 10;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
const PRESIGNED_URL_EXPIRY_SECONDS = 300; // 5 minutes

export interface GeneratePresignedUrlParams {
    candidateId: string;
    applicationId: string;
    fileName: string;
    fileSize: number;
    mimeType: string;
}

export interface GeneratePresignedUrlResult {
    uploadUrl: string;
    storageKey: string;
    resumeId: string;
    expiresIn: number;
}

export class ResumeUploadError extends Error {
    constructor(
        public code: string,
        message: string
    ) {
        super(message);
        this.name = 'ResumeUploadError';
    }
}

export async function generatePresignedUrl(
    params: GeneratePresignedUrlParams
): Promise<GeneratePresignedUrlResult> {
    const { candidateId, applicationId, fileName, fileSize, mimeType } = params;

    // Validate file type
    if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
        throw new ResumeUploadError(
            'INVALID_FILE_TYPE',
            'Only PDF and DOCX files are accepted'
        );
    }

    // Validate file size
    if (fileSize > MAX_FILE_SIZE_BYTES) {
        throw new ResumeUploadError(
            'FILE_TOO_LARGE',
            `File size must not exceed ${MAX_FILE_SIZE_MB} MB`
        );
    }

    // Generate unique storage key
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 15);
    const fileExtension = fileName.split('.').pop();
    const storageKey = `resumes/${candidateId}/${timestamp}-${randomSuffix}.${fileExtension}`;

    // Create pending Resume record
    const resume = await prisma.resume.create({
        data: {
            applicationId,
            storageKey,
            fileName,
            fileSize,
            mimeType,
            scanStatus: 'pending',
        },
    });

    // Generate presigned URL for upload
    const { data: uploadData, error } = await supabase.storage
        .from('resumes')
        .createSignedUploadUrl(storageKey, {
            upsert: false,
        });

    if (error || !uploadData) {
        logger.error('Failed to generate presigned URL', { error, storageKey });
        throw new ResumeUploadError('PRESIGNED_URL_FAILED', 'Failed to generate upload URL');
    }

    logger.info('Presigned URL generated', {
        resumeId: resume.id,
        candidateId,
        applicationId,
        storageKey,
    });

    return {
        uploadUrl: uploadData.signedUrl,
        storageKey,
        resumeId: resume.id,
        expiresIn: PRESIGNED_URL_EXPIRY_SECONDS,
    };
}
