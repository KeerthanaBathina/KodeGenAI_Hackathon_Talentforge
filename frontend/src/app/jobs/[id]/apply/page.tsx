'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useParams } from 'next/navigation';
import { useAutoSave } from '@/hooks/useAutoSave';
import { buildApiUrl } from '@/lib/api/url';
import CandidateTopNav from '@/components/CandidateTopNav';
import { ResumeUpload } from '@/components/ResumeUpload';

interface FormData {
    step1_personal: {
        fullName: string;
        email: string;
        phone: string;
        linkedinUrl: string;
    };
    step2_experience: {
        yearsExperience: number;
        currentRole: string;
        currentCompany: string;
    };
    step3_coverLetter: {
        coverLetter: string;
    };
}

interface FormErrors {
    [key: string]: string;
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

interface ExistingApplicationResponse {
    id: string;
    status: string;
    draftData?: {
        step1_personal?: FormData['step1_personal'];
        step2_experience?: FormData['step2_experience'];
        step3_coverLetter?: FormData['step3_coverLetter'];
        currentStep?: number;
    } | null;
    resume?: {
        id: string;
        scanStatus: 'pending' | 'clean' | 'infected';
        parsedData?: {
            skills?: string[];
        } | null;
        parsePopulationStatus?: ResumeParsePopulationStatus | null;
        parseMergeSummary?: ResumeParseMergeSummary | null;
    } | null;
}

interface RequisitionMatchContext {
    id: string;
    title: string;
    requiredSkills: string[];
    preferredSkills: string[];
}

interface SkillMatchSummary {
    source?: 'groq' | 'heuristic';
    matchedRequired: string[];
    matchedPreferred: string[];
    requiredCoveragePercent: number;
    preferredCoveragePercent: number;
    overallScorePercent: number;
    summary?: string;
    fallbackReason?:
        | 'missing_groq_api_key'
        | 'empty_resume_skills'
        | 'groq_rate_limited'
        | 'groq_http_error'
        | 'groq_parse_error'
        | 'groq_request_failed';
}

function getGroqFallbackMessage(reason?: SkillMatchSummary['fallbackReason']): string {
    switch (reason) {
        case 'missing_groq_api_key':
            return 'Groq score unavailable because the backend API key is not loaded.';
        case 'empty_resume_skills':
            return 'Groq score unavailable because no resume skills were extracted.';
        case 'groq_rate_limited':
            return 'Groq score unavailable because the API rate limit was reached.';
        case 'groq_http_error':
            return 'Groq score unavailable because the API returned an error response.';
        case 'groq_parse_error':
            return 'Groq score unavailable because the API response could not be parsed.';
        case 'groq_request_failed':
            return 'Groq score unavailable because the API request failed.';
        default:
            return 'Groq score unavailable. Showing parsed resume match above.';
    }
}

function normalizeSkillToken(skill: string): string {
    return skill.trim().toLowerCase();
}

function buildSkillMatchSummary(
    parsedSkills: string[],
    requiredSkills: string[],
    preferredSkills: string[]
): SkillMatchSummary {
    const parsedSkillSet = new Set(
        parsedSkills
            .filter((skill) => typeof skill === 'string' && skill.trim().length > 0)
            .map((skill) => normalizeSkillToken(skill))
    );

    const normalizedRequired = requiredSkills.filter((skill) => skill.trim().length > 0);
    const normalizedPreferred = preferredSkills.filter((skill) => skill.trim().length > 0);

    const matchedRequired = normalizedRequired.filter((skill) =>
        parsedSkillSet.has(normalizeSkillToken(skill))
    );
    const matchedPreferred = normalizedPreferred.filter((skill) =>
        parsedSkillSet.has(normalizeSkillToken(skill))
    );

    const requiredCoverage = normalizedRequired.length
        ? matchedRequired.length / normalizedRequired.length
        : 1;
    const preferredCoverage = normalizedPreferred.length
        ? matchedPreferred.length / normalizedPreferred.length
        : 0;

    const weightedScore = Math.round((requiredCoverage * 0.8 + preferredCoverage * 0.2) * 100);

    return {
        source: 'heuristic',
        matchedRequired,
        matchedPreferred,
        requiredCoveragePercent: Math.round(requiredCoverage * 100),
        preferredCoveragePercent: Math.round(preferredCoverage * 100),
        overallScorePercent: weightedScore,
        summary: 'Computed using deterministic skill overlap.',
    };
}

export default function ApplicationFormPage() {
    const router = useRouter();
    const params = useParams();
    const requisitionId = params.id as string;

    const [currentStep, setCurrentStep] = useState(1);
    const [formData, setFormData] = useState<FormData>({
        step1_personal: {
            fullName: '',
            email: '',
            phone: '',
            linkedinUrl: '',
        },
        step2_experience: {
            yearsExperience: 0,
            currentRole: '',
            currentCompany: '',
        },
        step3_coverLetter: {
            coverLetter: '',
        },
    });
    const [errors, setErrors] = useState<FormErrors>({});
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [applicationStatus, setApplicationStatus] = useState<'draft' | 'submitted'>('draft');
    const [applicationId, setApplicationId] = useState<string | null>(null);
    const [hasUploadedResume, setHasUploadedResume] = useState(false);
    const [resumeScanStatus, setResumeScanStatus] = useState<'none' | 'pending' | 'clean' | 'infected'>('none');
    const [isResumeParsed, setIsResumeParsed] = useState(false);
    const [resumePopulationStatus, setResumePopulationStatus] = useState<
        ResumeParsePopulationStatus | 'none'
    >('none');
    const [resumeMergeSummary, setResumeMergeSummary] = useState<ResumeParseMergeSummary | null>(
        null
    );
    const [parsedResumeSkills, setParsedResumeSkills] = useState<string[]>([]);
    const [parsedResumeSkillsCount, setParsedResumeSkillsCount] = useState(0);
    const [initializingResumeUpload, setInitializingResumeUpload] = useState(false);
    const [requisitionMatchContext, setRequisitionMatchContext] = useState<RequisitionMatchContext | null>(null);
    const [aiSkillScore, setAiSkillScore] = useState<SkillMatchSummary | null>(null);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

    function applyResumeState(application: ExistingApplicationResponse | null) {
        const resume = application?.resume;

        if (!resume?.id) {
            setHasUploadedResume(false);
            setResumeScanStatus('none');
            setIsResumeParsed(false);
            setResumePopulationStatus('none');
            setResumeMergeSummary(null);
            setParsedResumeSkills([]);
            setParsedResumeSkillsCount(0);
            return;
        }

        const parsedSkills = Array.isArray(resume.parsedData?.skills)
            ? resume.parsedData.skills.filter((skill) => typeof skill === 'string' && skill.trim().length > 0)
            : [];

        setHasUploadedResume(true);
        setResumeScanStatus(resume.scanStatus ?? 'pending');
        setIsResumeParsed(Boolean(resume.parsedData));
        setResumePopulationStatus(resume.parsePopulationStatus ?? 'none');
        setResumeMergeSummary(resume.parseMergeSummary ?? null);
        setParsedResumeSkills(parsedSkills);
        setParsedResumeSkillsCount(parsedSkills.length);
    }

    function getResumeProcessingMessage(): string {
        if (resumeScanStatus === 'infected') {
            return 'The uploaded resume failed security scanning. Please upload a clean file.';
        }

        if (resumeScanStatus === 'pending') {
            return 'Resume uploaded. Security scan and parsing are in progress.';
        }

        if (resumeScanStatus !== 'clean') {
            return 'Upload your resume to enable AI skill extraction before submission.';
        }

        if (!isResumeParsed) {
            return 'Resume passed security scanning. AI skill extraction is still in progress.';
        }

        if (resumePopulationStatus === 'pending_consent') {
            return 'Resume parsing is complete, but skill matching is paused until privacy consent is accepted.';
        }

        if (resumePopulationStatus === 'pending_profile_sync') {
            return 'Resume parsing is complete. Applying extracted profile updates now.';
        }

        if (parsedResumeSkillsCount > 0) {
            return `Resume parsed successfully. Extracted ${parsedResumeSkillsCount} skills for job matching.`;
        }

        return 'Resume parsed successfully. No skills were detected, please review profile skills before submitting.';
    }

    function buildDraftPayload() {
        return {
            requisitionId,
            draftData: {
                step1_personal: formData.step1_personal,
                step2_experience: formData.step2_experience,
                step3_coverLetter: formData.step3_coverLetter,
                currentStep,
            },
        };
    }

    async function ensureDraftApplicationId(): Promise<string> {
        if (applicationId) {
            return applicationId;
        }

        const response = await fetch(buildApiUrl('/api/applications/drafts'), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            credentials: 'include',
            body: JSON.stringify(buildDraftPayload()),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => null);
            throw new Error(errorData?.error?.message || 'Unable to initialize draft for resume upload');
        }

        const payload = await response.json();
        if (!payload?.id || typeof payload.id !== 'string') {
            throw new Error('Unable to initialize draft for resume upload');
        }

        setApplicationId(payload.id);
        return payload.id;
    }

