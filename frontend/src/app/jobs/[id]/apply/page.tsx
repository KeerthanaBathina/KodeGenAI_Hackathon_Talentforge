'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAutoSave } from '@/hooks/useAutoSave';
import Toast from '@/components/Toast';

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

function getApiUrl(pathname: string): string {
    const base = process.env.NEXT_PUBLIC_API_URL?.trim() ?? '';
    if (!base || (typeof window !== 'undefined' && window.location.hostname === '127.0.0.1')) {
        return pathname;
    }
    return `${base}${pathname}`;
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
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

    // Load profile and draft on mount
    useEffect(() => {
        async function loadData() {
            try {
                // Load profile data
                const profileResponse = await fetch(getApiUrl('/api/profile'), {
                    credentials: 'include',
                });

                if (profileResponse.ok) {
                    const profile = await profileResponse.json();
                    setFormData((prev) => ({
                        ...prev,
                        step1_personal: {
                            ...prev.step1_personal,
                            fullName: profile.fullName || '',
                            email: profile.candidate?.email || '',
                        },
                    }));
                }

                // Load draft if exists
                const draftResponse = await fetch(getApiUrl(`/api/applications/drafts/${requisitionId}`), {
                    credentials: 'include',
                });

                if (draftResponse.ok) {
                    const draft = await draftResponse.json();
                    if (draft.draftData) {
                        setFormData({
                            step1_personal: draft.draftData.step1_personal || formData.step1_personal,
                            step2_experience: draft.draftData.step2_experience || formData.step2_experience,
                            step3_coverLetter: draft.draftData.step3_coverLetter || formData.step3_coverLetter,
                        });
                        setCurrentStep(draft.draftData.currentStep || 1);
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
            const response = await fetch(getApiUrl(`/api/applications/drafts/${requisitionId}/submit`), {
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
            <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <p>Loading application form...</p>
            </div>
        );
    }

    return (
        <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb', padding: '2rem' }}>
            {/* Toast Notifications */}
            {toast && (
                <Toast
                    message={toast.message}
                    type={toast.type}
                    onClose={() => setToast(null)}
                />
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
                        <span>Review</span>
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
                                disabled={isSubmitting || applicationStatus === 'submitted'}
                                style={{
                                    padding: '0.75rem 1.5rem',
                                    backgroundColor: isSubmitting || applicationStatus === 'submitted' ? '#93c5fd' : '#3b82f6',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '6px',
                                    cursor: isSubmitting || applicationStatus === 'submitted' ? 'not-allowed' : 'pointer',
                                    fontWeight: '500',
                                }}
                            >
                                {isSubmitting ? 'Submitting...' : applicationStatus === 'submitted' ? 'Submitted' : 'Submit Application'}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
            </div >
        </div >
    );
}
