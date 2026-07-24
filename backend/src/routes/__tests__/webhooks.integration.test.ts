import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../../app';
import { processScanResult } from '../../services/scanWebhookService';
import { env } from '../../config/env';

vi.mock('../../services/scanWebhookService');

describe('Webhooks Integration Tests', () => {
    const app = createApp();
    const validToken = env.SCAN_WEBHOOK_SECRET;

    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('POST /api/webhooks/scan-result', () => {
        it('should accept valid scan result with correct token', async () => {
            vi.mocked(processScanResult).mockResolvedValue();

            const payload = {
                resumeId: 'resume-1',
                status: 'clean',
                scannerVersion: '1.0.0',
                scanTime: new Date().toISOString(),
            };

            const response = await request(app)
                .post('/api/webhooks/scan-result')
                .set('X-Webhook-Token', validToken)
                .send(payload);

            expect(response.status).toBe(200);
            expect(response.body).toMatchObject({
                success: true,
                message: 'Scan result processed successfully',
            });
        });

        it('should reject request without webhook token', async () => {
            const payload = {
                resumeId: 'resume-1',
                status: 'clean',
                scannerVersion: '1.0.0',
                scanTime: new Date().toISOString(),
            };

            const response = await request(app).post('/api/webhooks/scan-result').send(payload);

            expect(response.status).toBe(401);
            expect(response.body.error.message).toBe('Unauthorized');
        });

        it('should reject request with invalid webhook token', async () => {
            const payload = {
                resumeId: 'resume-1',
                status: 'clean',
                scannerVersion: '1.0.0',
                scanTime: new Date().toISOString(),
            };

            const response = await request(app)
                .post('/api/webhooks/scan-result')
                .set('X-Webhook-Token', 'invalid-token')
                .send(payload);

            expect(response.status).toBe(401);
        });

        it('should process infected file scan result', async () => {
            vi.mocked(processScanResult).mockResolvedValue();

            const payload = {
                resumeId: 'resume-1',
                status: 'infected',
                threats: ['Trojan.Generic', 'Malware.PDF'],
                scannerVersion: '1.0.0',
                scanTime: new Date().toISOString(),
            };

            const response = await request(app)
                .post('/api/webhooks/scan-result')
                .set('X-Webhook-Token', validToken)
                .send(payload);

            expect(response.status).toBe(200);
            expect(processScanResult).toHaveBeenCalledWith(
                expect.objectContaining({
                    resumeId: 'resume-1',
                    status: 'infected',
                    threats: ['Trojan.Generic', 'Malware.PDF'],
                })
            );
        });

        it('should validate payload schema', async () => {
            const invalidPayload = {
                resumeId: 'resume-1',
                // Missing status
                scannerVersion: '1.0.0',
            };

            const response = await request(app)
                .post('/api/webhooks/scan-result')
                .set('X-Webhook-Token', validToken)
                .send(invalidPayload);

            expect(response.status).toBe(400);
        });

        it('should handle scan processing errors gracefully', async () => {
            vi.mocked(processScanResult).mockRejectedValue(new Error('Processing failed'));

            const payload = {
                resumeId: 'resume-1',
                status: 'clean',
                scannerVersion: '1.0.0',
                scanTime: new Date().toISOString(),
            };

            const response = await request(app)
                .post('/api/webhooks/scan-result')
                .set('X-Webhook-Token', validToken)
                .send(payload);

            expect(response.status).toBe(500);
        });
    });
});