    // Load profile and draft on mount
    useEffect(() => {
        async function loadData() {
            try {
                let profilePrefill: Pick<FormData['step1_personal'], 'fullName' | 'email' | 'phone'> | null = null;

                const requisitionResponse = await fetch(buildApiUrl(`/api/requisitions/${requisitionId}`), {
                    credentials: 'include',
                });

                if (requisitionResponse.ok) {
                    const requisition = await requisitionResponse.json();
                    setRequisitionMatchContext({
                        id: requisition.id,
                        title: requisition.title,
                        requiredSkills: Array.isArray(requisition.requiredSkills)
                            ? requisition.requiredSkills.filter(
                                  (skill: unknown): skill is string =>
                                      typeof skill === 'string' && skill.trim().length > 0
                              )
                            : [],
                        preferredSkills: Array.isArray(requisition.preferredSkills)
                            ? requisition.preferredSkills.filter(
                                  (skill: unknown): skill is string =>
                                      typeof skill === 'string' && skill.trim().length > 0
                              )
                            : [],
                    });
                }

                // Load profile data
                const profileResponse = await fetch(buildApiUrl('/api/profile'), {
                    credentials: 'include',
                });

                if (profileResponse.status === 401) {
                    router.replace('/register?next=/profile');
                    return;
                }

                if (profileResponse.ok) {
                    const profile = await profileResponse.json();
                    const fallbackAuthEmail =
                        typeof window !== 'undefined' ? localStorage.getItem('auth_email') || '' : '';
                    const fallbackAuthPhone =
                        typeof window !== 'undefined' ? localStorage.getItem('auth_phone') || '' : '';

                    const resolvedProfilePrefill = {
                        fullName: profile.fullName || '',
                        email:
                            profile.candidate?.email ||
                            profile.email ||
                            fallbackAuthEmail,
                        phone:
                            profile.candidate?.phone ||
                            profile.candidate?.phoneNumber ||
                            profile.phone ||
                            fallbackAuthPhone ||
                            '',
                    };
                    profilePrefill = resolvedProfilePrefill;

                    setFormData((prev) => ({
                        ...prev,
                        step1_personal: {
                            ...prev.step1_personal,
                            fullName: resolvedProfilePrefill.fullName,
                            email: resolvedProfilePrefill.email,
                            phone: resolvedProfilePrefill.phone,
                        },
                    }));
                }

                const contactInfoResponse = await fetch(buildApiUrl('/api/applications/contact-info'), {
                    credentials: 'include',
                });

                if (contactInfoResponse.ok) {
                    const contactInfo = await contactInfoResponse.json();
                    setFormData((prev) => ({
                        ...prev,
                        step1_personal: {
                            ...prev.step1_personal,
                            email:
                                prev.step1_personal.email ||
                                contactInfo.email ||
                                '',
                            phone:
                                prev.step1_personal.phone ||
                                contactInfo.phone ||
                                (typeof window !== 'undefined' ? localStorage.getItem('auth_phone') || '' : '') ||
                                '',
                        },
                    }));

                    profilePrefill = {
                        fullName: profilePrefill?.fullName || '',
                        email:
                            profilePrefill?.email ||
                            contactInfo.email ||
                            '',
                        phone:
                            profilePrefill?.phone ||
                            contactInfo.phone ||
                            '',
                    };
                }

                // Load latest application state for this requisition (draft/resume)
                const applicationResponse = await fetch(buildApiUrl(`/api/applications/by-requisition/${requisitionId}`), {
                    credentials: 'include',
                });

                if (applicationResponse.status === 401) {
                    router.replace('/register?next=/profile');
                    return;
                }

                if (applicationResponse.ok) {
                    const existingApplication: ExistingApplicationResponse = await applicationResponse.json();
                    setApplicationId(existingApplication.id);
                    applyResumeState(existingApplication);

                    if (existingApplication.status !== 'draft') {
                        router.replace(`/applications/track/${existingApplication.id}`);
                        return;
                    }

                    if (existingApplication.draftData) {
                        const draftStep1 = existingApplication.draftData?.step1_personal || {};

                        setFormData((previous) => ({
                            step1_personal: {
                                ...previous.step1_personal,
                                ...draftStep1,
                                fullName:
                                    profilePrefill?.fullName?.trim() ||
                                    draftStep1.fullName?.trim() ||
                                    previous.step1_personal.fullName,
                                email:
                                    profilePrefill?.email?.trim() ||
                                    draftStep1.email?.trim() ||
                                    previous.step1_personal.email,
                                phone:
                                    profilePrefill?.phone?.trim() ||
                                    draftStep1.phone?.trim() ||
                                    previous.step1_personal.phone,
                            },
                            step2_experience: existingApplication.draftData?.step2_experience || previous.step2_experience,
                            step3_coverLetter: existingApplication.draftData?.step3_coverLetter || previous.step3_coverLetter,
                        }));

                        if (typeof existingApplication.draftData.currentStep === 'number') {
                            const safeStep = Math.min(4, Math.max(1, existingApplication.draftData.currentStep));
                            setCurrentStep(safeStep);
                        }
                    }
                }
            } catch (error) {
                console.error('Error loading data:', error);
            } finally {
                setIsLoading(false);
            }
        }

        loadData();
    }, [requisitionId]);

