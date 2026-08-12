import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/authenticate';
import * as profileService from '../services/profileService';
import { validateProfileData } from '../utils/profileValidator';
import logger from '../utils/logger';

const router = Router();

const MONTH_OR_DATE_REGEX = /^\d{4}-\d{2}(?:-\d{2})?$/;

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function trimString(value: unknown): string | undefined {
    if (typeof value !== 'string') {
        return undefined;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
}

function trimNullableString(value: unknown): string | null | undefined {
    if (value === null) {
        return null;
    }

    return trimString(value);
}

function normalizeMonthOrDate(value: unknown): string | null | undefined {
    const normalized = trimString(value);
    if (!normalized) {
        return undefined;
    }

    return isValidMonthOrDate(normalized) ? normalized : null;
}

function isValidMonthOrDate(value: string | undefined): boolean {
    return typeof value === 'string' && MONTH_OR_DATE_REGEX.test(value);
}

function isBlankEducationEntry(entry: Record<string, unknown>): boolean {
    return !trimString(entry.institution)
        && !trimString(entry.degree)
        && !trimString(entry.fieldOfStudy)
        && !trimString(entry.startDate)
        && !trimString(entry.endDate)
        && typeof entry.isCurrent !== 'boolean';
}

function isBlankWorkHistoryEntry(entry: Record<string, unknown>): boolean {
    return !trimString(entry.company)
        && !trimString(entry.title)
        && !trimString(entry.startDate)
        && !trimString(entry.endDate)
        && !trimString(entry.description)
        && typeof entry.isCurrent !== 'boolean';
}

function normalizeProfilePayload(body: unknown): unknown {
    if (!isRecord(body)) {
        return body;
    }

    const education = Array.isArray(body.education)
        ? body.education
              .filter(isRecord)
              .filter((entry) => !isBlankEducationEntry(entry))
              .map((entry) => ({
                  institution: trimString(entry.institution),
                  degree: trimString(entry.degree),
                  fieldOfStudy: trimString(entry.fieldOfStudy),
                  startDate: trimString(entry.startDate),
                  endDate: normalizeMonthOrDate(entry.endDate),
                  isCurrent: Boolean(entry.isCurrent),
              }))
              .filter(
                  (entry): entry is {
                      institution: string;
                      degree: string;
                      fieldOfStudy: string | undefined;
                      startDate: string;
                      endDate: string | null | undefined;
                      isCurrent: boolean;
                  } =>
                      Boolean(entry.institution) &&
                      Boolean(entry.degree) &&
                      isValidMonthOrDate(entry.startDate)
              )
        : body.education;

    const workHistory = Array.isArray(body.workHistory)
        ? body.workHistory
              .filter(isRecord)
              .filter((entry) => !isBlankWorkHistoryEntry(entry))
              .map((entry) => ({
                  company: trimString(entry.company),
                  title: trimString(entry.title),
                  startDate: trimString(entry.startDate),
                  endDate: normalizeMonthOrDate(entry.endDate),
                  description: trimString(entry.description),
                  isCurrent: Boolean(entry.isCurrent),
              }))
              .filter(
                  (entry): entry is {
                      company: string;
                      title: string;
                      startDate: string;
                      endDate: string | null | undefined;
                      description: string | undefined;
                      isCurrent: boolean;
                  } => Boolean(entry.company) && Boolean(entry.title) && isValidMonthOrDate(entry.startDate)
              )
        : body.workHistory;

    const skills = Array.isArray(body.skills)
        ? body.skills.filter((skill): skill is string => typeof skill === 'string').map((skill) => skill.trim()).filter((skill) => skill.length > 0)
        : body.skills;

    return {
        ...body,
        fullName: trimString(body.fullName),
        experienceYears:
            typeof body.experienceYears === 'string' && body.experienceYears.trim().length > 0
                ? Number(body.experienceYears)
                : body.experienceYears,
        skills,
        education,
        workHistory,
    };
}

function formatValidationIssues(issues: Array<{ path: Array<PropertyKey>; message: string }>): string[] {
    return issues.map((issue) => {
        const path = issue.path.length > 0 ? `${issue.path.map((part) => String(part)).join('.')}: ` : '';
        return `${path}${issue.message}`;
    });
}

function summarizeProfilePayload(payload: unknown): Record<string, unknown> {
    if (!isRecord(payload)) {
        return { payloadType: typeof payload };
    }

    return {
        hasFullName: typeof payload.fullName === 'string' && payload.fullName.trim().length > 0,
        experienceYearsType: typeof payload.experienceYears,
        skillsCount: Array.isArray(payload.skills) ? payload.skills.length : null,
        educationCount: Array.isArray(payload.education) ? payload.education.length : null,
        workHistoryCount: Array.isArray(payload.workHistory) ? payload.workHistory.length : null,
    };
}

// Validation schemas
const WorkExperienceSchema = z.object({
    company: z.string().min(1),
    title: z.string().min(1),
    startDate: z.string().regex(MONTH_OR_DATE_REGEX),
    endDate: z.string().regex(MONTH_OR_DATE_REGEX).nullable().optional(),
    description: z.string().optional(),
    isCurrent: z.boolean(),
});

const EducationSchema = z.object({
    institution: z.string().min(1),
    degree: z.string().min(1),
    fieldOfStudy: z.string().optional(),
    startDate: z.string().regex(MONTH_OR_DATE_REGEX),
    endDate: z.string().regex(MONTH_OR_DATE_REGEX).nullable().optional(),
    isCurrent: z.boolean(),
});

const ProfileDataSchema = z.object({
    fullName: z.string().min(1).max(255).optional(),
    experienceYears: z.number().int().min(0).max(50).optional(),
    skills: z.array(z.string().min(1)).optional(),
    education: z.array(EducationSchema).optional(),
    workHistory: z.array(WorkExperienceSchema).optional(),
});

/**
 * GET /api/profile
 * Get authenticated candidate's profile with completion status
 */
router.get('/', authenticate, async (req, res) => {
    try {
        const candidateId = req.user!.id;

        const profile = await profileService.getProfileByCandidate(candidateId);

        if (!profile) {
            return res.status(404).json({
                error: {
                    code: 'PROFILE_NOT_FOUND',
                    message: 'Profile not found for this candidate',
                },
            });
        }

        return res.status(200).json(profile);
    } catch (error) {
        logger.error({ error }, 'Error fetching profile');
        return res.status(500).json({
            error: {
                code: 'INTERNAL_ERROR',
                message: 'Unable to fetch profile',
            },
        });
    }
});

/**
 * POST /api/profile
 * Create profile for authenticated candidate
 */
router.post('/', authenticate, async (req, res) => {
    try {
        const candidateId = req.user!.id;
        const normalizedBody = normalizeProfilePayload(req.body);

        // Validate input
        const validation = ProfileDataSchema.safeParse(normalizedBody);
        if (!validation.success) {
            const details = formatValidationIssues(validation.error.issues);
            logger.warn(
                {
                    candidateId,
                    details,
                    payloadSummary: summarizeProfilePayload(normalizedBody),
                },
                'Profile POST validation failed'
            );

            return res.status(400).json({
                error: {
                    code: 'VALIDATION_ERROR',
                    message: 'Invalid profile data',
                    details,
                },
            });
        }

        // Additional validation
        const profileValidation = validateProfileData(validation.data);
        if (!profileValidation.valid) {
            return res.status(400).json({
                error: {
                    code: 'VALIDATION_ERROR',
                    message: 'Profile validation failed',
                    details: profileValidation.errors,
                },
            });
        }

        const profile = await profileService.createProfile(candidateId, validation.data, candidateId, req.user!.role);

        return res.status(201).json(profile);
    } catch (error: any) {
        if (error.name === 'ProfileError' && error.code === 'PROFILE_ALREADY_EXISTS') {
            return res.status(409).json({
                error: {
                    code: error.code,
                    message: error.message,
                },
            });
        }

        logger.error({ error }, 'Error creating profile');
        return res.status(500).json({
            error: {
                code: 'INTERNAL_ERROR',
                message: 'Unable to create profile',
            },
        });
    }
});

/**
 * PUT /api/profile
 * Update profile fields (partial updates supported)
 */
router.put('/', authenticate, async (req, res) => {
    try {
        const candidateId = req.user!.id;
        const ipAddress = req.ip;
        const normalizedBody = normalizeProfilePayload(req.body);

        // Validate input
        const validation = ProfileDataSchema.safeParse(normalizedBody);
        if (!validation.success) {
            const details = formatValidationIssues(validation.error.issues);
            logger.warn(
                {
                    candidateId,
                    details,
                    payloadSummary: summarizeProfilePayload(normalizedBody),
                },
                'Profile PUT validation failed'
            );

            return res.status(400).json({
                error: {
                    code: 'VALIDATION_ERROR',
                    message: 'Invalid profile data',
                    details,
                },
            });
        }

        const profile = await profileService.updateProfile(candidateId, validation.data, candidateId, req.user!.role, ipAddress);

        return res.status(200).json(profile);
    } catch (error: any) {
        if (error.name === 'ProfileError' && error.code === 'PROFILE_NOT_FOUND') {
            return res.status(404).json({
                error: {
                    code: error.code,
                    message: error.message,
                },
            });
        }

        logger.error({ error }, 'Error updating profile');
        return res.status(500).json({
            error: {
                code: 'INTERNAL_ERROR',
                message: 'Unable to update profile',
            },
        });
    }
});

/**
 * GET /api/profile/completion
 * Get profile completion status only
 */
router.get('/completion', authenticate, async (req, res) => {
    try {
        const candidateId = req.user!.id;

        const completionStatus = await profileService.getCompletionStatus(candidateId);

        return res.status(200).json(completionStatus);
    } catch (error) {
        logger.error({ error }, 'Error fetching completion status');
        return res.status(500).json({
            error: {
                code: 'INTERNAL_ERROR',
                message: 'Unable to fetch completion status',
            },
        });
    }
});

export default router;
