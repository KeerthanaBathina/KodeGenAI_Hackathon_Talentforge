import prisma from '../db/prisma';
import { auditService } from './auditService';
import logger from '../utils/logger';
import type { ProfileData, WorkExperience, EducationEntry, ProfileCompletionStatus, OnboardingSection } from '../types/profile';

export class ProfileError extends Error {
    constructor(
        message: string,
        public code: 'PROFILE_NOT_FOUND' | 'PROFILE_ALREADY_EXISTS' | 'VALIDATION_ERROR' | 'CANDIDATE_NOT_FOUND'
    ) {
        super(message);
        this.name = 'ProfileError';
    }
}

const SECTION_WEIGHT = 20; // Each of 5 sections = 20%
const MIN_SKILLS_COUNT = 3;
const MIN_EDUCATION_COUNT = 1;
const MIN_WORK_HISTORY_COUNT = 1;

/**
 * Create a new profile for a candidate.
 * Initial completion is 0% with no sections completed.
 */
export async function createProfile(
    candidateId: string,
    profileData: Partial<ProfileData>,
    actorId?: string
): Promise<any> {
    // Verify candidate exists
    const candidate = await prisma.candidate.findUnique({
        where: { id: candidateId },
        select: { id: true, email: true },
    });

    if (!candidate) {
        throw new ProfileError('Candidate not found', 'CANDIDATE_NOT_FOUND');
    }

    // Check if profile already exists
    const existing = await prisma.profile.findUnique({
        where: { candidateId },
    });

    if (existing) {
        throw new ProfileError('Profile already exists for this candidate', 'PROFILE_ALREADY_EXISTS');
    }

    // Create profile with initial data
    const profile = await prisma.profile.create({
        data: {
            candidateId,
            fullName: profileData.fullName || '',
            experienceYears: profileData.experienceYears || 0,
            skills: profileData.skills || [],
            education: profileData.education || [],
            workHistory: profileData.workHistory || [],
            profileCompletionPercentage: 0,
            lastCompletedSection: null,
            rawParseJson: {},
        },
    });

    // Calculate initial completion
    const completion = await calculateProfileCompletion(candidateId);

    // Update completion percentage
    await prisma.profile.update({
        where: { id: profile.id },
        data: {
            profileCompletionPercentage: completion.percentage,
        },
    });

    // Audit log
    await auditService.logEvent({
        eventType: 'profile_created',
        actorId: actorId || candidateId,
        actorRole: actorId ? 'admin' : 'candidate',
        resourceType: 'profile',
        resourceId: profile.id,
        metadata: { candidateId, initialCompletion: completion.percentage },
    });

    logger.info({ candidateId, profileId: profile.id }, 'Profile created');

    return { ...profile, completionStatus: completion };
}

/**
 * Get profile by candidate ID with completion status.
 */
export async function getProfileByCandidate(candidateId: string): Promise<any | null> {
    const profile = await prisma.profile.findUnique({
        where: { candidateId },
    });

    if (!profile) {
        return null;
    }

    const completion = await calculateProfileCompletion(candidateId);

    return { ...profile, completionStatus: completion };
}

/**
 * Update profile fields and recalculate completion.
 * Supports partial updates for any profile section.
 */
export async function updateProfile(
    candidateId: string,
    updates: Partial<ProfileData>,
    actorId?: string,
    ipAddress?: string
): Promise<any> {
    const existing = await prisma.profile.findUnique({
        where: { candidateId },
    });

    if (!existing) {
        throw new ProfileError('Profile not found', 'PROFILE_NOT_FOUND');
    }

    // Validate updates
    if (updates.skills && updates.skills.length === 0) {
        logger.warn({ candidateId }, 'Attempted to clear all skills');
    }

    // Apply updates
    const updatedProfile = await prisma.profile.update({
        where: { candidateId },
        data: {
            ...(updates.fullName !== undefined && { fullName: updates.fullName }),
            ...(updates.experienceYears !== undefined && { experienceYears: updates.experienceYears }),
            ...(updates.skills !== undefined && { skills: updates.skills }),
            ...(updates.education !== undefined && { education: updates.education as any }),
            ...(updates.workHistory !== undefined && { workHistory: updates.workHistory as any }),
            editedById: actorId,
            editedAt: new Date(),
        },
    });

    // Recalculate completion
    const completion = await calculateProfileCompletion(candidateId);

    // Update completion percentage
    await prisma.profile.update({
        where: { id: updatedProfile.id },
        data: {
            profileCompletionPercentage: completion.percentage,
            lastCompletedSection: completion.completedSections[completion.completedSections.length - 1] || null,
        },
    });

    // Audit log
    await auditService.logEvent({
        eventType: 'profile_updated',
        actorId: actorId || candidateId,
        actorRole: actorId ? 'admin' : 'candidate',
        resourceType: 'profile',
        resourceId: updatedProfile.id,
        metadata: {
            candidateId,
            updatedFields: Object.keys(updates),
            newCompletion: completion.percentage,
        },
        ipAddress,
    });

    logger.info({ candidateId, profileId: updatedProfile.id, completion: completion.percentage }, 'Profile updated');

    return { ...updatedProfile, completionStatus: completion };
}

