import express from 'express';
import request from 'supertest';
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import prisma from '../../db/prisma';
import consentRouter from '../consent';

// Mock authenticate middleware
vi.mock('../../middleware/authenticate', () => ({
    authenticate: (req: any, res: any, next: any) => {
        req.user = { id: req.headers['x-test-candidate-id'], email: 'test@example.com', role: 'candidate' };
        next();
    },
}));

vi.mock('../../utils/logger', () => ({
    default: {
        error: vi.fn(),
        warn: vi.fn(),
        info: vi.fn(),
        debug: vi.fn(),
    },
}));

function createTestApp() {
    const app = express();
    app.use(express.json());
    app.use('/api/consent', consentRouter);
    return app;
}

describe('consent API integration tests', () => {
    let testCandidate: any;
    let app: express.Application;

    beforeEach(async () => {
        testCandidate = await prisma.candidate.create({
            data: {
                email: `consent-api-test-${Date.now()}@example.com`,
                fullName: 'Test User',
                phoneNumber: null,
                status: 'active',
            },
        });

        app = createTestApp();
    });

    afterEach(async () => {
        await prisma.privacyConsent.deleteMany({ where: { candidateId: testCandidate.id } });
        await prisma.candidate.delete({ where: { id: testCandidate.id } });
    });

    describe('POST /api/consent/accept', () => {
        it('records consent with IP and user agent', async () => {
            const response = await request(app)
                .post('/api/consent/accept')
                .set('x-test-candidate-id', testCandidate.id)
                .set('user-agent', 'Mozilla/5.0 Test Browser')
                .send({});

            expect(response.status).toBe(201);
            expect(response.body.candidateId).toBe(testCandidate.id);
            expect(response.body.policyVersion).toBe('1.0');
            expect(response.body.ipAddress).toBeDefined();
            expect(response.body.userAgent).toBe('Mozilla/5.0 Test Browser');
            expect(response.body.acceptedAt).toBeDefined();
            expect(response.body.revokedAt).toBeNull();
        });

        it('is idempotent - returns existing consent if already accepted', async () => {
            const first = await request(app)
                .post('/api/consent/accept')
                .set('x-test-candidate-id', testCandidate.id)
                .send({});

            const second = await request(app)
                .post('/api/consent/accept')
                .set('x-test-candidate-id', testCandidate.id)
                .send({});

            expect(second.status).toBe(201);
            expect(first.body.id).toBe(second.body.id);
            expect(first.body.acceptedAt).toBe(second.body.acceptedAt);
        });

        it('creates new consent after previous was revoked', async () => {
            const first = await request(app)
                .post('/api/consent/accept')
                .set('x-test-candidate-id', testCandidate.id)
                .send({});

            await request(app)
                .delete('/api/consent')
                .set('x-test-candidate-id', testCandidate.id);

            const second = await request(app)
                .post('/api/consent/accept')
                .set('x-test-candidate-id', testCandidate.id)
                .send({});

            expect(second.status).toBe(201);
            expect(second.body.id).not.toBe(first.body.id);
            expect(second.body.revokedAt).toBeNull();
        });
    });

    describe('GET /api/consent', () => {
        it('returns active consent', async () => {
            await prisma.privacyConsent.create({
                data: {
                    candidateId: testCandidate.id,
                    policyVersion: '1.0',
                    ipAddress: '192.168.1.1',
                    userAgent: 'Test Browser',
                },
            });

            const response = await request(app)
                .get('/api/consent')
                .set('x-test-candidate-id', testCandidate.id);

            expect(response.status).toBe(200);
            expect(response.body.candidateId).toBe(testCandidate.id);
            expect(response.body.policyVersion).toBe('1.0');
            expect(response.body.revokedAt).toBeNull();
        });

        it('returns 404 when no active consent exists', async () => {
            const response = await request(app)
                .get('/api/consent')
                .set('x-test-candidate-id', testCandidate.id);

            expect(response.status).toBe(404);
            expect(response.body.error.code).toBe('CONSENT_NOT_FOUND');
        });

        it('returns 404 when consent was revoked', async () => {
            await prisma.privacyConsent.create({
                data: {
                    candidateId: testCandidate.id,
                    policyVersion: '1.0',
                    ipAddress: '192.168.1.1',
                    revokedAt: new Date(),
                },
            });

            const response = await request(app)
                .get('/api/consent')
                .set('x-test-candidate-id', testCandidate.id);

            expect(response.status).toBe(404);
        });
    });

    describe('DELETE /api/consent', () => {
        it('revokes active consent', async () => {
            await prisma.privacyConsent.create({
                data: {
                    candidateId: testCandidate.id,
                    policyVersion: '1.0',
                    ipAddress: '192.168.1.1',
                },
            });

            const response = await request(app)
                .delete('/api/consent')
                .set('x-test-candidate-id', testCandidate.id);

            expect(response.status).toBe(200);
            expect(response.body.message).toBe('Consent revoked successfully');
            expect(response.body.revokedAt).toBeDefined();
        });

        it('returns 404 when no active consent to revoke', async () => {
            const response = await request(app)
                .delete('/api/consent')
                .set('x-test-candidate-id', testCandidate.id);

            expect(response.status).toBe(404);
            expect(response.body.error.code).toBe('CONSENT_NOT_FOUND');
        });

        it('cannot revoke already revoked consent', async () => {
            await prisma.privacyConsent.create({
                data: {
                    candidateId: testCandidate.id,
                    policyVersion: '1.0',
                    ipAddress: '192.168.1.1',
                },
            });

            await request(app)
                .delete('/api/consent')
                .set('x-test-candidate-id', testCandidate.id);

            const response = await request(app)
                .delete('/api/consent')
                .set('x-test-candidate-id', testCandidate.id);

            expect(response.status).toBe(404);
        });
    });

    describe('GET /api/consent/history', () => {
        it('returns empty array when no consents exist', async () => {
            const response = await request(app)
                .get('/api/consent/history')
                .set('x-test-candidate-id', testCandidate.id);

            expect(response.status).toBe(200);
            expect(response.body).toEqual([]);
        });

        it('returns all consent records including revoked', async () => {
            await prisma.privacyConsent.create({
                data: {
                    candidateId: testCandidate.id,
                    policyVersion: '1.0',
                    ipAddress: '192.168.1.1',
                    revokedAt: new Date('2026-01-01'),
                },
            });

            await prisma.privacyConsent.create({
                data: {
                    candidateId: testCandidate.id,
                    policyVersion: '1.1',
                    ipAddress: '192.168.1.2',
                },
            });

            const response = await request(app)
                .get('/api/consent/history')
                .set('x-test-candidate-id', testCandidate.id);

            expect(response.status).toBe(200);
            expect(response.body).toHaveLength(2);
            expect(response.body[0].policyVersion).toBe('1.1');
            expect(response.body[0].revokedAt).toBeNull();
            expect(response.body[1].policyVersion).toBe('1.0');
            expect(response.body[1].revokedAt).not.toBeNull();
        });

        it('orders history by most recent first', async () => {
            const first = await prisma.privacyConsent.create({
                data: {
                    candidateId: testCandidate.id,
                    policyVersion: '1.0',
                    ipAddress: '192.168.1.1',
                    acceptedAt: new Date('2026-01-01'),
                },
            });

            const second = await prisma.privacyConsent.create({
                data: {
                    candidateId: testCandidate.id,
                    policyVersion: '1.1',
                    ipAddress: '192.168.1.2',
                    acceptedAt: new Date('2026-02-01'),
                },
            });

            const response = await request(app)
                .get('/api/consent/history')
                .set('x-test-candidate-id', testCandidate.id);

            expect(response.status).toBe(200);
            expect(response.body[0].id).toBe(second.id);
            expect(response.body[1].id).toBe(first.id);
        });
    });
});
