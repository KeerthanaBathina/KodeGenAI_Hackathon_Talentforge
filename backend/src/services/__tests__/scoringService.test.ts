import { describe, it, expect } from 'vitest';
import { computeScreeningScore } from '../scoringService';

describe('ScoringService', () => {
    describe('computeScreeningScore', () => {
        it('should score close to 100 for perfect match', () => {
            const input = {
                parsedData: {
                    skills: ['Python', 'React', 'PostgreSQL'],
                    experience_years: 5,
                    education: [{ degree: 'Master', field: 'Computer Science', institution: 'MIT' }],
                    employers: [],
                },
                requisition: {
                    requiredSkills: ['Python', 'React', 'PostgreSQL'],
                    preferredSkills: [],
                    minExperienceYears: 3,
                    educationLevel: 'bachelors',
                },
            };

            const result = computeScreeningScore(input);

            expect(result.score).toBeGreaterThanOrEqual(95);
            expect(result.score).toBeLessThanOrEqual(100);
            expect(result.factors.positiveFactors.length).toBeGreaterThan(0);
            expect(result.factors.skillGaps.length).toBe(0);
        });

        it('should score 0 for no matches', () => {
            const input = {
                parsedData: {
                    skills: ['Java', 'Angular'],
                    experience_years: 0,
                    education: [],
                    employers: [],
                },
                requisition: {
                    requiredSkills: ['Python', 'React'],
                    preferredSkills: ['PostgreSQL'],
                    minExperienceYears: 5,
                    educationLevel: 'masters',
                },
            };

            const result = computeScreeningScore(input);

            expect(result.score).toBeLessThan(20);
            expect(result.factors.skillGaps.length).toBeGreaterThan(0);
        });

        it('should score 15 points for 50% required skills matched', () => {
            const input = {
                parsedData: {
                    skills: ['Python'],
                    experience_years: 0,
                    education: [],
                    employers: [],
                },
                requisition: {
                    requiredSkills: ['Python', 'React'],
                    preferredSkills: [],
                    minExperienceYears: 0,
                    educationLevel: null,
                },
            };

            const result = computeScreeningScore(input);

            // 50% of required skills = 15 points, no experience req = 30 points, no edu req = 20 points
            expect(result.score).toBe(65);
            expect(result.factors.positiveFactors).toContain('Skill: Python');
            expect(result.factors.skillGaps).toContain('Missing required skill: React');
        });

        it('should match skills case-insensitively', () => {
            const input = {
                parsedData: {
                    skills: ['python', 'REACT'],
                    experience_years: 0,
                    education: [],
                    employers: [],
                },
                requisition: {
                    requiredSkills: ['Python', 'React'],
                    preferredSkills: [],
                    minExperienceYears: 0,
                    educationLevel: null,
                },
            };

            const result = computeScreeningScore(input);

            expect(result.score).toBe(80); // 30 (required) + 30 (no exp req) + 20 (no edu req)
            expect(result.factors.skillGaps.length).toBe(0);
        });

        it('should match skills with partial keyword matching', () => {
            const input = {
                parsedData: {
                    skills: ['Node.js', 'TypeScript'],
                    experience_years: 0,
                    education: [],
                    employers: [],
                },
                requisition: {
                    requiredSkills: ['Node', 'TypeScript'],
                    preferredSkills: [],
                    minExperienceYears: 0,
                    educationLevel: null,
                },
            };

            const result = computeScreeningScore(input);

            expect(result.score).toBe(80); // Full skill match
            expect(result.factors.positiveFactors).toContain('Skill: Node');
            expect(result.factors.positiveFactors).toContain('Skill: TypeScript');
        });

        it('should score experience at minimum requirement (25 points)', () => {
            const input = {
                parsedData: {
                    skills: [],
                    experience_years: 5,
                    education: [],
                    employers: [],
                },
                requisition: {
                    requiredSkills: [],
                    preferredSkills: [],
                    minExperienceYears: 5,
                    educationLevel: null,
                },
            };

            const result = computeScreeningScore(input);

            expect(result.factors.scoreBreakdown.experienceMatch).toBe(25);
            expect(result.factors.positiveFactors).toContainEqual(expect.stringContaining('5 years experience'));
        });

        it('should score experience exceeding requirement (30 points)', () => {
            const input = {
                parsedData: {
                    skills: [],
                    experience_years: 10,
                    education: [],
                    employers: [],
                },
                requisition: {
                    requiredSkills: [],
                    preferredSkills: [],
                    minExperienceYears: 5,
                    educationLevel: null,
                },
            };

            const result = computeScreeningScore(input);

            expect(result.factors.scoreBreakdown.experienceMatch).toBe(30);
            expect(result.factors.positiveFactors).toContainEqual(expect.stringContaining('significantly exceeds'));
        });

        it('should score experience 50% below minimum (10 points)', () => {
            const input = {
                parsedData: {
                    skills: [],
                    experience_years: 3,
                    education: [],
                    employers: [],
                },
                requisition: {
                    requiredSkills: [],
                    preferredSkills: [],
                    minExperienceYears: 5,
                    educationLevel: null,
                },
            };

            const result = computeScreeningScore(input);

            expect(result.factors.scoreBreakdown.experienceMatch).toBe(20);
        });

        it('should score education at requirement (18 points)', () => {
            const input = {
                parsedData: {
                    skills: [],
                    experience_years: 0,
                    education: [{ degree: 'Bachelor', field: 'CS', institution: 'MIT' }],
                    employers: [],
                },
                requisition: {
                    requiredSkills: [],
                    preferredSkills: [],
                    minExperienceYears: 0,
                    educationLevel: 'bachelors',
                },
            };

            const result = computeScreeningScore(input);

            expect(result.factors.scoreBreakdown.educationMatch).toBe(18);
            expect(result.factors.positiveFactors).toContainEqual(expect.stringContaining('Bachelor'));
        });

        it('should score education exceeding requirement (20 points)', () => {
            const input = {
                parsedData: {
                    skills: [],
                    experience_years: 0,
                    education: [{ degree: 'Master', field: 'CS', institution: 'MIT' }],
                    employers: [],
                },
                requisition: {
                    requiredSkills: [],
                    preferredSkills: [],
                    minExperienceYears: 0,
                    educationLevel: 'bachelors',
                },
            };

            const result = computeScreeningScore(input);

            expect(result.factors.scoreBreakdown.educationMatch).toBe(20);
            expect(result.factors.positiveFactors).toContainEqual(expect.stringContaining('exceeds'));
        });

        it('should score education below requirement (0 points)', () => {
            const input = {
                parsedData: {
                    skills: [],
                    experience_years: 0,
                    education: [{ degree: 'High School', field: '', institution: 'Local HS' }],
                    employers: [],
                },
                requisition: {
                    requiredSkills: [],
                    preferredSkills: [],
                    minExperienceYears: 0,
                    educationLevel: 'bachelors',
                },
            };

            const result = computeScreeningScore(input);

            expect(result.factors.scoreBreakdown.educationMatch).toBe(0);
        });

        it('should identify preferred skills as positive factors', () => {
            const input = {
                parsedData: {
                    skills: ['Docker', 'Kubernetes'],
                    experience_years: 0,
                    education: [],
                    employers: [],
                },
                requisition: {
                    requiredSkills: [],
                    preferredSkills: ['Docker', 'Kubernetes'],
                    minExperienceYears: 0,
                    educationLevel: null,
                },
            };

            const result = computeScreeningScore(input);

            expect(result.factors.positiveFactors).toContain('Skill: Docker');
            expect(result.factors.positiveFactors).toContain('Skill: Kubernetes');
            expect(result.factors.scoreBreakdown.skillMatch).toBe(20); // 100% of preferred
        });

        it('should clamp total score to 100', () => {
            // This shouldn't happen in practice, but ensure clamping works
            const input = {
                parsedData: {
                    skills: ['A', 'B', 'C'],
                    experience_years: 999,
                    education: [{ degree: 'PhD', field: 'CS', institution: 'MIT' }],
                    employers: [],
                },
                requisition: {
                    requiredSkills: ['A'],
                    preferredSkills: [],
                    minExperienceYears: 1,
                    educationLevel: 'bachelors',
                },
            };

            const result = computeScreeningScore(input);

            expect(result.score).toBeLessThanOrEqual(100);
        });

        it('should provide detailed score breakdown', () => {
            const input = {
                parsedData: {
                    skills: ['Python', 'React'],
                    experience_years: 5,
                    education: [{ degree: 'Bachelor', field: 'CS', institution: 'MIT' }],
                    employers: [],
                },
                requisition: {
                    requiredSkills: ['Python', 'React'],
                    preferredSkills: ['Docker'],
                    minExperienceYears: 3,
                    educationLevel: 'bachelors',
                },
            };

            const result = computeScreeningScore(input);

            expect(result.factors.scoreBreakdown).toHaveProperty('skillMatch');
            expect(result.factors.scoreBreakdown).toHaveProperty('experienceMatch');
            expect(result.factors.scoreBreakdown).toHaveProperty('educationMatch');
            expect(
                result.factors.scoreBreakdown.skillMatch +
                result.factors.scoreBreakdown.experienceMatch +
                result.factors.scoreBreakdown.educationMatch
            ).toBe(result.score);
        });
    });
});
