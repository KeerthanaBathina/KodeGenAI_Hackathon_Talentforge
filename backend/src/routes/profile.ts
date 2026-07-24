import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/authenticate';
import * as profileService from '../services/profileService';
import { validateProfileData } from '../utils/profileValidator';
import logger from '../utils/logger';

const router = Router();

// Validation schemas
const WorkExperienceSchema = z.object({
    company: z.string().min(1),
    title: z.string().min(1),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    description: z.string().optional(),
    isCurrent: z.boolean(),
});

const EducationSchema = z.object({
    institution: z.string().min(1),
    degree: z.string().min(1),
    fieldOfStudy: z.string().optional(),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
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

        // Validate input
        const validation = ProfileDataSchema.safeParse(req.body);
        if (!validation.success) {
            return res.status(400).json({
                error: {
                    code: 'VALIDATION_ERROR',
                    message: 'Invalid profile data',
                    details: validation.error.errors,
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

        const profile = await profileService.createProfile(candidateId, validation.data, candidateId);

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

        // Validate input
        const validation = ProfileDataSchema.safeParse(req.body);
        if (!validation.success) {
            return res.status(400).json({
                error: {
                    code: 'VALIDATION_ERROR',
                    message: 'Invalid profile data',
                    details: validation.error.errors,
                },
            });
        }

        const profile = await profileService.updateProfile(candidateId, validation.data, candidateId, ipAddress);

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
