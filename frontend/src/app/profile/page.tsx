'use client';

import React, { useState, useEffect, FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { buildApiUrl } from '@/lib/api/url';
import CandidateTopNav from '@/components/CandidateTopNav';
import { ResumeUpload } from '@/components/ResumeUpload';

interface EducationEntry {
    institution: string;
    degree: string;
    fieldOfStudy?: string;
    startDate: string;
    endDate?: string;
    isCurrent: boolean;
}

interface WorkExperience {
    company: string;
    title: string;
    startDate: string;
    endDate?: string;
    description?: string;
    isCurrent: boolean;
}

interface CompletionStatus {
    completedSections: string[];
    percentage: number;
    missingFields: string[];
}

interface OpenRequisitionOption {
    id: string;
    title: string;
    department: string;
    location: string;
}

type ResumeParsePopulationStatus = 'pending_consent' | 'pending_profile_sync' | 'applied';

interface ResumeParseMergeSummary {
    source?: string;
    appliedAt?: string;
    createdProfile?: boolean;
    populatedFields?: string[];
    addedSkillsCount?: number;
    totalSkills?: number;
    importedEducationEntries?: number;
    importedWorkHistoryEntries?: number;
    importedExperienceYears?: boolean;
    importedFullName?: boolean;
}

interface ResumeStateSnapshot {
    id: string;
    scanStatus: 'pending' | 'clean' | 'infected';
    parsedData?: {
        name?: string;
        skills?: string[];
        experience_years?: number;
        employers?: Array<{
            name?: string;
            title?: string;
            duration?: string;
        }>;
        education?: Array<{
            degree?: string;
            field?: string;
            institution?: string;
        }>;
    } | null;
    parsePopulationStatus?: ResumeParsePopulationStatus | null;
    parseMergeSummary?: ResumeParseMergeSummary | null;
}

interface CandidateApplicationSnapshot {
    id: string;
    resume?: ResumeStateSnapshot | null;
}

const DEFAULT_IMPORTED_START_DATE = '2000-01-01';

function normalizeMonthPrecision(value?: string | null): string {
    const normalized = (value || '').trim();
    if (!normalized) {
        return '';
    }

    const monthMatch = normalized.match(/^(\d{4}-\d{2})/);
    return monthMatch ? monthMatch[1] : '';
}

function normalizeNullableMonth(value?: string | null): string | null {
    const normalized = normalizeMonthPrecision(value);
    return normalized.length > 0 ? normalized : null;
}

    function isNonEmptyText(value?: string | null): boolean {
        return typeof value === 'string' && value.trim().length > 0;
    }

function normalizeOptionalDate(value?: string): string | null {
    const normalized = value?.trim();
    return normalized ? normalized : null;
}

function getInternalRedirectByRole(role: string | null): string | null {
    if (!role || role === 'candidate') {
        return null;
    }

    const roleRedirectMap: Record<string, string> = {
        hr_reviewer: '/hr/dashboard',
        hr_manager: '/hr/dashboard',
        admin: '/admin/health',
    };

    return roleRedirectMap[role] ?? null;
}

function getInternalRedirectByEmail(email: string | null): string | null {
    if (!email) {
        return null;
    }

    const emailRedirectMap: Record<string, string> = {
        'hr-reviewer@dev.local': '/hr/dashboard',
        'hr-manager@dev.local': '/hr/dashboard',
        'admin@dev.local': '/admin/health',
    };

    return emailRedirectMap[email.trim().toLowerCase()] ?? null;
}

function shouldApplyEmailFallback(role: string | null): boolean {
    // Email fallback is only for legacy sessions where role is not yet available.
    return !role;
}

export default function ProfilePage() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    const [profileExists, setProfileExists] = useState(false);
    const [completionPercentage, setCompletionPercentage] = useState(0);
    const [completionStatus, setCompletionStatus] = useState<CompletionStatus | null>(null);

    // Form state
    const [fullName, setFullName] = useState('');
    const [experienceYears, setExperienceYears] = useState(0);
    const [skills, setSkills] = useState<string[]>([]);
    const [skillInput, setSkillInput] = useState('');
    const [education, setEducation] = useState<EducationEntry[]>([]);
    const [workHistory, setWorkHistory] = useState<WorkExperience[]>([]);
    const [openRequisitions, setOpenRequisitions] = useState<OpenRequisitionOption[]>([]);
    const [selectedResumeRequisitionId, setSelectedResumeRequisitionId] = useState('');
    const [resumeUploadApplicationId, setResumeUploadApplicationId] = useState<string | null>(null);
    const [initializingResumeUpload, setInitializingResumeUpload] = useState(false);
    const [resumeContextError, setResumeContextError] = useState<string | null>(null);
    const [resumeScanStatus, setResumeScanStatus] = useState<'none' | 'pending' | 'clean' | 'infected'>('none');
    const [resumeParsedSkillsCount, setResumeParsedSkillsCount] = useState(0);
    const [isResumeParsed, setIsResumeParsed] = useState(false);
    const [resumePopulationStatus, setResumePopulationStatus] = useState<
        ResumeParsePopulationStatus | 'none'
    >('none');
    const [resumeMergeSummary, setResumeMergeSummary] = useState<ResumeParseMergeSummary | null>(
        null
    );
    const [lastAutoFilledResumeId, setLastAutoFilledResumeId] = useState<string | null>(null);

    function normalizeSkill(skill: string): string {
        return skill.trim().toLowerCase();
    }

    function dedupeSkills(values: string[]): string[] {
        const output: string[] = [];
        const seen = new Set<string>();

        for (const value of values) {
            const trimmed = value.trim();
            if (!trimmed) {
                continue;
            }

            const key = normalizeSkill(trimmed);
            if (seen.has(key)) {
                continue;
            }

            seen.add(key);
            output.push(trimmed);
        }

        return output;
    }

    function toDateFromYear(year: number, isEndDate: boolean): string {
        return `${year}-${isEndDate ? '12' : '01'}`;
    }

    function parseDuration(duration?: string): {
        startDate: string;
        endDate?: string;
        isCurrent: boolean;
    } {
        const value = (duration || '').trim().toLowerCase();
        const isCurrent = /present|current|now/.test(value);
        const years = (value.match(/\b(19|20)\d{2}\b/g) || [])
            .map((year) => Number.parseInt(year, 10))
            .filter((year) => Number.isFinite(year));

        const startYear = years[0];
        const endYear = years[1];

        return {
            startDate:
                typeof startYear === 'number'
                    ? toDateFromYear(startYear, false)
                    : DEFAULT_IMPORTED_START_DATE,
            endDate:
                !isCurrent && typeof endYear === 'number'
                    ? toDateFromYear(endYear, true)
                    : undefined,
            isCurrent,
        };
    }

    function autoFillFromParsedData(parsedData?: ResumeStateSnapshot['parsedData']): void {
        if (!parsedData || typeof parsedData !== 'object') {
            return;
        }

        const parsedName = typeof parsedData.name === 'string' ? parsedData.name.trim() : '';
        if (parsedName.length > 0) {
            setFullName(parsedName);
        }

        if (
            typeof parsedData.experience_years === 'number' &&
            Number.isFinite(parsedData.experience_years) &&
            parsedData.experience_years > 0 &&
            experienceYears <= 0
        ) {
            setExperienceYears(Math.floor(parsedData.experience_years));
        }

        if (Array.isArray(parsedData.skills) && parsedData.skills.length > 0) {
            setSkills((currentSkills) => dedupeSkills([...currentSkills, ...parsedData.skills!]));
        }

        if (education.length === 0 && Array.isArray(parsedData.education) && parsedData.education.length > 0) {
            const mappedEducation = parsedData.education
                .map((entry) => {
                    const institution = typeof entry?.institution === 'string' ? entry.institution.trim() : '';
                    const degree = typeof entry?.degree === 'string' ? entry.degree.trim() : '';
                    const fieldOfStudy = typeof entry?.field === 'string' ? entry.field.trim() : '';

                    if (!institution && !degree && !fieldOfStudy) {
                        return null;
                    }

                    return {
                        institution: institution || 'Institution',
                        degree: degree || 'Degree',
                        fieldOfStudy,
                        startDate: normalizeMonthPrecision(DEFAULT_IMPORTED_START_DATE),
                        endDate: '',
                        isCurrent: false,
                    } as EducationEntry;
                })
                .filter((entry): entry is EducationEntry => entry !== null);

            if (mappedEducation.length > 0) {
                setEducation(mappedEducation);
            }
        }

        if (workHistory.length === 0 && Array.isArray(parsedData.employers) && parsedData.employers.length > 0) {
            const mappedWorkHistory = parsedData.employers
                .map((entry) => {
                    const company = typeof entry?.name === 'string' ? entry.name.trim() : '';
                    const title = typeof entry?.title === 'string' ? entry.title.trim() : '';
                    const description = typeof entry?.duration === 'string' ? entry.duration.trim() : '';

                    if (!company && !title) {
                        return null;
                    }

                    const duration = parseDuration(entry?.duration);

                    return {
                        company: company || 'Employer',
                        title: title || 'Role',
                        startDate: duration.startDate,
                        endDate: duration.isCurrent ? '' : duration.endDate || '',
                        description,
                        isCurrent: duration.isCurrent,
                    } as WorkExperience;
                })
                .filter((entry): entry is WorkExperience => entry !== null);

            if (mappedWorkHistory.length > 0) {
                setWorkHistory(mappedWorkHistory);
            }
        }
    }

    function buildAuthHeaders(): Record<string, string> {
        if (typeof window === 'undefined') {
            return {};
        }

        const role = localStorage.getItem('auth_role');
        if (role && role !== 'candidate') {
            return {};
        }

        const token = localStorage.getItem('auth_token');
        return token ? { Authorization: `Bearer ${token}` } : {};
    }

    function applyResumeStateSnapshot(application: CandidateApplicationSnapshot | null): void {
        setResumeUploadApplicationId(application?.id ?? null);

        const resume = application?.resume;

        if (!resume?.id) {
            setResumeScanStatus('none');
            setIsResumeParsed(false);
            setResumeParsedSkillsCount(0);
            setResumePopulationStatus('none');
            setResumeMergeSummary(null);
            setLastAutoFilledResumeId(null);
            return;
        }

        const parsedSkills = Array.isArray(resume.parsedData?.skills)
            ? resume.parsedData.skills.filter(
                  (skill): skill is string => typeof skill === 'string' && skill.trim().length > 0
              )
            : [];

        setResumeScanStatus(resume.scanStatus ?? 'pending');
        setIsResumeParsed(Boolean(resume.parsedData));
        setResumeParsedSkillsCount(parsedSkills.length);
        setResumePopulationStatus(resume.parsePopulationStatus ?? 'none');
        setResumeMergeSummary(resume.parseMergeSummary ?? null);

        if (resume.parsedData && lastAutoFilledResumeId !== resume.id) {
            autoFillFromParsedData(resume.parsedData);
            setLastAutoFilledResumeId(resume.id);
        }
    }

    function getResumeSyncStatusMessage(): string {
        if (resumeScanStatus === 'infected') {
            return 'Resume failed security scan. Upload a clean file to continue.';
        }

        if (resumeScanStatus === 'pending') {
            return 'Resume uploaded. Security scan and AI extraction are in progress.';
        }

        if (resumeScanStatus !== 'clean') {
            return 'Upload your resume to start security scan and AI extraction.';
        }

        if (!isResumeParsed) {
            return 'Resume passed security scan. AI extraction is still in progress.';
        }

        if (resumePopulationStatus === 'pending_consent') {
            return 'Resume parsing is complete, but profile population is paused until privacy consent is accepted.';
        }

        if (resumePopulationStatus === 'pending_profile_sync') {
            return 'Resume parsing is complete. Applying extracted skills and profile details now.';
        }

        if (resumeParsedSkillsCount > 0) {
            return `Resume parsed successfully. ${resumeParsedSkillsCount} skills were extracted and synced to your profile.`;
        }

        return 'Resume parsed successfully, but no skills were detected. You can add skills manually below.';
    }

    async function syncResumeStateForRequisition(requisitionId: string): Promise<boolean> {
        const response = await fetch(buildApiUrl(`/api/applications/by-requisition/${requisitionId}`), {
            credentials: 'include',
            headers: buildAuthHeaders(),
        });

        if (response.status === 404) {
            applyResumeStateSnapshot(null);
            return false;
        }

        if (!response.ok) {
            throw new Error('Unable to refresh resume status');
        }

        const application: CandidateApplicationSnapshot = await response.json();
        applyResumeStateSnapshot(application);
        return true;
    }

    async function initializeResumeDraftForRequisition(requisitionId: string): Promise<void> {
        if (!requisitionId) {
            throw new Error('Unable to prepare resume upload because no open requisition is available.');
        }

        const response = await fetch(buildApiUrl('/api/applications/drafts'), {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
                ...buildAuthHeaders(),
            },
            body: JSON.stringify({
                requisitionId,
                draftData: {
                    step1_personal: {
                        fullName,
                    },
                    step2_experience: {
                        yearsExperience: experienceYears,
                    },
                    step3_coverLetter: {
                        coverLetter: '',
                    },
                    resumeSetupOnly: true,
                    currentStep: 4,
                },
            }),
        });

        if (!response.ok) {
            const errorBody = await response.json().catch(() => null);
            throw new Error(errorBody?.error?.message || 'Unable to initialize resume upload draft');
        }

        const payload = await response.json();
        if (!payload?.id || typeof payload.id !== 'string') {
            throw new Error('Resume upload draft did not return an application ID');
        }

        setResumeUploadApplicationId(payload.id);
        await syncResumeStateForRequisition(requisitionId);
    }

    async function ensureResumeUploadContext(requisitionId: string): Promise<void> {
        setResumeContextError(null);
        setInitializingResumeUpload(true);
        try {
            await initializeResumeDraftForRequisition(requisitionId);
        } catch (err) {
            setResumeContextError(
                err instanceof Error ? err.message : 'Unable to prepare resume upload at the moment.'
            );
        } finally {
            setInitializingResumeUpload(false);
        }
    }

    // Load existing profile
    useEffect(() => {
        async function loadProfile() {
            const role = localStorage.getItem('auth_role');
            const roleRedirect = getInternalRedirectByRole(role);
            if (roleRedirect) {
                router.replace(roleRedirect);
                return;
            }

            if (shouldApplyEmailFallback(role)) {
                const emailRedirect = getInternalRedirectByEmail(localStorage.getItem('auth_email'));
                if (emailRedirect) {
                    router.replace(emailRedirect);
                    return;
                }
            }

            try {
                const [response, completionResponse] = await Promise.all([
                    fetch(buildApiUrl('/api/profile'), {
                        credentials: 'include',
                        headers: buildAuthHeaders(),
                    }),
                    fetch(buildApiUrl('/api/profile/completion'), {
                        credentials: 'include',
                        headers: buildAuthHeaders(),
                    }),
                ]);

                if (completionResponse.ok) {
                    const completionData = await completionResponse.json();
                    const normalizedCompletion: CompletionStatus = {
                        completedSections: Array.isArray(completionData?.completedSections)
                            ? completionData.completedSections
                            : [],
                        percentage:
                            typeof completionData?.percentage === 'number'
                                ? completionData.percentage
                                : 0,
                        missingFields: Array.isArray(completionData?.missingFields)
                            ? completionData.missingFields
                            : [],
                    };

                    setCompletionStatus(normalizedCompletion);
                    setCompletionPercentage(normalizedCompletion.percentage);
                }

                if (response.status === 404) {
                    setProfileExists(false);
                    setLoading(false);
                    return;
                }

                if (!response.ok) {
                    throw new Error('Failed to load profile');
                }

                const data = await response.json();
                setProfileExists(true);
                setFullName(data.fullName || '');
                setExperienceYears(data.experienceYears || 0);
                setSkills(data.skills || []);
                setEducation(Array.isArray(data.education) ? data.education : []);
                setWorkHistory(Array.isArray(data.workHistory) ? data.workHistory : []);
                const initialCompletion =
                    typeof data?.completionStatus?.percentage === 'number'
                        ? data.completionStatus.percentage
                        : typeof data?.profileCompletionPercentage === 'number'
                            ? data.profileCompletionPercentage
                            : 0;
                setCompletionPercentage(initialCompletion);

                const requisitionsResponse = await fetch(
                    buildApiUrl('/api/requisitions?page=1&pageSize=20&status=open'),
                    {
                        credentials: 'include',
                        headers: buildAuthHeaders(),
                    }
                );

                if (requisitionsResponse.ok) {
                    const requisitionsPayload = await requisitionsResponse.json();
                    const requisitions: OpenRequisitionOption[] = [];

                    if (Array.isArray(requisitionsPayload?.data)) {
                        for (const item of requisitionsPayload.data as unknown[]) {
                            if (typeof item !== 'object' || item === null) {
                                continue;
                            }

                            const candidate = item as Partial<OpenRequisitionOption>;
                            if (
                                typeof candidate.id !== 'string' ||
                                typeof candidate.title !== 'string' ||
                                typeof candidate.department !== 'string' ||
                                typeof candidate.location !== 'string'
                            ) {
                                continue;
                            }

                            requisitions.push({
                                id: candidate.id,
                                title: candidate.title,
                                department: candidate.department,
                                location: candidate.location,
                            });
                        }
                    }

                    setOpenRequisitions(requisitions);

                    const defaultRequisitionId = requisitions[0]?.id;
                    if (defaultRequisitionId) {
                        setSelectedResumeRequisitionId(defaultRequisitionId);
                        await syncResumeStateForRequisition(defaultRequisitionId);
                    }
                }
            } catch (err) {
                console.error('Error loading profile:', err);
                setError('Unable to load profile data');
            } finally {
                setLoading(false);
            }
        }

        loadProfile();
    }, [router]);

    useEffect(() => {
        if (!selectedResumeRequisitionId) {
            return;
        }

        let cancelled = false;

        const syncOrInitialize = async () => {
            try {
                await syncResumeStateForRequisition(selectedResumeRequisitionId);

                if (cancelled) {
                    return;
                }
            } catch {
                // Keep profile usable even if resume status refresh fails.
            }
        };

        syncOrInitialize();

        return () => {
            cancelled = true;
        };
    }, [selectedResumeRequisitionId]);

    useEffect(() => {
        if (!selectedResumeRequisitionId || !resumeUploadApplicationId) {
            return;
        }

        if (resumeScanStatus === 'infected') {
            return;
        }

        if (
            resumeScanStatus === 'clean' &&
            isResumeParsed &&
            (resumePopulationStatus === 'applied' || resumePopulationStatus === 'pending_consent')
        ) {
            return;
        }

        const intervalId = window.setInterval(() => {
            syncResumeStateForRequisition(selectedResumeRequisitionId).catch(() => {
                // Polling is best-effort.
            });
        }, 4000);

        return () => {
            window.clearInterval(intervalId);
        };
    }, [
        isResumeParsed,
        resumePopulationStatus,
        resumeScanStatus,
        resumeUploadApplicationId,
        selectedResumeRequisitionId,
    ]);

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setError(null);
        setSuccess(false);

        const resumePopulationInProgress =
            resumeScanStatus === 'pending' ||
            (resumeScanStatus === 'clean' &&
                (!isResumeParsed || resumePopulationStatus === 'pending_profile_sync'));

        if (!fullName || fullName.trim().length === 0) {
            setError('Full name is required');
            return;
        }

        if (!resumePopulationInProgress && skills.length < 3) {
            setError('Please add at least 3 skills');
            return;
        }

        if (!resumePopulationInProgress && education.length === 0) {
            setError('Please add at least one education entry');
            return;
        }

        if (!resumePopulationInProgress && workHistory.length === 0) {
            setError('Please add at least one work experience entry');
            return;
        }

        setSaving(true);

        try {
            const educationPayload = education
                .filter(
                    (entry) =>
                        isNonEmptyText(entry.institution) ||
                        isNonEmptyText(entry.degree) ||
                        isNonEmptyText(entry.fieldOfStudy) ||
                        isNonEmptyText(entry.startDate) ||
                        isNonEmptyText(entry.endDate)
                )
                .map((entry) => ({
                    institution: entry.institution.trim(),
                    degree: entry.degree.trim(),
                    fieldOfStudy: entry.fieldOfStudy?.trim() || undefined,
                    startDate: normalizeMonthPrecision(entry.startDate),
                    endDate: entry.isCurrent
                        ? null
                        : normalizeNullableMonth(normalizeOptionalDate(entry.endDate)),
                    isCurrent: entry.isCurrent,
                }))
                .filter((entry) => entry.institution.length > 0 && entry.degree.length > 0 && entry.startDate.length > 0);

            const workHistoryPayload = workHistory
                .filter(
                    (entry) =>
                        isNonEmptyText(entry.company) ||
                        isNonEmptyText(entry.title) ||
                        isNonEmptyText(entry.startDate) ||
                        isNonEmptyText(entry.endDate) ||
                        isNonEmptyText(entry.description)
                )
                .map((entry) => ({
                    company: entry.company.trim(),
                    title: entry.title.trim(),
                    startDate: normalizeMonthPrecision(entry.startDate),
                    endDate: entry.isCurrent
                        ? null
                        : normalizeNullableMonth(normalizeOptionalDate(entry.endDate)),
                    description: entry.description?.trim() || undefined,
                    isCurrent: entry.isCurrent,
                }))
                .filter((entry) => entry.company.length > 0 && entry.title.length > 0 && entry.startDate.length > 0);

            const normalizedSkills = dedupeSkills(skills);

            const method = profileExists ? 'PUT' : 'POST';
            const response = await fetch(buildApiUrl('/api/profile'), {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    ...buildAuthHeaders(),
                },
                credentials: 'include',
                body: JSON.stringify({
                    fullName: fullName.trim(),
                    experienceYears,
                    skills: normalizedSkills,
                    education: educationPayload,
                    workHistory: workHistoryPayload,
                }),
            });

            const rawBody = await response.text();
            let data: any = null;

            if (rawBody) {
                try {
                    data = JSON.parse(rawBody);
                } catch {
                    data = null;
                }
            }

            if (!response.ok) {
                const validationMessages = Array.isArray(data?.error?.details)
                    ? data.error.details
                        .map((detail: unknown) => {
                            if (typeof detail === 'string') {
                                return detail;
                            }

                            if (detail && typeof detail === 'object' && 'message' in detail) {
                                const message = (detail as { message?: unknown }).message;
                                return typeof message === 'string' ? message : '';
                            }

                            return '';
                        })
                        .filter((message: string): message is string => message.length > 0)
                    : [];

                setError(
                    validationMessages.join(', ') ||
                    data?.error?.message ||
                    data?.message ||
                    `Unable to save profile (${response.status})`
                );
                setSaving(false);
                return;
            }

            setProfileExists(true);
            const updatedCompletion =
                typeof data?.completionStatus?.percentage === 'number'
                    ? data.completionStatus.percentage
                    : typeof data?.profileCompletionPercentage === 'number'
                        ? data.profileCompletionPercentage
                        : 0;
            setCompletionPercentage(updatedCompletion);

            if (Array.isArray(data?.completionStatus?.missingFields)) {
                setCompletionStatus({
                    completedSections: Array.isArray(data.completionStatus.completedSections)
                        ? data.completionStatus.completedSections
                        : [],
                    percentage: updatedCompletion,
                    missingFields: data.completionStatus.missingFields,
                });
            }

            setSuccess(true);

            setTimeout(() => {
                setSuccess(false);
                router.push('/candidate/dashboard');
            }, 800);
        } catch (err) {
            console.error('Error saving profile:', err);
            setError('Unable to connect to server');
        } finally {
            setSaving(false);
        }
    }

    function addSkill() {
        if (skillInput.trim() && !skills.includes(skillInput.trim())) {
            setSkills([...skills, skillInput.trim()]);
            setSkillInput('');
        }
    }

    function removeSkill(index: number) {
        setSkills(skills.filter((_, i) => i !== index));
    }

    function addEducation() {
        setEducation([
            ...education,
            {
                institution: '',
                degree: '',
                fieldOfStudy: '',
                startDate: '',
                endDate: '',
                isCurrent: false,
            },
        ]);
    }

    function updateEducation(index: number, field: keyof EducationEntry, value: any) {
        const updated = [...education];
        updated[index] = { ...updated[index], [field]: value } as EducationEntry;
        setEducation(updated);
    }

    function removeEducation(index: number) {
        setEducation(education.filter((_, i) => i !== index));
    }

    function addWorkHistory() {
        setWorkHistory([
            ...workHistory,
            {
                company: '',
                title: '',
                startDate: '',
                endDate: '',
                description: '',
                isCurrent: false,
            },
        ]);
    }

    function updateWorkHistory(index: number, field: keyof WorkExperience, value: any) {
        const updated = [...workHistory];
        updated[index] = { ...updated[index], [field]: value } as WorkExperience;
        setWorkHistory(updated);
    }

    function removeWorkHistory(index: number) {
        setWorkHistory(workHistory.filter((_, i) => i !== index));
    }

    if (loading) {
        return (
            <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb' }}>
                <CandidateTopNav active="profile" />
                <div style={{ minHeight: 'calc(100vh - 64px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <p>Loading profile...</p>
                </div>
            </div>
        );
    }

    const hasPrivacyConsentTodo = (completionStatus?.missingFields ?? []).some((field) =>
        field.toLowerCase().includes('privacy consent')
    );

    return (
        <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb' }}>
            <CandidateTopNav active="profile" />

            <div style={{ maxWidth: '800px', margin: '0 auto', padding: '2rem' }}>
                <div style={{ backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', padding: '2rem' }}>
                    <div style={{ marginBottom: '2rem' }}>
                        <h1 style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>
                            {profileExists ? 'Edit Profile' : 'Create Profile'}
                        </h1>
                        <p style={{ color: '#6b7280' }}>
                            {completionPercentage >= 100
                                ? 'Your profile is complete and ready for applications.'
                                : 'Complete your profile to apply for jobs.'}{' '}
                            Current completion: <strong>{completionPercentage}%</strong>
                        </p>
                    </div>

                    {/* Progress Bar */}
                    <div style={{ marginBottom: '2rem', backgroundColor: '#e5e7eb', borderRadius: '999px', height: '8px', overflow: 'hidden' }}>
                        <div
                            style={{
                                width: `${completionPercentage}%`,
                                backgroundColor: completionPercentage === 100 ? '#10b981' : '#2563eb',
                                height: '100%',
                                transition: 'width 0.3s',
                            }}
                        />
                    </div>

                    {hasPrivacyConsentTodo && (
                        <div style={{ marginBottom: '2rem', backgroundColor: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '8px', padding: '0.875rem' }}>
                            <p style={{ margin: '0 0 0.5rem 0', color: '#9a3412', fontSize: '0.875rem' }}>
                                Profile completion is measured in 5 sections at 20% each. Privacy consent is required to reach 100% and proceed cleanly through applications.
                            </p>
                            <Link
                                href="/consent?returnTo=/profile"
                                style={{
                                    display: 'inline-block',
                                    padding: '0.5rem 0.875rem',
                                    borderRadius: '6px',
                                    backgroundColor: '#f97316',
                                    color: '#ffffff',
                                    fontWeight: '600',
                                    textDecoration: 'none',
                                    fontSize: '0.8125rem',
                                }}
                            >
                                Accept Privacy Consent
                            </Link>
                        </div>
                    )}

                    {success && (
                        <div style={{ backgroundColor: '#d1fae5', border: '1px solid #a7f3d0', borderRadius: '6px', padding: '0.75rem', marginBottom: '1rem', color: '#065f46' }}>
                            Profile saved successfully!
                        </div>
                    )}

                    {error && (
                        <div style={{ backgroundColor: '#fee', border: '1px solid #fcc', borderRadius: '6px', padding: '0.75rem', marginBottom: '1rem', color: '#c00' }}>
                            {error}
                        </div>
                    )}

                    <section style={{ marginBottom: '2rem', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '1rem' }}>
                        <h2 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '0.5rem', color: '#0f172a' }}>
                            Resume Parsing Before Applying
                        </h2>
                        <p style={{ margin: '0 0 0.875rem 0', color: '#475569', fontSize: '0.875rem' }}>
                            Upload your resume once to pre-populate skills and experience in your profile. Job matching will run automatically during application review.
                        </p>

                        {openRequisitions.length === 0 ? (
                            <p style={{ margin: 0, color: '#64748b', fontSize: '0.875rem' }}>
                                No open jobs are available right now for resume pre-processing.
                            </p>
                        ) : (
                            <>
                                {!resumeUploadApplicationId ? (
                                    <div
                                        role="status"
                                        aria-live="polite"
                                        style={{
                                            padding: '0.75rem',
                                            borderRadius: '6px',
                                            border: '1px dashed #cbd5e1',
                                            backgroundColor: '#ffffff',
                                        }}
                                    >
                                        <p style={{ margin: 0, color: '#334155', fontSize: '0.875rem' }}>
                                            {initializingResumeUpload
                                                ? 'Preparing resume upload in the background...'
                                                : 'Set up resume upload when you are ready.'}
                                        </p>

                                        <button
                                            type="button"
                                            disabled={initializingResumeUpload || !selectedResumeRequisitionId}
                                            onClick={() => {
                                                if (!selectedResumeRequisitionId) {
                                                    return;
                                                }
                                                void ensureResumeUploadContext(selectedResumeRequisitionId);
                                            }}
                                            style={{
                                                marginTop: '0.5rem',
                                                padding: '0.5rem 0.75rem',
                                                backgroundColor: '#2563eb',
                                                color: '#ffffff',
                                                border: 'none',
                                                borderRadius: '6px',
                                                cursor:
                                                    initializingResumeUpload || !selectedResumeRequisitionId
                                                        ? 'not-allowed'
                                                        : 'pointer',
                                                fontWeight: 600,
                                            }}
                                        >
                                            {initializingResumeUpload
                                                ? 'Preparing Resume Upload...'
                                                : 'Prepare Resume Upload'}
                                        </button>

                                        {resumeContextError && (
                                            <>
                                                <p style={{ margin: '0.5rem 0 0', color: '#b91c1c', fontSize: '0.8125rem' }}>
                                                    {resumeContextError}
                                                </p>
                                            </>
                                        )}
                                    </div>
                                ) : (
                                    <>
                                        <ResumeUpload
                                            applicationId={resumeUploadApplicationId}
                                            existingResumeStatus={resumeScanStatus}
                                            existingResumeParsed={isResumeParsed}
                                            onSuccess={() => {
                                                setResumeScanStatus('pending');
                                                setIsResumeParsed(false);
                                                setResumeParsedSkillsCount(0);
                                                setResumePopulationStatus('none');
                                                setResumeMergeSummary(null);
                                            }}
                                            onError={(uploadError) => setError(uploadError)}
                                        />

                                        <p style={{ margin: '0.75rem 0 0', color: '#475569', fontSize: '0.875rem' }}>
                                            {getResumeSyncStatusMessage()}
                                        </p>

                                        {resumePopulationStatus === 'pending_consent' && (
                                            <div style={{ marginTop: '0.5rem' }}>
                                                <Link
                                                    href="/consent?returnTo=/profile"
                                                    style={{
                                                        display: 'inline-block',
                                                        padding: '0.5rem 0.75rem',
                                                        borderRadius: '6px',
                                                        backgroundColor: '#ea580c',
                                                        color: '#ffffff',
                                                        fontWeight: 600,
                                                        textDecoration: 'none',
                                                        fontSize: '0.8125rem',
                                                    }}
                                                >
                                                    Accept Consent To Apply Resume Insights
                                                </Link>
                                            </div>
                                        )}

                                        {resumeScanStatus === 'clean' && isResumeParsed && (
                                            <p style={{ margin: '0.375rem 0 0', color: '#1d4ed8', fontSize: '0.8125rem' }}>
                                                Next: review the profile fields below and save changes before applying.
                                            </p>
                                        )}

                                        {resumePopulationStatus === 'applied' && resumeMergeSummary && (
                                            <div
                                                style={{
                                                    marginTop: '0.625rem',
                                                    padding: '0.625rem 0.75rem',
                                                    borderRadius: '6px',
                                                    backgroundColor: '#eff6ff',
                                                    border: '1px solid #bfdbfe',
                                                }}
                                            >
                                                <p style={{ margin: 0, color: '#1e3a8a', fontSize: '0.8125rem', fontWeight: 600 }}>
                                                    Profile sync summary
                                                </p>
                                                <p style={{ margin: '0.25rem 0 0', color: '#1e40af', fontSize: '0.8125rem' }}>
                                                    Added skills: {resumeMergeSummary.addedSkillsCount ?? 0}. Imported education entries:{' '}
                                                    {resumeMergeSummary.importedEducationEntries ?? 0}. Imported work entries:{' '}
                                                    {resumeMergeSummary.importedWorkHistoryEntries ?? 0}.
                                                </p>
                                            </div>
                                        )}
                                    </>
                                )}
                            </>
                        )}
                    </section>

                    <form onSubmit={handleSubmit}>
                        {/* Basic Info Section */}
                        <section id="basic-info" style={{ marginBottom: '2rem' }}>
                            <h2 style={{ fontSize: '1.25rem', fontWeight: '600', marginBottom: '1rem', borderBottom: '2px solid #e5e7eb', paddingBottom: '0.5rem' }}>
                                Basic Information
                            </h2>

                            <div style={{ marginBottom: '1rem' }}>
                                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem', color: '#374151' }}>
                                    Full Name *
                                </label>
                                <input
                                    type="text"
                                    value={fullName}
                                    onChange={(e) => setFullName(e.target.value)}
                                    required
                                    disabled={saving}
                                    style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '1rem' }}
                                />
                            </div>

                            <div style={{ marginBottom: '1rem' }}>
                                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem', color: '#374151' }}>
                                    Years of Experience *
                                </label>
                                <input
                                    type="number"
                                    value={experienceYears}
                                    onChange={(e) => setExperienceYears(parseInt(e.target.value) || 0)}
                                    required
                                    min={0}
                                    max={50}
                                    disabled={saving}
                                    style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '1rem' }}
                                />
                            </div>
                        </section>

                        {/* Skills Section */}
                        <section id="skills" style={{ marginBottom: '2rem' }}>
                            <h2 style={{ fontSize: '1.25rem', fontWeight: '600', marginBottom: '1rem', borderBottom: '2px solid #e5e7eb', paddingBottom: '0.5rem' }}>
                                Skills (minimum 3) *
                            </h2>

                            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                                <input
                                    type="text"
                                    value={skillInput}
                                    onChange={(e) => setSkillInput(e.target.value)}
                                    onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addSkill())}
                                    disabled={saving}
                                    placeholder="e.g., JavaScript, React, Node.js"
                                    style={{ flex: 1, padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '6px' }}
                                />
                                <button
                                    type="button"
                                    onClick={addSkill}
                                    disabled={saving || !skillInput.trim()}
                                    style={{
                                        padding: '0.5rem 1rem',
                                        backgroundColor: '#2563eb',
                                        color: 'white',
                                        border: 'none',
                                        borderRadius: '6px',
                                        cursor: saving || !skillInput.trim() ? 'not-allowed' : 'pointer',
                                        opacity: saving || !skillInput.trim() ? 0.5 : 1,
                                    }}
                                >
                                    Add
                                </button>
                            </div>

                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                                {skills.map((skill, index) => (
                                    <div
                                        key={index}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.5rem',
                                            padding: '0.25rem 0.75rem',
                                            backgroundColor: '#e0e7ff',
                                            color: '#3730a3',
                                            borderRadius: '999px',
                                            fontSize: '0.875rem',
                                        }}
                                    >
                                        {skill}
                                        <button
                                            type="button"
                                            onClick={() => removeSkill(index)}
                                            disabled={saving}
                                            style={{
                                                backgroundColor: 'transparent',
                                                border: 'none',
                                                color: '#3730a3',
                                                cursor: 'pointer',
                                                fontSize: '1.25rem',
                                                lineHeight: '1',
                                            }}
                                        >
                                            ×
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </section>

                        {/* Education Section */}
                        <section id="education" style={{ marginBottom: '2rem' }}>
                            <h2 style={{ fontSize: '1.25rem', fontWeight: '600', marginBottom: '1rem', borderBottom: '2px solid #e5e7eb', paddingBottom: '0.5rem' }}>
                                Education (minimum 1) *
                            </h2>

                            {education.map((edu, index) => (
                                <div key={index} style={{ backgroundColor: '#f9fafb', padding: '1rem', borderRadius: '6px', marginBottom: '1rem', border: '1px solid #e5e7eb' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                                        <h3 style={{ fontSize: '1rem', fontWeight: '600' }}>Education #{index + 1}</h3>
                                        <button
                                            type="button"
                                            onClick={() => removeEducation(index)}
                                            disabled={saving}
                                            style={{ color: '#dc2626', fontSize: '0.875rem', backgroundColor: 'transparent', border: 'none', cursor: 'pointer' }}
                                        >
                                            Remove
                                        </button>
                                    </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem' }}>Institution *</label>
                                            <input
                                                type="text"
                                                value={edu.institution}
                                                onChange={(e) => updateEducation(index, 'institution', e.target.value)}
                                                required
                                                disabled={saving}
                                                style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '6px' }}
                                            />
                                        </div>

                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem' }}>Degree *</label>
                                            <input
                                                type="text"
                                                value={edu.degree}
                                                onChange={(e) => updateEducation(index, 'degree', e.target.value)}
                                                required
                                                disabled={saving}
                                                style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '6px' }}
                                            />
                                        </div>

                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem' }}>Field of Study</label>
                                            <input
                                                type="text"
                                                value={edu.fieldOfStudy || ''}
                                                onChange={(e) => updateEducation(index, 'fieldOfStudy', e.target.value)}
                                                disabled={saving}
                                                style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '6px' }}
                                            />
                                        </div>

                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem' }}>Start Date *</label>
                                            <input
                                                type="month"
                                                value={normalizeMonthPrecision(edu.startDate)}
                                                onChange={(e) => updateEducation(index, 'startDate', e.target.value)}
                                                required
                                                disabled={saving}
                                                style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '6px' }}
                                            />
                                        </div>

                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem' }}>End Date</label>
                                            <input
                                                type="month"
                                                value={normalizeMonthPrecision(edu.endDate)}
                                                onChange={(e) => updateEducation(index, 'endDate', e.target.value)}
                                                disabled={saving || edu.isCurrent}
                                                style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '6px' }}
                                            />
                                        </div>

                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            <input
                                                type="checkbox"
                                                id={`edu-current-${index}`}
                                                checked={edu.isCurrent}
                                                onChange={(e) => updateEducation(index, 'isCurrent', e.target.checked)}
                                                disabled={saving}
                                                style={{ width: '1rem', height: '1rem' }}
                                            />
                                            <label htmlFor={`edu-current-${index}`} style={{ fontSize: '0.875rem' }}>Currently Enrolled</label>
                                        </div>
                                    </div>
                                </div>
                            ))}

                            <button
                                type="button"
                                onClick={addEducation}
                                disabled={saving}
                                style={{ padding: '0.5rem 1rem', backgroundColor: '#10b981', color: 'white', border: 'none', borderRadius: '6px', cursor: saving ? 'not-allowed' : 'pointer' }}
                            >
                                + Add Education
                            </button>
                        </section>

                        {/* Work History Section */}
                        <section id="work-history" style={{ marginBottom: '2rem' }}>
                            <h2 style={{ fontSize: '1.25rem', fontWeight: '600', marginBottom: '1rem', borderBottom: '2px solid #e5e7eb', paddingBottom: '0.5rem' }}>
                                Work History (minimum 1) *
                            </h2>

                            {workHistory.map((work, index) => (
                                <div key={index} style={{ backgroundColor: '#f9fafb', padding: '1rem', borderRadius: '6px', marginBottom: '1rem', border: '1px solid #e5e7eb' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                                        <h3 style={{ fontSize: '1rem', fontWeight: '600' }}>Work Experience #{index + 1}</h3>
                                        <button
                                            type="button"
                                            onClick={() => removeWorkHistory(index)}
                                            disabled={saving}
                                            style={{ color: '#dc2626', fontSize: '0.875rem', backgroundColor: 'transparent', border: 'none', cursor: 'pointer' }}
                                        >
                                            Remove
                                        </button>
                                    </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem' }}>Company *</label>
                                            <input
                                                type="text"
                                                value={work.company}
                                                onChange={(e) => updateWorkHistory(index, 'company', e.target.value)}
                                                required
                                                disabled={saving}
                                                style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '6px' }}
                                            />
                                        </div>

                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem' }}>Job Title *</label>
                                            <input
                                                type="text"
                                                value={work.title}
                                                onChange={(e) => updateWorkHistory(index, 'title', e.target.value)}
                                                required
                                                disabled={saving}
                                                style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '6px' }}
                                            />
                                        </div>

                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem' }}>Start Date *</label>
                                            <input
                                                type="month"
                                                value={normalizeMonthPrecision(work.startDate)}
                                                onChange={(e) => updateWorkHistory(index, 'startDate', e.target.value)}
                                                required
                                                disabled={saving}
                                                style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '6px' }}
                                            />
                                        </div>

                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem' }}>End Date</label>
                                            <input
                                                type="month"
                                                value={normalizeMonthPrecision(work.endDate)}
                                                onChange={(e) => updateWorkHistory(index, 'endDate', e.target.value)}
                                                disabled={saving || work.isCurrent}
                                                style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '6px' }}
                                            />
                                        </div>

                                        <div style={{ gridColumn: '1 / -1' }}>
                                            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem' }}>Description</label>
                                            <textarea
                                                value={work.description || ''}
                                                onChange={(e) => updateWorkHistory(index, 'description', e.target.value)}
                                                disabled={saving}
                                                rows={3}
                                                style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '6px', resize: 'vertical' }}
                                            />
                                        </div>

                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            <input
                                                type="checkbox"
                                                id={`work-current-${index}`}
                                                checked={work.isCurrent}
                                                onChange={(e) => updateWorkHistory(index, 'isCurrent', e.target.checked)}
                                                disabled={saving}
                                                style={{ width: '1rem', height: '1rem' }}
                                            />
                                            <label htmlFor={`work-current-${index}`} style={{ fontSize: '0.875rem' }}>Currently Working</label>
                                        </div>
                                    </div>
                                </div>
                            ))}

                            <button
                                type="button"
                                onClick={addWorkHistory}
                                disabled={saving}
                                style={{ padding: '0.5rem 1rem', backgroundColor: '#10b981', color: 'white', border: 'none', borderRadius: '6px', cursor: saving ? 'not-allowed' : 'pointer' }}
                            >
                                + Add Work Experience
                            </button>
                        </section>

                        {/* Submit Button */}
                        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', paddingTop: '1rem', borderTop: '1px solid #e5e7eb' }}>
                            <button
                                type="submit"
                                disabled={saving}
                                style={{
                                    padding: '0.75rem 2rem',
                                    backgroundColor: saving ? '#9ca3af' : '#2563eb',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '6px',
                                    fontSize: '1rem',
                                    fontWeight: '600',
                                    cursor: saving ? 'not-allowed' : 'pointer',
                                }}
                            >
                                {saving ? 'Saving...' : 'Save Profile'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}