/**
 * Delete profile (soft delete by setting deletedAt or cascade).
 */
export async function deleteProfile(candidateId: string, actorId: string): Promise<boolean> {
    const profile = await prisma.profile.findUnique({
        where: { candidateId },
    });

    if (!profile) {
        throw new ProfileError('Profile not found', 'PROFILE_NOT_FOUND');
    }

    await prisma.profile.delete({
        where: { candidateId },
    });

    // Audit log
    await auditService.logEvent({
        eventType: 'profile_deleted',
        actorId,
        actorRole: 'admin',
        resourceType: 'profile',
        resourceId: profile.id,
        metadata: { candidateId },
    });

    logger.info({ candidateId, profileId: profile.id }, 'Profile deleted');

    return true;
}

/**
 * Calculate profile completion percentage and completed sections.
 * Checks: basic info, skills (≥3), education (≥1), work history (≥1), privacy consent
 */
export async function calculateProfileCompletion(candidateId: string): Promise<ProfileCompletionStatus> {
    const profile = await prisma.profile.findUnique({
        where: { candidateId },
        select: {
            fullName: true,
            experienceYears: true,
            skills: true,
            education: true,
            workHistory: true,
        },
    });

    if (!profile) {
        return {
            completedSections: [],
            percentage: 0,
            missingFields: ['Profile not created'],
        };
    }

    // Check privacy consent
    const consent = await prisma.privacyConsent.findFirst({
        where: {
            candidateId,
            revokedAt: null,
        },
    });

    const completedSections: OnboardingSection[] = [];
    const missingFields: string[] = [];

    // Basic Info (fullName, experienceYears)
    if (profile.fullName && profile.fullName.trim().length > 0 && profile.experienceYears >= 0) {
        completedSections.push('basic_info' as OnboardingSection);
    } else {
        if (!profile.fullName || profile.fullName.trim().length === 0) missingFields.push('Full Name');
        if (profile.experienceYears < 0) missingFields.push('Experience Years');
    }

    // Skills (at least 3)
    if (profile.skills && profile.skills.length >= MIN_SKILLS_COUNT) {
        completedSections.push('skills' as OnboardingSection);
    } else {
        missingFields.push(`Skills (minimum ${MIN_SKILLS_COUNT})`);
    }

    // Education (at least 1 entry)
    const educationArray = Array.isArray(profile.education) ? profile.education : [];
    if (educationArray.length >= MIN_EDUCATION_COUNT) {
        completedSections.push('education' as OnboardingSection);
    } else {
        missingFields.push(`Education (minimum ${MIN_EDUCATION_COUNT} entry)`);
    }

    // Work History (at least 1 entry)
    const workHistoryArray = Array.isArray(profile.workHistory) ? profile.workHistory : [];
    if (workHistoryArray.length >= MIN_WORK_HISTORY_COUNT) {
        completedSections.push('work_history' as OnboardingSection);
    } else {
        missingFields.push(`Work History (minimum ${MIN_WORK_HISTORY_COUNT} entry)`);
    }

    // Privacy Consent
    if (consent) {
        completedSections.push('privacy_consent' as OnboardingSection);
    } else {
        missingFields.push('Privacy Consent');
    }

    const percentage = completedSections.length * SECTION_WEIGHT;

    return {
        completedSections,
        percentage,
        missingFields,
    };
}

/**
 * Get aggregated profile completion status.
 * Returns profile data + completion status + consent state.
 */
export async function getCompletionStatus(candidateId: string): Promise<ProfileCompletionStatus> {
    return calculateProfileCompletion(candidateId);
}
