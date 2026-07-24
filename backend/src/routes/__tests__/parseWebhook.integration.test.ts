import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../app';
import { processParseResult } from '../../services/parseResultService';
import { env } from '../../config/env';

vi.mock('../../services/parseResultService');

describe('Parse Result Webhook Integration Tests', () => {
    const app = createApp();
    const validToken = env.WORKER_TOKEN;

    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('POST /api/webhooks/parse-result', () => {
        it('should accept valid parse result with correct token', async () => {
            vi.mocked(processParseResult).mockResolvedValue();

            const payload = {
                resumeId: 'resume-1',
                status: 'success',
                parsedData: {
                    name: 'John Doe',
                    email: 'john@example.com',
                    phone: '(555) 123-4567',
                    skills: ['Python', 'React'],
                    experience_years: 5,
                    employers: [{ name: 'Acme Corp', title: 'Engineer' }],
                    education: [{ degree: 'BS', field: 'CS', institution: 'MIT' }],
                    extracted_at: new Date().toISOString(),
                },
            };

            const response = await request(app)
                .post('/api/webhooks/parse-result')
                .set('X-Worker-Token', validToken)
                .send(payload);

            expect(response.status).toBe(200);
            expect(response.body).toMatchObject({
                success: true,
                message: 'Parse result processed successfully',
            });
        });

        it('should reject request without worker token', async () => {
            const payload = {
                resumeId: 'resume-1',
                status: 'success',
                parsedData: {
                    name: 'Test',
                    email: 'test@test.com',
                    phone: '',
                    skills: [],
                    experience_years: 0,
                    employers: [],
                    education: [],
                    extracted_at: new Date().toISOString(),
                },
            };

            const response = await request(app)
                .post('/api/webhooks/parse-result')
                .send(payload);

            expect(response.status).toBe(401);
            expect(response.body.error.message).toBe('Unauthorized');
        });

        it('should reject request with invalid token', async () => {
            const payload = {
                resumeId: 'resume-1',
                status: 'success',
            };

            const response = await request(app)
                .post('/api/webhooks/parse-result')
                .set('X-Worker-Token', 'invalid-token')
                .send(payload);

            expect(response.status).toBe(401);
        });

        it('should process failed parse result', async () => {
            vi.mocked(processParseResult).mockResolvedValue();

            const payload = {
                resumeId: 'resume-1',
                status: 'failed',
                error: 'Timeout parsing PDF',
            };

            const response = await request(app)
                .post('/api/webhooks/parse-result')
                .set('X-Worker-Token', validToken)
                .send(payload);

            expect(response.status).toBe(200);
            expect(processParseResult).toHaveBeenCalledWith(payload);
        });

        it('should validate payload schema', async () => {
            const invalidPayload = {
                resumeId: 'not-a-uuid',
                status: 'invalid-status',
            };

            const response = await request(app)
                .post('/api/webhooks/parse-result')
                .set('X-Worker-Token', validToken)
                .send(invalidPayload);

            expect(response.status).toBe(400);
            expect(response.body.error.code).toBe('VALIDATION_ERROR');
        });

        it('should handle processing errors gracefully', async () => {
            vi.mocked(processParseResult).mockRejectedValue(new Error('Database error'));

            const payload = {
                resumeId: 'resume-1',
                status: 'success',
                parsedData: {
                    name: 'Test',
                    email: '',
                    phone: '',
                    skills: [],
                    experience_years: 0,
                    employers: [],
                    education: [],
                    extracted_at: new Date().toISOString(),
                },
            };

            const response = await request(app)
                .post('/api/webhooks/parse-result')
                .set('X-Worker-Token', validToken)
                .send(payload);

            expect(response.status).toBe(500);
        });

        it('should accept minimal valid payload', async () => {
            vi.mocked(processParseResult).mockResolvedValue();

            const payload = {
                resumeId: '00000000-0000-0000-0000-000000000001',
                status: 'success',
                parsedData: {
                    name: 'Minimal Test',
                    skills: [],
                    experience_years: 0,
                    employers: [],
                    education: [],
                    extracted_at: new Date().toISOString(),
                },
            };

            const response = await request(app)
                .post('/api/webhooks/parse-result')
                .set('X-Worker-Token', validToken)
                .send(payload);

            expect(response.status).toBe(200);
        });
    });
});
