import type { ProfileData, WorkExperience, EducationEntry } from '../types/profile';

export interface ValidationResult {
    valid: boolean;
    errors: string[];
}

export function validateProfileData(data: Partial<ProfileData>): ValidationResult {
    const errors: string[] = [];

    if (data.fullName !== undefined) {
        if (data.fullName.trim().length === 0) {
            errors.push('Full name cannot be empty');
        }
        if (data.fullName.length > 255) {
            errors.push('Full name must be 255 characters or less');
        }
    }

    if (data.experienceYears !== undefined) {
        if (data.experienceYears < 0 || data.experienceYears > 50) {
            errors.push('Experience years must be between 0 and 50');
        }
    }

    if (data.skills !== undefined) {
        if (!Array.isArray(data.skills)) {
            errors.push('Skills must be an array');
        } else if (data.skills.some((s) => typeof s !== 'string' || s.trim().length === 0)) {
            errors.push('All skills must be non-empty strings');
        }
    }

    if (data.education !== undefined) {
        if (!Array.isArray(data.education)) {
            errors.push('Education must be an array');
        } else {
            data.education.forEach((edu, index) => {
                if (!edu.institution || !edu.degree) {
                    errors.push(`Education entry ${index + 1}: institution and degree are required`);
                }
            });
        }
    }

    if (data.workHistory !== undefined) {
        if (!Array.isArray(data.workHistory)) {
            errors.push('Work history must be an array');
        } else {
            data.workHistory.forEach((work, index) => {
                if (!work.company || !work.title || !work.startDate) {
                    errors.push(`Work history entry ${index + 1}: company, title, and startDate are required`);
                }
            });
        }
    }

    return {
        valid: errors.length === 0,
        errors,
    };
}
