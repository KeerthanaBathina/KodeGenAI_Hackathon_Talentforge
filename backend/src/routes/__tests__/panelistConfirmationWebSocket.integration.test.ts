import http from 'http';
import express from 'express';
import { io as createClient, type Socket as ClientSocket } from 'socket.io-client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { initSocketServer, resetSocketServerForTests } from '../../socket';
import interviewsRouter from '../interviews';

vi.mock('../../config/env', () => ({
    env: {
        FRONTEND_URL: 'http://localhost:3000',
        JWT_SECRET: 'test-secret-key-32-characters-long',
    },
}));

vi.mock('../../db/prisma');
vi.mock('../../services/panelistConfirmationService');
vi.mock('../../services/auditService');
vi.mock('../../utils/logger', () => ({
    default: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
    },
}));

import { prisma } from '../../db/prisma';
import { validatePanelistConfirmationToken, markTokenAsUsed } from '../../services/panelistConfirmationService';
import { auditEvent } from '../../services/auditService';

function onceConnected(socket: ClientSocket): Promise<void> {
    return new Promise((resolve, reject) => {
        socket.once('connect', () => resolve());
        socket.once('connect_error', (error) => reject(error));
    });
}

function waitForEvent<T>(socket: ClientSocket, eventName: string, timeoutMs: number): Promise<T> {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            reject(new Error(`Timed out waiting for ${eventName}`));
        }, timeoutMs);

        socket.once(eventName, (payload: T) => {
            clearTimeout(timeout);
            resolve(payload);
        });
    });
}