    useEffect(() => {
        if (!hasUploadedResume || !applicationId) {
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

        let cancelled = false;

        const refreshResumeState = async () => {
            try {
                const response = await fetch(
                    buildApiUrl(`/api/applications/by-requisition/${requisitionId}`),
                    { credentials: 'include' }
                );

                if (!response.ok || cancelled) {
                    return;
                }

                const existingApplication: ExistingApplicationResponse = await response.json();
                if (!cancelled) {
                    applyResumeState(existingApplication);
                }
            } catch {
                // Silent polling failure - user can continue manually.
            }
        };

        refreshResumeState();
        const intervalId = window.setInterval(refreshResumeState, 4000);

        return () => {
            cancelled = true;
            window.clearInterval(intervalId);
        };
    }, [
        applicationId,
        hasUploadedResume,
        isResumeParsed,
        requisitionId,
        resumePopulationStatus,
        resumeScanStatus,
    ]);

    useEffect(() => {
        if (
            !hasUploadedResume ||
            resumeScanStatus !== 'clean' ||
            !isResumeParsed ||
            resumePopulationStatus === 'pending_consent' ||
            resumePopulationStatus === 'pending_profile_sync'
        ) {
            setAiSkillScore(null);
            return;
        }

        let cancelled = false;

        const fetchAiScore = async () => {
            try {
                const response = await fetch(
                    buildApiUrl(`/api/applications/ai-score/${requisitionId}`),
                    { credentials: 'include' }
                );

                if (!response.ok || cancelled) {
                    return;
                }

                const score = await response.json();
                if (cancelled) {
                    return;
                }

                setAiSkillScore({
                    source: score.source === 'groq' ? 'groq' : 'heuristic',
                    matchedRequired: Array.isArray(score.matchedRequired) ? score.matchedRequired : [],
                    matchedPreferred: Array.isArray(score.matchedPreferred) ? score.matchedPreferred : [],
                    requiredCoveragePercent: Number(score.requiredCoveragePercent) || 0,
                    preferredCoveragePercent: Number(score.preferredCoveragePercent) || 0,
                    overallScorePercent: Number(score.overallScorePercent) || 0,
                    summary: typeof score.summary === 'string' ? score.summary : undefined,
                    fallbackReason:
                        score.fallbackReason === 'missing_groq_api_key' ||
                        score.fallbackReason === 'empty_resume_skills' ||
                        score.fallbackReason === 'groq_rate_limited' ||
                        score.fallbackReason === 'groq_http_error' ||
                        score.fallbackReason === 'groq_parse_error' ||
                        score.fallbackReason === 'groq_request_failed'
                            ? score.fallbackReason
                            : undefined,
                });
            } catch {
                // Non-blocking: UI falls back to deterministic score.
            }
        };

        fetchAiScore();

        return () => {
            cancelled = true;
        };
    }, [
        hasUploadedResume,
        isResumeParsed,
        requisitionId,
        resumePopulationStatus,
        resumeScanStatus,
    ]);

    // Auto-save hook integration
    const { isSaving, lastSavedAt } = useAutoSave({
        formData: {
            step1_personal: formData.step1_personal,
            step2_experience: formData.step2_experience,
            step3_coverLetter: formData.step3_coverLetter,
            currentStep,
        },
        requisitionId,
        enabled: applicationStatus === 'draft',
        onSaveSuccess: () => {
            setToast({ message: 'Draft saved', type: 'success' });
        },
        onSaveError: (error) => {
            setToast({ message: 'Failed to save draft', type: 'error' });
        },
    });

    // Validation functions
    function validateStep1(): boolean {
        const newErrors: FormErrors = {};

        if (!formData.step1_personal.fullName.trim()) {
            newErrors.fullName = 'Full name is required';
        }

        if (!formData.step1_personal.email.trim()) {
            newErrors.email = 'Email is required';
        } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.step1_personal.email)) {
            newErrors.email = 'Invalid email format';
        }

