import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import prisma from '../../db/prisma';
import * as profileService from '../profileService';
import { ProfileError } from '../profileService';

describe('profileService', () => {
    let testCandidate: any;

    beforeEach(async () => {
        testCandidate = await prisma.candidate.create({
            data: {
                email: `profile-test-${Date.now()}@example.com`,
                fullName: 'Test User',
                phoneNumber: null,
                status: 'active',
            },
        });
    });

    afterEach(async () => {
        await prisma.privacyConsent.deleteMany({ where: { candidateId: testCandidate.id } });
        await prisma.profile.deleteMany({ where: { candidateId: testCandidate.id } });
        await prisma.candidate.delete({ where: { id: testCandidate.id } });
    });

    describe('createProfile', () => {
        it('creates profile with 0% completion for minimal data', async () => {
            const profile = await profileService.createProfile(testCandidate.id, {
                fullName: 'Test',
                experienceYears: 0,
                skills: [],
                education: [],
                workHistory: [],
            });

            expect(profile.profileCompletionPercentage).toBe(0);
            expect(profile.completionStatus.completedSections).toHaveLength(0);
            expect(profile.completionStatus.percentage).toBe(0);
            expect(profile.fullName).toBe('Test');
        });

        it('calculates 20% completion when only basic info complete', async () => {
            const profile = await profileService.createProfile(testCandidate.id, {
                fullName: 'Jane Doe',
                experienceYears: 5,
                skills: [],
                education: [],
                workHistory: [],
            });

            expect(profile.profileCompletionPercentage).toBe(20);
            expect(profile.completionStatus.completedSections).toContain('basic_info');
            expect(profile.completionStatus.missingFields).toContain('skills');
            expect(profile.completionStatus.missingFields).toContain('education');
            expect(profile.completionStatus.missingFields).toContain('workHistory');
            expect(profile.completionStatus.missingFields).toContain('privacyConsent');
        });

        it('calculates 40% completion with basic info and skills', async () => {
            const profile = await profileService.createProfile(testCandidate.id, {
                fullName: 'Jane Doe',
                experienceYears: 5,
                skills: ['JavaScript', 'TypeScript', 'React'],
                education: [],
                workHistory: [],
            });

            expect(profile.profileCompletionPercentage).toBe(40);
            expect(profile.completionStatus.completedSections).toContain('basic_info');
            expect(profile.completionStatus.completedSections).toContain('skills');
            expect(profile.completionStatus.completedSections).toHaveLength(2);
        });

        it('throws PROFILE_ALREADY_EXISTS if profile exists', async () => {
            await profileService.createProfile(testCandidate.id, {
                fullName: 'Test',
                experienceYears: 0,
                skills: [],
                education: [],
                workHistory: [],
            });

            await expect(
                profileService.createProfile(testCandidate.id, {
                    fullName: 'Another',
                    experienceYears: 1,
                    skills: [],
                    education: [],
                    workHistory: [],
                })
            ).rejects.toThrow(ProfileError);
        });

        it('throws CANDIDATE_NOT_FOUND for invalid candidateId', async () => {
            await expect(
                profileService.createProfile('invalid-candidate-id', {
                    fullName: 'Test',
                    experienceYears: 0,
                    skills: [],
                    education: [],
                    workHistory: [],
                })
            ).rejects.toThrow(ProfileError);
        });
    });

    describe('getProfileByCandidate', () => {
        it('returns profile with completion status', async () => {
            await profileService.createProfile(testCandidate.id, {
                fullName: 'Jane Doe',
                experienceYears: 5,
                skills: ['JavaScript', 'TypeScript', 'React'],
                education: [
                    {
                        institution: 'MIT',
                        degree: 'BS Computer Science',
                        fieldOfStudy: 'Software Engineering',
                        startDate: '2015-09-01',
                        endDate: '2019-06-01',
                        isCurrent: false,
                    },
                ],
                workHistory: [],
            });

            const profile = await profileService.getProfileByCandidate(testCandidate.id);

            expect(profile).toBeDefined();
            expect(profile.fullName).toBe('Jane Doe');
            expect(profile.profileCompletionPercentage).toBe(60);
            expect(profile.completionStatus.completedSections).toContain('basic_info');
            expect(profile.completionStatus.completedSections).toContain('skills');
            expect(profile.completionStatus.completedSections).toContain('education');
        });

        it('throws PROFILE_NOT_FOUND when profile does not exist', async () => {
            await expect(
                profileService.getProfileByCandidate(testCandidate.id)
            ).rejects.toThrow(ProfileError);
        });
    });

    describe('updateProfile', () => {
        it('updates profile and recalculates completion', async () => {
            await profileService.createProfile(testCandidate.id, {
                fullName: 'Test',
                experienceYears: 0,
                skills: [],
                education: [],
                workHistory: [],
            });

            const updated = await profileService.updateProfile(testCandidate.id, {
                skills: ['JavaScript', 'TypeScript', 'React'],
            });

            expect(updated.skills).toHaveLength(3);
            expect(updated.completionStatus.completedSections).toContain('skills');
            expect(updated.profileCompletionPercentage).toBeGreaterThan(0);
        });

        it('allows partial updates without affecting other fields', async () => {
            await profileService.createProfile(testCandidate.id, {
                fullName: 'Original Name',
                experienceYears: 5,
                skills: ['JavaScript'],
                education: [],
                workHistory: [],
            });

            const updated = await profileService.updateProfile(testCandidate.id, {
                experienceYears: 10,
            });

            expect(updated.fullName).toBe('Original Name');
            expect(updated.experienceYears).toBe(10);
            expect(updated.skills).toHaveLength(1);
        });

        it('updates lastCompletedSection when section is newly completed', async () => {
            await profileService.createProfile(testCandidate.id, {
                fullName: 'Jane Doe',
                experienceYears: 5,
                skills: [],
                education: [],
                workHistory: [],
            });

            const updated = await profileService.updateProfile(testCandidate.id, {
                skills: ['JavaScript', 'TypeScript', 'React'],
            });

            expect(updated.lastCompletedSection).toBe('skills');
        });
    });

    describe('deleteProfile', () => {
        it('deletes profile successfully', async () => {
            await profileService.createProfile(testCandidate.id, {
                fullName: 'Test',
                experienceYears: 0,
                skills: [],
                education: [],
                workHistory: [],
            });

            await profileService.deleteProfile(testCandidate.id);

            await expect(
                profileService.getProfileByCandidate(testCandidate.id)
            ).rejects.toThrow(ProfileError);
        });

        it('throws PROFILE_NOT_FOUND when deleting non-existent profile', async () => {
            await expect(
                profileService.deleteProfile(testCandidate.id)
            ).rejects.toThrow(ProfileError);
        });
    });

    describe('calculateProfileCompletion', () => {
        it('returns 0% for empty profile', async () => {
            await profileService.createProfile(testCandidate.id, {
                fullName: '',
                experienceYears: 0,
                skills: [],
                education: [],
                workHistory: [],
            });

            const completion = await profileService.calculateProfileCompletion(testCandidate.id);

            expect(completion.percentage).toBe(0);
            expect(completion.completedSections).toHaveLength(0);
            expect(completion.missingFields).toContain('fullName');
        });

        it('returns 20% for basic info only', async () => {
            await profileService.createProfile(testCandidate.id, {
                fullName: 'Jane Doe',
                experienceYears: 5,
                skills: [],
                education: [],
                workHistory: [],
            });

            const completion = await profileService.calculateProfileCompletion(testCandidate.id);

            expect(completion.percentage).toBe(20);
            expect(completion.completedSections).toContain('basic_info');
            expect(completion.completedSections).toHaveLength(1);
        });

        it('returns 40% for basic info and skills', async () => {
            await profileService.createProfile(testCandidate.id, {
                fullName: 'Jane Doe',
                experienceYears: 5,
                skills: ['JavaScript', 'TypeScript', 'React'],
                education: [],
                workHistory: [],
            });

            const completion = await profileService.calculateProfileCompletion(testCandidate.id);

            expect(completion.percentage).toBe(40);
            expect(completion.completedSections).toHaveLength(2);
        });

        it('returns 60% for basic info, skills, and education', async () => {
            await profileService.createProfile(testCandidate.id, {
                fullName: 'Jane Doe',
                experienceYears: 5,
                skills: ['JavaScript', 'TypeScript', 'React'],
                education: [
                    {
                        institution: 'MIT',
                        degree: 'BS CS',
                        startDate: '2015-09-01',
                        isCurrent: false,
                    },
                ],
                workHistory: [],
            });

            const completion = await profileService.calculateProfileCompletion(testCandidate.id);

            expect(completion.percentage).toBe(60);
            expect(completion.completedSections).toContain('education');
        });

        it('returns 80% for all sections except privacy consent', async () => {
            await profileService.createProfile(testCandidate.id, {
                fullName: 'Jane Doe',
                experienceYears: 5,
                skills: ['JavaScript', 'TypeScript', 'React'],
                education: [
                    {
                        institution: 'MIT',
                        degree: 'BS CS',
                        startDate: '2015-09-01',
                        isCurrent: false,
                    },
                ],
                workHistory: [
                    {
                        company: 'TechCorp',
                        title: 'Engineer',
                        startDate: '2020-01-01',
                        isCurrent: true,
                    },
                ],
            });

            const completion = await profileService.calculateProfileCompletion(testCandidate.id);

            expect(completion.percentage).toBe(80);
            expect(completion.completedSections).toHaveLength(4);
            expect(completion.missingFields).toContain('privacyConsent');
        });

        it('returns 100% when all sections complete including consent', async () => {
            await profileService.createProfile(testCandidate.id, {
                fullName: 'Jane Doe',
                experienceYears: 5,
                skills: ['JavaScript', 'TypeScript', 'React'],
                education: [
                    {
                        institution: 'MIT',
                        degree: 'BS CS',
                        startDate: '2015-09-01',
                        isCurrent: false,
                    },
                ],
                workHistory: [
                    {
                        company: 'TechCorp',
                        title: 'Engineer',
                        startDate: '2020-01-01',
                        isCurrent: true,
                    },
                ],
            });

            // Record consent
            await prisma.privacyConsent.create({
                data: {
                    candidateId: testCandidate.id,
                    policyVersion: '1.0',
                    ipAddress: '127.0.0.1',
                },
            });

            const completion = await profileService.calculateProfileCompletion(testCandidate.id);

            expect(completion.percentage).toBe(100);
            expect(completion.completedSections).toHaveLength(5);
            expect(completion.completedSections).toContain('basic_info');
            expect(completion.completedSections).toContain('skills');
            expect(completion.completedSections).toContain('education');
            expect(completion.completedSections).toContain('work_history');
            expect(completion.completedSections).toContain('privacy_consent');
            expect(completion.missingFields).toHaveLength(0);
        });

        it('does not count revoked consent towards completion', async () => {
            await profileService.createProfile(testCandidate.id, {
                fullName: 'Jane Doe',
                experienceYears: 5,
                skills: ['JavaScript', 'TypeScript', 'React'],
                education: [
                    {
                        institution: 'MIT',
                        degree: 'BS CS',
                        startDate: '2015-09-01',
                        isCurrent: false,
                    },
                ],
                workHistory: [
                    {
                        company: 'TechCorp',
                        title: 'Engineer',
                        startDate: '2020-01-01',
                        isCurrent: true,
                    },
                ],
            });

            // Record and revoke consent
            await prisma.privacyConsent.create({
                data: {
                    candidateId: testCandidate.id,
                    policyVersion: '1.0',
                    ipAddress: '127.0.0.1',
                    revokedAt: new Date(),
                },
            });

            const completion = await profileService.calculateProfileCompletion(testCandidate.id);

            expect(completion.percentage).toBe(80);
            expect(completion.completedSections).not.toContain('privacy_consent');
            expect(completion.missingFields).toContain('privacyConsent');
        });
    });

    describe('getCompletionStatus', () => {
        it('returns completion status without full profile data', async () => {
            await profileService.createProfile(testCandidate.id, {
                fullName: 'Jane Doe',
                experienceYears: 5,
                skills: ['JavaScript', 'TypeScript', 'React'],
                education: [],
                workHistory: [],
            });

            const status = await profileService.getCompletionStatus(testCandidate.id);

            expect(status.percentage).toBe(40);
            expect(status.completedSections).toHaveLength(2);
            expect(status.missingFields).toContain('education');
            expect(status.missingFields).toContain('workHistory');
        });
    });
});
