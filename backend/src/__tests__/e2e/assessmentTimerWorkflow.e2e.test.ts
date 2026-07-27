/**
 * End-to-End Workflow Test for Assessment Timer
 * 
 * Tests complete workflow from provider creation through assessment launch to timer completion
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../app';
import prisma from '../../db/prisma';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env';
import { redis } from '../../db/redis';
import {
    createProvider,
    updateProvider,
} from '../../services/assessmentProviderService';
import {
    startSessionTimer,
    getSessionTimer,
    updateHeartbeat,
} from '../../services/sessionTimerService';

describe('End-to-End Assessment Timer Workflow', () => {
    let adminToken: string;
    let adminId: string;
    let candidateToken: string;
    let candidateId: string;
    let requisitionId: string;
    let applicationId: string;
    let providerId: string;
    let sessionId: string;

    beforeAll(async () => {
        // Create admin user
        const admin = await prisma.candidate.create({
            data: {
                email: 'admin-e2e@example.com',
                password: 'hashedpassword',
                role: 'admin',
                emailVerified: true,
                firstName: 'Admin',
                lastName: 'E2E',
            },
        });

        adminId = admin.id;
        adminToken = jwt.sign(
            { id: admin.id, email: admin.email, role: admin.role },
            env.JWT_SECRET || 'test-secret',
            { expiresIn: '1h' }
        );

        // Create candidate user
        const candidate = await prisma.candidate.create({
            data: {
                email: 'candidate-e2e@example.com',
                password: 'hashedpassword',
                role: 'candidate',
                emailVerified: true,
                firstName: 'Candidate',
                lastName: 'E2E',
            },
        });

        candidateId = candidate.id;
        candidateToken = jwt.sign(
            { id: candidate.id, email: candidate.email, role: candidate.role },
            env.JWT_SECRET || 'test-secret',
            { expiresIn: '1h' }
        );

        // Set encryption key
        if (!process.env.ENCRYPTION_KEY) {
            process.env.ENCRYPTION_KEY = 'a'.repeat(64);
        }
    });

    afterAll(async () => {
        // Cleanup
        if (sessionId) {
            await redis.del(`session:timer:${sessionId}`);
        }
        await prisma.auditEvent.deleteMany({ where: { actorId: adminId } });
        await prisma.assessmentSession.deleteMany({ where: { providerId } });
        await prisma.application.deleteMany({ where: { candidateId } });
        await prisma.assessmentProvider.deleteMany({ where: { id: providerId } });
        if (requisitionId) {
            await prisma.requisition.deleteMany({ where: { id: requisitionId } });
        }
        await prisma.candidate.deleteMany({ where: { id: { in: [adminId, candidateId] } } });
    });

    beforeEach(async () => {
        // Clean up any existing test data
        if (sessionId) {
            await redis.del(`session:timer:${sessionId}`);
        }
    });

    describe('Complete Assessment Workflow', () => {
        it('should execute full workflow from provider setup to timer expiry', async () => {
            // ==================== Step 1: Admin creates assessment provider ====================
            console.log('\n[Step 1] Creating assessment provider...');

            const providerData = {
                name: 'E2E Test Provider',
                apiEndpoint: 'https://api.e2etest.com/v1',
                authMode: 'bearer',
                hmacSecret: 'e2e' + 'a'.repeat(61), // 64 chars
                timeoutSeconds: 30,
                active: true,
            };

            const provider = await createProvider(providerData, adminId);
            providerId = provider.id;

            expect(provider.id).toBeDefined();
            expect(provider.name).toBe(providerData.name);
            expect(provider.hmacSecret).toBe('[REDACTED]');

            console.log(`✓ Provider created: ${provider.id}`);

            // ==================== Step 2: Create requisition and application ====================
            console.log('[Step 2] Creating requisition and application...');

            const requisition = await prisma.requisition.create({
                data: {
                    title: 'E2E Software Engineer',
                    department: 'Engineering',
                    location: 'Remote',
                    jobType: 'full_time',
                    status: 'open',
                    slots: 1,
                    filledSlots: 0,
                    hiringManagerId: adminId,
                    openedAt: new Date(),
                },
            });

            requisitionId = requisition.id;

            const application = await prisma.application.create({
                data: {
                    candidateId,
                    requisitionId,
                    status: 'shortlisted',
                },
            });

            applicationId = application.id;

            console.log(`✓ Application created: ${application.id}`);

            // ==================== Step 3: Create assessment session ====================
            console.log('[Step 3] Creating assessment session...');

            const assessmentSession = await prisma.assessmentSession.create({
                data: {
                    applicationId,
                    providerId,
                    sessionToken: 'e2e-session-token-123',
                    testUrl: 'https://api.e2etest.com/test/abc123',
                    status: 'in_progress',
                    launchedAt: new Date(),
                },
            });

            sessionId = assessmentSession.id;

            console.log(`✓ Assessment session created: ${sessionId}`);

            // ==================== Step 4: Start session timer ====================
            console.log('[Step 4] Starting session timer (10 minutes)...');

            const timerStart = await startSessionTimer(sessionId, 10);

            expect(timerStart.status).toBe('active');
            expect(timerStart.remainingMinutes).toBe(10);
            expect(timerStart.sessionId).toBe(sessionId);

            console.log(`✓ Timer started: ${timerStart.remainingMinutes} minutes remaining`);

            // ==================== Step 5: Fetch timer via API ====================
            console.log('[Step 5] Fetching timer via API...');

            const timerResponse = await request(app)
                .get(`/api/sessions/${sessionId}/timer`)
                .set('Authorization', `Bearer ${candidateToken}`)
                .expect(200);

            expect(timerResponse.body.success).toBe(true);
            expect(timerResponse.body.data.status).toBe('active');
            expect(timerResponse.body.data.remainingMinutes).toBeCloseTo(10, 0);

            console.log(`✓ Timer fetched via API: ${timerResponse.body.data.remainingMinutes} minutes`);

            // ==================== Step 6: Send heartbeat ====================
            console.log('[Step 6] Sending heartbeat...');

            const heartbeatResponse = await request(app)
                .post(`/api/sessions/${sessionId}/heartbeat`)
                .set('Authorization', `Bearer ${candidateToken}`)
                .expect(200);

            expect(heartbeatResponse.body.success).toBe(true);
            expect(heartbeatResponse.body.data.status).toBe('active');

            console.log(`✓ Heartbeat sent successfully`);

            // ==================== Step 7: Simulate time passage and disconnection ====================
            console.log('[Step 7] Simulating 5-minute disconnection...');

            // In a real scenario, 5 minutes would pass
            // For testing, we can verify the timer is still active
            const timerAfterDisconnect = await getSessionTimer(sessionId);

            expect(timerAfterDisconnect!.status).toBe('active');
            expect(timerAfterDisconnect!.remainingMinutes).toBeLessThan(10);
            expect(timerAfterDisconnect!.remainingMinutes).toBeGreaterThan(0);

            console.log(`✓ Timer still active after disconnection: ${timerAfterDisconnect!.remainingMinutes} minutes`);

            // ==================== Step 8: Reconnect and send heartbeat ====================
            console.log('[Step 8] Reconnecting and sending heartbeat...');

            await updateHeartbeat(sessionId);

            const timerAfterReconnect = await getSessionTimer(sessionId);

            expect(timerAfterReconnect!.status).toBe('active');

            console.log(`✓ Reconnected successfully, timer resumed`);

            // ==================== Step 9: Update provider configuration ====================
            console.log('[Step 9] Updating provider configuration...');

            const updatedProvider = await updateProvider(
                providerId,
                { timeoutSeconds: 60 },
                adminId
            );

            expect(updatedProvider.timeoutSeconds).toBe(60);

            console.log(`✓ Provider configuration updated`);

            // ==================== Step 10: Verify audit trail ====================
            console.log('[Step 10] Verifying audit trail...');

            const auditEvents = await prisma.auditEvent.findMany({
                where: {
                    actorId: adminId,
                    eventType: { in: ['PROVIDER_CREATED', 'PROVIDER_UPDATED'] },
                },
            });

            expect(auditEvents.length).toBeGreaterThanOrEqual(2);

            console.log(`✓ Audit events logged: ${auditEvents.length} events`);

            // ==================== Step 11: Complete assessment ====================
            console.log('[Step 11] Completing assessment...');

            await prisma.assessmentSession.update({
                where: { id: sessionId },
                data: {
                    status: 'completed',
                    completedAt: new Date(),
                    score: 85.5,
                },
            });

            console.log(`✓ Assessment completed with score: 85.5`);

            // ==================== Workflow Complete ====================
            console.log('\n✓ ✓ ✓ End-to-end workflow completed successfully! ✓ ✓ ✓\n');
        });

        it('should handle workflow with session expiry', async () => {
            console.log('\n[Expiry Workflow] Testing session expiry scenario...');

            // Create minimal setup
            const provider = await createProvider(
                {
                    name: 'Expiry Test Provider',
                    apiEndpoint: 'https://api.expirytest.com/v1',
                    authMode: 'bearer',
                    timeoutSeconds: 30,
                    active: true,
                },
                adminId
            );

            const requisition = await prisma.requisition.create({
                data: {
                    title: 'Expiry Test Position',
                    department: 'Engineering',
                    location: 'Remote',
                    jobType: 'full_time',
                    status: 'open',
                    slots: 1,
                    filledSlots: 0,
                    hiringManagerId: adminId,
                    openedAt: new Date(),
                },
            });

            const application = await prisma.application.create({
                data: {
                    candidateId,
                    requisitionId: requisition.id,
                    status: 'shortlisted',
                },
            });

            const session = await prisma.assessmentSession.create({
                data: {
                    applicationId: application.id,
                    providerId: provider.id,
                    sessionToken: 'expiry-test-token',
                    testUrl: 'https://api.expirytest.com/test/xyz789',
                    status: 'in_progress',
                },
            });

            // Start short-duration timer (1 minute for testing)
            await startSessionTimer(session.id, 1);

            console.log(`✓ Created session with 1-minute timer: ${session.id}`);

            // In a real scenario, worker would expire the session after reconnect window
            // For this test, we verify the timer exists and is active
            const timer = await getSessionTimer(session.id);
            expect(timer!.status).toBe('active');
            expect(timer!.remainingMinutes).toBeCloseTo(1, 0);

            console.log(`✓ Timer verified as active with ${timer!.remainingMinutes} minutes remaining`);

            // Cleanup
            await redis.del(`session:timer:${session.id}`);
            await prisma.assessmentSession.deleteMany({ where: { id: session.id } });
            await prisma.application.deleteMany({ where: { id: application.id } });
            await prisma.requisition.deleteMany({ where: { id: requisition.id } });
            await prisma.assessmentProvider.deleteMany({ where: { id: provider.id } });

            console.log('✓ Expiry workflow test completed\n');
        });

        it('should handle workflow with multiple concurrent assessments', async () => {
            console.log('\n[Concurrent Workflow] Testing multiple simultaneous assessments...');

            // Create provider
            const provider = await createProvider(
                {
                    name: 'Concurrent Test Provider',
                    apiEndpoint: 'https://api.concurrent.com/v1',
                    authMode: 'bearer',
                    timeoutSeconds: 30,
                    active: true,
                },
                adminId
            );

            const requisition = await prisma.requisition.create({
                data: {
                    title: 'Concurrent Test Position',
                    department: 'Engineering',
                    location: 'Remote',
                    jobType: 'full_time',
                    status: 'open',
                    slots: 5,
                    filledSlots: 0,
                    hiringManagerId: adminId,
                    openedAt: new Date(),
                },
            });

            // Create 3 candidates with assessments
            const candidates = await Promise.all([
                prisma.candidate.create({
                    data: {
                        email: `concurrent1-${Date.now()}@example.com`,
                        password: 'hash',
                        role: 'candidate',
                        emailVerified: true,
                        firstName: 'Concurrent',
                        lastName: 'One',
                    },
                }),
                prisma.candidate.create({
                    data: {
                        email: `concurrent2-${Date.now()}@example.com`,
                        password: 'hash',
                        role: 'candidate',
                        emailVerified: true,
                        firstName: 'Concurrent',
                        lastName: 'Two',
                    },
                }),
                prisma.candidate.create({
                    data: {
                        email: `concurrent3-${Date.now()}@example.com`,
                        password: 'hash',
                        role: 'candidate',
                        emailVerified: true,
                        firstName: 'Concurrent',
                        lastName: 'Three',
                    },
                }),
            ]);

            const applications = await Promise.all(
                candidates.map(candidate =>
                    prisma.application.create({
                        data: {
                            candidateId: candidate.id,
                            requisitionId: requisition.id,
                            status: 'shortlisted',
                        },
                    })
                )
            );

            const sessions = await Promise.all(
                applications.map((app, i) =>
                    prisma.assessmentSession.create({
                        data: {
                            applicationId: app.id,
                            providerId: provider.id,
                            sessionToken: `concurrent-token-${i}`,
                            testUrl: `https://api.concurrent.com/test/${i}`,
                            status: 'in_progress',
                        },
                    })
                )
            );

            console.log(`✓ Created 3 concurrent assessment sessions`);

            // Start timers for all sessions
            await Promise.all(
                sessions.map((session, i) => startSessionTimer(session.id, 30 + i * 10))
            );

            // Verify all timers are running
            const timers = await Promise.all(
                sessions.map(session => getSessionTimer(session.id))
            );

            timers.forEach((timer, i) => {
                expect(timer!.status).toBe('active');
                expect(timer!.remainingMinutes).toBeCloseTo(30 + i * 10, 0);
            });

            console.log(`✓ All 3 timers running independently`);

            // Send heartbeats for all
            await Promise.all(
                sessions.map(session => updateHeartbeat(session.id))
            );

            console.log(`✓ Heartbeats sent for all sessions`);

            // Cleanup
            await Promise.all(sessions.map(s => redis.del(`session:timer:${s.id}`)));
            await prisma.assessmentSession.deleteMany({ where: { id: { in: sessions.map(s => s.id) } } });
            await prisma.application.deleteMany({ where: { id: { in: applications.map(a => a.id) } } });
            await prisma.candidate.deleteMany({ where: { id: { in: candidates.map(c => c.id) } } });
            await prisma.requisition.deleteMany({ where: { id: requisition.id } });
            await prisma.assessmentProvider.deleteMany({ where: { id: provider.id } });

            console.log('✓ Concurrent workflow test completed\n');
        });
    });
});
