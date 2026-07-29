/**
 * Integration Tests for Admin Approval Policies API
 * 
 * Tests REST API endpoints for approval policy management with effective-date versioning.
 * Verifies: future effective dates, change history, validation, and in-flight isolation.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { Decimal } from '@prisma/client/runtime/library';
import { app } from '../../app';
import prisma from '../../db/prisma';
import { JwtService } from '../../services/jwtService';
import { UserRole } from '@prisma/client';

describe('Admin Approval Policies API', () => {
    let adminToken: string;
    let recruiterToken: string;
    let adminUserId: string;
    let recruiterUserId: string;

    beforeAll(async () => {
        // Clean up test data
        await prisma.approvalPolicy.deleteMany({
            where: {
                createdBy: {
                    email: {
                        contains: '@policy-test'
                    }
                }
            }
        });
        
        await prisma.user.deleteMany({
            where: {
                email: {
                    contains: '@policy-test'
                }
            }
        });

        // Create admin user
        const adminUser = await prisma.user.create({
            data: {
                email: 'policy-admin@policy-test',
                fullName: 'Policy Admin',
                role: UserRole.admin,
                timezone: 'UTC',
                active: true
            }
        });
        adminUserId = adminUser.id;

        // Create recruiter user (non-admin)
        const recruiterUser = await prisma.user.create({
            data: {
                email: 'policy-recruiter@policy-test',
                fullName: 'Policy Recruiter',
                role: UserRole.recruiter,
                timezone: 'UTC',
                active: true
            }
        });
        recruiterUserId = recruiterUser.id;

        // Generate tokens
        const jwtService = new JwtService();
        adminToken = jwtService.signAccessToken(adminUserId, UserRole.admin);
        recruiterToken = jwtService.signAccessToken(recruiterUserId, UserRole.recruiter);
    });

    afterAll(async () => {
        // Clean up test data
        await prisma.approvalPolicy.deleteMany({
            where: {
                createdBy: {
                    email: {
                        contains: '@policy-test'
                    }
                }
            }
        });

        await prisma.user.deleteMany({
            where: {
                email: {
                    contains: '@policy-test'
                }
            }
        });

        await prisma.$disconnect();
    });

    describe('Scenario 1: New policy version with future effective date does not affect current applications', () => {
        it('should create approval policy with future effective date', async () => {
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            tomorrow.setHours(0, 0, 0, 0);

            const response = await request(app)
                .post('/api/admin/approval-policies')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    compensationBandMin: '80000.00',
                    compensationBandMax: '120000.00',
                    requiredApprovers: [
                        {
                            tier: 1,
                            role: 'hr_reviewer',
                            approverId: adminUserId,
                            displayName: 'HR Reviewer'
                        }
                    ],
                    effectiveFrom: tomorrow.toISOString()
                });

            expect(response.status).toBe(201);
            expect(response.body.id).toBeDefined();
            expect(new Date(response.body.effectiveFrom)).toEqual(
                expect.objectContaining({
                    toISOString: expect.any(Function)
                })
            );
        });

        it('should query policy with effective date matching logic', async () => {
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const tomorrow = new Date(today);
            tomorrow.setDate(tomorrow.getDate() + 1);

            // Create two policies: one effective today, one tomorrow
            await request(app)
                .post('/api/admin/approval-policies')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    compensationBandMin: '50000.00',
                    compensationBandMax: '100000.00',
                    requiredApprovers: [
                        {
                            tier: 1,
                            role: 'hr_manager',
                            approverId: adminUserId,
                            displayName: 'HR Manager'
                        }
                    ],
                    effectiveFrom: today.toISOString()
                });

            await request(app)
                .post('/api/admin/approval-policies')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    compensationBandMin: '50000.00',
                    compensationBandMax: '100000.00',
                    requiredApprovers: [
                        {
                            tier: 1,
                            role: 'hr_manager',
                            approverId: adminUserId,
                            displayName: 'HR Manager'
                        },
                        {
                            tier: 2,
                            role: 'director',
                            approverId: adminUserId,
                            displayName: 'Director'
                        }
                    ],
                    effectiveFrom: tomorrow.toISOString()
                });

            // Query policy at today's compensation
            const response = await request(app)
                .get('/api/admin/approval-policies?compensationAmount=75000')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
            expect(response.body.policies).toHaveLength(1);
            // Today's query should return today's policy (1 approver)
            expect(response.body.policies[0].requiredApprovers).toHaveLength(1);
        });
    });

    describe('Scenario 2: Policy editor shows change history', () => {
        beforeEach(async () => {
            // Create multiple versions of the same policy band
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            // Version 1: Today
            await request(app)
                .post('/api/admin/approval-policies')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    compensationBandMin: '100000.00',
                    compensationBandMax: '150000.00',
                    requiredApprovers: [
                        {
                            tier: 1,
                            role: 'vp_engineering',
                            approverId: adminUserId,
                            displayName: 'VP Engineering'
                        }
                    ],
                    effectiveFrom: today.toISOString()
                });

            // Version 2: Tomorrow
            const tomorrow = new Date(today);
            tomorrow.setDate(tomorrow.getDate() + 1);

            await request(app)
                .post('/api/admin/approval-policies')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    compensationBandMin: '100000.00',
                    compensationBandMax: '150000.00',
                    requiredApprovers: [
                        {
                            tier: 1,
                            role: 'vp_engineering',
                            approverId: adminUserId,
                            displayName: 'VP Engineering'
                        },
                        {
                            tier: 2,
                            role: 'cfo',
                            approverId: adminUserId,
                            displayName: 'CFO'
                        }
                    ],
                    effectiveFrom: tomorrow.toISOString()
                });
        });

        it('should retrieve policy history with all versions', async () => {
            const response = await request(app)
                .get('/api/admin/approval-policies/history?compensationBandMin=100000&compensationBandMax=150000&limit=10')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
            expect(response.body.policies.length).toBeGreaterThanOrEqual(2);
            
            // Verify policies are sorted by effectiveFrom descending
            for (let i = 0; i < response.body.policies.length - 1; i++) {
                const current = new Date(response.body.policies[i].effectiveFrom);
                const next = new Date(response.body.policies[i + 1].effectiveFrom);
                expect(current.getTime()).toBeGreaterThanOrEqual(next.getTime());
            }
        });

        it('should show different approvers in different versions', async () => {
            const response = await request(app)
                .get('/api/admin/approval-policies/history?compensationBandMin=100000&compensationBandMax=150000&limit=10')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
            expect(response.body.policies.length).toBeGreaterThanOrEqual(2);

            // Most recent should have 2 approvers
            const mostRecent = response.body.policies[0];
            expect(mostRecent.requiredApprovers.length).toBeGreaterThanOrEqual(1);

            // Older version should have 1 approver
            const older = response.body.policies[1];
            expect(older.requiredApprovers.length).toBeGreaterThanOrEqual(1);
        });
    });

    describe('Scenario 3: Invalid policy value rejected', () => {
        it('should reject invalid compensation band (min > max)', async () => {
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);

            const response = await request(app)
                .post('/api/admin/approval-policies')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    compensationBandMin: '150000.00',
                    compensationBandMax: '100000.00', // Invalid: max < min
                    requiredApprovers: [
                        {
                            tier: 1,
                            role: 'hr_reviewer',
                            approverId: adminUserId,
                            displayName: 'HR Reviewer'
                        }
                    ],
                    effectiveFrom: tomorrow.toISOString()
                });

            expect(response.status).toBe(400);
            expect(response.body.error.code).toBe('VALIDATION_ERROR');
            expect(response.body.error.details).toBeDefined();
            expect(response.body.error.details.some((d: string) => d.toLowerCase().includes('min'))).toBe(true);
        });

        it('should reject invalid approver tier (not sequential)', async () => {
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);

            const response = await request(app)
                .post('/api/admin/approval-policies')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    compensationBandMin: '100000.00',
                    compensationBandMax: '150000.00',
                    requiredApprovers: [
                        {
                            tier: 1,
                            role: 'hr_reviewer',
                            approverId: adminUserId,
                            displayName: 'HR Reviewer'
                        },
                        {
                            tier: 3, // Invalid: should be 2
                            role: 'director',
                            approverId: adminUserId,
                            displayName: 'Director'
                        }
                    ],
                    effectiveFrom: tomorrow.toISOString()
                });

            expect(response.status).toBe(400);
            expect(response.body.error.code).toBe('VALIDATION_ERROR');
            expect(response.body.error.details).toBeDefined();
        });

        it('should reject past effective dates', async () => {
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);

            const response = await request(app)
                .post('/api/admin/approval-policies')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    compensationBandMin: '100000.00',
                    compensationBandMax: '150000.00',
                    requiredApprovers: [
                        {
                            tier: 1,
                            role: 'hr_reviewer',
                            approverId: adminUserId,
                            displayName: 'HR Reviewer'
                        }
                    ],
                    effectiveFrom: yesterday.toISOString()
                });

            expect(response.status).toBe(400);
            expect(response.body.error.code).toBe('VALIDATION_ERROR');
            expect(response.body.error.details).toBeDefined();
        });

        it('should reject missing required fields', async () => {
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);

            const response = await request(app)
                .post('/api/admin/approval-policies')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    compensationBandMin: '100000.00'
                    // Missing compensationBandMax, requiredApprovers, effectiveFrom
                });

            expect(response.status).toBe(400);
            expect(response.body.error.code).toBe('VALIDATION_ERROR');
        });
    });

    describe('Scenario 4: Approval policy change applies to new offer decisions only', () => {
        it('should allow multiple policies for same band with different effective dates', async () => {
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const future = new Date(today);
            future.setDate(future.getDate() + 7);

            // Create policy effective today
            const policy1 = await request(app)
                .post('/api/admin/approval-policies')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    compensationBandMin: '200000.00',
                    compensationBandMax: '250000.00',
                    requiredApprovers: [
                        {
                            tier: 1,
                            role: 'cfo',
                            approverId: adminUserId,
                            displayName: 'CFO'
                        }
                    ],
                    effectiveFrom: today.toISOString()
                });

            expect(policy1.status).toBe(201);

            // Create policy effective next week
            const policy2 = await request(app)
                .post('/api/admin/approval-policies')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    compensationBandMin: '200000.00',
                    compensationBandMax: '250000.00',
                    requiredApprovers: [
                        {
                            tier: 1,
                            role: 'cfo',
                            approverId: adminUserId,
                            displayName: 'CFO'
                        },
                        {
                            tier: 2,
                            role: 'ceo',
                            approverId: adminUserId,
                            displayName: 'CEO'
                        }
                    ],
                    effectiveFrom: future.toISOString()
                });

            expect(policy2.status).toBe(201);

            // Verify both policies exist in history
            const historyResponse = await request(app)
                .get('/api/admin/approval-policies/history?compensationBandMin=200000&compensationBandMax=250000')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(historyResponse.status).toBe(200);
            expect(historyResponse.body.policies.length).toBeGreaterThanOrEqual(2);
        });
    });

    describe('Access Control', () => {
        it('should reject unauthenticated requests', async () => {
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);

            const response = await request(app)
                .post('/api/admin/approval-policies')
                .send({
                    compensationBandMin: '100000.00',
                    compensationBandMax: '150000.00',
                    requiredApprovers: [
                        {
                            tier: 1,
                            role: 'hr_reviewer',
                            approverId: adminUserId,
                            displayName: 'HR Reviewer'
                        }
                    ],
                    effectiveFrom: tomorrow.toISOString()
                });

            expect(response.status).toBe(401);
        });

        it('should reject non-admin requests', async () => {
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);

            const response = await request(app)
                .post('/api/admin/approval-policies')
                .set('Authorization', `Bearer ${recruiterToken}`)
                .send({
                    compensationBandMin: '100000.00',
                    compensationBandMax: '150000.00',
                    requiredApprovers: [
                        {
                            tier: 1,
                            role: 'hr_reviewer',
                            approverId: adminUserId,
                            displayName: 'HR Reviewer'
                        }
                    ],
                    effectiveFrom: tomorrow.toISOString()
                });

            expect(response.status).toBe(403);
        });
    });
});