        if (!formData.step1_personal.phone.trim()) {
            newErrors.phone = 'Phone number is required';
        }

        if (
            formData.step1_personal.linkedinUrl &&
            !/^https?:\/\/.+/.test(formData.step1_personal.linkedinUrl)
        ) {
            newErrors.linkedinUrl = 'Invalid URL format';
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    }

    function validateStep2(): boolean {
        const newErrors: FormErrors = {};

        if (formData.step2_experience.yearsExperience < 0) {
            newErrors.yearsExperience = 'Years of experience cannot be negative';
        }

        if (!formData.step2_experience.currentRole.trim()) {
            newErrors.currentRole = 'Current role is required';
        }

        if (!formData.step2_experience.currentCompany.trim()) {
            newErrors.currentCompany = 'Current company is required';
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    }

    function validateStep3(): boolean {
        const newErrors: FormErrors = {};

        if (!formData.step3_coverLetter.coverLetter.trim()) {
            newErrors.coverLetter = 'Cover letter is required';
        } else if (formData.step3_coverLetter.coverLetter.length < 100) {
            newErrors.coverLetter = 'Cover letter must be at least 100 characters';
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    }

    // Navigation handlers
    function handleNext() {
        let isValid = false;

        switch (currentStep) {
            case 1:
                isValid = validateStep1();
                break;
            case 2:
                isValid = validateStep2();
                break;
            case 3:
                isValid = validateStep3();
                break;
            default:
                isValid = true;
        }

        if (isValid && currentStep < 4) {
            setCurrentStep(currentStep + 1);
            setErrors({});
        }
    }

    function handlePrevious() {
        if (currentStep > 1) {
            setCurrentStep(currentStep - 1);
            setErrors({});
        }
    }

    function handleEditStep(step: number) {
        setCurrentStep(step);
        setErrors({});
    }

    // Form field update handlers
    function updateStep1(field: keyof FormData['step1_personal'], value: string) {
        setFormData((prev) => ({
            ...prev,
            step1_personal: {
                ...prev.step1_personal,
                [field]: value,
            },
        }));
    }

    function updateStep2(field: keyof FormData['step2_experience'], value: string | number) {
        setFormData((prev) => ({
            ...prev,
            step2_experience: {
                ...prev.step2_experience,
                [field]: value,
            },
        }));
    }

    function updateStep3(field: keyof FormData['step3_coverLetter'], value: string) {
        setFormData((prev) => ({
            ...prev,
            step3_coverLetter: {
                ...prev.step3_coverLetter,
                [field]: value,
            },
        }));
    }

    // Submission handler
    async function handleSubmit() {
        setIsSubmitting(true);

        try {
            const saveDraftResponse = await fetch(buildApiUrl('/api/applications/drafts'), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                credentials: 'include',
                body: JSON.stringify(buildDraftPayload()),
            });

            if (!saveDraftResponse.ok) {
                const saveErrorData = await saveDraftResponse.json().catch(() => null);
                throw new Error(saveErrorData?.error?.message || 'Unable to save draft before submission');
            }

            const saveDraftPayload = await saveDraftResponse.json().catch(() => null);
            if (saveDraftPayload?.id && typeof saveDraftPayload.id === 'string') {
                setApplicationId(saveDraftPayload.id);
            }

            let hasResumeForSubmission = hasUploadedResume;
            const existingApplicationResponse = await fetch(
                buildApiUrl(`/api/applications/by-requisition/${requisitionId}`),
                { credentials: 'include' }
            );

            if (existingApplicationResponse.ok) {
                const existingApplication: ExistingApplicationResponse = await existingApplicationResponse.json();
                applyResumeState(existingApplication);

                hasResumeForSubmission = Boolean(existingApplication.resume?.id);

                if (existingApplication.resume?.scanStatus === 'infected') {
                    throw new Error('Uploaded resume failed security scan. Please upload a clean resume and try again.');
                }

                if (existingApplication.resume?.scanStatus === 'pending') {
                    throw new Error('Resume security scan is still in progress. Please wait before submitting.');
                }

                if (existingApplication.resume?.scanStatus === 'clean' && !existingApplication.resume?.parsedData) {
                    throw new Error('Resume parsing is still in progress. Please wait for AI skill extraction to complete.');
                }

                if (existingApplication.resume?.parsePopulationStatus === 'pending_consent') {
                    throw new Error('Please accept privacy consent before submitting so resume insights can be applied.');
                }

                if (existingApplication.resume?.parsePopulationStatus === 'pending_profile_sync') {
                    throw new Error('Resume insights are still being applied to your profile. Please wait a few seconds and submit again.');
                }
            }

            if (!hasResumeForSubmission) {
                throw new Error('Please upload your resume before submitting the application.');
            }

            const response = await fetch(buildApiUrl(`/api/applications/drafts/${requisitionId}/submit`), {
                method: 'POST',
                credentials: 'include',
            });

            if (!response.ok) {
                const errorData = await response.json();

                // Handle HTTP 409 Conflict (duplicate application or cooling period)
                if (response.status === 409) {
                    const errorCode = errorData.error?.code;
                    let userMessage = errorData.error?.message || 'Unable to submit application';

                    if (errorCode === 'DUPLICATE_APPLICATION') {
                        userMessage = 'You already have an active application for this position.';
                    } else if (errorCode === 'COOLING_PERIOD_ACTIVE') {
                        userMessage = errorData.error?.message; // Already includes day countdown
                    }

                    throw new Error(userMessage);
                }

                throw new Error(errorData.error?.message || 'Submission failed');
            }

            const data = await response.json();
            setApplicationStatus('submitted');
            setToast({ message: 'Application submitted successfully!', type: 'success' });

            // Redirect to success page after 2 seconds
            setTimeout(() => {
                router.push(`/jobs/${requisitionId}/application-success`);
            }, 2000);
        } catch (error) {
            setToast({
                message: error instanceof Error ? error.message : 'Failed to submit application. Please try again.',
                type: 'error',
            });
        } finally {
            setIsSubmitting(false);
        }
    }

    if (isLoading) {
        return (
            <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb' }}>
                <CandidateTopNav active="jobs" />
                <div style={{ minHeight: 'calc(100vh - 64px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <p>Loading application form...</p>
                </div>
            </div>
        );
    }

    const resumeReadyForSubmission =
        hasUploadedResume &&
        resumeScanStatus === 'clean' &&
        isResumeParsed &&
        resumePopulationStatus !== 'pending_consent' &&
        resumePopulationStatus !== 'pending_profile_sync';
    const heuristicSkillMatchSummary = requisitionMatchContext
        ? buildSkillMatchSummary(
              parsedResumeSkills,
              requisitionMatchContext.requiredSkills,
              requisitionMatchContext.preferredSkills
          )
        : null;
    const groqSkillMatchSummary = aiSkillScore?.source === 'groq' ? aiSkillScore : null;
    const skillMatchSummary = groqSkillMatchSummary ?? heuristicSkillMatchSummary;

    return (
        <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb' }}>
            <CandidateTopNav active="jobs" />

            <div style={{ padding: '2rem' }}>
            {/* Toast Notifications */}
            {toast && (
                <div
                    style={{
                        position: 'fixed',
                        top: '1rem',
                        right: '1rem',
                        padding: '1rem',
                        borderRadius: '0.5rem',
                        backgroundColor: toast.type === 'success' ? '#10b981' : toast.type === 'error' ? '#ef4444' : '#3b82f6',
                        color: 'white',
                        boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
                        zIndex: 9999,
                        maxWidth: '400px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: '1rem'
                    }}
                >
                    <span>{toast.message}</span>
                    <button
                        onClick={() => setToast(null)}
                        style={{
                            background: 'transparent',
                            border: 'none',
                            color: 'white',
                            cursor: 'pointer',
                            fontSize: '1.25rem',
                            padding: '0',
                            lineHeight: '1'
                        }}
                        aria-label="Close notification"
                    >
                        ×
                    </button>
                </div>
            )}

            <div style={{ maxWidth: '800px', margin: '0 auto' }}>
                {/* Auto-save Indicator */}
                <div style={{ marginBottom: '1rem', textAlign: 'right', fontSize: '0.875rem', color: '#6b7280' }}>
                    {isSaving && <span>Saving...</span>}
                    {!isSaving && lastSavedAt && (
                        <span>Draft saved at {lastSavedAt.toLocaleTimeString()}</span>
                    )}
                </div>

                {/* Progress Indicator */}
                <div style={{ marginBottom: '2rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                        {[1, 2, 3, 4].map((step) => (
                            <div key={step} style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
                                <div
                                    style={{
                                        width: '2rem',
                                        height: '2rem',
                                        borderRadius: '50%',
                                        backgroundColor: step <= currentStep ? '#3b82f6' : '#d1d5db',
                                        color: 'white',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontWeight: '600',
                                    }}
                                >
                                    {step < currentStep ? '✓' : step}
                                </div>
                                {step < 4 && (
                                    <div
                                        style={{
                                            flex: 1,
                                            height: '2px',
                                            backgroundColor: step < currentStep ? '#3b82f6' : '#d1d5db',
                                            marginLeft: '0.5rem',
                                        }}
                                    />
                                )}
                            </div>
                        ))}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#6b7280' }}>
                        <span>Personal Info</span>
                        <span>Experience</span>
                        <span>Cover Letter</span>
                        <span>Review & Resume</span>
                    </div>
                </div>

                {/* Form Card */}
                <div style={{ backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', padding: '2rem' }}>
                    {/* Step 1: Personal Information */}
                    {currentStep === 1 && (
                        <div>
                            <h2 style={{ fontSize: '1.5rem', fontWeight: '600', marginBottom: '1.5rem' }}>Personal Information</h2>

                            <div style={{ marginBottom: '1rem' }}>
                                <label htmlFor="fullName" style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem' }}>
                                    Full Name <span style={{ color: '#dc2626' }}>*</span>
                                </label>
                                <input
                                    id="fullName"
                                    type="text"
                                    value={formData.step1_personal.fullName}
                                    onChange={(e) => updateStep1('fullName', e.target.value)}
                                    style={{
                                        width: '100%',
                                        padding: '0.75rem',
                                        border: `1px solid ${errors.fullName ? '#dc2626' : '#d1d5db'}`,
                                        borderRadius: '6px',
                                    }}
                                />
                                {errors.fullName && <p style={{ color: '#dc2626', fontSize: '0.875rem', marginTop: '0.25rem' }}>{errors.fullName}</p>}
                            </div>

                            <div style={{ marginBottom: '1rem' }}>
                                <label htmlFor="email" style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem' }}>
                                    Email <span style={{ color: '#dc2626' }}>*</span>
                                </label>
                                <input
                                    id="email"
                                    type="email"
                                    value={formData.step1_personal.email}
                                    onChange={(e) => updateStep1('email', e.target.value)}
                                    style={{
                                        width: '100%',
                                        padding: '0.75rem',
                                        border: `1px solid ${errors.email ? '#dc2626' : '#d1d5db'}`,
                                        borderRadius: '6px',
                                    }}
                                />
                                {errors.email && <p style={{ color: '#dc2626', fontSize: '0.875rem', marginTop: '0.25rem' }}>{errors.email}</p>}
                            </div>

                            <div style={{ marginBottom: '1rem' }}>
                                <label htmlFor="phone" style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem' }}>
                                    Phone <span style={{ color: '#dc2626' }}>*</span>
                                </label>
                                <input
                                    id="phone"
                                    type="tel"
                                    value={formData.step1_personal.phone}
                                    onChange={(e) => updateStep1('phone', e.target.value)}
                                    style={{
                                        width: '100%',
                                        padding: '0.75rem',
                                        border: `1px solid ${errors.phone ? '#dc2626' : '#d1d5db'}`,
                                        borderRadius: '6px',
                                    }}
                                />
                                {errors.phone && <p style={{ color: '#dc2626', fontSize: '0.875rem', marginTop: '0.25rem' }}>{errors.phone}</p>}
                            </div>

                            <div style={{ marginBottom: '1rem' }}>
                                <label htmlFor="linkedinUrl" style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem' }}>
                                    LinkedIn URL
                                </label>
                                <input
                                    id="linkedinUrl"
                                    type="url"
                                    value={formData.step1_personal.linkedinUrl}
                                    onChange={(e) => updateStep1('linkedinUrl', e.target.value)}
                                    placeholder="https://linkedin.com/in/yourprofile"
                                    style={{
                                        width: '100%',
                                        padding: '0.75rem',
                                        border: `1px solid ${errors.linkedinUrl ? '#dc2626' : '#d1d5db'}`,
                                        borderRadius: '6px',
                                    }}
                                />
                                {errors.linkedinUrl && <p style={{ color: '#dc2626', fontSize: '0.875rem', marginTop: '0.25rem' }}>{errors.linkedinUrl}</p>}
                            </div>
                        </div>
                    )}

                    {/* Step 2: Experience */}
                    {currentStep === 2 && (
                        <div>
                            <h2 style={{ fontSize: '1.5rem', fontWeight: '600', marginBottom: '1.5rem' }}>Experience</h2>

                            <div style={{ marginBottom: '1rem' }}>
                                <label htmlFor="yearsExperience" style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem' }}>
                                    Years of Experience <span style={{ color: '#dc2626' }}>*</span>
                                </label>
                                <input
                                    id="yearsExperience"
                                    type="number"
                                    min="0"
                                    value={formData.step2_experience.yearsExperience}
                                    onChange={(e) => updateStep2('yearsExperience', parseInt(e.target.value) || 0)}
                                    style={{
                                        width: '100%',
                                        padding: '0.75rem',
                                        border: `1px solid ${errors.yearsExperience ? '#dc2626' : '#d1d5db'}`,
                                        borderRadius: '6px',
                                    }}
                                />
                                {errors.yearsExperience && <p style={{ color: '#dc2626', fontSize: '0.875rem', marginTop: '0.25rem' }}>{errors.yearsExperience}</p>}
                            </div>

                            <div style={{ marginBottom: '1rem' }}>
                                <label htmlFor="currentRole" style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem' }}>
                                    Current Role <span style={{ color: '#dc2626' }}>*</span>
                                </label>
                                <input
                                    id="currentRole"
                                    type="text"
                                    value={formData.step2_experience.currentRole}
                                    onChange={(e) => updateStep2('currentRole', e.target.value)}
                                    style={{
                                        width: '100%',
                                        padding: '0.75rem',
                                        border: `1px solid ${errors.currentRole ? '#dc2626' : '#d1d5db'}`,
                                        borderRadius: '6px',
                                    }}
                                />
                                {errors.currentRole && <p style={{ color: '#dc2626', fontSize: '0.875rem', marginTop: '0.25rem' }}>{errors.currentRole}</p>}
                            </div>

                            <div style={{ marginBottom: '1rem' }}>
                                <label htmlFor="currentCompany" style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem' }}>
                                    Current Company <span style={{ color: '#dc2626' }}>*</span>
                                </label>
                                <input
                                    id="currentCompany"
                                    type="text"
                                    value={formData.step2_experience.currentCompany}
                                    onChange={(e) => updateStep2('currentCompany', e.target.value)}
                                    style={{
                                        width: '100%',
                                        padding: '0.75rem',
                                        border: `1px solid ${errors.currentCompany ? '#dc2626' : '#d1d5db'}`,
                                        borderRadius: '6px',
                                    }}
                                />
                                {errors.currentCompany && <p style={{ color: '#dc2626', fontSize: '0.875rem', marginTop: '0.25rem' }}>{errors.currentCompany}</p>}
                            </div>
                        </div>
                    )}

                    {/* Step 3: Cover Letter */}
                    {currentStep === 3 && (
                        <div>
                            <h2 style={{ fontSize: '1.5rem', fontWeight: '600', marginBottom: '1.5rem' }}>Cover Letter</h2>

                            <div style={{ marginBottom: '1rem' }}>
                                <label htmlFor="coverLetter" style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem' }}>
                                    Cover Letter <span style={{ color: '#dc2626' }}>*</span>
                                </label>
                                <textarea
                                    id="coverLetter"
                                    value={formData.step3_coverLetter.coverLetter}
                                    onChange={(e) => updateStep3('coverLetter', e.target.value)}
                                    rows={10}
                                    placeholder="Tell us why you're interested in this position..."
                                    style={{
                                        width: '100%',
                                        padding: '0.75rem',
                                        border: `1px solid ${errors.coverLetter ? '#dc2626' : '#d1d5db'}`,
                                        borderRadius: '6px',
                                        fontFamily: 'inherit',
                                    }}
                                />
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.25rem' }}>
                                    {errors.coverLetter ? (
                                        <p style={{ color: '#dc2626', fontSize: '0.875rem' }}>{errors.coverLetter}</p>
                                    ) : (
                                        <p style={{ color: '#6b7280', fontSize: '0.875rem' }}>Minimum 100 characters</p>
                                    )}
                                    <p style={{ color: '#6b7280', fontSize: '0.875rem' }}>
                                        {formData.step3_coverLetter.coverLetter.length} / 500
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Step 4: Review & Submit */}
                    {currentStep === 4 && (
                        <div>
                            <h2 style={{ fontSize: '1.5rem', fontWeight: '600', marginBottom: '1.5rem' }}>Review & Submit</h2>

                            <div style={{ marginBottom: '2rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                                    <h3 style={{ fontSize: '1.125rem', fontWeight: '600' }}>Personal Information</h3>
                                    <button
                                        onClick={() => handleEditStep(1)}
                                        style={{
                                            padding: '0.5rem 1rem',
                                            backgroundColor: 'transparent',
                                            color: '#3b82f6',
                                            border: '1px solid #3b82f6',
                                            borderRadius: '6px',
                                            cursor: 'pointer',
                                        }}
                                    >
                                        Edit
                                    </button>
                                </div>
                                <div style={{ backgroundColor: '#f9fafb', padding: '1rem', borderRadius: '6px' }}>
                                    <p><strong>Full Name:</strong> {formData.step1_personal.fullName}</p>
                                    <p><strong>Email:</strong> {formData.step1_personal.email}</p>
                                    <p><strong>Phone:</strong> {formData.step1_personal.phone}</p>
                                    {formData.step1_personal.linkedinUrl && (
                                        <p><strong>LinkedIn:</strong> {formData.step1_personal.linkedinUrl}</p>
                                    )}
                                </div>
                            </div>

                            <div style={{ marginBottom: '2rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                                    <h3 style={{ fontSize: '1.125rem', fontWeight: '600' }}>Experience</h3>
                                    <button
                                        onClick={() => handleEditStep(2)}
                                        style={{
                                            padding: '0.5rem 1rem',
                                            backgroundColor: 'transparent',
                                            color: '#3b82f6',
                                            border: '1px solid #3b82f6',
                                            borderRadius: '6px',
                                            cursor: 'pointer',
                                        }}
                                    >
                                        Edit
                                    </button>
                                </div>
                                <div style={{ backgroundColor: '#f9fafb', padding: '1rem', borderRadius: '6px' }}>
                                    <p><strong>Years of Experience:</strong> {formData.step2_experience.yearsExperience}</p>
                                    <p><strong>Current Role:</strong> {formData.step2_experience.currentRole}</p>
                                    <p><strong>Current Company:</strong> {formData.step2_experience.currentCompany}</p>
                                </div>
                            </div>

                            <div style={{ marginBottom: '2rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                                    <h3 style={{ fontSize: '1.125rem', fontWeight: '600' }}>Cover Letter</h3>
                                    <button
                                        onClick={() => handleEditStep(3)}
                                        style={{
                                            padding: '0.5rem 1rem',
                                            backgroundColor: 'transparent',
                                            color: '#3b82f6',
                                            border: '1px solid #3b82f6',
                                            borderRadius: '6px',
                                            cursor: 'pointer',
                                        }}
                                    >
                                        Edit
                                    </button>
                                </div>
                                <div style={{ backgroundColor: '#f9fafb', padding: '1rem', borderRadius: '6px', whiteSpace: 'pre-wrap' }}>
                                    {formData.step3_coverLetter.coverLetter}
                                </div>
                            </div>

                            <div style={{ marginBottom: '2rem' }}>
                                <h3 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '0.5rem' }}>
                                    Resume Upload
                                </h3>
                                <p style={{ color: '#6b7280', fontSize: '0.875rem', marginBottom: '1rem' }}>
                                    Uploading your resume enables automated skill extraction and improves job matching quality.
                                </p>

                                {!applicationId ? (
                                    <div style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '1rem' }}>
                                        <p style={{ color: '#475569', fontSize: '0.875rem', marginBottom: '0.75rem' }}>
                                            Save your draft once to create an application ID before uploading a resume.
                                        </p>
                                        <button
                                            type="button"
                                            disabled={initializingResumeUpload}
                                            onClick={async () => {
                                                setInitializingResumeUpload(true);
                                                try {
                                                    await ensureDraftApplicationId();
                                                    setToast({
                                                        message: 'Draft initialized. You can now upload your resume.',
                                                        type: 'success',
                                                    });
                                                } catch (error) {
                                                    setToast({
                                                        message: error instanceof Error ? error.message : 'Unable to initialize draft',
                                                        type: 'error',
                                                    });
                                                } finally {
                                                    setInitializingResumeUpload(false);
                                                }
                                            }}
                                            style={{
                                                padding: '0.625rem 1rem',
                                                backgroundColor: initializingResumeUpload ? '#94a3b8' : '#3b82f6',
                                                color: '#ffffff',
                                                border: 'none',
                                                borderRadius: '6px',
                                                fontWeight: '600',
                                                cursor: initializingResumeUpload ? 'not-allowed' : 'pointer',
                                            }}
                                        >
                                            {initializingResumeUpload ? 'Preparing...' : 'Save Draft and Continue'}
                                        </button>
                                    </div>
                                ) : (
                                    <>
                                        <ResumeUpload
                                            applicationId={applicationId}
                                            existingResumeStatus={resumeScanStatus}
                                            existingResumeParsed={isResumeParsed}
                                            onSuccess={() => {
                                                setHasUploadedResume(true);
                                                setResumeScanStatus('pending');
                                                setIsResumeParsed(false);
                                                setResumePopulationStatus('none');
                                                setResumeMergeSummary(null);
                                                setParsedResumeSkills([]);
                                                setParsedResumeSkillsCount(0);
                                                setToast({
                                                    message: 'Resume uploaded. Security scan and parsing are now running.',
                                                    type: 'success',
                                                });
                                            }}
                                            onError={(error) => {
                                                setToast({ message: error, type: 'error' });
                                            }}
                                        />

                                        {hasUploadedResume && (
                                            <>
                                                <p style={{ color: '#475569', fontSize: '0.875rem', marginTop: '0.75rem' }}>
                                                    {getResumeProcessingMessage()}
                                                </p>

                                                {resumePopulationStatus === 'pending_consent' && (
                                                    <div style={{ marginTop: '0.5rem' }}>
                                                        <Link
                                                            href={`/consent?returnTo=/jobs/${requisitionId}/apply`}
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
                                                            Accept Privacy Consent
                                                        </Link>
                                                    </div>
                                                )}

                                                {resumeScanStatus === 'clean' &&
                                                    isResumeParsed &&
                                                    resumePopulationStatus !== 'pending_consent' &&
                                                    heuristicSkillMatchSummary && (
                                                    <div
                                                        style={{
                                                            marginTop: '0.875rem',
                                                            backgroundColor: '#f8fafc',
                                                            border: '1px solid #e2e8f0',
                                                            borderRadius: '8px',
                                                            padding: '0.875rem',
                                                        }}
                                                    >
                                                        <p style={{ margin: 0, color: '#0f172a', fontWeight: 600, fontSize: '0.875rem' }}>
                                                            Parsed Resume Match for {requisitionMatchContext?.title ?? 'this job'}: {heuristicSkillMatchSummary.overallScorePercent}%
                                                        </p>
                                                        <p style={{ margin: '0.25rem 0 0', color: '#64748b', fontSize: '0.75rem' }}>
                                                            Source: Deterministic skill overlap (required + preferred skills)
                                                        </p>
                                                        <p style={{ margin: '0.375rem 0 0', color: '#0f172a', fontWeight: 600, fontSize: '0.875rem' }}>
                                                            Groq Match Score: {groqSkillMatchSummary ? `${groqSkillMatchSummary.overallScorePercent}%` : 'Not available'}
                                                        </p>
                                                        <p style={{ margin: '0.25rem 0 0', color: '#64748b', fontSize: '0.75rem' }}>
                                                            {groqSkillMatchSummary
                                                                ? 'Source: Groq'
                                                                : getGroqFallbackMessage(aiSkillScore?.fallbackReason)}
                                                        </p>
                                                        {skillMatchSummary?.summary && (
                                                            <p style={{ margin: '0.25rem 0 0', color: '#334155', fontSize: '0.8125rem' }}>
                                                                {skillMatchSummary.summary}
                                                            </p>
                                                        )}
                                                        <p style={{ margin: '0.375rem 0 0', color: '#475569', fontSize: '0.8125rem' }}>
                                                            Required skills matched: {heuristicSkillMatchSummary.matchedRequired.length}/
                                                            {requisitionMatchContext?.requiredSkills.length ?? 0} ({heuristicSkillMatchSummary.requiredCoveragePercent}%)
                                                        </p>
                                                        {(requisitionMatchContext?.preferredSkills.length ?? 0) > 0 && (
                                                            <p style={{ margin: '0.25rem 0 0', color: '#475569', fontSize: '0.8125rem' }}>
                                                                Preferred skills matched: {heuristicSkillMatchSummary.matchedPreferred.length}/
                                                                {requisitionMatchContext?.preferredSkills.length ?? 0} ({heuristicSkillMatchSummary.preferredCoveragePercent}%)
                                                            </p>
                                                        )}

                                                        {resumeMergeSummary && (
                                                            <p style={{ margin: '0.25rem 0 0', color: '#334155', fontSize: '0.8125rem' }}>
                                                                Profile sync updated {resumeMergeSummary.addedSkillsCount ?? 0} skills,{' '}
                                                                {resumeMergeSummary.importedEducationEntries ?? 0} education entries, and{' '}
                                                                {resumeMergeSummary.importedWorkHistoryEntries ?? 0} work entries.
                                                            </p>
                                                        )}
                                                    </div>
                                                )}
                                            </>
                                        )}
                                    </>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Navigation Buttons */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2rem', paddingTop: '2rem', borderTop: '1px solid #e5e7eb' }}>
                        <button
                            onClick={handlePrevious}
                            disabled={currentStep === 1}
                            style={{
                                padding: '0.75rem 1.5rem',
                                backgroundColor: currentStep === 1 ? '#e5e7eb' : 'white',
                                color: currentStep === 1 ? '#9ca3af' : '#374151',
                                border: '1px solid #d1d5db',
                                borderRadius: '6px',
                                cursor: currentStep === 1 ? 'not-allowed' : 'pointer',
                                fontWeight: '500',
                            }}
                        >
                            ← Previous
                        </button>

                        {currentStep < 4 ? (
                            <button
                                onClick={handleNext}
                                style={{
                                    padding: '0.75rem 1.5rem',
                                    backgroundColor: '#3b82f6',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    fontWeight: '500',
                                }}
                            >
                                Next →
                            </button>
                        ) : (
                            <button
                                onClick={handleSubmit}
                                disabled={isSubmitting || applicationStatus === 'submitted' || !resumeReadyForSubmission}
                                style={{
                                    padding: '0.75rem 1.5rem',
                                    backgroundColor:
                                        isSubmitting || applicationStatus === 'submitted' || !resumeReadyForSubmission
                                            ? '#93c5fd'
                                            : '#3b82f6',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '6px',
                                    cursor:
                                        isSubmitting || applicationStatus === 'submitted' || !resumeReadyForSubmission
                                            ? 'not-allowed'
                                            : 'pointer',
                                    fontWeight: '500',
                                }}
                            >
                                {isSubmitting
                                    ? 'Submitting...'
                                    : applicationStatus === 'submitted'
                                        ? 'Submitted'
                                        : !hasUploadedResume
                                            ? 'Upload Resume to Submit'
                                            : resumePopulationStatus === 'pending_consent'
                                                ? 'Accept Privacy Consent To Continue'
                                            : resumePopulationStatus === 'pending_profile_sync'
                                                ? 'Applying Resume Insights'
                                            : resumeScanStatus === 'pending'
                                                ? 'Waiting For Security Scan'
                                                : !isResumeParsed
                                                    ? 'Waiting For AI Skill Extraction'
                                            : 'Submit Application'}
                            </button>
                        )}
                    </div>
                </div>
            </div>
            </div>
        </div>
    );
}
