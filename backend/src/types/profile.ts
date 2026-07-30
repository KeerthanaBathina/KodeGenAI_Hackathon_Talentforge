export interface WorkExperience {
    company: string;
    title: string;
    startDate: string; // ISO 8601
    endDate?: string | null;
    description?: string;
    isCurrent: boolean;
}

export interface EducationEntry {
    institution: string;
    degree: string;
    fieldOfStudy?: string;
    startDate: string;
    endDate?: string | null;
    isCurrent: boolean;
}

export interface ProfileData {
    fullName: string;
    experienceYears: number;
    skills: string[];
    education: EducationEntry[];
    workHistory: WorkExperience[];
}

export enum OnboardingSection {
    BASIC_INFO = 'basic_info',
    SKILLS = 'skills',
    EDUCATION = 'education',
    WORK_HISTORY = 'work_history',
    PRIVACY_CONSENT = 'privacy_consent',
}

export interface ProfileCompletionStatus {
    completedSections: OnboardingSection[];
    percentage: number;
    missingFields: string[];
}
