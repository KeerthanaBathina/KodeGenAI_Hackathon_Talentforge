'use client';

import React, { useState, useEffect, FormEvent } from 'react';
import { useRouter } from 'next/navigation';

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

function getApiUrl(pathname: string): string {
    const base = process.env.NEXT_PUBLIC_API_URL?.trim() ?? '';
    if (!base || (typeof window !== 'undefined' && window.location.hostname === '127.0.0.1')) {
        return pathname;
    }
    return `${base}${pathname}`;
}

export default function ProfilePage() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    const [profileExists, setProfileExists] = useState(false);
    const [completionPercentage, setCompletionPercentage] = useState(0);

    // Form state
    const [fullName, setFullName] = useState('');
    const [experienceYears, setExperienceYears] = useState(0);
    const [skills, setSkills] = useState<string[]>([]);
    const [skillInput, setSkillInput] = useState('');
    const [education, setEducation] = useState<EducationEntry[]>([]);
    const [workHistory, setWorkHistory] = useState<WorkExperience[]>([]);

    // Load existing profile
    useEffect(() => {
        async function loadProfile() {
            try {
                const response = await fetch(getApiUrl('/api/profile'), {
                    credentials: 'include',
                });

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
                setCompletionPercentage(data.profileCompletionPercentage || 0);
            } catch (err) {
                console.error('Error loading profile:', err);
                setError('Unable to load profile data');
            } finally {
                setLoading(false);
            }
        }

        loadProfile();
    }, []);

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setError(null);
        setSuccess(false);

        if (!fullName || fullName.trim().length === 0) {
            setError('Full name is required');
            return;
        }

        if (skills.length < 3) {
            setError('Please add at least 3 skills');
            return;
        }

        if (education.length === 0) {
            setError('Please add at least one education entry');
            return;
        }

        if (workHistory.length === 0) {
            setError('Please add at least one work experience entry');
            return;
        }

        setSaving(true);

        try {
            const method = profileExists ? 'PUT' : 'POST';
            const response = await fetch(getApiUrl('/api/profile'), {
                method,
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    fullName,
                    experienceYears,
                    skills,
                    education,
                    workHistory,
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                setError(data.error?.message || 'Unable to save profile');
                setSaving(false);
                return;
            }

            setProfileExists(true);
            setCompletionPercentage(data.profileCompletionPercentage || 0);
            setSuccess(true);

            setTimeout(() => setSuccess(false), 3000);
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
        updated[index] = { ...updated[index], [field]: value };
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
        updated[index] = { ...updated[index], [field]: value };
        setWorkHistory(updated);
    }

    function removeWorkHistory(index: number) {
        setWorkHistory(workHistory.filter((_, i) => i !== index));
    }

    if (loading) {
        return (
            <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f9fafb' }}>
                <p>Loading profile...</p>
            </div>
        );
    }

    return (
        <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb', padding: '2rem' }}>
            <div style={{ maxWidth: '800px', margin: '0 auto' }}>
                <div style={{ backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', padding: '2rem' }}>
                    <div style={{ marginBottom: '2rem' }}>
                        <h1 style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>
                            {profileExists ? 'Edit Profile' : 'Create Profile'}
                        </h1>
                        <p style={{ color: '#6b7280' }}>
                            Complete your profile to apply for jobs. Current completion: <strong>{completionPercentage}%</strong>
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
                                                type="date"
                                                value={edu.startDate}
                                                onChange={(e) => updateEducation(index, 'startDate', e.target.value)}
                                                required
                                                disabled={saving}
                                                style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '6px' }}
                                            />
                                        </div>

                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem' }}>End Date</label>
                                            <input
                                                type="date"
                                                value={edu.endDate || ''}
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
                                                type="date"
                                                value={work.startDate}
                                                onChange={(e) => updateWorkHistory(index, 'startDate', e.target.value)}
                                                required
                                                disabled={saving}
                                                style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '6px' }}
                                            />
                                        </div>

                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem' }}>End Date</label>
                                            <input
                                                type="date"
                                                value={work.endDate || ''}
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