describe('Panelist Confirmation WebSocket Emission', () => {
    let server: http.Server | null = null;
    let app: express.Application;
    const clients: ClientSocket[] = [];
    const interviewId = 'interview-123';
    const panelistId = 'panelist-1';

    beforeEach(() => {
        vi.clearAllMocks();
        
        app = express();
        app.use(express.json());
        app.use('/api/interviews', interviewsRouter);
        
        vi.mocked(auditEvent).mockResolvedValue();
    });

    afterEach(async () => {
        for (const client of clients) {
            client.disconnect();
        }
        clients.length = 0;

        if (server) {
            await new Promise<void>((resolve, reject) => {
                server!.close((error) => {
                    if (error) {
                        reject(error);
                        return;
                    }
                    resolve();
                });
            });
            server = null;
        }

        await resetSocketServerForTests();
    });

    it('emits panelist:confirmed event when panelist confirms', async () => {
        server = http.createServer(app);
        initSocketServer(server);

        await new Promise<void>((resolve) => {
            server!.listen(0, () => resolve());
        });

        const address = server.address();
        if (!address || typeof address === 'string') {
            throw new Error('Failed to get dynamic test port');
        }

        const baseUrl = `http://127.0.0.1:${address.port}`;

        // Connect WebSocket client
        const clientSocket = createClient(baseUrl, {
            transports: ['websocket'],
        });
        clients.push(clientSocket);

        await onceConnected(clientSocket);

        // Mock service responses
        const mockPayload = {
            interviewStageId: interviewId,
            panelistId,
            action: 'confirm' as const,
        };

        vi.mocked(validatePanelistConfirmationToken).mockResolvedValue(mockPayload);
        vi.mocked(prisma.panelistConfirmation.updateMany).mockResolvedValue({ count: 1 });
        vi.mocked(markTokenAsUsed).mockResolvedValue();

        // Listen for WebSocket event
        const eventPromise = waitForEvent<{
            interviewStageId: string;
            panelistId: string;
            status: 'confirmed' | 'declined';
            timestamp: string;
        }>(clientSocket, 'panelist:confirmed', 2000);

        // Trigger confirmation endpoint
        const response = await request(app)
            .post('/api/interviews/confirm-panelist')
            .send({ token: 'valid-token' });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);

        // Verify WebSocket event was received
        const eventPayload = await eventPromise;
        expect(eventPayload).toEqual({
            interviewStageId: interviewId,
            panelistId,
            status: 'confirmed',
            timestamp: expect.any(String),
        });

        // Verify timestamp is recent (within last 5 seconds)
        const timestamp = new Date(eventPayload.timestamp);
        const now = new Date();
        const diffMs = now.getTime() - timestamp.getTime();
        expect(diffMs).toBeLessThan(5000);
        expect(diffMs).toBeGreaterThanOrEqual(0);
    });

    it('emits panelist:confirmed event with declined status', async () => {
        server = http.createServer(app);
        initSocketServer(server);

        await new Promise<void>((resolve) => {
            server!.listen(0, () => resolve());
        });

        const address = server.address();
        if (!address || typeof address === 'string') {
            throw new Error('Failed to get dynamic test port');
        }

        const baseUrl = `http://127.0.0.1:${address.port}`;

        const clientSocket = createClient(baseUrl, {
            transports: ['websocket'],
        });
        clients.push(clientSocket);

        await onceConnected(clientSocket);

        const mockPayload = {
            interviewStageId: interviewId,
            panelistId,
            action: 'decline' as const,
        };

        vi.mocked(validatePanelistConfirmationToken).mockResolvedValue(mockPayload);
        vi.mocked(prisma.panelistConfirmation.updateMany).mockResolvedValue({ count: 1 });
        vi.mocked(markTokenAsUsed).mockResolvedValue();

        const eventPromise = waitForEvent<{
            interviewStageId: string;
            panelistId: string;
            status: 'confirmed' | 'declined';
            timestamp: string;
        }>(clientSocket, 'panelist:confirmed', 2000);

        const response = await request(app)
            .post('/api/interviews/confirm-panelist')
            .send({ token: 'valid-token' });

        expect(response.status).toBe(200);

        const eventPayload = await eventPromise;
        expect(eventPayload.status).toBe('declined');
        expect(eventPayload.interviewStageId).toBe(interviewId);
        expect(eventPayload.panelistId).toBe(panelistId);
    });

    it('still succeeds even if WebSocket emission fails', async () => {
        server = http.createServer(app);
        initSocketServer(server);

        await new Promise<void>((resolve) => {
            server!.listen(0, () => resolve());
        });

        const address = server.address();
        if (!address || typeof address === 'string') {
            throw new Error('Failed to get dynamic test port');
        }

        const mockPayload = {
            interviewStageId: interviewId,
            panelistId,
            action: 'confirm' as const,
        };

        vi.mocked(validatePanelistConfirmationToken).mockResolvedValue(mockPayload);
        vi.mocked(prisma.panelistConfirmation.updateMany).mockResolvedValue({ count: 1 });
        vi.mocked(markTokenAsUsed).mockResolvedValue();

        // Don't connect any clients - WebSocket will fail to emit but request should still succeed
        const response = await request(app)
            .post('/api/interviews/confirm-panelist')
            .send({ token: 'valid-token' });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
    });

    it('emits event within 2 seconds of confirmation', async () => {
        server = http.createServer(app);
        initSocketServer(server);

        await new Promise<void>((resolve) => {
            server!.listen(0, () => resolve());
        });

        const address = server.address();
        if (!address || typeof address === 'string') {
            throw new Error('Failed to get dynamic test port');
        }

        const baseUrl = `http://127.0.0.1:${address.port}`;

        const clientSocket = createClient(baseUrl, {
            transports: ['websocket'],
        });
        clients.push(clientSocket);

        await onceConnected(clientSocket);

        const mockPayload = {
            interviewStageId: interviewId,
            panelistId,
            action: 'confirm' as const,
        };

        vi.mocked(validatePanelistConfirmationToken).mockResolvedValue(mockPayload);
        vi.mocked(prisma.panelistConfirmation.updateMany).mockResolvedValue({ count: 1 });
        vi.mocked(markTokenAsUsed).mockResolvedValue();

        const startTime = Date.now();
        
        const eventPromise = waitForEvent<{
            interviewStageId: string;
            panelistId: string;
            status: 'confirmed' | 'declined';
            timestamp: string;
        }>(clientSocket, 'panelist:confirmed', 2000);

        await request(app)
            .post('/api/interviews/confirm-panelist')
            .send({ token: 'valid-token' });

        await eventPromise;
        const endTime = Date.now();
        const elapsedMs = endTime - startTime;

        // Verify event was received within 2 seconds
        expect(elapsedMs).toBeLessThan(2000);
    });
});
