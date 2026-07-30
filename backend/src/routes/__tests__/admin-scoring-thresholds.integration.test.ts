/**
 * Integration Tests for Admin Scoring Thresholds API
 * 
 * Tests REST API endpoints for job-family-specific AI scoring thresholds with versioning.
 * Verifies: effective-date isolation, validation, and change history.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../app';
import prisma from '../../db/prisma';
import { JwtService } from '../../services/jwtService';
import { UserRole } from '@prisma/client';

describe('Admin Scoring Thresholds API', () => {
    let adminToken: string;
    let recruiterToken: string;
    let adminUserId: string;
    let recruiterUserId: string;
    let jobFamilyId: string;

    beforeAll(async () => {
        // Clean up test data
        await prisma.scoringThreshold.deleteMany({
            where: {
                createdBy: {
                    email: {
                        contains: '@scoring-test'
                    }
                }
            }
        });

        await prisma.jobFamily.deleteMany({
            where: {
                name: 'Test Job Family'
            }
        });

        await prisma.user.deleteMany({
            where: {
                email: {
                    contains: '@scoring-test'
                }
            }
        });

        // Create admin user
        const adminUser = await prisma.user.create({
            data: {
                email: 'scoring-admin@scoring-test',
                fullName: 'Scoring Admin',
                role: UserRole.admin,
                timezone: 'UTC',
                active: true
            }
        });
        adminUserId = adminUser.id;

        // Create recruiter user (non-admin)
        const recruiterUser = await prisma.user.create({
            data: {
                email: 'scoring-recruiter@scoring-test',
                fullName: 'Scoring Recruiter',
                role: UserRole.recruiter,
                timezone: 'UTC',
                active: true
            }
        });
        recruiterUserId = recruiterUser.id;

        // Create test job family
        const jobFamily = await prisma.jobFamily.create({
            data: {
                name: 'Test Job Family',
                description: 'Test family for scoring thresholds'
            }
        });
        jobFamilyId = jobFamily.id;

        // Generate tokens
        const jwtService = new JwtService();
        adminToken = jwtService.signAccessToken(adminUserId, UserRole.admin);
        recruiterToken = jwtService.signAccessToken(recruiterUserId, UserRole.recruiter);
    });

    afterAll(async () => {
        // Clean up test data
        await prisma.scoringThreshold.deleteMany({
            where: {
                createdBy: {
                    email: {
                        contains: '@scoring-test'
                    }
                }
            }
        });

        await prisma.jobFamily.deleteMany({
            where: {
                name: 'Test Job Family'
            }
        });

        await prisma.user.deleteMany({
            where: {
                email: {
                    contains: '@scoring-test'
                }
            }
        });

        await prisma.$disconnect();
    });

    describe('Scenario 1: New threshold version with future effective date does not affect current applications', () => {
        it('should create scoring threshold with future effective date', async () => {
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            tomorrow.setHours(0, 0, 0, 0);

            const response = await request(app)
                .post('/api/admin/scoring-thresholds')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    jobFamilyId,
                    aiShortlistThreshold: 0.75,
                    confidenceThreshold: 0.8,
                    experienceThresholdYears: 3,
                    effectiveFrom: tomorrow.toISOString()
                });

            expect(response.status).toBe(201);
            expect(response.body.id).toBeDefined();
            expect(parseFloat(response.body.aiShortlistThreshold)).toBe(0.75);
            expect(new Date(response.body.effectiveFrom)).toEqual(
                expect.objectContaining({
                    toISOString: expect.any(Function)
                })
            );
        });

        it('should query thresholds with effective date matching logic', async () => {
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const tomorrow = new Date(today);
            tomorrow.setDate(tomorrow.getDate() + 1);

            // Create version 1: effective today with threshold 0.70
            await request(app)
                .post('/api/admin/scoring-thresholds')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    jobFamilyId,
                    aiShortlistThreshold: 0.70,
                    confidenceThreshold: 0.75,
                    experienceThresholdYears: 2,
                    effectiveFrom: today.toISOString()
                });

            // Create version 2: effective tomorrow with threshold 0.75
            await request(app)
                .post('/api/admin/scoring-thresholds')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    jobFamilyId,
                    aiShortlistThreshold: 0.75,
                    confidenceThreshold: 0.80,
                    experienceThresholdYears: 3,
                    effectiveFrom: tomorrow.toISOString()
                });

            // Query effective thresholds for today
            const response = await request(app)
                .get(`/api/admin/scoring-thresholds?jobFamilyId=${jobFamilyId}`)
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
            expect(response.body.thresholds.length).toBeGreaterThan(0);
            
            const todayThreshold = response.body.thresholds.find(
                (t: any) => t.jobFamilyId === jobFamilyId
            );
            
            // Today's query should get version 1 (0.70)
            expect(parseFloat(todayThreshold.aiShortlistThreshold)).toBe(0.70);
        });
    });

    describe('Scenario 2: Threshold editor shows change history', () => {
        beforeEach(async () => {
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            // Version 1: Today
            await request(app)
                .post('/api/admin/scoring-thresholds')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    jobFamilyId,
                    aiShortlistThreshold: 0.65,
                    confidenceThreshold: 0.70,
                    experienceThresholdYears: 1,
                    effectiveFrom: today.toISOString()
                });

            // Version 2: Tomorrow
            const tomorrow = new Date(today);
            tomorrow.setDate(tomorrow.getDate() + 1);

            await request(app)
                .post('/api/admin/scoring-thresholds')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    jobFamilyId,
                    aiShortlistThreshold: 0.70,
                    confidenceThreshold: 0.75,
                    experienceThresholdYears: 2,
                    effectiveFrom: tomorrow.toISOString()
                });
        });

        it('should retrieve threshold history with all versions', async () => {
            const response = await request(app)
                .get(`/api/admin/scoring-thresholds/history?jobFamilyId=${jobFamilyId}&limit=10`)
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
            expect(response.body.thresholds.length).toBeGreaterThanOrEqual(2);

            // Verify sorted by effectiveFrom descending
            for (let i = 0; i < response.body.thresholds.length - 1; i++) {
                const current = new Date(response.body.thresholds[i].effectiveFrom);
                const next = new Date(response.body.thresholds[i + 1].effectiveFrom);
                expect(current.getTime()).toBeGreaterThanOrEqual(next.getTime());
            }
        });

        it('should show different thresholds in different versions', async () => {
            const response = await request(app)
                .get(`/api/admin/scoring-thresholds/history?jobFamilyId=${jobFamilyId}&limit=10`)
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
            expect(response.body.thresholds.length).toBeGreaterThanOrEqual(2);

            const thresholds = response.body.thresholds.map((t: any) => 
                parseFloat(t.aiShortlistThreshold)
            );

            // Different versions should have different values
            expect(new Set(thresholds).size).toBeGreaterThan(1);
        });
    });

    describe('Scenario 3: Invalid threshold value rejected', () => {
        it('should reject threshold outside 0-1 range', async () => {
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);

            const response = await request(app)
                .post('/api/admin/scoring-thresholds')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    jobFamilyId,
                    aiShortlistThreshold: 1.5, // Invalid: > 1
                    confidenceThreshold: 0.8,
                    experienceThresholdYears: 3,
                    effectiveFrom: tomorrow.toISOString()
                });

            expect(response.status).toBe(400);
            expect(response.body.error.code).toBe('VALIDATION_ERROR');
            expect(response.body.error.details).toBeDefined();
            expect(response.body.error.details.some((d: string) => 
                d.toLowerCase().includes('threshold') && 
                (d.toLowerCase().includes('0') || d.toLowerCase().includes('1'))
            )).toBe(true);
        });

        it('should reject negative threshold values', async () => {
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);

            const response = await request(app)
                .post('/api/admin/scoring-thresholds')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    jobFamilyId,
                    aiShortlistThreshold: -0.5, // Invalid: negative
                    confidenceThreshold: 0.8,
                    experienceThresholdYears: 3,
                    effectiveFrom: tomorrow.toISOString()
                });

            expect(response.status).toBe(400);
            expect(response.body.error.code).toBe('VALIDATION_ERROR');
        });

        it('should reject past effective dates', async () => {
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);

            const response = await request(app)
                .post('/api/admin/scoring-thresholds')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    jobFamilyId,
                    aiShortlistThreshold: 0.75,
                    confidenceThreshold: 0.8,
                    experienceThresholdYears: 3,
                    effectiveFrom: yesterday.toISOString()
                });

            expect(response.status).toBe(400);
            expect(response.body.error.code).toBe('VALIDATION_ERROR');
        });

        it('should reject missing required fields', async () => {
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);

            const response = await request(app)
                .post('/api/admin/scoring-thresholds')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    jobFamilyId
                    // Missing thresholds and effectiveFrom
                });

            expect(response.status).toBe(400);
            expect(response.body.error.code).toBe('VALIDATION_ERROR');
        });

        it('should reject invalid job family', async () => {
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);

            const response = await request(app)
                .post('/api/admin/scoring-thresholds')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    jobFamilyId: '00000000-0000-0000-0000-000000000000', // Non-existent
                    aiShortlistThreshold: 0.75,
                    confidenceThreshold: 0.8,
                    experienceThresholdYears: 3,
                    effectiveFrom: tomorrow.toISOString()
                });

            expect(response.status).toBe(404);
            expect(response.body.error.code).toBe('NOT_FOUND');
        });
    });

    describe('Access Control', () => {
        it('should reject unauthenticated requests', async () => {
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);

            const response = await request(app)
                .post('/api/admin/scoring-thresholds')
                .send({
                    jobFamilyId,
                    aiShortlistThreshold: 0.75,
                    confidenceThreshold: 0.8,
                    experienceThresholdYears: 3,
                    effectiveFrom: tomorrow.toISOString()
                });

            expect(response.status).toBe(401);
        });

        it('should reject non-admin requests', async () => {
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);

            const response = await request(app)
                .post('/api/admin/scoring-thresholds')
                .set('Authorization', `Bearer ${recruiterToken}`)
                .send({
                    jobFamilyId,
                    aiShortlistThreshold: 0.75,
                    confidenceThreshold: 0.8,
                    experienceThresholdYears: 3,
                    effectiveFrom: tomorrow.toISOString()
                });

            expect(response.status).toBe(403);
        });
    });

    describe('List and Query Operations', () => {
        it('should list all effective scoring thresholds', async () => {
            const response = await request(app)
                .get('/api/admin/scoring-thresholds')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
            expect(Array.isArray(response.body.thresholds)).toBe(true);
            expect(response.body.total).toBeGreaterThanOrEqual(0);
        });

        it('should filter thresholds by job family', async () => {
            const response = await request(app)
                .get(`/api/admin/scoring-thresholds?jobFamilyId=${jobFamilyId}`)
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
            response.body.thresholds.forEach((threshold: any) => {
                expect(threshold.jobFamilyId).toBe(jobFamilyId);
            });
        });
    });
});
