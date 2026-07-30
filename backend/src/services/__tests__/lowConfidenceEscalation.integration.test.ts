/**
 * Integration Tests: Low Confidence Escalation
 * 
 * Tests that applications with low AI confidence (<0.5) are automatically
 * escalated to manual review queue with appropriate reason and metadata
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import prisma from '../../db/prisma';
import { performScreening } from '../../services/screeningService';

describe('Low Confidence Escalation Integration Tests', () => {
    let testApplicationId: string;
    let testResumeId: string;

    beforeEach(async () => {
        // Create test data with incomplete resume (triggers low confidence)
        const candidate = await prisma.candidate.create({
            data: {
                email: 'lowconf@test.com',
                firstName: 'Low',
                lastName: 'Confidence',
                passwordHash: 'test',
                status: 'active',
            },
        });

        const requisition = await prisma.requisition.create({
            data: {
                title: 'Test Position',
                description: 'Test',
                status: 'open',
                jobType: 'full_time',
                requiredSkills: ['JavaScript', 'React'],
                preferredSkills: ['TypeScript'],
                minExperienceYears: 2,
                educationLevel: "Bachelor's",
            },
        });

        const application = await prisma.application.create({
            data: {
                candidateId: candidate.id,
                requisitionId: requisition.id,
                status: 'screening',
            },
        });

        testApplicationId = application.id;

        const resume = await prisma.resume.create({
            data: {
                applicationId: application.id,
                storageKey: 'test-key',
                fileName: 'test.pdf',
                fileSize: 1000,
                mimeType: 'application/pdf',
                scanStatus: 'clean',
                parsedData: {
                    // Incomplete data - only 1 skill, missing education
                    name: 'Low Confidence',
                    email: 'lowconf@test.com',
                    phone: '1234567890',
                    skills: ['JavaScript'], // Very few skills = low data quality
                    experience_years: 2,
                    employers: [
                        {
                            name: 'Test Company',
                            title: 'Developer',
                            duration: '2 years',
                        },
                    ],
                    education: [], // No education = low data quality
                    extracted_at: new Date().toISOString(),
                },
            },
        });

        testResumeId = resume.id;
    });

    afterEach(async () => {
        // Cleanup
        await prisma.screening.deleteMany({
            where: { applicationId: testApplicationId },
        });
        await prisma.resume.deleteMany({ where: { id: testResumeId } });
        await prisma.application.deleteMany({ where: { id: testApplicationId } });
        await prisma.candidate.deleteMany({ where: { email: 'lowconf@test.com' } });
        await prisma.requisition.deleteMany({ where: { title: 'Test Position' } });
    });

    it('should calculate low confidence for incomplete resume data', async () => {
        const result = await performScreening(testApplicationId);

        const screening = await prisma.screening.findFirst({
            where: { applicationId: testApplicationId },
        });

        expect(screening).toBeTruthy();
        expect(screening!.confidence).toBeLessThan(0.5);
    });

    it('should escalate low-confidence application to manual review', async () => {
        await performScreening(testApplicationId);

        const application = await prisma.application.findUnique({
            where: { id: testApplicationId },
        });

        expect(application!.status).toBe('pending_review');
        expect(application!.manualReviewReason).toBe('low_confidence');
    });

    it('should override normal recommendation with manual_review when confidence is low', async () => {
        const result = await performScreening(testApplicationId);

        expect(result.recommendation).toBe('manual_review');

        const screening = await prisma.screening.findFirst({
            where: { applicationId: testApplicationId },
        });

        expect(screening!.recommendation).toBe('manual_review');
    });
});
